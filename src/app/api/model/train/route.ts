import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';
import { SupabaseClient } from '@supabase/supabase-js';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Define constant training parameters
const TRAINING_PARAMS = {
  steps: 3,
  lora_rank: 16,
  optimizer: "adamw8bit",
  batch_size: 1,
  resolution: "512,768,1024",
  autocaption: true,
  trigger_word: "TOK",
  learning_rate: 0.0004,
  wandb_project: "flux_train_replicate",
  wandb_save_interval: 100,
  caption_dropout_rate: 0.05,
  cache_latents_to_disk: false,
  wandb_sample_interval: 100,
  gradient_checkpointing: false
};

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
        { error: 'Missing required parameters: modelOwner, modelName, and zipUrl are required', success: false },
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
      return NextResponse.json(
        { error: 'Model not found in database', success: false },
        { status: 404 }
      );
    }

    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL && `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`;

    // Create the training in Replicate
    const training = await replicate.trainings.create(
      "ostris",
      "flux-dev-lora-trainer",
      "b6af14222e6bd9be257cbc1ea4afda3cd0503e1133083b9d1de0364d8568e6ef",
      {
        destination: `${modelOwner}/${modelName}`,
        input: { ...TRAINING_PARAMS, input_images: zipUrl },
        webhook: webhookUrl,
        webhook_events_filter: ["start", "output", "logs", "completed"]
      }
    );

    // Store the training in Supabase
    await supabase
      .from('trainings')
      .insert({
        model_id: modelData.id,
        training_id: training.id,
        status: training.status,
        zip_url: zipUrl,
        input_params: TRAINING_PARAMS,
        user_id: userId
      });

    // Update the model status to 'training'
    await supabase
      .from('models')
      .update({ status: 'training' })
      .eq('id', modelData.id);

    return NextResponse.json({
      success: true,
      training: {
        id: training.id,
        status: training.status,
        url: `https://replicate.com/p/${training.id}`
      }
    });
  } catch (error) {
    console.error('Error in trainModel:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create training',
        success: false
      },
      { status: 500 }
    );
  }
} 