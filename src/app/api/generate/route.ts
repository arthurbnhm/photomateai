import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import OpenAI from "openai";

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
    
    // Define a type for the expected request body parts
    interface GenerateRequestBody {
      prompt: string;
      aspectRatio?: string;
      outputFormat?: string;
      modelId?: string;
      modelName?: string;
      modelVersion?: string;
      image_data_url?: string;
      // Add any other expected properties from the request body here
    }

    // Parse the request body
    const fullRequestBody = await request.json() as GenerateRequestBody;
    let { prompt } = fullRequestBody;
    const { 
        image_data_url, 
        aspectRatio, 
        outputFormat, 
        modelId: requestModelId, 
        modelName: requestModelName, 
        modelVersion 
    } = fullRequestBody;
    const originalPrompt = prompt; // Keep original prompt for fallback
    
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

    // Conditional prompt validation: Prompt is required only if no image is being used for description
    if (!image_data_url && (!prompt || prompt.trim() === '')) {
      return NextResponse.json(
        { error: 'Prompt is required when no reference image is used' },
        { status: 400 }
      );
    }
    // If image_data_url is present, an empty initial prompt is acceptable as OpenAI is expected to generate one.
    // The originalPrompt (which could be empty) will be used if OpenAI fails.

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
    
    // OpenAI Image Description Step
    const openAIKey = process.env.OPENAI_API_KEY;
    if (image_data_url && openAIKey) {
      try {
        const openai = new OpenAI({
          apiKey: openAIKey,
        });

        const systemPrompt = "Describe this image in a professional and detailed way. Focus on the following aspects:\n\n- Image composition – talk about framing, angle, lighting, background, and overall layout\n\n- Colors – describe the dominant colors, color harmony, contrast, and any mood they create\n\n- Facial expression and pose – describe what the subject is expressing emotionally, how they are positioned, and what direction they are looking\n\n- Accessories – mention any visible accessories like jewelry, glasses, hats, etc.\n\n- Garments – describe the clothing style, color, texture, and how it fits or contributes to the visual impact";

        console.log("Sending image to OpenAI for description...");
        const openAICompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              "role": "system",
              "content": systemPrompt
            },
            {
              "role": "user",
              "content": [
                {
                  "type": "text",
                  "text": "Describe the following image."
                },
                {
                  "type": "image_url",
                  "image_url": {
                    "url": image_data_url
                  }
                }
              ]
            }
          ],
          temperature: 1,
          max_tokens: 2048,
          top_p: 1,
        });

        const description = openAICompletion.choices[0]?.message?.content;

        if (description && typeof description === 'string' && description.trim() !== '') {
          prompt = description;
        } else {
          prompt = originalPrompt;
        }
      } catch {
        prompt = originalPrompt; 
      }
    } else if (image_data_url && !openAIKey) {
      prompt = originalPrompt;
    }
    // If there's no image_data_url, prompt remains as is from the request (and was validated above).

    // After OpenAI step, if prompt is still empty (e.g. original was empty and OpenAI failed),
    // Replicate might still need a prompt. Let's add a final check or default if necessary.
    if (!prompt || prompt.trim() === '') {
      // This case means: an image was provided, but OpenAI failed to describe it, AND the user provided no original prompt.
      // Replicate likely still needs some prompt. We can use a generic one or error out.
      // For now, let's use a generic prompt. Consider making this behavior more sophisticated.
      prompt = "A generated image based on the provided reference."; 
      console.warn("Prompt was empty after OpenAI step (image provided, but no description and no original prompt). Using a generic prompt for Replicate.");
    }

    // Define a type for the Replicate input parameters
    interface ReplicateInputParams {
      prompt: string;
      model: string;
      go_fast: boolean;
      lora_scale: number;
      megapixels: string;
      num_outputs: number;
      aspect_ratio?: string; // Optional because it's removed for img2img
      output_format: string; // Expects a string
      guidance_scale: number;
      output_quality: number;
      prompt_strength: number;
      extra_lora_scale: number;
      num_inference_steps: number;
      disable_safety_checker: boolean;
      image?: Buffer; // Optional for img2img
    }
    
    const inputParams: ReplicateInputParams = {
      prompt,
      model: "dev",
      go_fast: false,
      lora_scale: 1,
      megapixels: "1",
      num_outputs: 4,
      // aspectRatio will be set conditionally
      output_format: outputFormat || "webp", // Provide default if undefined
      guidance_scale: 3,
      output_quality: 100,
      prompt_strength: 0.8, // Default prompt_strength
      extra_lora_scale: 1,
      num_inference_steps: 28,
      disable_safety_checker: true
    };

    if (image_data_url) {
      // Image is provided, prepare it for Replicate
      try {
        // Validate data URL format first
        const dataUrlRegex = /^data:image\/[a-zA-Z]*;base64,([A-Za-z0-9+/]+=*)?$/;
        if (!dataUrlRegex.test(image_data_url)) {
          throw new Error("Invalid image data URL format. Expected format: data:image/[type];base64,[data]");
        }
        
        // Convert base64 data URL to Buffer
        // Expected format: "data:[<mediatype>];base64,<data>"
        const base64Data = image_data_url.split(',')[1];
        if (!base64Data) {
          throw new Error("No base64 data found in image data URL.");
        }
        
        // Validate base64 format
        try {
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
          // Validate that we got a reasonable buffer size (not empty, not too large)
          if (imageBuffer.length === 0) {
            throw new Error("Empty image data");
          }
          if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
            throw new Error("Image data too large");
          }
          
          inputParams.image = imageBuffer;
        } catch (bufferError) {
          throw new Error(`Invalid base64 data: ${bufferError instanceof Error ? bufferError.message : 'Unknown error'}`);
        }
        
        // Prompt strength is more relevant for img2img
        inputParams.prompt_strength = 0.8; // Or make this configurable
        // Remove aspectRatio as it's ignored by Replicate when an image is provided
        delete inputParams.aspect_ratio;

      } catch (e) {
        console.error("Error processing image data URL:", e);
        return NextResponse.json(
          { error: 'Invalid image data provided.', details: e instanceof Error ? e.message : "Unknown error processing image" },
          { status: 400 }
        );
      }
    } else {
      // No image provided, use aspectRatio
      inputParams.aspect_ratio = aspectRatio || "1:1"; // Provide default if undefined
    }
    
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
        // Prepare input for logging, remove image buffer if present
        const inputForLogging = { ...inputParams };
        if (inputForLogging.image) {
          delete inputForLogging.image; // Remove the image Buffer before logging
        }

        const { data: predictionRecord, error: insertError } = await supabase
          .from('predictions')
          .insert({
            replicate_id: predictionId,
            prompt: prompt, // Log the final prompt used (could be from OpenAI or original)
            aspect_ratio: image_data_url ? "Image Reference" : (aspectRatio || "1:1"), // Changed to "Image Reference"
            format: outputFormat || "webp",
            status: prediction.status,
            input: inputForLogging, // Use the modified input for logging
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 