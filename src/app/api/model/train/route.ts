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
  training_steps: 1500
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
    const action = body.action;

    // Handle different actions
    switch (action) {
      case 'create':
        const { modelName, owner, displayName, gender } = body;
        
        if (!modelName || !owner || !displayName) {
          return NextResponse.json(
            { error: 'Missing required parameters: modelName, owner, and displayName are required', success: false },
            { status: 400 }
          );
        }
        
        return await createModel(modelName, owner, displayName, gender, supabase);

      case 'train':
        const { modelOwner, modelName: trainModelName, zipUrl } = body;
        
        if (!modelOwner || !trainModelName || !zipUrl) {
          return NextResponse.json(
            { error: 'Missing required parameters: modelOwner, modelName, and zipUrl are required', success: false },
            { status: 400 }
          );
        }
        
        return await trainModel(modelOwner, trainModelName, zipUrl, supabase);

      case 'initBucket':
        // Initialize the storage bucket
        return await initializeBucket(supabase);

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: create, train, initBucket', success: false },
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
async function createModel(modelName: string, owner: string, displayName: string, gender: string, supabase: SupabaseClient) {
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
        visibility: 'private',
        hardware: 'gpu-t4'
      }
    );

    // Store the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .insert({
        model_id: modelName,
        model_owner: model.owner,
        display_name: displayName,
        gender: gender
        // user_id is now handled by Supabase trigger
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
        url: `https://replicate.com/${model.owner}/${model.name}`
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
      "8b10794665aed907bb98a1a5324cd1d3a8bea0e9b31e65210967fb9c9e2e08ed",
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

// Initialize the storage bucket
async function initializeBucket(supabase: SupabaseClient) {
  try {
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
          fileSizeLimit: 250 * 1024 * 1024, // 250MB limit
        });
        
        if (createBucketError) {
          // Continue anyway, as the bucket might already exist but not be visible to this user
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