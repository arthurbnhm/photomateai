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

    const { action, modelName, owner, modelOwner, visibility, hardware, zipUrl, trainingId } = await request.json();

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
        return await createModel(modelName, owner, visibility as Visibility, hardware);
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
async function createModel(modelName: string, owner: string, visibility: Visibility, hardware: string) {
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
        name: modelName,
        owner: owner,
        replicate_owner: model.owner,
        replicate_name: model.name,
        visibility: model.visibility,
        hardware: hardware || 'gpu-t4',
        status: 'created'
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
    return NextResponse.json(
      { error: 'Model owner, name, and zip URL are required', success: false },
      { status: 400 }
    );
  }

  console.log('Training model with parameters:', { 
    modelOwner, 
    modelName,
    zipUrl
  });

  try {
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();

    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('replicate_owner', modelOwner)
      .eq('replicate_name', modelName)
      .single();

    if (modelError) {
      console.error('Error finding model in Supabase:', modelError);
      return NextResponse.json(
        { error: 'Model not found in database', success: false },
        { status: 404 }
      );
    }

    // Define training parameters
    const trainingParams = {
      steps: 3,
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

    // Create the training in Replicate
    const training = await replicate.trainings.create(
      "ostris",
      "flux-dev-lora-trainer",
      "b6af14222e6bd9be257cbc1ea4afda3cd0503e1133083b9d1de0364d8568e6ef",
      {
        // Set the destination model
        destination: `${modelOwner}/${modelName}`,
        input: trainingParams,
        // Add webhook configuration with ngrok URL
        webhook: "https://4805-2a01-e0a-301-d300-fdc3-35f9-17aa-dd13.ngrok-free.app/api/webhook",
        webhook_events_filter: ["start", "output", "completed"]
      }
    );

    console.log('Training created successfully:', training);

    // Store the training in Supabase
    const { error: trainingError } = await supabase
      .from('trainings')
      .insert({
        model_id: modelData.id,
        replicate_training_id: training.id,
        status: training.status,
        zip_url: zipUrl,
        input_params: trainingParams
      });

    if (trainingError) {
      console.error('Error storing training in Supabase:', trainingError);
      // Continue anyway since the training was created in Replicate
    }

    // Update the model status
    const { error: updateError } = await supabase
      .from('models')
      .update({ status: 'training' })
      .eq('id', modelData.id);

    if (updateError) {
      console.error('Error updating model status in Supabase:', updateError);
    }

    return NextResponse.json({
      success: true,
      training: {
        id: training.id,
        status: training.status,
        url: `https://replicate.com/p/${training.id}`
      }
    });
  } catch (error) {
    console.error('Error training model:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to train model',
        success: false
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
    const formData = await request.formData();
    const modelOwner = formData.get('modelOwner') as string;
    const modelName = formData.get('modelName') as string;
    const files = formData.getAll('files') as File[];

    if (!modelOwner || !modelName || files.length === 0) {
      return NextResponse.json(
        { error: 'Model owner, name, and files are required', success: false },
        { status: 400 }
      );
    }

    // Initialize Supabase client with admin privileges
    const supabase = createSupabaseAdmin();
    
    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('replicate_owner', modelOwner)
      .eq('replicate_name', modelName)
      .single();

    if (modelError) {
      console.error('Error finding model in Supabase:', modelError);
      // Continue anyway since we can still upload the files
    }
    
    // Create a zip file directly
    const zip = new JSZip();
    
    // Add each file to the zip
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Read the file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      // Add to zip with a simple numbered name
      zip.file(`${i + 1}${getFileExtension(file.name)}`, arrayBuffer);
    }
    
    // Generate the zip file
    const zipContent = await zip.generateAsync({ type: 'blob' });
    
    // Convert Blob to ArrayBuffer for Supabase upload
    const zipArrayBuffer = await zipContent.arrayBuffer();
    
    // Upload the zip file directly to Supabase
    const zipPath = `${modelOwner}/${modelName}/images.zip`;
    const { error: uploadError } = await supabase.storage
      .from('training-files')
      .upload(zipPath, zipArrayBuffer, {
        contentType: 'application/zip',
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading zip file:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload zip file: ${uploadError.message}`, success: false },
        { status: 500 }
      );
    }
    
    // Get the public URL for the zip file
    const { data: publicUrl } = supabase.storage
      .from('training-files')
      .getPublicUrl(zipPath);
    
    console.log(`Zip file uploaded: ${publicUrl.publicUrl}`);

    // Update the model with the zip URL if we found the model
    if (modelData) {
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          status: 'files_uploaded'
        })
        .eq('id', modelData.id);

      if (updateError) {
        console.error('Error updating model in Supabase:', updateError);
        // Continue anyway since the files were uploaded
      }
    }

    return NextResponse.json({
      success: true,
      zipUrl: publicUrl.publicUrl,
      message: `Successfully uploaded ${files.length} files as a zip`
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
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
    // Cancel the training in Replicate
    // Note: Despite the API docs indicating training_id should be a number,
    // the Replicate Node.js client expects a string. Let's use it as is
    // but add more detailed error logging if it fails.
    console.log('Calling replicate.trainings.cancel with ID:', trainingId);
    const response = await replicate.trainings.cancel(trainingId);

    console.log('Training cancelled successfully, response:', JSON.stringify(response, null, 2));

    // Initialize Supabase client
    const supabase = createSupabaseAdmin();

    // Find the training in Supabase
    const { data: trainingData, error: trainingError } = await supabase
      .from('trainings')
      .select('*, models!inner(*)')
      .eq('replicate_training_id', trainingId)
      .single();

    if (trainingError) {
      console.error('Error finding training in Supabase:', trainingError);
      return NextResponse.json(
        { 
          error: 'Training not found in database, but was cancelled in Replicate',
          success: true,
          training: {
            id: trainingId,
            status: 'canceled'
          }
        }
      );
    }

    console.log('Found training in database:', JSON.stringify(trainingData, null, 2));

    // Update the training status in Supabase
    const { error: updateTrainingError } = await supabase
      .from('trainings')
      .update({ 
        status: 'canceled',
        is_cancelled: true,
        completed_at: new Date().toISOString()
      })
      .eq('replicate_training_id', trainingId);

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
      .neq('replicate_training_id', trainingId);

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