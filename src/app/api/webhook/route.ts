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

// Function to download and store an image with retry logic
async function downloadAndStoreImage(url: string, userId: string, format: string = 'png', maxRetries: number = 3): Promise<string | null> {
  // Validate userId to prevent 'undefined' in storage paths
  if (!userId || userId === 'undefined') {
    console.error('Invalid or missing userId for image storage:', userId);
    return null; // Return null instead of original URL
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    return null; // Return null instead of original URL
  }

  // Use the createClient directly for this specific operation
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries} to download and store image: ${url.substring(0, 50)}...`);
      
      // Download image from Replicate with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'PhotomateAI/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Validate image size
      if (blob.size === 0) {
        throw new Error('Downloaded image is empty');
      }
      
      if (blob.size > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('Downloaded image is too large');
      }
      
      const contentType = `image/${format}`;
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${format}`;
      const filePath = `${userId}/${fileName}`;

      console.log(`📤 Uploading to Supabase: ${filePath} (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
      
      // Upload to Supabase Storage with retry-friendly options
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, blob, {
          contentType: contentType,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Failed to upload to Supabase: ${uploadError.message}`);
      }

      // Generate a long-lived signed URL (10 years)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('images')
        .createSignedUrl(filePath, 10 * 365 * 24 * 60 * 60); // 10 years in seconds
      
      if (signedUrlError || !signedUrlData) {
        throw new Error(`Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`);
      }

      console.log(`✅ Successfully stored image attempt ${attempt}/${maxRetries}: ${filePath}`);
      return signedUrlData.signedUrl;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Attempt ${attempt}/${maxRetries} failed for image storage:`, errorMessage);
      
      // If this was the last attempt, log the final failure
      if (attempt === maxRetries) {
        console.error(`🚨 FINAL FAILURE: Could not store image after ${maxRetries} attempts: ${url}`);
        console.error(`🚨 Error details:`, errorMessage);
        return null; // Return null - never fallback to Replicate URL
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
      console.log(`⏱️ Waiting ${waitTime}ms before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  return null; // This should never be reached, but ensures we never return Replicate URLs
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
    
    // 🚨 TEMPORARY: Log ALL webhook payloads for debugging - REMOVE THIS BLOCK
    // console.log('='.repeat(80));
    // console.log(`🔔 WEBHOOK RECEIVED - ID: ${webhookData.id}, Status: ${webhookData.status}`);
    // console.log('📦 Full Payload:', JSON.stringify(webhookData, null, 2));
    // console.log('='.repeat(80));

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

    /*
    // For debugging specific webhooks if needed
    if (replicate_id === "specific_id_to_debug") {
      // console.log(
      //   'Webhook event details for specific ID:',
      //   JSON.stringify(webhookData, null, 2)
      // );
    }
    */

    // 🚨 TEMPORARY: Quick test to verify webhook URL is accessible
    if (webhookData.test === true) {
      console.log('✅ Test webhook received successfully!');
      return NextResponse.json({ message: 'Test webhook received', success: true });
    }

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
      // Add comprehensive logging for debugging the new trainer's payload - REMOVE/REDUCE THESE LOGS
      // console.log(`🔍 Training webhook received for training ID: ${replicate_id}`); 
      // console.log(`📋 Webhook status: ${webhookData.status}`); 
      // console.log(`📄 Full webhook payload:`, JSON.stringify(webhookData, null, 2)); 
      // console.log(`🎯 Webhook output:`, JSON.stringify(webhookData.output, null, 2)); 
      // console.log(`⏱️ Webhook metrics:`, JSON.stringify(webhookData.metrics, null, 2)); 
      
      // Extract timing information from webhook payload
      const startedAt = webhookData.started_at || null;
      const completedAt = webhookData.completed_at || null;
      const predictTime = webhookData.metrics?.predict_time || null;
      
      // console.log(`⏰ Timing info - started_at: ${startedAt}, completed_at: ${completedAt}, predict_time: ${predictTime}`); 
      
      // Calculate cost based on predict time (if available)
      // Cost rate is $0.0122 per second for training
      const costPerSecond = 0.0122;
      const cost = predictTime ? predictTime * costPerSecond : null;
      
      // console.log(`💰 Calculated cost: ${cost}`); 

      // Extract the newly created model version identifier from the webhook.
      // For fast-flux-trainer, check multiple possible locations
      let rawModelVersionIdentifier: string | null = null;
      
      // Check various possible locations for the model version
      if (webhookData.output && typeof webhookData.output === 'object') {
        // Check output.version first (ostris format)
        if (webhookData.output.version && typeof webhookData.output.version === 'string') {
          rawModelVersionIdentifier = webhookData.output.version;
          // console.log(`✅ Found version in output.version: ${rawModelVersionIdentifier}`); 
        }
        // Check if output itself is a string (might be the version for fast-flux-trainer)
        else if (typeof webhookData.output === 'string') {
          rawModelVersionIdentifier = webhookData.output;
          // console.log(`✅ Found version in output (string): ${rawModelVersionIdentifier}`); 
        }
        // Check output.model_version (alternative field name)
        else if (webhookData.output.model_version && typeof webhookData.output.model_version === 'string') {
          rawModelVersionIdentifier = webhookData.output.model_version;
          // console.log(`✅ Found version in output.model_version: ${rawModelVersionIdentifier}`); 
        }
        // Check output.destination (destination field)
        else if (webhookData.output.destination && typeof webhookData.output.destination === 'string') {
          rawModelVersionIdentifier = webhookData.output.destination;
          // console.log(`✅ Found version in output.destination: ${rawModelVersionIdentifier}`); 
        }
      }
      
      // Fallback to top-level version if output checks didn't work
      if (!rawModelVersionIdentifier && webhookData.version && typeof webhookData.version === 'string') {
        rawModelVersionIdentifier = webhookData.version;
        // console.log(`⚠️ Using top-level version field: ${rawModelVersionIdentifier} (might be trainer version)`); 
      }
      
      // Check model field as another fallback
      if (!rawModelVersionIdentifier && webhookData.model && typeof webhookData.model === 'string') {
        rawModelVersionIdentifier = webhookData.model;
        // console.log(`⚠️ Using model field: ${rawModelVersionIdentifier}`); 
      }
      
      if (!rawModelVersionIdentifier) {
        console.error(`❌ Could not determine model version from webhook for training ${replicate_id}`);
        console.error(`Available fields:`, Object.keys(webhookData)); 
        // if (webhookData.output) {
        //   console.error(`Available output fields:`, Object.keys(webhookData.output));
        // }
      }

      // Parse the raw identifier to get just the version hash.
      let finalModelVersionToStore: string | null = null;
      if (rawModelVersionIdentifier) {
        // console.log(`🔄 Processing raw model version identifier: ${rawModelVersionIdentifier}`); 
        
        const parts = rawModelVersionIdentifier.split(':');
        if (parts.length === 2) {
          finalModelVersionToStore = parts[1]; // Assumes "owner/model:hash" format
          // console.log(`✅ Extracted version hash from owner/model:hash format: ${finalModelVersionToStore}`); 
        } else if (parts.length === 1 && !rawModelVersionIdentifier.includes('/')) {
          // If it's already just a hash (no owner/model and no colon)
          finalModelVersionToStore = rawModelVersionIdentifier;
          // console.log(`✅ Using raw identifier as version hash: ${finalModelVersionToStore}`); 
        } else {
          // It's an unexpected format, but store it anyway
          finalModelVersionToStore = rawModelVersionIdentifier;
          // console.warn(`⚠️ Unexpected version format, storing as-is: ${finalModelVersionToStore}`); 
        }
      }

      // Prepare the update data based on status
      const updateData: {
        status: string;
        error?: string | null;
        started_at?: string | null;
        completed_at?: string | null;
        predict_time?: number | null;
        cost?: number | null;
      } = {
        status: webhookData.status,
        error: webhookData.error,
        started_at: startedAt,
        completed_at: completedAt,
        predict_time: predictTime,
        cost: cost,
      };

      // console.log(`📝 About to update training record with:`, updateData); 

      // Update the training record
      const { error: updateError } = await supabase
        .from('trainings')
        .update(updateData)
        .eq('training_id', replicate_id);

      if (updateError) {
        console.error('❌ Error updating training record:', updateError);
        console.error('❌ Update data was:', JSON.stringify(updateData, null, 2));
        console.error('❌ Training ID:', replicate_id);
        // Continue even if update fails, as we still need to update the model
      } else {
        console.log(`✅ Successfully updated training record for training ID: ${replicate_id}`);
        
        // Verify the update by fetching the record again - REMOVE THIS BLOCK
        // const { data: verifyData, error: verifyError } = await supabase
        //   .from('trainings')
        //   .select('status, started_at, completed_at, predict_time, cost')
        //   .eq('training_id', replicate_id)
        //   .single();
          
        // if (verifyError) {
        //   console.error('❌ Error verifying training update:', verifyError);
        // } else {
        //   console.log('✅ Verified training record after update:', verifyData);
        // }
      }

      // If training succeeded and we have a model ID and the new version,
      // update the corresponding record in the 'models' table.
      if (webhookData.status === 'succeeded' && training.model_id && finalModelVersionToStore) {
        console.log(`🎯 Updating model ${training.model_id} with version: ${finalModelVersionToStore}`); 
        
        const { error: modelUpdateError } = await supabase
          .from('models')
          .update({ 
            version: finalModelVersionToStore
          })
          .eq('id', training.model_id);

        if (modelUpdateError) {
          console.error(`❌ Error updating model ${training.model_id} to version ${finalModelVersionToStore}:`, modelUpdateError);
          // Continue even if model update fails
        } else {
          console.log(`✅ Successfully updated model ${training.model_id} to version ${finalModelVersionToStore}`);
          
          // Verify the model update by fetching the record again - REMOVE THIS BLOCK
          // const { data: verifyModelData, error: verifyModelError } = await supabase
          //   .from('models')
          //   .select('version, user_id')
          //   .eq('id', training.model_id)
          //   .single();
            
            // Decrement models_remaining from user's subscription
            if (training.user_id) {
              console.log(`💳 Decrementing models_remaining for user: ${training.user_id}`);
              
              try {
                // Get the user's active subscription
                const { data: subscription, error: subscriptionError } = await supabase
                  .from('subscriptions')
                  .select('models_remaining')
                  .eq('user_id', training.user_id)
                  .eq('is_active', true)
                  .single();

                if (subscriptionError) {
                  console.error(`❌ Error fetching subscription for user ${training.user_id}:`, subscriptionError);
                } else if (!subscription) {
                  console.warn(`⚠️ No active subscription found for user ${training.user_id} to decrement models_remaining.`);
                } else if (subscription.models_remaining > 0) {
                  // Decrement models_remaining
                  const { error: decrementError } = await supabase
                    .from('subscriptions')
                    .update({ 
                      models_remaining: subscription.models_remaining - 1,
                      updated_at: new Date().toISOString()
                    })
                    .eq('user_id', training.user_id)
                    .eq('is_active', true);

                  if (decrementError) {
                    console.error(`❌ Error decrementing models_remaining for user ${training.user_id}:`, decrementError);
                  } else {
                    console.log(`✅ Successfully decremented models_remaining for user ${training.user_id} from ${subscription.models_remaining} to ${subscription.models_remaining - 1}`);
                  }
                } else {
                  console.warn(`⚠️ User ${training.user_id} has no models_remaining to decrement (current: ${subscription.models_remaining})`);
                }
              } catch (error) {
                console.error(`❌ Unexpected error while decrementing models_remaining for user ${training.user_id}:`, error);
              }
            } else {
              console.error('❌ No user_id found in training record, cannot decrement models_remaining'); // This should ideally not happen if training.user_id is guaranteed
            }
          }
        } else if (webhookData.status === 'succeeded' && !finalModelVersionToStore && training.model_id) {
          console.error(
              `❌ Training succeeded for ${replicate_id} (model ${training.model_id}) ` +
              `but no valid model version could be determined. Raw identifier: ${rawModelVersionIdentifier}`
          );
        } else if (webhookData.status === 'succeeded' && !training.model_id) {
          console.error(`❌ Training succeeded but no model_id found in training record: ${replicate_id}`);
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
      
      // This situation should not normally happen - predictions should be created
      // by the /api/generate endpoint before the webhook fires. Log a warning.
      console.warn(`⚠️ Received webhook for non-existent prediction: ${replicate_id}`);
      console.warn('This may indicate the prediction was created without going through our API');
      
      // For terminal events, we should NOT create a new record as this breaks our flow
      // The prediction should have been created by /api/generate before the webhook
      if (webhookData.status === 'succeeded' || webhookData.status === 'failed') {
        console.error(`❌ Cannot process ${webhookData.status} webhook for non-existent prediction: ${replicate_id}`);
        console.error('Predictions must be created via /api/generate before webhooks are processed');
        return NextResponse.json({ 
          error: 'Prediction not found in database',
          message: 'Predictions must be created via /api/generate endpoint before webhook processing'
        }, { status: 404 });
      }
      
      return NextResponse.json({ message: 'Webhook acknowledged but no action taken' }, { status: 200 });
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
        const output = webhookData.output;
        
        // Handle both array (regular generations) and string (edit generations) formats
        let urls: string[];
        if (Array.isArray(output)) {
          // Regular generation with multiple images
          urls = output;
        } else if (typeof output === 'string') {
          // Edit generation with single image
          urls = [output];
        } else {
          console.error('Invalid output format:', output);
          return NextResponse.json({ error: 'Invalid output format' }, { status: 400 });
        }

        // Extract timing and cost information from webhook payload
        const startedAt = webhookData.started_at || null;
        const completedAt = webhookData.completed_at || null;
        const predictTime = webhookData.metrics?.predict_time || null;
        
        // Calculate cost based on prediction type
        let costToLog;
        if (prediction.is_edit) {
          costToLog = 0.08; // Fixed cost for an edit
        } else {
          const costPerSecondForGeneration = 0.001525;
          costToLog = predictTime ? predictTime * costPerSecondForGeneration : null;
        }

        // Extract and validate userId
        const userId = prediction.user_id || 'anonymous';
        if (!userId || userId === 'undefined') {
          console.warn('Missing or invalid user_id for prediction:', prediction.id);
        }

        // Download and store images with improved error handling
        try {
          console.log(`🔄 Processing ${urls.length} images for prediction ${replicate_id}`);
          const format = prediction.input?.output_format || 'png';
          
          // Process images with retry logic
          const storageResults = await Promise.allSettled(
            urls.map((url, index) => {
              console.log(`📥 Processing image ${index + 1}/${urls.length}: ${url.substring(0, 50)}...`);
              return downloadAndStoreImage(url, userId, format);
            })
          );

          // Extract successful storage URLs and log failures
          const validStorageUrls: string[] = [];
          const failedImages: number[] = [];
          
          storageResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value !== null) {
              validStorageUrls.push(result.value);
              console.log(`✅ Image ${index + 1} stored successfully`);
            } else {
              failedImages.push(index + 1);
              const errorReason = result.status === 'rejected' 
                ? result.reason 
                : 'Failed to store image';
              console.error(`❌ Image ${index + 1} failed to store:`, errorReason);
            }
          });

          console.log(`📊 Storage summary: ${validStorageUrls.length}/${urls.length} images stored successfully`);
          
          // Require ALL images to be successfully stored in Supabase
          if (validStorageUrls.length === 0) {
            // No images were successfully stored
            console.error(`🚨 CRITICAL: No images could be stored for prediction ${replicate_id}`);
            
            const { error: failedStorageError } = await supabase
              .from('predictions')
              .update({
                status: 'failed',
                error: 'Failed to store any images in Supabase storage',
                completed_at: completedAt || now.toISOString()
              })
              .eq('id', prediction.id);

            if (failedStorageError) {
              console.error('Error updating prediction after storage failure:', failedStorageError);
            }

            return NextResponse.json({ 
              error: 'Failed to store images in Supabase storage',
              details: `All ${urls.length} images failed to transfer to Supabase`
            }, { status: 500 });
          }
          
          if (validStorageUrls.length < urls.length) {
            // Some images failed to store
            console.warn(`⚠️ PARTIAL SUCCESS: Only ${validStorageUrls.length}/${urls.length} images stored for prediction ${replicate_id}`);
            console.warn(`⚠️ Failed images: ${failedImages.join(', ')}`);
            
            const { error: partialFailureError } = await supabase
              .from('predictions')
              .update({
                status: 'failed',
                error: `Only ${validStorageUrls.length}/${urls.length} images could be stored in Supabase storage`,
                completed_at: completedAt || now.toISOString()
              })
              .eq('id', prediction.id);

            if (partialFailureError) {
              console.error('Error updating prediction after partial storage failure:', partialFailureError);
            }

            return NextResponse.json({ 
              error: 'Partial image storage failure',
              details: `Only ${validStorageUrls.length}/${urls.length} images stored successfully`
            }, { status: 500 });
          }

          // All images successfully stored - update prediction with Supabase URLs only
          console.log(`🎉 SUCCESS: All ${validStorageUrls.length} images stored successfully in Supabase for prediction ${replicate_id}`);
          
          const { error: successError } = await supabase
            .from('predictions')
            .update({
              status: webhookData.status,
              storage_urls: validStorageUrls, // Only Supabase URLs
              started_at: startedAt,
              completed_at: completedAt || now.toISOString(),
              predict_time: predictTime,
              cost: costToLog // Use the new costToLog
            })
            .eq('id', prediction.id);

          if (successError) {
            console.error('Error updating prediction on success:', successError);
            return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
          }
          
          // If this is an edit, update the original prediction's edited_images array
          if (prediction.is_edit && prediction.source_prediction_id && validStorageUrls.length > 0) {
            console.log(`🎨 This is an edit of prediction ${prediction.source_prediction_id}, updating edited_images array`);
            
            try {
              // Get the current edited_images array from the original prediction
              const { data: originalPrediction, error: fetchOriginalError } = await supabase
                .from('predictions')
                .select('edited_images')
                .eq('id', prediction.source_prediction_id)
                .single();
                
              if (fetchOriginalError) {
                console.error('❌ Error fetching original prediction for edit tracking:', fetchOriginalError);
              } else {
                // Add the new edited image URLs to the existing array
                const currentEditedImages = originalPrediction.edited_images || [];
                const updatedEditedImages = [...currentEditedImages, ...validStorageUrls];
                
                const { error: updateOriginalError } = await supabase
                  .from('predictions')
                  .update({
                    edited_images: updatedEditedImages
                  })
                  .eq('id', prediction.source_prediction_id);
                  
                if (updateOriginalError) {
                  console.error('❌ Error updating original prediction edited_images:', updateOriginalError);
                } else {
                  console.log(`✅ Successfully added ${validStorageUrls.length} edited images to original prediction ${prediction.source_prediction_id}`);
                }
              }
            } catch (editTrackingError) {
              console.error('❌ Exception during edit tracking:', editTrackingError);
              // Don't fail the entire webhook - edit tracking is not critical
            }
          }
          
          console.log(`✅ Prediction ${replicate_id} completed successfully with all images in Supabase`);
          
        } catch (error) {
          console.error('🚨 CRITICAL ERROR in image storage process:', error);
          
          // Mark prediction as failed due to storage error
          const { error: criticalError } = await supabase
            .from('predictions')
            .update({
              status: 'failed',
              error: `Critical error during image storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
              completed_at: completedAt || now.toISOString()
            })
            .eq('id', prediction.id);

          if (criticalError) {
            console.error('Error updating prediction after critical storage error:', criticalError);
          }

          return NextResponse.json({ 
            error: 'Critical error during image storage',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
        break;
        
      case 'failed':
      case 'canceled':
        // Extract timing information from webhook payload
        const failedStartedAt = webhookData.started_at || null;
        const failedCompletedAt = webhookData.completed_at || null;
        const failedPredictTime = webhookData.metrics?.predict_time || null;
        
        // Calculate cost based on prediction type for failed/canceled
        let costToLogForFailure;
        if (prediction.is_edit) {
          costToLogForFailure = 0.08; // Fixed cost for an edit, even if failed (credit was taken)
        } else {
          const costPerSecondForGeneration = 0.001525;
          costToLogForFailure = failedPredictTime ? failedPredictTime * costPerSecondForGeneration : null;
        }
        
        // Update the prediction with status, error, and timing information
        const { error: failedUpdateError } = await supabase
          .from('predictions')
          .update({
            status: webhookData.status,
            error: webhookData.error || 'Prediction failed or was canceled',
            started_at: failedStartedAt,
            completed_at: failedCompletedAt || now.toISOString(),
            predict_time: failedPredictTime,
            cost: costToLogForFailure // Use the new costToLogForFailure
          })
          .eq('id', prediction.id);
  
        if (failedUpdateError) {
          console.error(`Error updating prediction on ${webhookData.status}:`, failedUpdateError);
          return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
        }
        
        console.log(`📝 Prediction ${replicate_id} status updated to ${webhookData.status}`);
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