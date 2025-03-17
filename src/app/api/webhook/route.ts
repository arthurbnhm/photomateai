import { NextResponse } from 'next/server';
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
async function downloadAndStoreImage(url: string, userId: string, format: string = 'png'): Promise<string | null> {
  try {
    // Validate userId to prevent 'undefined' in storage paths
    if (!userId || userId === 'undefined') {
      console.error('Invalid or missing userId for image storage:', userId);
      return url; // Return the original URL if userId is invalid
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to download image:', response.statusText);
      return url; // Return the original URL on download failure
    }

    const blob = await response.blob();
    
    const contentType = `image/${format}`;
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${format}`;
    
    // Ensure userId is valid before constructing the path
    const filePath = `${userId}/${fileName}`;

    // For storage operations, we need to use the service role key
    // This is one of the few legitimate cases where we need admin access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return url;
    }
    
    // Use the createClient directly for this specific operation
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, blob, {
        contentType: contentType,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Failed to upload image:', uploadError);
      return url; // Return the original URL on upload failure
    }

    // Generate a signed URL that expires in 10 years instead of 1 hour
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('images')
      .createSignedUrl(filePath, 10 * 365 * 24 * 60 * 60); // 10 years in seconds
    
    if (signedUrlError || !signedUrlData) {
      console.error('Failed to generate signed URL:', signedUrlError);
      return url; // Return the original URL if we can't generate a signed URL
    }

    return signedUrlData.signedUrl;
  } catch (error) {
    console.error('Error in downloadAndStoreImage:', error);
    return url; // Return the original URL on any error
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

    // For webhook handling, we need to use the service role key
    // This is one of the few legitimate cases where we need admin access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    // Use the createClient directly for this specific operation
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
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
          error: webhookData.error
        })
        .eq('training_id', replicate_id);

      if (updateError) {
        console.error('Error updating training:', updateError);
        return NextResponse.json({ error: 'Error updating training' }, { status: 500 });
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
            status: 'trained'
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
            status: 'training_failed'
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
      // Log more details about the webhook for debugging
      console.log('Webhook event details:', {
        status: webhookData.status,
        event: webhookData.event || 'unknown',
        id: replicate_id
      });
      
      // If this is a terminal event (succeeded/failed), create a record for it
      if (webhookData.status === 'succeeded' || webhookData.status === 'failed') {
        console.log(`Creating record for webhook with replicate_id: ${replicate_id}`);
        
        // Extract timing and cost information from webhook payload
        const startedAt = webhookData.started_at || null;
        const completedAt = webhookData.completed_at || null;
        const predictTime = webhookData.metrics?.predict_time || null;
        
        // Calculate cost based on predict time (if available)
        const costPerSecond = 0.001525;
        const cost = predictTime ? predictTime * costPerSecond : null;
        
        // Create a new prediction record
        const { error: insertError } = await supabase
          .from('predictions')
          .insert({
            replicate_id: replicate_id,
            status: webhookData.status,
            error: webhookData.error,
            started_at: startedAt,
            completed_at: completedAt || new Date().toISOString(),
            predict_time: predictTime,
            cost: cost,
            storage_urls: Array.isArray(webhookData.output) ? webhookData.output : null
          });
          
        if (insertError) {
          console.error('Error creating prediction record from webhook:', insertError);
          return NextResponse.json({ error: 'Error creating prediction record' }, { status: 500 });
        }
        
        return NextResponse.json({ 
          success: true, 
          type: 'prediction_created_from_webhook',
          message: 'Created prediction record from webhook data'
        });
      }
      
      // If this is not a terminal event (succeeded/failed), we can safely ignore it
      if (webhookData.status !== 'succeeded' && webhookData.status !== 'failed') {
        console.log(`Ignoring ${webhookData.status} webhook for non-existent prediction: ${replicate_id}`);
        return NextResponse.json({ message: 'Webhook acknowledged but no action taken' }, { status: 200 });
      }
      
      console.error('No prediction or training found with replicate_id:', replicate_id);
      return NextResponse.json({ error: 'Webhook data not found in database' }, { status: 404 });
    }

    // Handle prediction webhook based on status
    const now = new Date();
    
    // Handle different webhook statuses
    switch (webhookData.status) {
      case 'processing':
        // Extract started_at from webhook payload
        const processingStartedAt = webhookData.started_at || null;
        
        // Update the prediction status
        const { error: processingError } = await supabase
          .from('predictions')
          .update({
            status: webhookData.status,
            started_at: processingStartedAt
          })
          .eq('id', prediction.id);

        if (processingError) {
          console.error('Error updating prediction status:', processingError);
          return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
        }
        
        return NextResponse.json({ success: true, type: 'prediction_started' });
        
      case 'succeeded':
        const urls = webhookData.output;
        if (!Array.isArray(urls)) {
          console.error('Invalid output format:', urls);
          return NextResponse.json({ error: 'Invalid output format' }, { status: 400 });
        }

        // Extract timing and cost information from webhook payload
        const startedAt = webhookData.started_at || null;
        const completedAt = webhookData.completed_at || null;
        const predictTime = webhookData.metrics?.predict_time || null;
        
        // Calculate cost based on predict time (if available)
        // Cost rate is $0.001525 per second
        const costPerSecond = 0.001525;
        const cost = predictTime ? predictTime * costPerSecond : null;

        // Extract and validate userId
        const userId = prediction.user_id || 'anonymous';
        if (!userId || userId === 'undefined') {
          console.warn('Missing or invalid user_id for prediction:', prediction.id);
        }

        // Download and store images
        try {
          const format = prediction.input?.output_format || 'png';
          const storageUrls = await Promise.all(
            urls.map(url => downloadAndStoreImage(url, userId, format))
          );

          // Filter out any null values from failed uploads
          const validStorageUrls = storageUrls.filter(url => url !== null) as string[];

          if (validStorageUrls.length === 0) {
            // If no images were successfully stored, mark the prediction as failed
            const { error: failedStorageError } = await supabase
              .from('predictions')
              .update({
                status: 'failed',
                error: 'Failed to store any images',
                completed_at: completedAt || now.toISOString()
              })
              .eq('id', prediction.id);

            if (failedStorageError) {
              console.error('Error updating prediction after storage failure:', failedStorageError);
            }

            return NextResponse.json({ error: 'Failed to store images' }, { status: 500 });
          }

          // Update the prediction with storage URLs, status, and timing information
          const { error: successError } = await supabase
            .from('predictions')
            .update({
              status: webhookData.status,
              storage_urls: validStorageUrls,
              started_at: startedAt,
              completed_at: completedAt || now.toISOString(),
              predict_time: predictTime,
              cost: cost
            })
            .eq('id', prediction.id);

          if (successError) {
            console.error('Error updating prediction on success:', successError);
            return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
          }
        } catch (error) {
          console.error('Error storing images:', error);
          return NextResponse.json({ error: 'Error storing images' }, { status: 500 });
        }
        break;
        
      case 'failed':
      case 'canceled':
        // Extract timing information from webhook payload
        const failedStartedAt = webhookData.started_at || null;
        const failedCompletedAt = webhookData.completed_at || null;
        const failedPredictTime = webhookData.metrics?.predict_time || null;
        
        // Calculate cost based on predict time (if available)
        const failedCost = failedPredictTime ? failedPredictTime * 0.001525 : null;
        
        // Update the prediction with status, error, and timing information
        const { error: failedError } = await supabase
          .from('predictions')
          .update({
            status: webhookData.status,
            error: webhookData.error,
            started_at: failedStartedAt,
            completed_at: failedCompletedAt || now.toISOString(),
            predict_time: failedPredictTime,
            cost: failedCost
          })
          .eq('id', prediction.id);

        if (failedError) {
          console.error(`Error updating prediction on ${webhookData.status}:`, failedError);
          return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
        }
        break;
        
      default:
        // For other statuses, just update the status
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            status: webhookData.status,
            error: webhookData.error
          })
          .eq('id', prediction.id);

        if (updateError) {
          console.error(`Error updating prediction with status ${webhookData.status}:`, updateError);
          return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true, type: 'prediction' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 