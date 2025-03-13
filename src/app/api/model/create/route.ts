import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';
import { SupabaseClient } from '@supabase/supabase-js';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Define the Visibility type
type Visibility = 'public' | 'private';

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
    const { modelName, owner, visibility, hardware, displayName } = body;
    
    if (!modelName || !owner || !visibility || !hardware) {
      return NextResponse.json(
        { error: 'Missing required parameters', success: false },
        { status: 400 }
      );
    }
    
    return await createModel(modelName, owner, visibility, hardware, displayName, user.id, supabase);
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
async function createModel(modelName: string, owner: string, visibility: Visibility, hardware: string, displayName: string, userId: string, supabase: SupabaseClient) {
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