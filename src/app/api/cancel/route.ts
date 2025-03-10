import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request: NextRequest) {
  try {
    const { predictionId } = await request.json();
    const supabase = createServerClient();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!predictionId) {
      return NextResponse.json(
        { error: 'Prediction ID is required' },
        { status: 400 }
      );
    }

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      console.error('REPLICATE_API_TOKEN is not set');
      return NextResponse.json(
        { 
          error: "Missing Replicate API token. Please add your token to the .env file or environment variables.",
          details: "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens"
        },
        { status: 401 }
      );
    }

    // Cancelling prediction
    // console.log('Cancelling prediction:', predictionId);

    try {
      // First, check if this is a prediction ID or a replicate ID
      let replicateId = predictionId;
      
      // If it's a UUID format (prediction ID), look up the replicate_id
      if (predictionId.includes('-')) {
        const { data: prediction, error } = await supabase
          .from('predictions')
          .select('replicate_id')
          .eq('id', predictionId)
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (error) {
          console.error('Error looking up prediction:', error);
          return NextResponse.json(
            { error: 'Failed to find prediction', details: error.message },
            { status: 500 }
          );
        }
        
        if (!prediction || !prediction.replicate_id) {
          console.error('No replicate_id found for prediction:', predictionId);
          return NextResponse.json(
            { error: 'No replicate_id found for this prediction' },
            { status: 404 }
          );
        }
        
        replicateId = prediction.replicate_id;
      }

      // Cancel the prediction using Replicate API
      await replicate.predictions.cancel(replicateId);
      // console.log('Prediction cancelled successfully:', response);

      // Update the prediction in Supabase
      const { error: updateError } = await supabase
        .from('predictions')
        .update({ 
          status: 'canceled',
          is_cancelled: true,
          completed_at: new Date().toISOString()
        })
        .eq('replicate_id', replicateId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating prediction in Supabase:', updateError);
        
        // If the update failed, double check if the prediction exists in Supabase
        const { data: existingPrediction, error: lookupError } = await supabase
          .from('predictions')
          .select('id, replicate_id')
          .eq('replicate_id', replicateId)
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (lookupError) {
          console.error('Error looking up prediction:', lookupError);
        } else if (!existingPrediction) {
          // console.log(`No prediction found with replicate_id: ${replicateId}. It might not be in the database yet.`);
        } else {
          // console.log(`Found prediction with replicate_id: ${replicateId}, but failed to update it.`);
        }
        
        // Return success anyway since we successfully cancelled the prediction in Replicate
        return NextResponse.json({ 
          success: true, 
          message: 'Prediction cancelled successfully, but failed to update database',
          details: updateError
        });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Prediction cancelled successfully'
      });

    } catch (error) {
      console.error('Error cancelling prediction:', error);
      
      // Even if the Replicate API call fails, try to mark it as cancelled in Supabase anyway
      // This handles cases where the prediction might be done or not found in Replicate
      try {
        // console.log('Attempting to mark prediction as cancelled in database despite Replicate API error');
        
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
          .eq('user_id', user.id);
          
        if (!fallbackUpdateError) {
          // console.log('Successfully marked prediction as cancelled in database');
          return NextResponse.json({ 
            success: true, 
            message: 'Prediction marked as cancelled in database (Replicate API error ignored)'
          });
        }
      } catch (fallbackError) {
        console.error('Error in fallback cancellation:', fallbackError);
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to cancel prediction', 
          details: error instanceof Error ? error.message : 'Unknown error' 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 