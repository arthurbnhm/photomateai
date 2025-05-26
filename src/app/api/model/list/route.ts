import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  gender?: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const modelId = searchParams.get('modelId');
    const status = searchParams.get('status');
    const isCancelled = searchParams.get('is_cancelled');
    const isDeleted = searchParams.get('is_deleted');

    const supabase = await createSupabaseServerClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session', success: false },
        { status: 401 }
      );
    }
    
    const authenticatedUserId = user.id;

    if (modelId) {
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

      if (trainings && trainings.length > 0) {
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

    const modelsListQuery = supabase
      .from('models')
      .select('*, trainings!trainings_model_id_fkey(*)')
      .eq('is_deleted', isDeleted === 'true' ? true : (isDeleted === 'false' ? false : false))
      .eq('user_id', authenticatedUserId)
      .order('created_at', { ascending: false });

    const { data: models, error: modelsError } = await modelsListQuery;

    if (modelsError) {
      console.error('Error fetching models:', modelsError);
      return NextResponse.json(
        { error: 'Failed to fetch models', success: false },
        { status: 500 }
      );
    }

    const processedModels = await Promise.all(models.map(async (model) => {
      if (model.trainings && model.trainings.length > 0) {
        const training = model.trainings[0];
        model.training_id = training.training_id;
        model.is_cancelled = training.is_cancelled;
        model.training_status = training.status;
      } else {
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

    let statusFilteredModels = processedModels;
    if (status) {
      statusFilteredModels = processedModels.filter(model => 
        model.training_status === status
      );
    }

    let filteredModels = statusFilteredModels;
    
    if (isCancelled !== null) {
      const isCancelledBool = isCancelled === 'true';
      filteredModels = statusFilteredModels.filter(model => {
        if (typeof model.is_cancelled !== 'undefined') {
          return model.is_cancelled === isCancelledBool;
        }
        return !isCancelledBool;
      });
    } else {
      filteredModels = statusFilteredModels.filter(model => !model.is_cancelled);
    }
    
    const finalModels = filteredModels.map((model): Model => ({
      ...model,
      trainings: model.trainings.filter((training: Training) => !training.is_cancelled)
    }));

    return NextResponse.json({
      success: true,
      models: finalModels,
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
    
    const supabase = await createSupabaseServerClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }
    
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

        const { data: trainingToUpdate, error: trainingFetchError } = await supabase
          .from('trainings')
          .select('model_id, models(user_id)')
          .eq('id', trainingId)
          .single();

        let ownerUserId: string | null | undefined = null;

        if (trainingToUpdate && trainingToUpdate.models && Array.isArray(trainingToUpdate.models) && trainingToUpdate.models.length > 0) {
          ownerUserId = trainingToUpdate.models[0]?.user_id;
        } else if (trainingToUpdate && trainingToUpdate.models && !Array.isArray(trainingToUpdate.models)) {
          ownerUserId = (trainingToUpdate.models as { user_id: string }).user_id;
        }

        if (trainingFetchError || !trainingToUpdate || !ownerUserId || ownerUserId !== user.id) {
          return NextResponse.json(
            { error: 'Unauthorized to update this training or training not found', success: false },
            { status: 403 }
          );
        }

        const { error: updateTrainingError } = await supabase
          .from('trainings')
          .update({ 
            status,
            ...(status === 'succeeded' || status === 'failed' || status === 'canceled' ? { completed_at: new Date().toISOString() } : {})
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

      case 'updateAttributes':
        if (!modelId) {
          return NextResponse.json(
            { error: 'Model ID is required', success: false },
            { status: 400 }
          );
        }

        const { attributes } = body;
        
        if (!Array.isArray(attributes)) {
          return NextResponse.json(
            { error: 'Attributes must be an array', success: false },
            { status: 400 }
          );
        }

        // Verify the model belongs to the authenticated user
        const { data: modelForAttributes, error: attributesModelFetchError } = await supabase
          .from('models')
          .select('user_id')
          .eq('id', modelId)
          .single();

        if (attributesModelFetchError || !modelForAttributes || modelForAttributes.user_id !== user.id) {
          return NextResponse.json(
            { error: 'Unauthorized to update this model or model not found', success: false },
            { status: 403 }
          );
        }

        // Update the model's attributes
        const { error: updateAttributesError } = await supabase
          .from('models')
          .update({ attributes })
          .eq('id', modelId);

        if (updateAttributesError) {
          console.error('Error updating model attributes:', updateAttributesError);
          return NextResponse.json(
            { error: 'Failed to update model attributes', success: false },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Model attributes updated successfully'
        });

      case 'markAsDeleted':
        if (!modelId) {
          return NextResponse.json(
            { error: 'Model ID is required', success: false },
            { status: 400 }
          );
        }

        const { data: modelToDelete, error: modelFetchError } = await supabase
            .from('models')
            .select('user_id')
            .eq('id', modelId)
            .single();

        if (modelFetchError || !modelToDelete || modelToDelete.user_id !== user.id) {
            return NextResponse.json(
                { error: 'Unauthorized to delete this model or model not found', success: false },
                { status: 403 }
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