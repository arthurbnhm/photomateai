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

    // For JSON requests, parse the body
    const body = await request.json();
    const action = body.action;

    // Handle different actions
    switch (action) {
      case 'create':
        // Create a new model
        const { modelName, owner, visibility, hardware, displayName, userId } = body;
        if (!modelName || !owner || !visibility || !hardware || !userId) {
          return NextResponse.json(
            { error: 'Missing required parameters', success: false },
            { status: 400 }
          );
        }
        return await createModel(modelName, owner, visibility, hardware, displayName, userId);

      case 'train':
        // Start training a model
        const { modelOwner, modelName: trainModelName, zipUrl, userId: trainUserId } = body;
        if (!modelOwner || !trainModelName || !zipUrl || !trainUserId) {
          return NextResponse.json(
            { error: 'Missing required parameters', success: false },
            { status: 400 }
          );
        }
        return await trainModel(modelOwner, trainModelName, zipUrl, trainUserId);

      case 'initBucket':
        // Initialize the storage bucket
        return await initializeBucket();

      case 'cancelTraining':
        // Cancel an ongoing training
        const { trainingId } = body;
        if (!trainingId) {
          return NextResponse.json(
            { error: 'Missing training ID', success: false },
            { status: 400 }
          );
        }
        return await cancelTraining(trainingId);

      default:
        return NextResponse.json(
          { error: 'Invalid action', success: false },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        success: false
      },
      { status: 500 }
    );
  }
}

// Create a model in Replicate
async function createModel(modelName: string, owner: string, visibility: Visibility, hardware: string, displayName: string, userId: string) {
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

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required', success: false },
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
        display_name: displayName,
        user_id: userId
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
async function trainModel(modelOwner: string, modelName: string, zipUrl: string, userId: string) {
  if (!modelOwner || !modelName || !zipUrl) {
    console.error('Missing required parameters:', { modelOwner, modelName, zipUrl });
    return NextResponse.json(
      { error: 'Model owner, name, and zip URL are required', success: false },
      { status: 400 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required', success: false },
      { status: 400 }
    );
  }

  try {
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();

    // Find the model in Supabase
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

    // Verify the zip URL is accessible
    try {
      const zipResponse = await fetch(zipUrl, { method: 'HEAD' });
      if (zipResponse.ok) {
      } else {
        console.error('This may cause training to fail as Replicate cannot access the zip file');
      }
    } catch (verifyError) {
      console.error('⚠️ Could not verify zip URL:', verifyError);
      console.error('This may cause training to fail as Replicate cannot access the zip file');
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

    // Get webhook URL from environment or use fallback
    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL 
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook` 
      : undefined;
    
    if (!webhookUrl) {
      console.warn('No webhook URL available. Status updates will not be received.');
    }

    // Create the training in Replicate
    try {
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

      // Store the training in Supabase
      try {
        const trainingInsertData = {
          model_id: modelData.id,
          training_id: training.id,
          status: training.status,
          zip_url: zipUrl,
          input_params: trainingParams,
          user_id: userId
        };
        
        const { data: trainingData, error: trainingError } = await supabase
          .from('trainings')
          .insert(trainingInsertData)
          .select()
          .single();

        if (trainingError) {
          // Continue anyway since the training was created in Replicate
        } else {
          void trainingData; // Explicitly indicate we're using this variable
          // Training stored successfully
        }
      } catch (_) {
        void _; // Explicitly indicate we're ignoring this variable
        // Continue anyway since the training was created in Replicate
      }

      // Update the model status to 'training'
      const { error: _updateError } = await supabase
        .from('models')
        .update({ status: 'training' })
        .eq('id', modelData.id);

      if (_updateError) {
        // Continue anyway
      }

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
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    void buckets; // Explicitly indicate we're ignoring this variable
    void bucketsError; // Explicitly indicate we're ignoring this variable
    const bucketExists = buckets?.some(bucket => bucket.name === 'training-files');
    
    if (!bucketExists) {
      try {
        // Try to create the bucket
        const { error: createBucketError } = await supabase.storage.createBucket('training-files', {
          public: false, // Set to private as per RLS policies
          fileSizeLimit: 50 * 1024 * 1024, // 50MB limit
        });
        
        if (createBucketError) {
          // Continue anyway, as the bucket might already exist but not be visible to this user
        } else {
        }
      } catch (error) {
        void error; // Explicitly indicate we're ignoring this variable
        // Continue anyway, as the bucket might already exist
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error initializing bucket:', error);
    return NextResponse.json(
      { error: 'Failed to initialize storage bucket', success: false },
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
    const sessionToken = request.headers.get('authorization')?.split('Bearer ')[1];

    if (!modelOwner || !modelName || files.length === 0) {
      console.error('Missing required parameters for upload');
      return NextResponse.json(
        { error: 'Model owner, name, and files are required', success: false },
        { status: 400 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Authentication required', success: false },
        { status: 401 }
      );
    }

    // Initialize Supabase admin client for database operations
    const supabaseAdmin = createSupabaseAdmin();
    
    // Get user ID from session token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(sessionToken);
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid session token', success: false },
        { status: 401 }
      );
    }
    
    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabaseAdmin
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .single();

    if (modelError) {
      // Continue anyway since we can still upload the files
    } else {
      // Update the model with the user ID if it's not already set
      if (modelData && !modelData.user_id) {
        const { error: updateError } = await supabaseAdmin
          .from('models')
          .update({ user_id: user.id })
          .eq('id', modelData.id);
          
        if (updateError) {
          console.warn(`Failed to update model with user ID: ${updateError.message}`);
          // Continue anyway
        }
      }
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
    try {
      const zipContent = await zip.generateAsync({ type: 'blob' });
      
      // Check if zip size is approaching limit
      const sizeLimit = 50 * 1024 * 1024; // 50MB
      if (zipContent.size > sizeLimit * 0.8) {
        console.warn(`⚠️ Zip file size (${Math.round(zipContent.size / (1024 * 1024))} MB) is approaching the bucket limit (${sizeLimit / (1024 * 1024)} MB)`);
      }
      
      // Convert Blob to ArrayBuffer for Supabase upload
      const zipArrayBuffer = await zipContent.arrayBuffer();
      
      // Upload the zip file directly to Supabase using admin client
      // We need admin client here because we're uploading to the user's folder
      const zipPath = `${modelOwner}/${modelName}/images.zip`;
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from('training-files')
        .upload(zipPath, zipArrayBuffer, {
          contentType: 'application/zip',
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        return NextResponse.json(
          { error: `Failed to upload zip file: ${uploadError.message}`, success: false },
          { status: 500 }
        );
      }
      
      // Generate a signed URL that expires in 1 hour
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from('training-files')
        .createSignedUrl(zipPath, 60 * 60); // 1 hour in seconds

      if (signedUrlError || !signedUrlData) {
        return NextResponse.json(
          { error: `Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`, success: false },
          { status: 500 }
        );
      }
      
      // Update the model with the zip URL if we found the model
      if (modelData) {
        const { error: updateError } = await supabaseAdmin
          .from('models')
          .update({ 
            status: 'files_uploaded'
          })
          .eq('id', modelData.id);

        if (updateError) {
          // Continue anyway since the files were uploaded
        }
      }

      return NextResponse.json({
        success: true,
        zipUrl: signedUrlData.signedUrl,
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
      const { data: internalTrainingData, error: internalTrainingError } = await supabase
        .from('trainings')
        .select('*, models!inner(*)')
        .eq('id', trainingId)
        .single();
      
      if (internalTrainingError) {
        return NextResponse.json(
          { error: 'Training not found in database', success: false },
          { status: 404 }
        );
      }
      
      // Use the Replicate training_id for cancellation
      trainingId = internalTrainingData.training_id;
      
      // Now we have the correct Replicate training ID
      // Cancel the training in Replicate
      await replicate.trainings.cancel(trainingId);
      
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
      } else {
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
        }
      }
      
      // Delete the training files if they exist
      try {
        const modelOwner = internalTrainingData.models.model_owner;
        const modelName = internalTrainingData.models.model_id;
        const zipPath = `${modelOwner}/${modelName}/images.zip`;
        
        const { error: deleteError } = await supabase.storage
          .from('training-files')
          .remove([zipPath]);

        if (deleteError) {
          console.warn(`Failed to delete training files: ${deleteError.message}`);
          // Continue anyway since the training was canceled
        } else {
          console.log(`Successfully deleted training files: ${zipPath}`);
        }
      } catch (deleteError) {
        console.warn('Error deleting training files:', deleteError);
        // Continue anyway since the training was canceled
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
    // Cancel the training in Replicate
    await replicate.trainings.cancel(trainingId);

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
      }
    }

    // Delete the training files if they exist
    try {
      const modelOwner = trainingData.models.model_owner;
      const modelName = trainingData.models.model_id;
      const zipPath = `${modelOwner}/${modelName}/images.zip`;
      
      const { error: deleteError } = await supabase.storage
        .from('training-files')
        .remove([zipPath]);

      if (deleteError) {
        console.warn(`Failed to delete training files: ${deleteError.message}`);
        // Continue anyway since the training was canceled
      } else {
        console.log(`Successfully deleted training files: ${zipPath}`);
      }
    } catch (deleteError) {
      console.warn('Error deleting training files:', deleteError);
      // Continue anyway since the training was canceled
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