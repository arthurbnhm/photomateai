import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';

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
    const supabase = createServerClient();
    
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
    
    // Check if user has an active subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (subscriptionError || !subscription) {
      return NextResponse.json(
        { error: 'Unauthorized: You need an active subscription to use this API' },
        { status: 403 }
      );
    }
    
    // Check if user has enough credits
    if (subscription.credits_remaining <= 0) {
      return NextResponse.json(
        { error: 'Insufficient credits: You have used all your available credits' },
        { status: 403 }
      );
    }
    
    // Decrement credits
    await supabase
      .from('subscriptions')
      .update({ 
        credits_remaining: subscription.credits_remaining - 1,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);
    
    let modelName = null;
    let predictionId = null;
    let dbRecordId = null;
    let userId = null;
    
    // Parse the request body
    const { prompt, aspectRatio, outputFormat, modelId: requestModelId, modelName: requestModelName, modelVersion } = await request.json();
    
    // Use the authenticated user's ID
    userId = user.id;

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

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Initialize model variables
    let finalModelVersion = null;
    
    // If model name is provided directly in the request, use it
    if (requestModelName) {
      modelName = requestModelName;
    }
    
    // If a specific model version was provided in the request, use it
    if (modelVersion) {
      finalModelVersion = modelVersion;
    }
    
    // Only fetch from Supabase if we don't have the model name from the request
    if (requestModelId && !modelName) {
      try {
        // Verify that the model is trained and belongs to the user
        const { data: trainedModel, error: trainedError } = await supabase
          .from('models')
          .select('*, trainings!inner(*)')
          .eq('id', requestModelId)
          .eq('trainings.status', 'succeeded')
          .eq('user_id', userId)
          .single();
        
        if (trainedError || !trainedModel) {
          console.error('Error fetching model with successful training:', trainedError);
          return NextResponse.json(
            { error: 'Selected model not found or not available' },
            { status: 404 }
          );
        } else {
          // Use the model's model_id
          modelName = trainedModel.model_id;
          
          // Use the model's version if available and not already set
          if (trainedModel.version && !finalModelVersion) {
            finalModelVersion = trainedModel.version;
          }
        }
      } catch (err) {
        console.error('Error getting model details:', err);
        return NextResponse.json(
          { error: 'Error retrieving model details' },
          { status: 500 }
        );
      }
    }
    
    // If we still don't have model information, return an error
    if (!modelName) {
      return NextResponse.json(
        { error: 'No valid model selected' },
        { status: 400 }
      );
    }
    
    // If we don't have a version yet, return an error
    if (!finalModelVersion) {
      return NextResponse.json(
        { error: `No version available for model ${modelName}. Please ensure the model has a version specified.` },
        { status: 400 }
      );
    }
    
    const inputParams = {
      prompt,
      model: "dev",
      go_fast: false,
      lora_scale: 1,
      megapixels: "1",
      num_outputs: 4,
      aspect_ratio: aspectRatio || "1:1",
      output_format: outputFormat,
      guidance_scale: 3,
      output_quality: 100,
      prompt_strength: 0.8,
      extra_lora_scale: 1,
      num_inference_steps: 28,
      disable_safety_checker: true
    };
    
    try {
      // Get the webhook URL from environment variables
      const webhookUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook` 
        : null;
      
      if (!webhookUrl) {
        console.warn('No webhook URL available. Status updates will not work properly. Set NEXT_PUBLIC_APP_URL in your environment.');
      }
      
      // Use predictions.create instead of replicate.run to support webhooks
      const prediction = await replicate.predictions.create({
        version: finalModelVersion,
        input: inputParams,
        webhook: webhookUrl || undefined,
        webhook_events_filter: ["start", "completed"]
      });
      
      predictionId = prediction.id;
      
      // Store the initial prediction with "starting" status in the database
      try {
        const { data: predictionRecord, error: insertError } = await supabase
          .from('predictions')
          .insert({
            replicate_id: predictionId,
            prompt: prompt,
            aspect_ratio: aspectRatio || "1:1",
            status: prediction.status,
            input: inputParams,
            model_id: modelName
            // user_id is now handled by Supabase trigger
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('Error logging prediction to Supabase:', insertError);
        } else {
          dbRecordId = predictionRecord.id;
        }
      } catch (dbError) {
        console.error('Exception logging prediction to Supabase:', dbError);
      }
      
      // Return the response with the prediction ID
      return NextResponse.json({
        id: dbRecordId,
        replicate_id: predictionId,
        status: prediction.status || 'processing',
        message: 'Prediction started successfully. You will be notified when it completes.',
        urls: prediction.urls
      });
      
    } catch (replicateError) {
      console.error('Error calling Replicate API:', replicateError);
      
      // Create an error response
      const isRateLimitError = replicateError instanceof Error && 
        (replicateError.message.includes('429') || 
         replicateError.message.toLowerCase().includes('rate limit'));
      
      const errorMessage = replicateError instanceof Error ? replicateError.message : 'Unknown error';
      const additionalInfo = isRateLimitError 
        ? "You've reached the rate limit for image generation. Please try again later."
        : "There was an error generating your image. Please try again.";
      
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
          console.error('Error updating prediction with error status:', updateError);
        }
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          message: additionalInfo,
          details: isRateLimitError ? 'RATE_LIMIT_EXCEEDED' : 'GENERATION_FAILED'
        },
        { status: isRateLimitError ? 429 : 500 }
      );
    }
  } catch (error) {
    console.error('Error in generate API route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 