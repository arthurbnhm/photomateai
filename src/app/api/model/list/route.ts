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
  created_at: string;
  is_deleted: boolean;
  user_id?: string;
  trainings: Training[];
  training_id?: string;
  training_status?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const modelId = searchParams.get('modelId');
    const status = searchParams.get('status');
    const isCancelled = searchParams.get('is_cancelled');
    const isDeleted = searchParams.get('is_deleted');

    // Pagination parameters
    const hasPageParam = searchParams.has('page');
    const hasLimitParam = searchParams.has('limit');

    let limit = 10; // Default limit if pagination params are present but one is missing
    let page = 1;   // Default page
    let offset = 0;

    if (hasPageParam || hasLimitParam) {
      limit = parseInt(searchParams.get('limit') || '10', 10);
      page = parseInt(searchParams.get('page') || '1', 10);
      offset = (page - 1) * limit;
    }

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

      // Add training information to the model
      if (trainings && trainings.length > 0) {
        // Use the first training
        const training = trainings[0];
        model.training_id = training.training_id;
        model.training_status = training.status;
      } else {
        model.training_status = null;
      }

      return NextResponse.json({
        success: true,
        model,
        trainings
      });
    }

    // Otherwise, fetch a list of models
    let modelsListQuery = supabase
      .from('models')
      .select('*, trainings!trainings_model_id_fkey(*)')
      .eq('is_deleted', isDeleted === 'true' ? true : (isDeleted === 'false' ? false : false))
      .eq('user_id', authenticatedUserId) // Always filter by authenticated user
      .order('created_at', { ascending: false });

    // Apply pagination ONLY if page or limit parameters are present
    if (hasPageParam || hasLimitParam) {
      modelsListQuery = modelsListQuery.range(offset, offset + limit - 1).limit(limit);
    }
    // If no page/limit params, the query will fetch all matching models.

    const { data: models, error: modelsError } = await modelsListQuery;


    if (modelsError) {
      console.error('Error fetching models:', modelsError);
      return NextResponse.json(
        { error: 'Failed to fetch models', success: false },
        { status: 500 }
      );
    }

    // Process models to add training information
    const processedModels = await Promise.all(models.map(async (model) => {
      // First check if trainings are already loaded with the model
      if (model.trainings && model.trainings.length > 0) {
        // Use the first (and only) training
        const training = model.trainings[0];
        model.training_id = training.training_id;
        model.is_cancelled = training.is_cancelled;
        model.training_status = training.status;
      } else {
        // If no trainings loaded with model, fetch it separately
        const { data: trainingData } = await supabase
          .from('trainings')
          .select('training_id, is_cancelled, status')
          .eq('model_id', model.id)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (trainingData && trainingData.length > 0) {
          const training = trainingData[0];
          model.training_id = training.training_id;
          model.is_cancelled = training.is_cancelled;
          model.training_status = training.status;
        } else {
          model.training_status = null;
        }
      }
      
      return model;
    }));

    // Filter by status if provided
    let statusFilteredModels = processedModels;
    if (status) {
      statusFilteredModels = processedModels.filter(model => 
        model.training_status === status
      );
    }

    // Filter models based on is_cancelled parameter if provided
    let filteredModels = statusFilteredModels;
    
    if (isCancelled !== null) {
      const isCancelledBool = isCancelled === 'true';
      filteredModels = statusFilteredModels.filter(model => {
        // If is_cancelled is explicitly defined on the model, use that
        if (typeof model.is_cancelled !== 'undefined') {
          return model.is_cancelled === isCancelledBool;
        }
        // Default behavior (if is_cancelled is not specified, assume it's false)
        return !isCancelledBool;
      });
    } else {
      // Default behavior: filter out cancelled models
      filteredModels = statusFilteredModels.filter(model => !model.is_cancelled);
    }
    
    // Filter out cancelled trainings from the results
    const finalModels = filteredModels.map((model): Model => ({
      ...model,
      trainings: model.trainings.filter((training: Training) => !training.is_cancelled)
    }));

    // Get total count for pagination metadata (always count all matching models for the user)
    const countQueryBuilder = supabase
      .from('models')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', isDeleted === 'true' ? true : (isDeleted === 'false' ? false : false)) // Match is_deleted filter
      .eq('user_id', authenticatedUserId);
    
    const { count: totalCount, error: countError } = await countQueryBuilder;

    if (countError) {
      console.error('Error counting models:', countError);
      // Not returning error here, as fetching models might have succeeded
    }
    
    // For the pagination object in response:
    // If we fetched all models (no page/limit params), page is 1, limit is totalCount, pages is 1.
    // Otherwise, use the provided page/limit.
    const responsePage = (hasPageParam || hasLimitParam) ? page : 1;
    const responseLimit = (hasPageParam || hasLimitParam) ? limit : (totalCount || finalModels.length); // Use finalModels.length if totalCount is null
    const responsePages = (hasPageParam || hasLimitParam) ? Math.ceil((totalCount || 0) / limit) : 1;


    return NextResponse.json({
      success: true,
      models: finalModels,
      pagination: {
        total: totalCount || finalModels.length, // Use finalModels.length if totalCount is null
        page: responsePage,
        limit: responseLimit,
        pages: responsePages
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