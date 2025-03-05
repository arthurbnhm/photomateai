import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createSupabaseAdmin } from '@/lib/supabase';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Default model version ID
const DEFAULT_MODEL_VERSION = "40ac7e258f9af939116dfa3896368d8ffee7abcbf9889c64462b77f4478eab53";

export async function POST(request: NextRequest) {
  try {
    const { prompt, aspectRatio, outputFormat, modelId } = await request.json();
    const supabase = createSupabaseAdmin();

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
    console.log('API request parameters:', { prompt, aspectRatio, outputFormat, modelId });
    console.log('API token available:', apiToken ? `Yes (starts with ${apiToken.substring(0, 4)}...)` : 'No');
    
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

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Get model details if modelId is provided
    let modelVersion: string | undefined = DEFAULT_MODEL_VERSION;
    let modelOwner = "arthurbnhm";
    let modelName = "clem";
    
    if (modelId) {
      try {
        // Fetch the model details from Supabase
        const { data: model, error } = await supabase
          .from('models')
          .select('*')
          .eq('id', modelId)
          .eq('status', 'ready')
          .single();
        
        if (error || !model) {
          console.error('Error fetching model details:', error);
        } else {
          // Use the model's replicate_owner and replicate_name
          modelOwner = model.replicate_owner;
          modelName = model.replicate_name;
          
          // For custom models, we use the model name/owner instead of a specific version
          modelVersion = undefined;
          
          console.log(`Using custom model: ${modelOwner}/${modelName}`);
        }
      } catch (err) {
        console.error('Error getting model details:', err);
      }
    }
    
    // Log which model we're using
    if (modelVersion) {
      console.log(`Calling Replicate API with default model version: ${modelOwner}/${modelName}:${modelVersion}`);
    } else {
      console.log(`Calling Replicate API with custom model: ${modelOwner}/${modelName}`);
    }
    
    const inputParams = {
      prompt,
      model: "dev",
      go_fast: false,
      lora_scale: 1,
      megapixels: "1",
      num_outputs: 4,
      aspect_ratio: aspectRatio || "1:1",
      output_format: outputFormat || "webp",
      guidance_scale: 3,
      output_quality: 80,
      prompt_strength: 0.8,
      extra_lora_scale: 1,
      num_inference_steps: 28,
      disable_safety_checker: true
    };
    
    console.log('Input parameters:', JSON.stringify(inputParams, null, 2));

    try {
      // Instead of using replicate.run, use the predictions API directly
      console.log('Creating prediction using predictions.create API...');
      
      let prediction;
      
      if (modelVersion) {
        // Use version-based prediction
        prediction = await replicate.predictions.create({
          version: modelVersion,
          input: inputParams,
          webhook: undefined,
          webhook_events_filter: undefined
        });
      } else {
        // Use model-based prediction
        prediction = await replicate.predictions.create({
          model: `${modelOwner}/${modelName}`,
          input: inputParams,
          webhook: undefined,
          webhook_events_filter: undefined
        });
      }
      
      console.log('Prediction created:', JSON.stringify(prediction, null, 2));
      console.log('Prediction ID:', prediction.id);
      
      // Log the prediction to Supabase immediately to ensure it's available for cancellation
      let dbRecordId = null;
      try {
        const { data: predictionRecord, error: insertError } = await supabase
          .from('predictions')
          .insert({
            replicate_id: prediction.id,
            prompt: prompt,
            aspect_ratio: aspectRatio || "1:1",
            status: prediction.status,
            input: inputParams
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('Error logging prediction to Supabase:', insertError);
        } else {
          console.log('Prediction logged to Supabase:', predictionRecord);
          dbRecordId = predictionRecord.id;
        }
      } catch (dbError) {
        console.error('Exception logging prediction to Supabase:', dbError);
      }
      
      // Return an immediate response with the prediction ID - this is critical for cancellation
      return NextResponse.json({
        id: dbRecordId || `manual-${Date.now()}`,
        replicate_id: prediction.id,
        status: 'processing',
        message: 'Prediction started successfully. The generation process may take up to 1-2 minutes.'
      });
      
      // Note: This code is now unreachable. We're returning early and letting the client
      // check for updates via checkForCompletedGenerations instead of making the client wait
      
      // Poll for the prediction result
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes (30 * 10 seconds)
      let finalPrediction = prediction;

      while (
        attempts < maxAttempts &&
        finalPrediction.status !== "succeeded" &&
        finalPrediction.status !== "failed" &&
        finalPrediction.status !== "canceled"
      ) {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts}, current status: ${finalPrediction.status}`);
        
        // Wait for 10 seconds before polling again
        await new Promise((resolve) => setTimeout(resolve, 10000));
        
        // Get the updated prediction
        finalPrediction = await replicate.predictions.get(prediction.id);
        console.log(`Updated status: ${finalPrediction.status}`);
        
        // Update the prediction status in Supabase
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            status: finalPrediction.status,
            updated_at: new Date().toISOString()
          })
          .eq('replicate_id', prediction.id);
        
        if (updateError) {
          console.error('Error updating prediction status in Supabase:', updateError);
        }
        
        if (finalPrediction.status === "processing") {
          console.log("Still processing...");
        } else if (finalPrediction.status === "succeeded") {
          console.log("Prediction succeeded!");
          console.log("Output:", JSON.stringify(finalPrediction.output, null, 2));
          
          // Update the prediction with output in Supabase
          const { error: successUpdateError } = await supabase
            .from('predictions')
            .update({
              status: finalPrediction.status,
              output: finalPrediction.output,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('replicate_id', prediction.id);
          
          if (successUpdateError) {
            console.error('Error updating prediction output in Supabase:', successUpdateError);
          }
        } else if (finalPrediction.status === "failed") {
          console.error("Prediction failed:", finalPrediction.error);
          
          // Update the prediction with error in Supabase
          const { error: failureUpdateError } = await supabase
            .from('predictions')
            .update({
              status: finalPrediction.status,
              error: finalPrediction.error || "Unknown error",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('replicate_id', prediction.id);
          
          if (failureUpdateError) {
            console.error('Error updating prediction error in Supabase:', failureUpdateError);
          }
        }
      }

      // Check if we've reached the maximum number of attempts
      if (attempts >= maxAttempts && finalPrediction.status !== "succeeded") {
        console.error("Reached maximum polling attempts without success");
        
        // Update the prediction with timeout error in Supabase
        const { error: timeoutUpdateError } = await supabase
          .from('predictions')
          .update({
            status: "timeout",
            error: "Prediction timed out after 5 minutes",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('replicate_id', prediction.id);
        
        if (timeoutUpdateError) {
          console.error('Error updating prediction timeout in Supabase:', timeoutUpdateError);
        }
        
        return NextResponse.json(
          { 
            error: "Prediction timed out after 5 minutes", 
            predictionId: prediction.id,
            replicate_id: prediction.id,
            status: finalPrediction.status
          },
          { status: 504 }
        );
      }

      // If generation was successful, save to history
      if (finalPrediction.status === "succeeded" && Array.isArray(finalPrediction.output)) {
        try {
          // We don't need to import addToHistory anymore since we're already using Supabase
          // The prediction is already saved to Supabase in the code above
          
          console.log('Images already saved to Supabase:', finalPrediction.output);
          
          // Return the successful prediction
          return NextResponse.json({
            id: prediction.id,
            replicate_id: prediction.id,
            status: finalPrediction.status,
            output: finalPrediction.output
          });
        } catch (historyError) {
          console.error('Error handling successful prediction:', historyError);
          
          // Return the successful prediction anyway
          return NextResponse.json({
            id: prediction.id,
            replicate_id: prediction.id,
            status: finalPrediction.status,
            output: finalPrediction.output
          });
        }
      } else if (finalPrediction.status === "failed") {
        // Return the error
        return NextResponse.json(
          { 
            error: finalPrediction.error || "Prediction failed", 
            predictionId: prediction.id,
            replicate_id: prediction.id,
            status: finalPrediction.status
          },
          { status: 500 }
        );
      } else {
        // Return an unknown error
        return NextResponse.json(
          { 
            error: "Prediction did not succeed or fail properly", 
            predictionId: prediction.id,
            replicate_id: prediction.id,
            status: finalPrediction.status
          },
          { status: 500 }
        );
      }
    } catch (replicateError) {
      console.error('Error calling Replicate API:', replicateError);
      
      // Log the error to Supabase
      const { error: errorLogError } = await supabase
        .from('predictions')
        .insert({
          replicate_id: 'error-' + Date.now(),
          prompt: prompt,
          aspect_ratio: aspectRatio || "1:1",
          status: "error",
          input: inputParams,
          error: replicateError instanceof Error ? replicateError.message : 'Unknown error',
          completed_at: new Date().toISOString()
        });
      
      if (errorLogError) {
        console.error('Error logging prediction error to Supabase:', errorLogError);
      }
      
      // Determine if it's a rate limit error
      const isRateLimitError = replicateError instanceof Error && 
        (replicateError.message.includes('429') || 
         replicateError.message.toLowerCase().includes('rate limit'));
      
      // Get additional error details
      const errorMessage = replicateError instanceof Error ? replicateError.message : 'Unknown error';
      const additionalInfo = isRateLimitError 
        ? "You've reached the rate limit for image generation. Please try again later."
        : "There was an error generating your image. Please try again.";
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: additionalInfo
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