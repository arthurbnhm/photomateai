import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';
import { SupabaseClient } from '@supabase/supabase-js';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client with user session
    const supabase = createServerClient();
    
    // Get the current user
    const { data, error: userError } = await supabase.auth.getUser();
    let user = data.user;
    
    if (userError || !user) {
      // Check for Authorization header as fallback
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // Authenticate with the token
        const { data: { user: tokenUser }, error: tokenError } = await supabase.auth.getUser(token);
        
        if (tokenError || !tokenUser) {
          return NextResponse.json(
            { error: 'Unauthorized: Invalid token', success: false },
            { status: 401 }
          );
        }
        
        // Use the token user
        user = tokenUser;
      } else {
        return NextResponse.json(
          { error: 'Unauthorized', success: false },
          { status: 401 }
        );
      }
    }

    // Parse the body
    const body = await request.json();
    const { modelOwner, modelName, zipUrl } = body;
    
    if (!modelOwner || !modelName || !zipUrl) {
      return NextResponse.json(
        { error: 'Missing required parameters', success: false },
        { status: 400 }
      );
    }
    
    return await trainModel(modelOwner, modelName, zipUrl, user.id, supabase);
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

// Train a model using Replicate
async function trainModel(modelOwner: string, modelName: string, zipUrl: string, userId: string, supabase: SupabaseClient) {
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
    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .eq('user_id', userId)
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