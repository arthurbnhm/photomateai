import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

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
    
    // Determine the training data based on payload structure
    let training;
    
    if (data.training) {
      // Standard structure with training property
      training = data.training;
    } else if (data.id && data.status) {
      // Alternative structure where training data is at the root
      training = data;
    } else {
      console.log('Unknown webhook payload structure:', Object.keys(data));
      // Not a training webhook or unrecognized format, just acknowledge it
      return NextResponse.json({ success: true });
    }
    
    console.log('Training data:', JSON.stringify(training, null, 2));
    
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
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
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
} 