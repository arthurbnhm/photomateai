import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';

// Define the expected response type based on the documentation
interface ModelVersionResponse {
  previous: string | null;
  next: string | null;
  results: Array<{
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: Record<string, unknown>;
  }>;
}

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Disable caching for Next.js App Router
replicate.fetch = (url, options) => {
  return fetch(url, { ...options, cache: "no-store" });
};

// Hardcoded model owner
const MODEL_OWNER = "arthurbnhm";

// Helper function to get the latest model version
async function getLatestModelVersion(owner: string, name: string): Promise<string | null> {
  try {
    // Get the list of versions from Replicate
    const versionsResponse = await replicate.models.versions.list(owner, name) as unknown as ModelVersionResponse;
    
    // According to the documentation, the response should have a 'results' array
    if (versionsResponse && 
        'results' in versionsResponse && 
        Array.isArray(versionsResponse.results) && 
        versionsResponse.results.length > 0) {
      return versionsResponse.results[0].id;
    }
    
    return null;
  } catch (_) {
    void _; // Explicitly indicate we're ignoring this variable
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client
    const supabase = createServerClient();
    
    // Get user session
    const { data: { session } } = await supabase.auth.getSession();
    
    // Check if user is authenticated
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to use this API' },
        { status: 401 }
      );
    }
    
    // Check if user has an active subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
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
      .eq('user_id', session.user.id);
    
    let modelName = null;
    let predictionId = null;
    let dbRecordId = null;
    let userId = null;
    
    // Parse the request body
    const { prompt, aspectRatio, outputFormat, modelId: requestModelId, modelName: requestModelName, modelVersion } = await request.json();
    
    // Get the current user from the session
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
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
        // Fetch the model details from Supabase
        const { data: model, error } = await supabase
          .from('models')
          .select('*')
          .eq('id', requestModelId)
          .eq('status', 'ready')
          .eq('user_id', userId)
          .single();
        
        if (error) {
          console.error('Error fetching model details:', error);
          
          // Try with 'trained' status instead of 'ready'
          const { data: trainedModel, error: trainedError } = await supabase
            .from('models')
            .select('*')
            .eq('id', requestModelId)
            .eq('status', 'trained')
            .eq('user_id', userId)
            .single();
            
          if (trainedError || !trainedModel) {
            console.error('Error fetching model with trained status:', trainedError);
            return NextResponse.json(
              { error: 'Selected model not found or not available' },
              { status: 404 }
            );
          } else {
            // Use the model's model_id
            modelName = trainedModel.model_id;
          }
        } else if (model) {
          // Use the model's model_id
          modelName = model.model_id;
        } else {
          console.error('No model found with ID:', requestModelId);
          return NextResponse.json(
            { error: 'Selected model not found' },
            { status: 404 }
          );
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
    
    // If we don't have a version yet, fetch the latest
    if (!finalModelVersion) {
      finalModelVersion = await getLatestModelVersion(MODEL_OWNER, modelName);
      if (!finalModelVersion) {
        return NextResponse.json(
          { error: `No versions found for model ${MODEL_OWNER}/${modelName}` },
          { status: 404 }
        );
      }
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
        console.warn('No webhook URL available, falling back to synchronous prediction');
      }
      
      // Use predictions.create instead of replicate.run to support webhooks
      const prediction = await replicate.predictions.create({
        version: finalModelVersion,
        input: inputParams,
        webhook: webhookUrl || undefined,
        webhook_events_filter: ["completed"]
      });
      
      predictionId = prediction.id;
      
      // Log the prediction to Supabase immediately to ensure it's available for tracking
      try {
        const { data: predictionRecord, error: insertError } = await supabase
          .from('predictions')
          .insert({
            replicate_id: predictionId,
            prompt: prompt,
            aspect_ratio: aspectRatio || "1:1",
            status: prediction.status || "processing",
            input: inputParams,
            user_id: userId
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
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
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