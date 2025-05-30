export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Max allowed for Vercel hobby plan

import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Disable caching for Next.js App Router
replicate.fetch = (url, options) => {
  return fetch(url, { ...options, cache: "no-store" });
};

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client
    const supabase = await createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Check if user is authenticated
    if (!user || userError) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to use this API' },
        { status: 401 }
      );
    }
    
    // Get session for additional checks if needed
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session' },
        { status: 401 }
      );
    }
    
    // Check if user has an active subscription and atomically decrement credits
    const { data: creditResult, error: creditError } = await supabase
      .rpc('decrement_user_credits', { p_user_id: user.id });
    
    if (creditError) {
      console.error('Error checking/decrementing credits:', creditError);
      return NextResponse.json(
        { error: 'Unable to process credit transaction. Please try again.' },
        { status: 500 }
      );
    }
    
    // Check if the function returned any results (user has active subscription with credits)
    if (!creditResult || creditResult.length === 0) {
      return NextResponse.json(
        { error: 'Insufficient credits or no active subscription. Please check your subscription status.' },
        { status: 403 }
      );
    }

    // Parse the request body
    const { prompt, imageUrl, originalPredictionId } = await request.json();

    // Validate required fields
    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Prompt is required for image editing' },
        { status: 400 }
      );
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required for editing' },
        { status: 400 }
      );
    }

    if (!originalPredictionId) {
      return NextResponse.json(
        { error: 'Original prediction ID is required' },
        { status: 400 }
      );
    }

    // Verify that the original prediction exists and belongs to the user
    const { data: originalPrediction, error: originalError } = await supabase
      .from('predictions')
      .select('id, user_id, aspect_ratio')
      .eq('id', originalPredictionId)
      .eq('user_id', user.id)
      .single();

    if (originalError || !originalPrediction) {
      return NextResponse.json(
        { error: 'Original prediction not found or access denied' },
        { status: 404 }
      );
    }

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        {
          error: "Missing Replicate API token. Please add your token to the .env file or environment variables.",
          details: "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens"
        },
        { status: 401 }
      );
    }

    let predictionId = null;
    let dbRecordId = null;

    try {
      console.log('🎨 Starting image edit with Replicate API...');
      
      // Get the webhook URL from environment variables
      const webhookUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook` 
        : null;
      
      if (!webhookUrl) {
        console.warn('⚠️ No webhook URL available. Status updates will not work properly. Set NEXT_PUBLIC_APP_URL in your environment.');
      }

      // Prepare input for the flux-kontext-pro model
      const input = {
        prompt: prompt.trim(),
        input_image: imageUrl,
        aspect_ratio: "match_input_image" // Use the original image's aspect ratio
      };

      // Use predictions.create to support webhooks
      const prediction = await replicate.predictions.create({
        model: "black-forest-labs/flux-kontext-max",
        input: input,
        webhook: webhookUrl || undefined,
        webhook_events_filter: ["start", "completed"]
      });
      
      console.log('✅ Replicate edit API call successful, prediction ID:', prediction.id);
      predictionId = prediction.id;
      
      // Store the edit prediction in the database
      try {
        const { data: editPredictionRecord, error: insertError } = await supabase
          .from('predictions')
          .insert({
            replicate_id: predictionId,
            prompt: prompt.trim(),
            aspect_ratio: originalPrediction.aspect_ratio || "1:1",
            format: "webp", // Default format for edits
            status: prediction.status,
            input: input,
            model_id: null, // External models don't exist in our models table
            user_id: user.id,
            is_edit: true,
            source_prediction_id: originalPredictionId,
            source_image_url: imageUrl
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('❌ Error logging edit prediction to Supabase:', insertError);
          return NextResponse.json(
            { error: 'Failed to save edit prediction' },
            { status: 500 }
          );
        }

        console.log('✅ Edit prediction logged to database with ID:', editPredictionRecord.id);
        dbRecordId = editPredictionRecord.id;
        
      } catch (dbError) {
        console.error('❌ Exception logging edit to Supabase:', dbError);
        return NextResponse.json(
          { error: 'Failed to save edit record' },
          { status: 500 }
        );
      }
      
      // Return the response with the prediction ID
      return NextResponse.json({
        id: dbRecordId,
        replicate_id: predictionId,
        status: prediction.status || 'processing',
        message: 'Image edit started successfully. You will be notified when it completes.',
        urls: prediction.urls
      });
      
    } catch (replicateError) {
      console.error('❌ REPLICATE EDIT API ERROR:', replicateError);
      
      const errorMessage = replicateError instanceof Error ? replicateError.message : 'Unknown error';
      
      // Create an error response
      const isRateLimitError = replicateError instanceof Error && 
        (replicateError.message.includes('429') || 
         replicateError.message.toLowerCase().includes('rate limit'));
      
      const additionalInfo = isRateLimitError 
        ? "You've reached the rate limit for image editing. Please try again later."
        : "There was an error editing your image. Please try again.";
      
      // If we have a database record, update it with the error
      if (dbRecordId) {
        try {
          await supabase
            .from('predictions')
            .update({
              status: 'failed',
              error: errorMessage,
              completed_at: new Date().toISOString()
            })
            .eq('id', dbRecordId);
        } catch (updateError) {
          console.error('❌ Error updating prediction with error status:', updateError);
        }
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          message: additionalInfo,
          details: isRateLimitError ? 'RATE_LIMIT_EXCEEDED' : 'EDIT_FAILED'
        },
        { status: isRateLimitError ? 429 : 500 }
      );
    }
  } catch (error) {
    console.error('❌ General error in edit API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 