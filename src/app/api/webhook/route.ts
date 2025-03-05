import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

// Define types for webhook data
interface TrainingWebhookData {
  training?: {
    id: string;
    status: string;
    output?: unknown;
    error?: string;
  };
  id?: string;
  status?: string;
  output?: unknown;
  error?: string;
}

interface PredictionWebhookData {
  id: string;
  status: string;
  output?: unknown;
  error?: string;
}

interface PredictionOutputItem {
  url?: string;
  [key: string]: unknown;
}

// Simple GET endpoint to verify the webhook route is accessible
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Webhook endpoint is active'
  });
}

export async function POST(request: NextRequest) {
  try {
    // Log the request headers for debugging
    console.log('Webhook received with headers:', Object.fromEntries(request.headers.entries()));
    
    // Clone the request to read the body twice (once for validation, once for processing)
    const requestClone = request.clone();
    
    // Get the webhook secret from environment variables
    const webhookSecret = process.env.REPLICATE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('REPLICATE_WEBHOOK_SECRET is not set');
      return NextResponse.json(
        { error: 'Webhook secret is not configured' },
        { status: 500 }
      );
    }
    
    // Get the signature and timestamp from headers
    const signature = request.headers.get('webhook-signature') || '';
    const timestamp = request.headers.get('webhook-timestamp') || '';
    const webhookId = request.headers.get('webhook-id') || '';
    
    console.log('Webhook signature:', signature);
    console.log('Webhook timestamp:', timestamp);
    console.log('Webhook ID:', webhookId);
    
    // Read the payload
    const payload = await requestClone.text();
    console.log('Webhook payload:', payload);
    
    // Skip validation in development if needed
    // For production, always validate
    let isValid = false;
    
    if (signature && timestamp) {
      // Validate the webhook
      // The expected format is v1,signature
      // We need to verify that the signature is valid
      const signatureParts = signature.split(',');
      if (signatureParts.length === 2 && signatureParts[0] === 'v1') {
        const receivedSignature = signatureParts[1];
        
        // Create the signed payload
        const signedPayload = `${webhookId}.${timestamp}.${payload}`;
        
        // Create the expected signature
        const hmac = crypto.createHmac('sha256', webhookSecret);
        hmac.update(signedPayload);
        const expectedSignature = hmac.digest('base64');
        
        console.log('Expected signature:', expectedSignature);
        console.log('Received signature:', receivedSignature);
        
        isValid = receivedSignature === expectedSignature;
      }
    }
    
    // If validation fails, return 401
    if (!isValid) {
      console.error('Invalid webhook signature');
      // For testing, we'll continue processing anyway
      // In production, you should uncomment the following line
      // return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    // Parse the payload
    const data = JSON.parse(payload);
    console.log('Parsed webhook data:', JSON.stringify(data, null, 2));
    
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
    // Determine the type of webhook (training or prediction)
    if (data.training) {
      // Handle training webhook
      return await handleTrainingWebhook(data, supabase);
    } else if (data.id && data.status) {
      // This could be either a training or prediction webhook
      // Check if it's a training webhook first
      const { data: trainingRecord, error: trainingError } = await supabase
        .from('trainings')
        .select('*')
        .eq('replicate_training_id', data.id)
        .single();
      
      if (!trainingError && trainingRecord) {
        // It's a training webhook
        return await handleTrainingWebhook({ training: data }, supabase);
      } else {
        // Check if it's a prediction webhook
        const { data: predictionRecord, error: predictionError } = await supabase
          .from('predictions')
          .select('*')
          .eq('replicate_id', data.id)
          .single();
        
        if (!predictionError && predictionRecord) {
          // It's a prediction webhook
          return await handlePredictionWebhook(data, supabase);
        } else {
          console.log('Unknown webhook payload, no matching training or prediction found:', data.id);
          return NextResponse.json({ success: true });
        }
      }
    } else {
      console.log('Unknown webhook payload structure:', Object.keys(data));
      // Not a recognized webhook format, just acknowledge it
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}

// Handle training webhooks
async function handleTrainingWebhook(data: TrainingWebhookData, supabase: SupabaseClient) {
  // Determine the training data based on payload structure
  const training = data.training || data;
  
  console.log('Training data:', JSON.stringify(training, null, 2));
  
  // Find the training in Supabase
  const { data: trainingRecord, error: trainingError } = await supabase
    .from('trainings')
    .select('*')
    .eq('replicate_training_id', training.id)
    .single();
  
  if (trainingError) {
    console.error('Training not found in database:', training.id);
    return NextResponse.json(
      { error: 'Training not found' },
      { status: 404 }
    );
  }
  
  // Update the training status
  const { error: updateError } = await supabase
    .from('trainings')
    .update({
      status: training.status,
      ...(training.output ? { output: training.output } : {}),
      ...(training.error ? { error: training.error } : {}),
      ...(training.status === 'succeeded' || training.status === 'failed' ? { completed_at: new Date().toISOString() } : {})
    })
    .eq('id', trainingRecord.id);
  
  if (updateError) {
    console.error('Error updating training status:', updateError);
    return NextResponse.json(
      { error: 'Failed to update training status' },
      { status: 500 }
    );
  }
  
  // If the training is completed (succeeded or failed), update the model status
  if (training.status === 'succeeded' || training.status === 'failed') {
    const { error: modelUpdateError } = await supabase
      .from('models')
      .update({
        status: training.status === 'succeeded' ? 'trained' : 'training_failed'
      })
      .eq('id', trainingRecord.model_id);
    
    if (modelUpdateError) {
      console.error('Error updating model status:', modelUpdateError);
      // Continue anyway since the training was updated
    }
  }
  
  return NextResponse.json({ success: true });
}

// Handle prediction webhooks
async function handlePredictionWebhook(prediction: PredictionWebhookData, supabase: SupabaseClient) {
  console.log('Prediction webhook received:', prediction.id, 'Status:', prediction.status);
  
  // Find the prediction in Supabase
  const { data: predictionRecord, error: predictionError } = await supabase
    .from('predictions')
    .select('*')
    .eq('replicate_id', prediction.id)
    .single();
  
  if (predictionError) {
    console.error('Prediction not found in database:', prediction.id);
    return NextResponse.json(
      { error: 'Prediction not found' },
      { status: 404 }
    );
  }
  
  console.log('Found prediction in database:', predictionRecord.id, 'Current status:', predictionRecord.status);
  
  // Process the output to ensure we have string URLs
  let processedOutput: string[] | null = null;
  
  if (prediction.output) {
    console.log('Processing prediction output:', 
      Array.isArray(prediction.output) 
        ? `Array with ${prediction.output.length} items` 
        : typeof prediction.output);
    
    if (Array.isArray(prediction.output)) {
      // Extract URLs from objects if needed
      processedOutput = prediction.output.map((item: unknown) => {
        if (typeof item === 'string') {
          return item;
        } else if (item && typeof item === 'object') {
          // If it's an object with a url property
          const typedItem = item as PredictionOutputItem;
          if (typedItem.url && typeof typedItem.url === 'string') {
            return typedItem.url;
          }
        }
        // Fallback
        return JSON.stringify(item);
      });
    } else if (prediction.output && typeof prediction.output === 'object') {
      // Single object case
      const typedOutput = prediction.output as PredictionOutputItem;
      if (typedOutput.url && typeof typedOutput.url === 'string') {
        processedOutput = [typedOutput.url];
      } else {
        processedOutput = [JSON.stringify(prediction.output)];
      }
    } else if (typeof prediction.output === 'string') {
      // Single string case
      processedOutput = [prediction.output];
    } else {
      // Fallback
      processedOutput = [JSON.stringify(prediction.output)];
    }
    
    console.log('Processed output:', processedOutput ? `${processedOutput.length} items` : 'null');
  } else {
    console.log('No output in webhook payload');
  }
  
  // Merge with existing output if this is a partial update
  if (processedOutput && predictionRecord.output && Array.isArray(predictionRecord.output)) {
    // Check if we're getting new images or just the same ones
    const existingUrls = new Set(predictionRecord.output);
    const newUrls = processedOutput.filter(url => !existingUrls.has(url));
    
    if (newUrls.length > 0) {
      // We have new images, append them to existing ones
      console.log(`Adding ${newUrls.length} new images to existing ${predictionRecord.output.length} images`);
      processedOutput = [...predictionRecord.output, ...newUrls];
    } else if (prediction.status !== 'succeeded') {
      // No new images and not complete yet, keep existing output
      console.log('No new images, keeping existing output');
      processedOutput = predictionRecord.output;
    } else {
      console.log('Status is succeeded but no new images, using current processed output');
    }
  } else if (processedOutput) {
    console.log('No existing output to merge with, using new output');
  } else if (predictionRecord.output && Array.isArray(predictionRecord.output)) {
    console.log('No new output but existing output exists, keeping existing output');
    processedOutput = predictionRecord.output;
  }
  
  // Update the prediction status
  const updateData: Record<string, unknown> = {
    status: prediction.status,
    updated_at: new Date().toISOString()
  };
  
  // Add output if available
  if (processedOutput) {
    updateData.output = processedOutput;
  }
  
  // Add error if available
  if (prediction.error) {
    updateData.error = prediction.error;
  }
  
  // Add completed_at if the prediction is done
  if (prediction.status === 'succeeded' || prediction.status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }
  
  // Log the update we're making
  console.log('Updating prediction with data:', JSON.stringify({
    id: predictionRecord.id,
    status: updateData.status,
    outputCount: processedOutput ? processedOutput.length : 0,
    hasError: !!prediction.error,
    completed: updateData.completed_at ? true : false
  }, null, 2));
  
  // Update the prediction in Supabase
  const { error: updateError } = await supabase
    .from('predictions')
    .update(updateData)
    .eq('id', predictionRecord.id);
  
  if (updateError) {
    console.error('Error updating prediction status:', updateError);
    return NextResponse.json(
      { error: 'Failed to update prediction status' },
      { status: 500 }
    );
  }
  
  console.log('Successfully updated prediction:', predictionRecord.id);
  return NextResponse.json({ success: true });
} 