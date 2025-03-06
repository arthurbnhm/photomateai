import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createSupabaseAdmin } from '@/lib/supabase';
import JSZip from 'jszip';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Define the Visibility type
type Visibility = 'public' | 'private';

export async function POST(request: NextRequest) {
  try {
    // Check if this is a file upload request
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return await handleFileUpload(request);
    }

    const { action, modelName, owner, modelOwner, visibility, hardware, zipUrl, trainingId, displayName } = await request.json();

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
    console.log('API token available:', apiToken ? `Yes (starts with ${apiToken.substring(0, 4)}...)` : 'No');
    
    if (!apiToken) {
      console.error('REPLICATE_API_TOKEN is not set');
      return NextResponse.json(
        { 
          error: "Missing Replicate API token. Please add your token to the .env file or environment variables.",
          details: "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens",
          success: false
        },
        { status: 401 }
      );
    }

    // Handle different actions
    switch (action) {
      case 'create':
        return await createModel(modelName, owner, visibility as Visibility, hardware, displayName);
      case 'train':
        return await trainModel(modelOwner || owner, modelName, zipUrl);
      case 'initBucket':
        return await initializeBucket();
      case 'cancel':
        return await cancelTraining(trainingId);
      default:
        return NextResponse.json(
          { error: 'Invalid action', success: false },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in model API:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        success: false
      },
      { status: 500 }
    );
  }
}

// Create a model in Replicate
async function createModel(modelName: string, owner: string, visibility: Visibility, hardware: string, displayName: string) {
  if (!modelName) {
    return NextResponse.json(
      { error: 'Model name is required', success: false },
      { status: 400 }
    );
  }

  if (!owner) {
    return NextResponse.json(
      { error: 'Model owner is required', success: false },
      { status: 400 }
    );
  }

  if (!displayName) {
    return NextResponse.json(
      { error: 'Display name is required', success: false },
      { status: 400 }
    );
  }

  // Validate model name format
  const validPattern = /^[a-z0-9][a-z0-9_.-]*[a-z0-9]$|^[a-z0-9]$/;
  if (!validPattern.test(modelName)) {
    return NextResponse.json(
      { 
        error: 'Model name can only contain lowercase letters, numbers, dashes, underscores, or periods, and cannot start or end with a dash, underscore, or period',
        success: false 
      },
      { status: 400 }
    );
  }

  console.log('Creating model with parameters:', { 
    modelName, 
    owner, 
    visibility: visibility || 'private',
    hardware: hardware || 'gpu-t4'
  });

  try {
    // Create the model in Replicate
    const model = await replicate.models.create(
      owner, 
      modelName,
      {
        visibility: visibility || 'private',
        hardware: hardware || 'gpu-t4'
      }
    );

    console.log('Model created successfully:', model);

    // Initialize Supabase client
    const supabase = createSupabaseAdmin();

    // Store the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .insert({
        model_id: modelName,
        model_owner: model.owner,
        visibility: model.visibility,
        hardware: hardware || 'gpu-t4',
        status: 'created',
        display_name: displayName
      })
      .select()
      .single();

    if (modelError) {
      console.error('Error storing model in Supabase:', modelError);
      // Continue anyway since the model was created in Replicate
    }

    return NextResponse.json({
      success: true,
      model: {
        id: modelData?.id || null,
        name: model.name,
        owner: model.owner,
        url: `https://replicate.com/${model.owner}/${model.name}`,
        visibility: model.visibility,
      }
    });
  } catch (error) {
    console.error('Error creating model:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create model',
        success: false
      },
      { status: 500 }
    );
  }
}

// Train a model using Replicate
async function trainModel(modelOwner: string, modelName: string, zipUrl: string) {
  if (!modelOwner || !modelName || !zipUrl) {
    console.error('Missing required parameters:', { modelOwner, modelName, zipUrl });
    return NextResponse.json(
      { error: 'Model owner, name, and zip URL are required', success: false },
      { status: 400 }
    );
  }

  console.log('=== TRAINING PROCESS STARTED ===');
  console.log('Training model with parameters:', { 
    modelOwner, 
    modelName,
    zipUrl
  });

  try {
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    console.log('Supabase client initialized for training');

    // Find the model in Supabase
    console.log('Looking for model in database with:', { modelOwner, modelName });
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .single();

    if (modelError) {
      console.error('Error finding model in Supabase:', modelError);
      return NextResponse.json(
        { error: 'Model not found in database', success: false, details: modelError },
        { status: 404 }
      );
    }

    console.log('Found model in database:', modelData);
    
    // Log the structure of the model data to help debug database schema issues
    console.log('Model data structure:', {
      id: modelData.id,
      model_id: modelData.model_id,
      model_owner: modelData.model_owner,
      keys: Object.keys(modelData)
    });

    // Verify the zip URL is accessible
    try {
      console.log(`Verifying zip URL accessibility: ${zipUrl}`);
      const zipResponse = await fetch(zipUrl, { method: 'HEAD' });
      if (zipResponse.ok) {
        console.log(`Zip URL verification successful: HTTP ${zipResponse.status}`);
        console.log('Content-Type:', zipResponse.headers.get('Content-Type'));
        console.log('Content-Length:', zipResponse.headers.get('Content-Length'));
      } else {
        console.error(`⚠️ Zip URL verification failed: HTTP ${zipResponse.status}`);
        console.error('This may cause training to fail as Replicate cannot access the zip file');
      }
    } catch (verifyError) {
      console.error('⚠️ Could not verify zip URL:', verifyError);
      console.error('This may cause training to fail as Replicate cannot access the zip file');
    }

    // Define training parameters
    const trainingParams = {
      steps: 1000,
      lora_rank: 16,
      optimizer: "adamw8bit",
      batch_size: 1,
      resolution: "512,768,1024",
      autocaption: true,
      input_images: zipUrl,
      trigger_word: "TOK",
      learning_rate: 0.0004,
      wandb_project: "flux_train_replicate",
      wandb_save_interval: 100,
      caption_dropout_rate: 0.05,
      cache_latents_to_disk: false,
      wandb_sample_interval: 100,
      gradient_checkpointing: false
    };

    console.log('Training parameters defined:', trainingParams);

    // Get webhook URL from environment or use fallback
    const webhookUrl = process.env.REPLICATE_WEBHOOK_URL || "https://your-app-url.com/api/webhook";
    console.log(`Using webhook URL: ${webhookUrl}`);

    // Create the training in Replicate
    console.log('Creating training in Replicate with destination:', `${modelOwner}/${modelName}`);
    try {
      console.log('Sending request to Replicate API...');
      const replicateStart = Date.now();
      
      const training = await replicate.trainings.create(
        "ostris",
        "flux-dev-lora-trainer",
        "b6af14222e6bd9be257cbc1ea4afda3cd0503e1133083b9d1de0364d8568e6ef",
        {
          // Set the destination model
          destination: `${modelOwner}/${modelName}`,
          input: trainingParams,
          // Use environment variable for webhook URL
          webhook: webhookUrl,
          webhook_events_filter: ["start", "output", "logs", "completed"]
        }
      );
      
      const replicateDuration = Date.now() - replicateStart;
      console.log(`Replicate API request completed in ${replicateDuration}ms`);
      console.log('Training created successfully in Replicate:', training);
      console.log('Training ID:', training.id);
      console.log('Training status:', training.status);
      console.log('Training version:', training.version);

      // Store the training in Supabase
      console.log('Storing training in database with model_id:', modelData.id);
      try {
        const trainingInsertData = {
          model_id: modelData.id,
          training_id: training.id,
          status: training.status,
          zip_url: zipUrl,
          input_params: trainingParams
        };
        
        console.log('Training insert data:', trainingInsertData);
        
        const { data: trainingData, error: trainingError } = await supabase
          .from('trainings')
          .insert(trainingInsertData)
          .select()
          .single();

        if (trainingError) {
          console.error('Error storing training in Supabase:', trainingError);
          // Continue anyway since the training was created in Replicate
        } else {
          console.log('Training stored in database:', trainingData);
        }
      } catch (dbError) {
        console.error('Exception when inserting training record:', dbError);
        // Continue anyway since the training was created in Replicate
      }

      // Update the model status to 'training'
      console.log('Updating model status to training');
      const { error: updateError } = await supabase
        .from('models')
        .update({ status: 'training' })
        .eq('id', modelData.id);

      if (updateError) {
        console.error('Error updating model status:', updateError);
        // Continue anyway
      } else {
        console.log('Model status updated successfully to "training"');
      }

      console.log('=== TRAINING PROCESS COMPLETED SUCCESSFULLY ===');
      return NextResponse.json({
        success: true,
        training: {
          id: training.id,
          status: training.status,
          url: `https://replicate.com/p/${training.id}`
        }
      });
    } catch (replicateError) {
      console.error('Error creating training in Replicate:', replicateError);
      if (replicateError instanceof Error) {
        console.error('Error message:', replicateError.message);
        console.error('Error stack:', replicateError.stack);
      }
      console.error('Full error details:', JSON.stringify(replicateError, Object.getOwnPropertyNames(replicateError)));
      return NextResponse.json(
        { 
          error: replicateError instanceof Error ? replicateError.message : 'Failed to create training in Replicate',
          success: false,
          details: replicateError
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in trainModel function:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    console.error('Full error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred during training setup',
        success: false,
        details: error
      },
      { status: 500 }
    );
  }
}

// Initialize the storage bucket
async function initializeBucket() {
  try {
    // Initialize Supabase client with admin privileges
    const supabase = createSupabaseAdmin();
    
    // Check if the bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === 'training-files');
    
    if (!bucketExists) {
      try {
        // Try to create the bucket
        const { error: createBucketError } = await supabase.storage.createBucket('training-files', {
          public: true,
          fileSizeLimit: 50 * 1024 * 1024, // 50MB limit
        });
        
        if (createBucketError) {
          console.log('Error creating bucket (might already exist):', createBucketError);
          // Continue anyway, as the bucket might already exist but not be visible to this user
        } else {
          console.log('Created training-files bucket');
        }
      } catch (error) {
        console.log('Exception when creating bucket (continuing anyway):', error);
        // Continue anyway, as the bucket might already exist
      }
    }
    
    // Update the bucket's public access
    try {
      const { error: updateError } = await supabase.storage.updateBucket('training-files', {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024, // 50MB limit
      });
      
      if (updateError) {
        console.log('Error updating bucket:', updateError);
      } else {
        console.log('Updated training-files bucket to be public');
      }
    } catch (error) {
      console.log('Exception when updating bucket:', error);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Bucket initialization completed'
    });
  } catch (error) {
    console.error('Error initializing bucket:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to initialize bucket',
        success: false
      },
      { status: 500 }
    );
  }
}

// Handle file upload using formdata
async function handleFileUpload(request: NextRequest) {
  try {
    console.log('=== UPLOAD PROCESS STARTED ===');
    const formData = await request.formData();
    const modelOwner = formData.get('modelOwner') as string;
    const modelName = formData.get('modelName') as string;
    const files = formData.getAll('files') as File[];

    console.log(`Received upload request for model: ${modelOwner}/${modelName}`);
    console.log(`Number of files to process: ${files.length}`);
    
    // Log some details about the files
    const fileSizes = files.map(f => Math.round(f.size / 1024)).join(', ');
    console.log(`File sizes (KB): ${fileSizes}`);
    console.log(`Total size: ${Math.round(files.reduce((sum, f) => sum + f.size, 0) / 1024)} KB`);

    if (!modelOwner || !modelName || files.length === 0) {
      console.error('Missing required parameters for upload');
      return NextResponse.json(
        { error: 'Model owner, name, and files are required', success: false },
        { status: 400 }
      );
    }

    // Initialize Supabase client with admin privileges
    const supabase = createSupabaseAdmin();
    console.log('Supabase client initialized');
    
    // Check available buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
    } else {
      console.log('Available buckets:', buckets?.map(b => b.name));
      console.log('Target bucket exists:', buckets?.some(b => b.name === 'training-files'));
    }
    
    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .single();

    if (modelError) {
      console.error('Error finding model in Supabase:', modelError);
      // Continue anyway since we can still upload the files
    } else {
      console.log('Found model in database:', modelData?.id);
    }
    
    console.log('Creating zip file in memory...');
    // Create a zip file directly
    const zip = new JSZip();
    
    // Add each file to the zip
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name} (${Math.round(file.size / 1024)} KB)`);
      // Read the file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      console.log(`File ${i + 1} read successfully, size: ${Math.round(arrayBuffer.byteLength / 1024)} KB`);
      // Add to zip with a simple numbered name
      zip.file(`${i + 1}${getFileExtension(file.name)}`, arrayBuffer);
    }
    
    console.log('All files added to zip, generating final zip file...');
    // Generate the zip file
    try {
      const zipContent = await zip.generateAsync({ type: 'blob' });
      console.log(`Zip file generated successfully. Size: ${Math.round(zipContent.size / 1024)} KB`);
      
      // Check if zip size is approaching limit
      const sizeLimit = 50 * 1024 * 1024; // 50MB
      if (zipContent.size > sizeLimit * 0.8) {
        console.warn(`⚠️ Zip file size (${Math.round(zipContent.size / (1024 * 1024))} MB) is approaching the bucket limit (${sizeLimit / (1024 * 1024)} MB)`);
      }
      
      // Convert Blob to ArrayBuffer for Supabase upload
      console.log('Converting zip to ArrayBuffer for upload...');
      const zipArrayBuffer = await zipContent.arrayBuffer();
      console.log(`Conversion complete. ArrayBuffer size: ${Math.round(zipArrayBuffer.byteLength / 1024)} KB`);
      
      // Upload the zip file directly to Supabase
      const zipPath = `${modelOwner}/${modelName}/images.zip`;
      console.log(`Uploading to Supabase storage path: ${zipPath}`);
      console.log('Starting upload to Supabase...');
      
      const uploadStart = Date.now();
      const { error: uploadError } = await supabase.storage
        .from('training-files')
        .upload(zipPath, zipArrayBuffer, {
          contentType: 'application/zip',
          cacheControl: '3600',
          upsert: true
        });
      const uploadDuration = Date.now() - uploadStart;
      
      if (uploadError) {
        console.error('Error uploading zip file:', uploadError);
        console.error('Upload error details:', JSON.stringify(uploadError));
        return NextResponse.json(
          { error: `Failed to upload zip file: ${uploadError.message}`, success: false },
          { status: 500 }
        );
      }
      
      console.log(`Upload completed successfully in ${uploadDuration}ms`);
      
      // Get the public URL for the zip file
      const { data: publicUrl } = supabase.storage
        .from('training-files')
        .getPublicUrl(zipPath);
      
      console.log(`Zip file public URL: ${publicUrl.publicUrl}`);
      
      // Verify the upload by attempting to fetch the file head
      try {
        console.log('Verifying upload accessibility...');
        const verifyResponse = await fetch(publicUrl.publicUrl, { method: 'HEAD' });
        if (verifyResponse.ok) {
          console.log(`Verification successful: HTTP ${verifyResponse.status}`);
          console.log('Content-Type:', verifyResponse.headers.get('Content-Type'));
          console.log('Content-Length:', verifyResponse.headers.get('Content-Length'));
        } else {
          console.warn(`⚠️ Verification failed: HTTP ${verifyResponse.status}`);
        }
      } catch (verifyError) {
        console.warn('⚠️ Could not verify upload:', verifyError);
      }
      
      // Update the model with the zip URL if we found the model
      if (modelData) {
        console.log(`Updating model ${modelData.id} status to 'files_uploaded'`);
        const { error: updateError } = await supabase
          .from('models')
          .update({ 
            status: 'files_uploaded'
          })
          .eq('id', modelData.id);

        if (updateError) {
          console.error('Error updating model in Supabase:', updateError);
          // Continue anyway since the files were uploaded
        } else {
          console.log('Model status updated successfully');
        }
      }

      console.log('=== UPLOAD PROCESS COMPLETED SUCCESSFULLY ===');
      return NextResponse.json({
        success: true,
        zipUrl: publicUrl.publicUrl,
        message: `Successfully uploaded ${files.length} files as a zip`
      });
    } catch (zipError) {
      console.error('Error generating or processing zip file:', zipError);
      return NextResponse.json(
        { error: `Failed to generate zip file: ${zipError instanceof Error ? zipError.message : 'Unknown error'}`, success: false },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error handling file upload:', error);
    console.error('Full error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to upload files',
        success: false
      },
      { status: 500 }
    );
  }
}

// Helper function to get file extension with dot
function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
}

// Cancel a training in Replicate
async function cancelTraining(trainingId: string) {
  if (!trainingId) {
    return NextResponse.json(
      { error: 'Training ID is required', success: false },
      { status: 400 }
    );
  }

  console.log('Cancelling training with ID:', trainingId);

  try {
    // First, try to find the training in Supabase to get the correct Replicate training ID
    const supabase = createSupabaseAdmin();
    
    // Try to find by training_id first (this is the Replicate ID)
    const { data: trainingData, error: trainingError } = await supabase
      .from('trainings')
      .select('*, models!inner(*)')
      .eq('training_id', trainingId)
      .single();
    
    // If not found, try to find by internal id
    if (trainingError) {
      console.log('Training not found by training_id, trying internal id');
      const { data: internalTrainingData, error: internalTrainingError } = await supabase
        .from('trainings')
        .select('*, models!inner(*)')
        .eq('id', trainingId)
        .single();
      
      if (internalTrainingError) {
        console.error('Error finding training in Supabase:', internalTrainingError);
        return NextResponse.json(
          { error: 'Training not found in database', success: false },
          { status: 404 }
        );
      }
      
      // Use the Replicate training_id for cancellation
      trainingId = internalTrainingData.training_id;
      
      // Now we have the correct Replicate training ID
      console.log('Using Replicate training ID for cancellation:', trainingId);
      
      // Cancel the training in Replicate
      console.log('Calling replicate.trainings.cancel with ID:', trainingId);
      const response = await replicate.trainings.cancel(trainingId);
      
      console.log('Training cancelled successfully, response:', JSON.stringify(response, null, 2));
      
      // Update the training status in Supabase
      const { error: updateTrainingError } = await supabase
        .from('trainings')
        .update({ 
          status: 'canceled',
          is_cancelled: true,
          completed_at: new Date().toISOString()
        })
        .eq('training_id', trainingId);
      
      if (updateTrainingError) {
        console.error('Error updating training status in Supabase:', updateTrainingError);
      } else {
        console.log('Successfully updated training status in Supabase');
      }
      
      // Check if this is the only active training for the model
      const { data: activeTrainings, error: activeTrainingsError } = await supabase
        .from('trainings')
        .select('id')
        .eq('model_id', internalTrainingData.model_id)
        .in('status', ['training', 'starting', 'created', 'queued'])
        .neq('training_id', trainingId);
      
      if (!activeTrainingsError && (!activeTrainings || activeTrainings.length === 0)) {
        // Update the model status if this was the only active training
        const { error: updateModelError } = await supabase
          .from('models')
          .update({ status: 'training_failed' })
          .eq('id', internalTrainingData.model_id);
        
        if (updateModelError) {
          console.error('Error updating model status in Supabase:', updateModelError);
        }
      }
      
      return NextResponse.json({
        success: true,
        training: {
          id: trainingId,
          status: 'canceled',
          modelId: internalTrainingData.model_id
        }
      });
    }
    
    // If we found the training by training_id, proceed with cancellation
    console.log('Found training by training_id, proceeding with cancellation');
    
    // Cancel the training in Replicate
    console.log('Calling replicate.trainings.cancel with ID:', trainingId);
    const response = await replicate.trainings.cancel(trainingId);

    console.log('Training cancelled successfully, response:', JSON.stringify(response, null, 2));

    // Update the training status in Supabase
    const { error: updateTrainingError } = await supabase
      .from('trainings')
      .update({ 
        status: 'canceled',
        is_cancelled: true,
        completed_at: new Date().toISOString()
      })
      .eq('training_id', trainingId);

    if (updateTrainingError) {
      console.error('Error updating training status in Supabase:', updateTrainingError);
    } else {
      console.log('Successfully updated training status in Supabase');
    }

    // Check if this is the only active training for the model
    const { data: activeTrainings, error: activeTrainingsError } = await supabase
      .from('trainings')
      .select('id')
      .eq('model_id', trainingData.model_id)
      .in('status', ['training', 'starting', 'created', 'queued'])
      .neq('training_id', trainingId);

    if (!activeTrainingsError && (!activeTrainings || activeTrainings.length === 0)) {
      // Update the model status if this was the only active training
      const { error: updateModelError } = await supabase
        .from('models')
        .update({ status: 'training_failed' })
        .eq('id', trainingData.model_id);

      if (updateModelError) {
        console.error('Error updating model status in Supabase:', updateModelError);
      }
    }

    return NextResponse.json({
      success: true,
      training: {
        id: trainingId,
        status: 'canceled',
        modelId: trainingData.model_id
      }
    });
  } catch (error) {
    console.error('Error cancelling training:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to cancel training',
        success: false
      },
      { status: 500 }
    );
  }
} 