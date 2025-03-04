import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt, aspectRatio, outputFormat } = await request.json();

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
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

    console.log('API request parameters:', { prompt, aspectRatio, outputFormat });

    // Run the model with the specific version ID
    console.log('Calling Replicate API with model:', "arthurbnhm/clem:40ac7e258f9af939116dfa3896368d8ffee7abcbf9889c64462b77f4478eab53");
    
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
      
      const prediction = await replicate.predictions.create({
        version: "40ac7e258f9af939116dfa3896368d8ffee7abcbf9889c64462b77f4478eab53",
        input: inputParams,
        webhook: undefined,
        webhook_events_filter: undefined
      });
      
      console.log('Prediction created:', JSON.stringify(prediction, null, 2));
      console.log('Prediction ID:', prediction.id);
      
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
        
        if (finalPrediction.status === "processing") {
          console.log("Still processing...");
        } else if (finalPrediction.status === "succeeded") {
          console.log("Prediction succeeded!");
          console.log("Output:", JSON.stringify(finalPrediction.output, null, 2));
        } else if (finalPrediction.status === "failed") {
          console.error("Prediction failed:", finalPrediction.error);
        }
      }

      // Check if we've reached the maximum number of attempts
      if (attempts >= maxAttempts && finalPrediction.status !== "succeeded") {
        console.error("Reached maximum polling attempts without success");
        return NextResponse.json(
          { 
            error: "Prediction timed out after 5 minutes", 
            predictionId: prediction.id,
            status: finalPrediction.status
          },
          { status: 504 }
        );
      }

      // If generation was successful, save to history
      if (finalPrediction.status === "succeeded" && Array.isArray(finalPrediction.output)) {
        try {
          // Import the addToHistory function
          const { addToHistory } = await import('../history/utils');
          
          console.log('Images to save to history:', finalPrediction.output);
          
          // Create a new generation object
          const newGeneration = {
            id: Date.now().toString(),
            prompt,
            timestamp: new Date().toISOString(),
            images: finalPrediction.output,
            aspectRatio: aspectRatio || "1:1"
          };
          
          console.log('Generation object to save:', JSON.stringify(newGeneration, null, 2));
          
          // Add to history
          const savedGeneration = addToHistory(newGeneration);
          if (savedGeneration) {
            console.log('Successfully saved to history:', JSON.stringify(savedGeneration, null, 2));
          } else {
            console.error('Failed to save to history: Invalid generation object');
            
            // Try to save via POST request as fallback
            try {
              const historyResponse = await fetch(new URL('/api/history', request.url).toString(), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(newGeneration),
              });
              
              if (historyResponse.ok) {
                console.log('Successfully saved to history via POST request');
              } else {
                console.error('Failed to save to history via POST request:', await historyResponse.text());
              }
            } catch (postError) {
              console.error('Error saving to history via POST request:', postError);
            }
          }
        } catch (historyError) {
          console.error('Failed to save to history:', historyError);
          // Don't fail the request if history saving fails
        }
      }

      // Return the final prediction result
      return NextResponse.json({
        output: finalPrediction.output,
        prediction: finalPrediction,
        status: finalPrediction.status,
        predictionId: finalPrediction.id,
        hasOutput: !!finalPrediction.output,
        isUndefined: finalPrediction.output === undefined,
        outputType: typeof finalPrediction.output,
        outputIsArray: Array.isArray(finalPrediction.output),
        outputLength: Array.isArray(finalPrediction.output) ? finalPrediction.output.length : 0,
        completedAt: finalPrediction.completed_at,
        metrics: finalPrediction.metrics,
      });
    } catch (replicateError) {
      console.error('Error generating image:', replicateError);
      
      // Extract the error message
      const errorMessage = replicateError instanceof Error 
        ? replicateError.message 
        : String(replicateError);
      
      // Check if the error is related to the API token
      if (errorMessage.includes('API token') || errorMessage.includes('authentication') || errorMessage.includes('auth')) {
        return NextResponse.json(
          { 
            error: "Invalid Replicate API token. Please check your token and try again.",
            details: "You need a valid Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens"
          },
          { status: 401 }
        );
      }
      
      // Check if the error is related to the model version
      if (errorMessage.includes('version') || errorMessage.includes('model')) {
        return NextResponse.json(
          { 
            error: "Error with the model version. The model may be unavailable or the version ID is incorrect.",
            details: errorMessage
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { 
          error: `Error generating image: ${errorMessage}`,
          details: "An unexpected error occurred while generating the image. Please try again later."
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error generating image:', error);
    
    // Return more detailed error information
    let errorMessage = 'Failed to generate image';
    let additionalInfo = {};
    
    if (error instanceof Error) {
      errorMessage = error.message;
      additionalInfo = { stack: error.stack };
      
      // Check for specific error types
      if (errorMessage.includes('404')) {
        errorMessage = 'Model not found. Please check the model ID and version.';
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorMessage = 'Authentication error. Please check your API token.';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: additionalInfo
      },
      { status: 500 }
    );
  }
} 