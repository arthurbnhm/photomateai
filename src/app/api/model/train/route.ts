import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Define constant training parameters for fast-flux-trainer
const TRAINING_PARAMS = {
  lora_type: "subject",
  trigger_word: "TOK",
  training_steps: 1000
};

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client with user session
    const supabase = await createSupabaseServerClient();
    
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
    
    return await trainModel(modelOwner, modelName, zipUrl, supabase);
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
async function trainModel(modelOwner: string, modelName: string, zipUrl: string, supabase: SupabaseClient) {
  try {
    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .single();

    if (modelError) {
      return NextResponse.json(
        { error: 'Model not found in database', success: false },
        { status: 404 }
      );
    }

    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL && `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`;

    // Create the training in Replicate using fast-flux-trainer
    const training = await replicate.trainings.create(
      "replicate",
      "fast-flux-trainer",
      "d0f6d9aa8257e0fd535c4d20b3dc4d91d26d6329a45c5ff5109c6fbff107efd8",
      {
        destination: `${modelOwner}/${modelName}`,
        input: { ...TRAINING_PARAMS, input_images: zipUrl },
        webhook: webhookUrl,
        webhook_events_filter: ["start", "completed"]
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
        input_params: TRAINING_PARAMS
        // user_id is now handled by Supabase trigger
      });

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