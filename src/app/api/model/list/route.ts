import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Define types for the database entities
interface Training {
  id: string;
  model_id: string;
  training_id: string;
  status: string;
  zip_url: string;
  input_params: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  is_cancelled: boolean;
}

interface Model {
  id: string;
  model_id: string;
  model_owner: string;
  display_name: string;
  status: string;
  created_at: string;
  is_deleted: boolean;
  user_id?: string;
  trainings: Training[];
  training_id?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const modelId = searchParams.get('modelId');
    const status = searchParams.get('status');
    const isCancelled = searchParams.get('is_cancelled');
    const isDeleted = searchParams.get('is_deleted');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const offset = (page - 1) * limit;

    // Initialize Supabase client with user session
    const supabase = createServerClient();
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }
    
    // Get session for additional checks if needed
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session', success: false },
        { status: 401 }
      );
    }
    
    const authenticatedUserId = user.id;

    // If modelId is provided, fetch a specific model with its trainings
    if (modelId) {
      // Get the model
      const modelQuery = supabase
        .from('models')
        .select('*, trainings(*)')
        .eq('id', modelId)
        .eq('is_deleted', false)
        .eq('user_id', authenticatedUserId);
      
      const { data: model, error: modelError } = await modelQuery.single();

      if (modelError) {
        return NextResponse.json(
          { error: 'Model not found', success: false },
          { status: 404 }
        );
      }

      // Get the trainings for this model
      const { data: trainings, error: trainingsError } = await supabase
        .from('trainings')
        .select('*')
        .eq('model_id', modelId)
        .eq('is_cancelled', false)
        .order('created_at', { ascending: false });

      if (trainingsError) {
        console.error('Error fetching trainings:', trainingsError);
        return NextResponse.json(
          { error: 'Failed to fetch trainings', success: false },
          { status: 500 }
        );
      }

      // If model is in training status but has no active trainings, get the latest training ID
      if ((model.status === "training" || model.status === "created") && 
          (!trainings || trainings.length === 0)) {
        // Get any training for this model (even if cancelled)
        const { data: anyTraining } = await supabase
          .from('trainings')
          .select('training_id')
          .eq('model_id', modelId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (anyTraining) {
          model.training_id = anyTraining.training_id;
        }
      } else if (trainings && trainings.length > 0) {
        // Add the latest training ID to the model for convenience
        model.training_id = trainings[0].training_id;
      }

      return NextResponse.json({
        success: true,
        model,
        trainings
      });
    }

    // Otherwise, fetch a list of models with pagination
    let query = supabase
      .from('models')
      .select('*, trainings!trainings_model_id_fkey(*)')
      .eq('is_deleted', isDeleted === 'true' ? true : (isDeleted === 'false' ? false : false))
      .eq('user_id', authenticatedUserId); // Always filter by authenticated user

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Apply pagination
    const { data: models, error: modelsError } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .limit(limit);

    if (modelsError) {
      console.error('Error fetching models:', modelsError);
      return NextResponse.json(
        { error: 'Failed to fetch models', success: false },
        { status: 500 }
      );
    }

    // Process models to add training IDs for those in training status
    const processedModels = await Promise.all(models.map(async (model) => {
      // If model is in training status but has no active trainings
      if ((model.status === "training" || model.status === "created") && 
          (!model.trainings || model.trainings.length === 0)) {
        
        // Get any training for this model (even if cancelled)
        const { data: anyTraining } = await supabase
          .from('trainings')
          .select('training_id, is_cancelled')
          .eq('model_id', model.id)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (anyTraining && anyTraining.length > 0) {
          model.training_id = anyTraining[0].training_id;
          model.is_cancelled = anyTraining[0].is_cancelled;
        }
      } else if (model.trainings && model.trainings.length > 0) {
        // Add the latest training ID to the model for convenience
        const activeTraining = model.trainings.find((t: Training) => 
          t.status === "training" || t.status === "starting" || 
          t.status === "created" || t.status === "queued"
        );
        
        if (activeTraining) {
          model.training_id = activeTraining.training_id;
          model.is_cancelled = activeTraining.is_cancelled;
        } else {
          model.training_id = model.trainings[0].training_id;
          model.is_cancelled = model.trainings[0].is_cancelled;
        }
      }
      
      return model;
    }));

    // Filter models based on is_cancelled parameter if provided
    let filteredModels = processedModels;
    
    if (isCancelled !== null) {
      const isCancelledBool = isCancelled === 'true';
      filteredModels = processedModels.filter(model => {
        // If is_cancelled is explicitly defined on the model, use that
        if (typeof model.is_cancelled !== 'undefined') {
          return model.is_cancelled === isCancelledBool;
        }
        // Default behavior (if is_cancelled is not specified, assume it's false)
        return !isCancelledBool;
      });
    } else {
      // Default behavior: filter out cancelled models
      filteredModels = processedModels.filter(model => !model.is_cancelled);
    }
    
    // Filter out cancelled trainings from the results
    const finalModels = filteredModels.map((model): Model => ({
      ...model,
      trainings: model.trainings.filter((training: Training) => !training.is_cancelled)
    }));

    // Get total count for pagination with user_id filter if available
    let countQuery = supabase
      .from('models')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);
      
    // Apply user_id filter to count query if available
    if (authenticatedUserId) {
      countQuery = countQuery.eq('user_id', authenticatedUserId);
    }
    
    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting models:', countError);
    }

    return NextResponse.json({
      success: true,
      models: finalModels,
      pagination: {
        total: totalCount || 0,
        page,
        limit,
        pages: Math.ceil((totalCount || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error in model/list API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        success: false
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Initialize Supabase client with user session
    const supabase = createServerClient();
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }
    
    // Get session for additional checks if needed
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session', success: false },
        { status: 401 }
      );
    }
    
    const { action, modelId, trainingId, status } = body;

    switch (action) {
      case 'updateModelStatus':
        if (!modelId || !status) {
          return NextResponse.json(
            { error: 'Model ID and status are required', success: false },
            { status: 400 }
          );
        }

        const { error: updateModelError } = await supabase
          .from('models')
          .update({ status })
          .eq('id', modelId);

        if (updateModelError) {
          return NextResponse.json(
            { error: 'Failed to update model status', success: false },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Model status updated successfully'
        });

      case 'updateTrainingStatus':
        if (!trainingId || !status) {
          return NextResponse.json(
            { error: 'Training ID and status are required', success: false },
            { status: 400 }
          );
        }

        const { error: updateTrainingError } = await supabase
          .from('trainings')
          .update({ 
            status,
            ...(status === 'succeeded' || status === 'failed' ? { completed_at: new Date().toISOString() } : {})
          })
          .eq('id', trainingId);

        if (updateTrainingError) {
          return NextResponse.json(
            { error: 'Failed to update training status', success: false },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Training status updated successfully'
        });

      case 'markAsDeleted':
        if (!modelId) {
          return NextResponse.json(
            { error: 'Model ID is required', success: false },
            { status: 400 }
          );
        }

        const { error: markDeletedError } = await supabase
          .from('models')
          .update({ is_deleted: true })
          .eq('id', modelId);

        if (markDeletedError) {
          return NextResponse.json(
            { error: 'Failed to mark model as deleted', success: false },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Model marked as deleted successfully'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action', success: false },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in model/list API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        success: false
      },
      { status: 500 }
    );
  }
} 