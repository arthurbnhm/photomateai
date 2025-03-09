import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import * as crypto from 'crypto';

// Function to verify webhook signature
function verifyWebhookSignature(
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null,
  body: string
): boolean {
  // If any of the required headers are missing, verification fails
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.error('Missing required webhook headers');
    return false;
  }

  // Get the webhook secret from environment variables
  const webhookSecret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('REPLICATE_WEBHOOK_SECRET is not set');
    return false;
  }

  try {
    // Construct the signed content
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;

    // Extract the base64 portion of the secret (after whsec_ prefix)
    const secretKey = webhookSecret.startsWith('whsec_') 
      ? webhookSecret.substring(6) 
      : webhookSecret;

    // Base64 decode the secret
    const secretBytes = Buffer.from(secretKey, 'base64');

    // Calculate the expected signature
    const computedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Parse the webhook signature header
    const expectedSignatures = webhookSignature
      .split(' ')
      .map(sig => {
        const parts = sig.split(',');
        return parts.length > 1 ? parts[1] : null;
      })
      .filter(Boolean) as string[];

    // Check if our computed signature matches any of the expected signatures
    return expectedSignatures.some(expectedSig => expectedSig === computedSignature);
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

// Function to download and store an image
async function downloadAndStoreImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to download image:', response.statusText);
      return null;
    }

    const blob = await response.blob();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const filePath = `generations/${fileName}`;

    const supabase = createSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Failed to upload image:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error in downloadAndStoreImage:', error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    // Get the webhook headers
    const webhookId = request.headers.get('webhook-id');
    const webhookTimestamp = request.headers.get('webhook-timestamp');
    const webhookSignature = request.headers.get('webhook-signature');

    // Clone the request to get the body as text for signature verification
    const clonedRequest = request.clone();
    const bodyText = await clonedRequest.text();

    // Verify the webhook signature
    const isSignatureValid = verifyWebhookSignature(
      webhookId,
      webhookTimestamp,
      webhookSignature,
      bodyText
    );

    // If signature verification fails, reject the webhook
    if (!isSignatureValid) {
      console.error('Webhook signature verification failed');
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Parse the webhook data
    const webhookData = JSON.parse(bodyText);

    const supabase = createSupabaseAdmin();
    const replicate_id = webhookData.id;

    if (!replicate_id) {
      console.error('No replicate_id in webhook data');
      return NextResponse.json({ error: 'No replicate_id provided' }, { status: 400 });
    }

    // Determine if this is a training or prediction webhook
    // First, try to find it in the trainings table
    const { data: training, error: trainingError } = await supabase
      .from('trainings')
      .select('*')
      .eq('training_id', replicate_id)
      .maybeSingle();

    if (trainingError) {
      console.error('Error fetching training:', trainingError);
    }

    // If found in trainings table, handle as a training webhook
    if (training) {
      // Update the training status
      const { error: updateError } = await supabase
        .from('trainings')
        .update({
          status: webhookData.status,
          error: webhookData.error,
          updated_at: new Date().toISOString()
        })
        .eq('training_id', replicate_id);

      if (updateError) {
        console.error('Error updating training:', updateError);
        return NextResponse.json({ error: 'Error updating training' }, { status: 500 });
      }

      // If training has started processing, delete the training files
      if (webhookData.status === 'processing' || webhookData.status === 'starting') {
        try {
          // Get the model details to construct the file path
          const { data: modelData, error: modelError } = await supabase
            .from('models')
            .select('model_owner, model_id')
            .eq('id', training.model_id)
            .single();

          if (!modelError && modelData) {
            const zipPath = `${modelData.model_owner}/${modelData.model_id}/images.zip`;
            
            // Check if the file exists before trying to delete it
            const { data: fileExists } = await supabase.storage
              .from('training-files')
              .list(modelData.model_owner, {
                search: `${modelData.model_id}/images.zip`
              });

            if (fileExists && fileExists.length > 0) {
              // Delete the file
              const { error: deleteError } = await supabase.storage
                .from('training-files')
                .remove([zipPath]);

              if (deleteError) {
                console.warn(`Failed to delete training files: ${deleteError.message}`);
              } else {
                console.log(`Successfully deleted training files: ${zipPath}`);
              }
            } else {
              console.log(`Training files not found or already deleted: ${zipPath}`);
            }
          }
        } catch (deleteError) {
          console.warn('Error deleting training files:', deleteError);
          // Continue anyway since this is not critical
        }
      }

      // If training is completed, update the model status
      if (webhookData.status === 'succeeded') {
        // Update the training with completed_at timestamp
        const { error: trainingCompletedError } = await supabase
          .from('trainings')
          .update({
            completed_at: new Date().toISOString()
          })
          .eq('training_id', replicate_id);

        if (trainingCompletedError) {
          // Continue anyway
        }

        const { error: modelUpdateError } = await supabase
          .from('models')
          .update({
            status: 'trained',
            updated_at: new Date().toISOString()
          })
          .eq('id', training.model_id);

        if (modelUpdateError) {
          // Continue anyway
        }
      } else if (webhookData.status === 'failed') {
        // If training failed, update the model status
        const { error: modelUpdateError } = await supabase
          .from('models')
          .update({
            status: 'training_failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', training.model_id);

        if (modelUpdateError) {
          // Continue anyway
        }
      }

      return NextResponse.json({ success: true, type: 'training' });
    }

    // If not found in trainings, check predictions table
    const { data: prediction, error: predictionError } = await supabase
      .from('predictions')
      .select('*')
      .eq('replicate_id', replicate_id)
      .maybeSingle();

    if (predictionError) {
      console.error('Error fetching prediction:', predictionError);
      return NextResponse.json({ error: 'Error fetching prediction' }, { status: 500 });
    }

    if (!prediction) {
      console.error('No prediction or training found with replicate_id:', replicate_id);
      return NextResponse.json({ error: 'Webhook data not found in database' }, { status: 404 });
    }

    // Handle prediction webhook
    
    // Handle different webhook statuses for predictions
    if (webhookData.status === 'succeeded') {
      const urls = webhookData.output;
      if (!Array.isArray(urls)) {
        console.error('Invalid output format:', urls);
        return NextResponse.json({ error: 'Invalid output format' }, { status: 400 });
      }

      // Download and store images
      try {
        const storageUrls = await Promise.all(
          urls.map(url => downloadAndStoreImage(url))
        );

        // Filter out any null values from failed uploads
        const validStorageUrls = storageUrls.filter(url => url !== null) as string[];

        if (validStorageUrls.length === 0) {
          // If no images were successfully stored, mark the prediction as failed
          const { error: updateError } = await supabase
            .from('predictions')
            .update({
              status: 'failed',
              error: 'Failed to store any images',
              updated_at: new Date().toISOString()
            })
            .eq('id', prediction.id);

          if (updateError) {
            // Continue anyway
          }

          return NextResponse.json({ error: 'Failed to store images' }, { status: 500 });
        }

        // Update the prediction with storage URLs and status
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            status: webhookData.status,
            storage_urls: validStorageUrls,
            updated_at: new Date().toISOString()
          })
          .eq('id', prediction.id);

        if (updateError) {
          console.error('Error updating prediction:', updateError);
          return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
        }
      } catch (error) {
        console.error('Error storing images:', error);
        return NextResponse.json({ error: 'Error storing images' }, { status: 500 });
      }
    } else {
      // For non-succeeded statuses, just update the status
      const { error: updateError } = await supabase
        .from('predictions')
        .update({
          status: webhookData.status,
          error: webhookData.error,
          updated_at: new Date().toISOString()
        })
        .eq('id', prediction.id);

      if (updateError) {
        console.error('Error updating prediction:', updateError);
        return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, type: 'prediction' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 