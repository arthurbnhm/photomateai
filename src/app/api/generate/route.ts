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
  const debugLogs: Array<{timestamp: string, step: string, details: unknown}> = [];
  
  const addDebugLog = (step: string, details: unknown) => {
    const timestamp = new Date().toISOString();
    debugLogs.push({ timestamp, step, details });
    console.log(`[${timestamp}] ${step}:`, details);
  };

  try {
    addDebugLog('1. REQUEST_RECEIVED', 'Starting API generation request processing');

    // Create Supabase client
    addDebugLog('2. SUPABASE_CLIENT_INIT', 'Initializing Supabase server client');
    const supabase = await createSupabaseServerClient();
    
    // Get authenticated user
    addDebugLog('3. USER_AUTH_CHECK', 'Checking user authentication');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Check if user is authenticated
    if (!user || userError) {
      addDebugLog('3. USER_AUTH_FAILED', { error: userError, hasUser: !!user });
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to use this API', debugLogs },
        { status: 401 }
      );
    }
    
    addDebugLog('3. USER_AUTH_SUCCESS', { userId: user.id, email: user.email });
    
    // Get session for additional checks if needed
    addDebugLog('4. SESSION_CHECK', 'Validating user session');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      addDebugLog('4. SESSION_INVALID', { sessionError, hasSession: !!session });
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session', debugLogs },
        { status: 401 }
      );
    }
    
    addDebugLog('4. SESSION_VALID', { sessionId: session.access_token?.substring(0, 20) + '...' });
    
    // Check if user has an active subscription
    addDebugLog('5. SUBSCRIPTION_CHECK', 'Checking active subscription');
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (subscriptionError || !subscription) {
      addDebugLog('5. SUBSCRIPTION_FAILED', { subscriptionError, hasSubscription: !!subscription });
      return NextResponse.json(
        { error: 'Unauthorized: You need an active subscription to use this API', debugLogs },
        { status: 403 }
      );
    }
    
    addDebugLog('5. SUBSCRIPTION_VALID', { 
      subscriptionId: subscription.id, 
      creditsRemaining: subscription.credits_remaining,
      plan: subscription.plan_type 
    });
    
    // Check if user has enough credits
    if (subscription.credits_remaining <= 0) {
      addDebugLog('6. CREDITS_INSUFFICIENT', { creditsRemaining: subscription.credits_remaining });
      return NextResponse.json(
        { error: 'Insufficient credits: You have used all your available credits', debugLogs },
        { status: 403 }
      );
    }
    
    addDebugLog('6. CREDITS_SUFFICIENT', { creditsRemaining: subscription.credits_remaining });
    
    // Decrement credits
    addDebugLog('7. CREDITS_DECREMENT', 'Decrementing user credits');
    await supabase
      .from('subscriptions')
      .update({ 
        credits_remaining: subscription.credits_remaining - 1,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);
      
    addDebugLog('7. CREDITS_DECREMENTED', { 
      oldCredits: subscription.credits_remaining, 
      newCredits: subscription.credits_remaining - 1 
    });
    
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
      // Add any other expected properties from the request body here
    }

    // Parse the request body
    addDebugLog('8. REQUEST_BODY_PARSE', 'Parsing request body JSON');
    const fullRequestBody = await request.json() as GenerateRequestBody;
    
    addDebugLog('8. REQUEST_BODY_PARSED', {
      hasPrompt: !!fullRequestBody.prompt,
      promptLength: fullRequestBody.prompt?.length || 0,
      aspectRatio: fullRequestBody.aspectRatio,
      outputFormat: fullRequestBody.outputFormat,
      hasImageData: !!fullRequestBody.image_data_url,
      imageDataLength: fullRequestBody.image_data_url?.length || 0,
      modelId: fullRequestBody.modelId,
      modelVersion: fullRequestBody.modelVersion,
      modelGender: fullRequestBody.modelGender
    });
    
    let { prompt } = fullRequestBody;
    const { 
        image_data_url, 
        aspectRatio, 
        outputFormat, 
        modelId: requestModelId, 
        modelName: requestModelName, 
        modelVersion,
        modelGender: requestModelGender 
    } = fullRequestBody;
    const originalPrompt = prompt; // Keep original prompt for fallback
    
    addDebugLog('9. VARIABLES_EXTRACTED', {
      originalPrompt: originalPrompt?.substring(0, 100) + (originalPrompt?.length > 100 ? '...' : ''),
      hasImageDataUrl: !!image_data_url,
      aspectRatio,
      outputFormat,
      requestModelId,
      requestModelName,
      modelVersion,
      requestModelGender
    });
    
    // Use the authenticated user's ID
    userId = user.id;

    // Check if API token is available
    addDebugLog('10. API_TOKEN_CHECK', 'Checking Replicate API token availability');
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      addDebugLog('10. API_TOKEN_MISSING', 'Replicate API token not found in environment');
      return NextResponse.json(
        {
          error: "Missing Replicate API token. Please add your token to the .env file or environment variables.",
          details: "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens",
          debugLogs
        },
        { status: 401 }
      );
    }
    
    addDebugLog('10. API_TOKEN_FOUND', { tokenLength: apiToken.length, tokenPrefix: apiToken.substring(0, 8) + '...' });

    // Conditional prompt validation: Prompt is required only if no image is being used for description
    addDebugLog('11. PROMPT_VALIDATION', 'Validating prompt requirements');
    if (!image_data_url && (!prompt || prompt.trim() === '')) {
      addDebugLog('11. PROMPT_VALIDATION_FAILED', 'No prompt provided and no image for description');
      return NextResponse.json(
        { error: 'Prompt is required when no reference image is used', debugLogs },
        { status: 400 }
      );
    }
    
    addDebugLog('11. PROMPT_VALIDATION_PASSED', {
      hasImageForDescription: !!image_data_url,
      hasPrompt: !!prompt && prompt.trim() !== ''
    });
    
    // Initialize model variables
    addDebugLog('12. MODEL_VARS_INIT', 'Initializing model variables');
    let finalModelVersion = null;
    let modelGender: string | null = requestModelGender || null;
    
    // If model name is provided directly in the request, use it
    if (requestModelName) {
      modelName = requestModelName;
      addDebugLog('12. MODEL_NAME_FROM_REQUEST', { modelName: requestModelName });
    }
    
    // If a specific model version was provided in the request, use it
    if (modelVersion) {
      finalModelVersion = modelVersion;
      addDebugLog('12. MODEL_VERSION_FROM_REQUEST', { modelVersion });
    }
    
    addDebugLog('12. MODEL_VARS_INITIALIZED', {
      modelName,
      finalModelVersion,
      modelGender,
      needsDatabaseLookup: !!(requestModelId && !modelName)
    });
    
    // Only fetch from Supabase if we don't have the model name from the request
    if (requestModelId && !modelName) {
      try {
        addDebugLog('13. MODEL_DB_LOOKUP', `Looking up model in database with ID: ${requestModelId}`);
        
        // Verify that the model is trained and belongs to the user
        const { data: trainedModel, error: trainedError } = await supabase
          .from('models')
          .select('*, trainings!inner(*)')
          .eq('id', requestModelId)
          .eq('trainings.status', 'succeeded')
          .eq('user_id', userId)
          .single();
        
        if (trainedError || !trainedModel) {
          addDebugLog('13. MODEL_DB_LOOKUP_FAILED', { 
            trainedError, 
            hasTrainedModel: !!trainedModel,
            requestModelId,
            userId 
          });
          console.error('Error fetching model with successful training:', trainedError);
          return NextResponse.json(
            { error: 'Selected model not found or not available', debugLogs },
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
          
          addDebugLog('13. MODEL_DB_LOOKUP_SUCCESS', {
            modelId: trainedModel.model_id,
            displayName: trainedModel.display_name,
            version: trainedModel.version,
            gender: trainedModel.gender,
            trainingStatus: trainedModel.trainings?.status
          });
        }
      } catch (err) {
        addDebugLog('13. MODEL_DB_LOOKUP_ERROR', { error: err instanceof Error ? err.message : 'Unknown error' });
        console.error('Error getting model details:', err);
        return NextResponse.json(
          { error: 'Error retrieving model details', debugLogs },
          { status: 500 }
        );
      }
    }
    
    // If we still don't have model information, return an error
    if (!modelName) {
      addDebugLog('14. MODEL_VALIDATION_FAILED', 'No valid model name found after all lookups');
      return NextResponse.json(
        { error: 'No valid model selected', debugLogs },
        { status: 400 }
      );
    }
    
    // If we don't have a version yet, return an error
    if (!finalModelVersion) {
      addDebugLog('14. MODEL_VERSION_MISSING', { modelName, finalModelVersion });
      return NextResponse.json(
        { error: `No version available for model ${modelName}. Please ensure the model has a version specified.`, debugLogs },
        { status: 400 }
      );
    }
    
    addDebugLog('14. MODEL_VALIDATION_PASSED', {
      finalModelName: modelName,
      finalModelVersion,
      finalModelGender: modelGender
    });
    
    // OpenAI Image Description Step
    addDebugLog('15. OPENAI_CHECK', 'Checking if OpenAI processing is needed');
    const openAIKey = process.env.OPENAI_API_KEY;
    if (image_data_url && openAIKey) {
      try {
        addDebugLog('15. OPENAI_INIT', 'Initializing OpenAI client');
        const openai = new OpenAI({
          apiKey: openAIKey,
        });

        const systemPrompt = "Describe this image in a professional and detailed way. Focus on the following aspects:\n\n- Image composition – talk about framing, angle, lighting, background, and overall layout\n\n- Colors – describe the dominant colors, color harmony, contrast, and any mood they create\n\n- Facial expression and pose – describe what the subject is expressing emotionally, how they are positioned, and what direction they are looking\n\n- Accessories – mention any visible accessories like jewelry, glasses, hats, etc.\n\n- Garments – describe the clothing style, color, texture, and how it fits or contributes to the visual impact";

        addDebugLog('15. OPENAI_REQUEST_START', {
          model: 'gpt-4o-mini',
          imageDataLength: image_data_url.length,
          systemPromptLength: systemPrompt.length
        });

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

        addDebugLog('15. OPENAI_RESPONSE_RECEIVED', {
          hasDescription: !!description,
          descriptionLength: description?.length || 0,
          descriptionPreview: description?.substring(0, 100) + (description && description.length > 100 ? '...' : ''),
          usage: openAICompletion.usage,
          finishReason: openAICompletion.choices[0]?.finish_reason
        });

        if (description && typeof description === 'string' && description.trim() !== '') {
          prompt = description;
          addDebugLog('15. OPENAI_DESCRIPTION_APPLIED', { 
            oldPrompt: originalPrompt,
            newPrompt: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : '')
          });
        } else {
          prompt = originalPrompt;
          addDebugLog('15. OPENAI_DESCRIPTION_EMPTY', 'OpenAI returned empty description, using original prompt');
        }
      } catch (openAIError) {
        addDebugLog('15. OPENAI_ERROR', {
          error: openAIError instanceof Error ? openAIError.message : 'Unknown OpenAI error',
          fallbackToOriginal: true
        });
        prompt = originalPrompt; 
      }
    } else if (image_data_url && !openAIKey) {
      addDebugLog('15. OPENAI_SKIPPED_NO_KEY', 'Image provided but no OpenAI key, using original prompt');
      prompt = originalPrompt;
    } else {
      addDebugLog('15. OPENAI_SKIPPED_NO_IMAGE', 'No image provided, proceeding with original prompt');
    }

    // After OpenAI step, if prompt is still empty (e.g. original was empty and OpenAI failed),
    // Replicate might still need a prompt. Let's add a final check or default if necessary.
    addDebugLog('16. PROMPT_FINAL_CHECK', 'Checking final prompt status');
    if (!prompt || prompt.trim() === '') {
      // This case means: an image was provided, but OpenAI failed to describe it, AND the user provided no original prompt.
      // Replicate likely still needs some prompt. We can use a generic one or error out.
      // For now, let's use a generic prompt. Consider making this behavior more sophisticated.
      prompt = "A generated image based on the provided reference."; 
      addDebugLog('16. PROMPT_FALLBACK_APPLIED', 'Empty prompt detected, using generic fallback');
      console.warn("Prompt was empty after OpenAI step (image provided, but no description and no original prompt). Using a generic prompt for Replicate.");
    } else {
      addDebugLog('16. PROMPT_FINAL_READY', {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 150) + (prompt.length > 150 ? '...' : '')
      });
    }

    // Append gender to the prompt if available
    if (modelGender && (modelGender === 'male' || modelGender === 'female')) {
      const genderText = modelGender === 'male' ? ', the subject is a male' : ', the subject is a female';
      prompt = prompt.trim() + genderText;
      addDebugLog('16. GENDER_APPENDED', { 
        modelGender, 
        genderText,
        finalPrompt: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : '')
      });
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
    
    addDebugLog('17. REPLICATE_INPUT_INIT', 'Initializing Replicate input parameters');
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

    addDebugLog('17. REPLICATE_INPUT_BASE_PARAMS', {
      prompt: inputParams.prompt.substring(0, 100) + (inputParams.prompt.length > 100 ? '...' : ''),
      model: inputParams.model,
      output_format: inputParams.output_format,
      num_outputs: inputParams.num_outputs,
      guidance_scale: inputParams.guidance_scale,
      num_inference_steps: inputParams.num_inference_steps
    });

    if (image_data_url) {
      // Image is provided, prepare it for Replicate
      try {
        addDebugLog('18. IMAGE_PROCESSING_START', 'Starting image data URL processing');
        console.log('🔍 Processing image data URL in production...');
        console.log('📊 Data URL length:', image_data_url.length);
        console.log('🏷️ Data URL prefix:', image_data_url.substring(0, 50));
        
        addDebugLog('18. IMAGE_URL_ANALYSIS', {
          totalLength: image_data_url.length,
          prefix: image_data_url.substring(0, 50),
          hasComma: image_data_url.includes(','),
          commaPosition: image_data_url.indexOf(',')
        });
        
        // Basic validation - check if it starts with data:image
        if (!image_data_url.startsWith('data:image/')) {
          addDebugLog('18. IMAGE_VALIDATION_FAILED', { 
            reason: 'Invalid data URL prefix',
            actualPrefix: image_data_url.substring(0, 30)
          });
          console.error('❌ Invalid data URL prefix:', image_data_url.substring(0, 30));
          throw new Error("Invalid image data URL format");
        }
        
        addDebugLog('18. IMAGE_PREFIX_VALID', 'Data URL has valid image prefix');
        
        // Extract base64 data
        const base64Part = image_data_url.split(',')[1];
        if (!base64Part) {
          addDebugLog('18. IMAGE_BASE64_MISSING', 'No base64 data found after comma');
          console.error('❌ No base64 data found after comma');
          throw new Error("No base64 data found in image data URL");
        }
        
        addDebugLog('18. IMAGE_BASE64_EXTRACTED', {
          base64Length: base64Part.length,
          base64Sample: base64Part.substring(0, 50)
        });
        console.log('✅ Base64 part extracted, length:', base64Part.length);
        console.log('🔍 Base64 sample (first 50 chars):', base64Part.substring(0, 50));
        
        // Validate base64 format
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Regex.test(base64Part)) {
          addDebugLog('18. IMAGE_BASE64_INVALID', 'Base64 format validation failed');
          console.error('❌ Invalid base64 format detected');
          throw new Error("Invalid base64 format in image data URL");
        }
        
        addDebugLog('18. IMAGE_BASE64_VALID', 'Base64 format validation passed');
        
        // Convert to Buffer
        addDebugLog('18. IMAGE_BUFFER_CONVERSION_START', 'Converting base64 to Buffer');
        const imageBuffer = Buffer.from(base64Part, 'base64');
        
        addDebugLog('18. IMAGE_BUFFER_CREATED', {
          bufferSize: imageBuffer.length,
          bufferSizeKB: Math.round(imageBuffer.length / 1024),
          bufferSizeMB: Math.round(imageBuffer.length / (1024 * 1024) * 100) / 100
        });
        console.log('✅ Buffer created successfully, size:', imageBuffer.length, 'bytes');
        
        // Basic size check
        if (imageBuffer.length === 0) {
          addDebugLog('18. IMAGE_BUFFER_EMPTY', 'Image buffer is empty');
          console.error('❌ Empty image buffer');
          throw new Error("Empty image data");
        }
        if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
          addDebugLog('18. IMAGE_BUFFER_TOO_LARGE', {
            bufferSize: imageBuffer.length,
            limitSize: 10 * 1024 * 1024
          });
          console.error('❌ Image too large:', imageBuffer.length, 'bytes');
          throw new Error("Image too large (max 10MB)");
        }
        
        addDebugLog('18. IMAGE_SIZE_VALID', 'Image size validation passed');
        
        // Validate image signature (first few bytes)
        const imageSignature = imageBuffer.subarray(0, 4);
        addDebugLog('18. IMAGE_SIGNATURE_CHECK', {
          signatureHex: imageSignature.toString('hex'),
          signatureBytes: Array.from(imageSignature)
        });
        console.log('🔍 Image signature (hex):', imageSignature.toString('hex'));
        
        inputParams.image = imageBuffer;
        inputParams.prompt_strength = 0.8;
        delete inputParams.aspect_ratio;
        
        addDebugLog('18. IMAGE_PROCESSING_COMPLETE', {
          bufferAttached: true,
          promptStrength: inputParams.prompt_strength,
          aspectRatioRemoved: true
        });
        console.log('✅ Image processing completed successfully');

      } catch (e) {
        addDebugLog('18. IMAGE_PROCESSING_ERROR', {
          error: e instanceof Error ? e.message : 'Unknown error',
          errorType: typeof e,
          stage: 'Image preprocessing'
        });
        console.error("❌ Error processing image data URL:", e);
        console.error("📍 Error occurred in image preprocessing, not Replicate API");
        return NextResponse.json(
          { error: 'Failed to process image. Please try a different image.', details: e instanceof Error ? e.message : "Unknown error", debugLogs },
          { status: 400 }
        );
      }
    } else {
      // No image provided, use aspectRatio
      inputParams.aspect_ratio = aspectRatio || "1:1";
      addDebugLog('18. NO_IMAGE_ASPECT_RATIO', {
        aspectRatio: inputParams.aspect_ratio,
        hasImage: false
      });
    }
    
    try {
      addDebugLog('19. REPLICATE_API_CALL_START', 'Preparing Replicate API call');
      console.log('🚀 About to call Replicate API...');
      console.log('📝 Input params (without image buffer):', {
        ...inputParams,
        image: inputParams.image ? `[Buffer: ${inputParams.image.length} bytes]` : undefined
      });
      
      addDebugLog('19. REPLICATE_INPUT_FINAL', {
        hasImage: !!inputParams.image,
        imageBufferSize: inputParams.image?.length || 0,
        prompt: inputParams.prompt.substring(0, 150) + (inputParams.prompt.length > 150 ? '...' : ''),
        aspectRatio: inputParams.aspect_ratio || 'removed for img2img',
        outputFormat: inputParams.output_format,
        modelVersion: finalModelVersion
      });
      
      // Get the webhook URL from environment variables
      addDebugLog('19. WEBHOOK_SETUP', 'Setting up webhook configuration');
      const webhookUrl = process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook` 
        : null;
      
      if (!webhookUrl) {
        addDebugLog('19. WEBHOOK_MISSING', 'No webhook URL configured');
        console.warn('⚠️ No webhook URL available. Status updates will not work properly. Set NEXT_PUBLIC_APP_URL in your environment.');
      } else {
        addDebugLog('19. WEBHOOK_CONFIGURED', { webhookUrl });
      }
      
      // Use predictions.create instead of replicate.run to support webhooks
      addDebugLog('19. REPLICATE_PREDICTION_CREATE', 'Calling replicate.predictions.create');
      const prediction = await replicate.predictions.create({
        version: finalModelVersion,
        input: inputParams,
        webhook: webhookUrl || undefined,
        webhook_events_filter: ["start", "completed"]
      });
      
      addDebugLog('19. REPLICATE_PREDICTION_SUCCESS', {
        predictionId: prediction.id,
        status: prediction.status,
        urls: prediction.urls,
        createdAt: prediction.created_at,
        version: prediction.version
      });
      console.log('✅ Replicate API call successful, prediction ID:', prediction.id);
      predictionId = prediction.id;
      
      // Store the initial prediction with "starting" status in the database
      try {
        addDebugLog('20. DATABASE_LOG_START', 'Logging prediction to database');
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
          addDebugLog('20. DATABASE_LOG_ERROR', {
            error: insertError.message,
            code: insertError.code,
            details: insertError.details
          });
          console.error('❌ Error logging prediction to Supabase:', insertError);
        } else {
          addDebugLog('20. DATABASE_LOG_SUCCESS', {
            dbRecordId: predictionRecord.id,
            replicateId: predictionId,
            status: prediction.status
          });
          console.log('✅ Prediction logged to database with ID:', predictionRecord.id);
          dbRecordId = predictionRecord.id;
        }
      } catch (dbError) {
        addDebugLog('20. DATABASE_LOG_EXCEPTION', {
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
        console.error('❌ Exception logging prediction to Supabase:', dbError);
      }
      
      // Return the response with the prediction ID
      addDebugLog('21. SUCCESS_RESPONSE', 'Preparing successful response');
      return NextResponse.json({
        id: dbRecordId,
        replicate_id: predictionId,
        status: prediction.status || 'processing',
        message: 'Prediction started successfully. You will be notified when it completes.',
        urls: prediction.urls,
        debugLogs // Include debug logs in successful response
      });
      
    } catch (replicateError) {
      addDebugLog('19. REPLICATE_API_ERROR', {
        error: replicateError instanceof Error ? replicateError.message : 'Unknown Replicate error',
        errorType: typeof replicateError,
        errorName: replicateError instanceof Error ? replicateError.name : 'Unknown',
        stage: 'Replicate API call'
      });
      console.error('❌ REPLICATE API ERROR - This is likely where "string did not match" comes from:');
      console.error('📍 Error details:', replicateError);
      console.error('📋 Error message:', replicateError instanceof Error ? replicateError.message : 'Unknown error');
      console.error('🔍 Error type:', typeof replicateError);
      
      // Check if this is the "string did not match" error
      const errorMessage = replicateError instanceof Error ? replicateError.message : 'Unknown error';
      if (errorMessage.includes('string did not match')) {
        addDebugLog('19. STRING_MATCH_ERROR_DETECTED', {
          errorMessage,
          source: 'Replicate API',
          suggestion: 'Input validation failed at Replicate level'
        });
        console.error('🎯 FOUND IT! This is the "string did not match" error from Replicate API');
        console.error('💡 This suggests Replicate is rejecting the input format/validation');
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
          addDebugLog('19. DATABASE_ERROR_UPDATE', 'Updating database record with error status');
          await supabase
            .from('predictions')
            .update({
              status: 'failed',
              error: errorMessage,
              completed_at: new Date().toISOString()
            })
            .eq('id', dbRecordId);
        } catch (updateError) {
          addDebugLog('19. DATABASE_ERROR_UPDATE_FAILED', {
            error: updateError instanceof Error ? updateError.message : 'Unknown update error'
          });
          console.error('❌ Error updating prediction with error status:', updateError);
        }
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          message: additionalInfo,
          details: isRateLimitError ? 'RATE_LIMIT_EXCEEDED' : 'GENERATION_FAILED',
          debugLogs // Include debug logs in error response
        },
        { status: isRateLimitError ? 429 : 500 }
      );
    }
  } catch (error) {
    addDebugLog('FINAL_CATCH_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown final error',
      errorType: typeof error,
      stage: 'Final catch block'
    });
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        debugLogs // Include debug logs even in final catch
      },
      { status: 500 }
    );
  }
} 