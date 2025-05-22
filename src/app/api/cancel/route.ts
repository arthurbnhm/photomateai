import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Common response types
type ErrorResponse = { error: string, details?: string, success: false };
type SuccessResponse<T> = { success: true, message?: string, details?: unknown } & T;

// Helper function to create error responses
function createErrorResponse(error: string, details?: string, status: number = 400): Response {
  const response: ErrorResponse = { error, success: false };
  if (details) response.details = details;
  return NextResponse.json(response, { status });
}

// Helper function to create success responses
function createSuccessResponse<T>(data: T, message?: string): Response {
  const response: SuccessResponse<T> = { ...data, success: true };
  if (message) response.message = message;
  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    
    // Get session for additional checks if needed
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return createErrorResponse('Unauthorized: Invalid session', undefined, 401);
    }

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      console.error('REPLICATE_API_TOKEN is not set');
      return createErrorResponse(
        "Missing Replicate API token. Please add your token to the .env file or environment variables.",
        "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens",
        401
      );
    }

    // Parse the request body
    const body = await request.json();
    const action = body.action || 'cancelPrediction'; // Default to prediction cancellation for backward compatibility

    switch (action) {
      case 'cancelPrediction':
        const { predictionId } = body;
        if (!predictionId) {
          return createErrorResponse('Prediction ID is required');
        }
        return await cancelPrediction(predictionId, supabase, user.id);

      case 'cancelTraining':
        const { trainingId } = body;
        if (!trainingId) {
          return createErrorResponse('Training ID is required');
        }
        return await cancelTraining(trainingId, supabase, user.id);

      default:
        return createErrorResponse('Invalid action');
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return createErrorResponse('Internal server error', undefined, 500);
  }
}

/**
 * Cancel a Replicate operation (prediction or training) and update its status in the database
 */
async function cancelReplicateOperation<T extends { id: string, status: string }>(
  operationId: string,
  cancelFunction: (id: string) => Promise<unknown>,
  updateTable: string,
  updateConditions: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<T | null> {
  try {
    // Cancel the operation in Replicate
    await cancelFunction(operationId);
    
    // Update the status in Supabase
    const { data, error } = await supabase
      .from(updateTable)
      .update({ 
        status: 'canceled',
        is_cancelled: true,
        completed_at: new Date().toISOString()
      })
      .match(updateConditions)
      .select()
      .single();
    
    if (error) {
      console.error(`Error updating ${updateTable} in Supabase:`, error);
      return null;
    }
    
    return data as T;
  } catch (error) {
    console.error(`Error cancelling ${updateTable}:`, error);
    throw error;
  }
}

// Cancel a prediction
async function cancelPrediction(predictionId: string, supabase: SupabaseClient, userId: string) {
  try {
    // First, check if this is a prediction ID or a replicate ID
    let replicateId = predictionId;
    
    // If it's a UUID format (prediction ID), look up the replicate_id
    if (predictionId.includes('-')) {
      const { data: prediction, error } = await supabase
        .from('predictions')
        .select('replicate_id')
        .eq('id', predictionId)
        .eq('user_id', userId)
        .maybeSingle();
        
      if (error) {
        console.error('Error looking up prediction:', error);
        return createErrorResponse('Failed to find prediction', error.message, 500);
      }
      
      if (!prediction || !prediction.replicate_id) {
        console.error('No replicate_id found for prediction:', predictionId);
        return createErrorResponse('No replicate_id found for this prediction', undefined, 404);
      }
      
      replicateId = prediction.replicate_id;
    }

    // Cancel the prediction using the common function
    const updatedPrediction = await cancelReplicateOperation(
      replicateId,
      replicate.predictions.cancel.bind(replicate.predictions),
      'predictions',
      { replicate_id: replicateId, user_id: userId },
      supabase
    );

    if (updatedPrediction) {
      return createSuccessResponse({ prediction: updatedPrediction }, 'Prediction cancelled successfully');
    }

    // If the update failed, double check if the prediction exists in Supabase
    const { data: existingPrediction, error: lookupError } = await supabase
      .from('predictions')
      .select('id, replicate_id')
      .eq('replicate_id', replicateId)
      .eq('user_id', userId)
      .maybeSingle();
      
    if (lookupError) {
      console.error('Error looking up prediction:', lookupError);
    }
    
    // Return success anyway since we successfully cancelled the prediction in Replicate
    return createSuccessResponse(
      { prediction: existingPrediction || { id: null, replicate_id: replicateId } },
      'Prediction cancelled successfully, but failed to update database'
    );
  } catch (error) {
    console.error('Error cancelling prediction:', error);
    
    // Even if the Replicate API call fails, try to mark it as cancelled in Supabase anyway
    try {
      // Determine which field to use for the query
      const field = predictionId.includes('-') ? 'id' : 'replicate_id';
      
      const { error: fallbackUpdateError } = await supabase
        .from('predictions')
        .update({ 
          status: 'canceled',
          is_cancelled: true,
          completed_at: new Date().toISOString()
        })
        .eq(field, predictionId)
        .eq('user_id', userId);
        
      if (!fallbackUpdateError) {
        return createSuccessResponse(
          { prediction: { id: predictionId } },
          'Prediction marked as cancelled in database (Replicate API error ignored)'
        );
      }
    } catch (fallbackError) {
      console.error('Error in fallback cancellation:', fallbackError);
    }
    
    return createErrorResponse(
      'Failed to cancel prediction',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}

// Helper function to delete training files (placeholder)
async function deleteTrainingFiles(
  // modelOwner: string,
  // modelName: string
): Promise<boolean> {
  try {
    // For now, we won't actually delete, just log what would be deleted
    // This is a placeholder for actual file deletion logic
    // console.log(`Would delete training files for ${modelOwner}/${modelName}`);

    return true;
  } catch (error) {
    console.error('Error deleting training files:', error);
    return false;
  }
}

// Cancel an ongoing training
async function cancelTraining(trainingId: string, supabase: SupabaseClient, userId: string) {
  if (!trainingId) {
    return createErrorResponse('Training ID is required');
  }

  try {
    // First, try to find the training in Supabase to get the correct Replicate training ID
    const { data: trainingData, error: trainingError } = await supabase
      .from('trainings')
      .select('*, models(*)')
      .eq('training_id', trainingId)
      .eq('user_id', userId)
      .single();
    
    // If not found, try to find by internal id
    if (trainingError) {
      const { data: internalTrainingData, error: internalTrainingError } = await supabase
        .from('trainings')
        .select('*, models!inner(*)')
        .eq('id', trainingId)
        .single();
      
      if (internalTrainingError) {
        return createErrorResponse('Training not found in database', undefined, 404);
      }
      
      // Use the Replicate training_id for cancellation
      const replicateTrainingId = internalTrainingData.training_id;
      
      try {
        // Cancel the training in Replicate
        await replicate.trainings.cancel(replicateTrainingId);
        
        // Update the training status in Supabase
        await supabase
          .from('trainings')
          .update({ 
            status: 'canceled',
            is_cancelled: true,
            completed_at: new Date().toISOString()
          })
          .eq('training_id', replicateTrainingId);
        
        // Delete training files
        if (internalTrainingData.models) {
          await deleteTrainingFiles(
            // internalTrainingData.models.model_owner,
            // internalTrainingData.models.model_id
          );
        }
        
        return createSuccessResponse({
          training: {
            id: replicateTrainingId,
            status: 'canceled',
            modelId: internalTrainingData.model_id
          }
        });
      } catch (error) {
        console.error('Error in training cancellation:', error);
        return createErrorResponse(
          'Failed to cancel training',
          error instanceof Error ? error.message : 'Unknown error',
          500
        );
      }
    }
    
    // If we found the training by training_id, proceed with cancellation
    try {
      // Cancel the training in Replicate
      await replicate.trainings.cancel(trainingId);

      // Update the training status in Supabase
      await supabase
        .from('trainings')
        .update({ 
          status: 'canceled',
          is_cancelled: true,
          completed_at: new Date().toISOString()
        })
        .eq('training_id', trainingId);

      // Delete training files
      if (trainingData.models) {
        await deleteTrainingFiles(
          // trainingData.models.model_owner,
          // trainingData.models.model_id
        );
      }

      return createSuccessResponse({
        training: {
          id: trainingId,
          status: 'canceled',
          modelId: trainingData.model_id
        }
      });
    } catch (error) {
      console.error('Error cancelling training:', error);
      return createErrorResponse(
        'Failed to cancel training',
        error instanceof Error ? error.message : 'Unknown error',
        500
      );
    }
  } catch (error) {
    console.error('Error in training cancellation process:', error);
    return createErrorResponse(
      'Failed to process training cancellation',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
} 