export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Max allowed for Vercel hobby plan

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
    
    // Credit decremented successfully - removed sensitive logging
    
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
      modelGender?: string | null;
      modelAttributes?: string[]; // Add model attributes
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
        modelVersion,
        modelGender: requestModelGender,
        modelAttributes: requestModelAttributes
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
    let modelGender: string | null = requestModelGender || null;
    let modelAttributes: string[] = requestModelAttributes || [];
    
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
          
          // Get the gender from the model if not provided in request
          if (!modelGender && trainedModel.gender) {
            modelGender = trainedModel.gender;
          }
          
          // Get the attributes from the model
          if (trainedModel.attributes && Array.isArray(trainedModel.attributes)) {
            modelAttributes = trainedModel.attributes;
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

        const systemPrompt = "Describe this image in a professional and detailed way. Focus on the following aspects:\n\n- Image composition – talk about framing, angle, lighting, background, and overall layout\n\n- Colors – describe the dominant colors, color harmony, contrast, and any mood they create\n\n- Facial expression and pose – describe what the subject is expressing emotionally, how they are positioned, and what direction they are looking\n\n- Accessories – mention any visible accessories like jewelry, glasses, hats, etc.\n\n- Garments – describe the clothing style, color, texture, and how it fits or contributes to the visual impact\n\nIMPORTANT: Do not mention or reference the gender of any person in the image. Focus only on the visual elements described above.";

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

    // Append gender to the prompt if available
    if (modelGender && (modelGender === 'male' || modelGender === 'female')) {
      const genderText = modelGender === 'male' ? ', the subject is a male' : ', the subject is a female';
      prompt = prompt.trim() + genderText;
    }

    // Append model attributes to the prompt if available
    if (modelAttributes && modelAttributes.length > 0) {
      // Create a more natural description of the attributes
      const attributesText = modelAttributes.join(', ');
      prompt = prompt.trim() + `, with the following characteristics: ${attributesText}`;
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
        console.log('🔍 Processing image data URL...');
        
        let imageBuffer: Buffer;
        
        // Check if it's a data URL or a direct URL
        if (image_data_url.startsWith('data:image/')) {
          // Handle data URL (uploaded files)
          console.log('📄 Processing data URL...');
          
          // Extract base64 data
          const base64Part = image_data_url.split(',')[1];
          if (!base64Part) {
            throw new Error("No base64 data found in image data URL");
          }
          
          // Validate base64 format
          const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!base64Regex.test(base64Part)) {
            throw new Error("Invalid base64 format in image data URL");
          }
          
          // Convert to Buffer
          imageBuffer = Buffer.from(base64Part, 'base64');
        } else if (image_data_url.startsWith('http://') || image_data_url.startsWith('https://')) {
          // Handle direct URL (Use as Reference feature)
          console.log('🌐 Processing direct image URL...');
          
          try {
            const imageResponse = await fetch(image_data_url);
            if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
            }
            
            const arrayBuffer = await imageResponse.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            
            console.log(`✅ Successfully fetched image (${imageBuffer.length} bytes)`);
          } catch (fetchError) {
            console.error('❌ Failed to fetch image from URL:', fetchError);
            throw new Error(`Failed to fetch reference image: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
          }
        } else {
          throw new Error("Invalid image format. Must be a data URL or HTTP(S) URL");
        }
        
        // Basic size check
        if (imageBuffer.length === 0) {
          throw new Error("Empty image data");
        }
        if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
          throw new Error("Image too large (max 10MB)");
        }
        
        inputParams.image = imageBuffer;
        inputParams.prompt_strength = 0.8;
        delete inputParams.aspect_ratio;
        
        console.log('✅ Image processing completed successfully');

      } catch (e) {
        console.error("❌ Error processing image data URL:", e);
        return NextResponse.json(
          { error: 'Failed to process image. Please try a different image.', details: e instanceof Error ? e.message : "Unknown error" },
          { status: 400 }
        );
      }
    } else {
      // No image provided, use aspectRatio
      inputParams.aspect_ratio = aspectRatio || "1:1";
    }
    
    try {
      console.log('🚀 About to call Replicate API...');
      
      // Get the webhook URL from environment variables
      const webhookUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook` 
        : null;
      
      if (!webhookUrl) {
        console.warn('⚠️ No webhook URL available. Status updates will not work properly. Set NEXT_PUBLIC_APP_URL in your environment.');
      }
      
      // Use predictions.create instead of replicate.run to support webhooks
      const prediction = await replicate.predictions.create({
        version: finalModelVersion,
        input: inputParams,
        webhook: webhookUrl || undefined,
        webhook_events_filter: ["start", "completed"]
      });
      
      console.log('✅ Replicate API call successful, prediction ID:', prediction.id);
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
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('❌ Error logging prediction to Supabase:', insertError);
        } else {
          console.log('✅ Prediction logged to database with ID:', predictionRecord.id);
          dbRecordId = predictionRecord.id;
        }
      } catch (dbError) {
        console.error('❌ Exception logging prediction to Supabase:', dbError);
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
      console.error('❌ REPLICATE API ERROR:', replicateError);
      
      // Check if this is the "string did not match" error
      const errorMessage = replicateError instanceof Error ? replicateError.message : 'Unknown error';
      if (errorMessage.includes('string did not match')) {
        console.error('🎯 FOUND "string did not match" error from Replicate API');
      }
      
      // Create an error response
      const isRateLimitError = replicateError instanceof Error && 
        (replicateError.message.includes('429') || 
         replicateError.message.toLowerCase().includes('rate limit'));
      
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
          console.error('❌ Error updating prediction with error status:', updateError);
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