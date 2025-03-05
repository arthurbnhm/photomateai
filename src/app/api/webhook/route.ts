import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Create a Supabase client for the API route
const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

// Function to download and store an image
async function downloadAndStoreImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to download image:', response.statusText);
      return null;
    }

    const blob = await response.blob();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const filePath = `generations/${fileName}`;

    const supabase = createSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Failed to upload image:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error in downloadAndStoreImage:', error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const webhookData = await request.json();
    console.log('Received prediction webhook:', webhookData);

    const supabase = createSupabaseClient();
    const replicate_id = webhookData.id;

    if (!replicate_id) {
      console.error('No replicate_id in webhook data');
      return NextResponse.json({ error: 'No replicate_id provided' }, { status: 400 });
    }

    // Get the prediction from our database
    const { data: prediction, error: predictionError } = await supabase
      .from('predictions')
      .select('*')
      .eq('replicate_id', replicate_id)
      .maybeSingle();

    if (predictionError) {
      console.error('Error fetching prediction:', predictionError);
      return NextResponse.json({ error: 'Error fetching prediction' }, { status: 500 });
    }

    if (!prediction) {
      console.error('No prediction found with replicate_id:', replicate_id);
      return NextResponse.json({ error: 'Prediction not found' }, { status: 404 });
    }

    // Handle different webhook statuses
    if (webhookData.status === 'succeeded') {
      const urls = webhookData.output;
      if (!Array.isArray(urls)) {
        console.error('Invalid output format:', urls);
        return NextResponse.json({ error: 'Invalid output format' }, { status: 400 });
      }

      // Download and store images
      try {
        const storageUrls = await Promise.all(
          urls.map(url => downloadAndStoreImage(url))
        );

        // Filter out any null values from failed uploads
        const validStorageUrls = storageUrls.filter(url => url !== null) as string[];

        if (validStorageUrls.length === 0) {
          // If no images were successfully stored, mark the prediction as failed
          const { error: updateError } = await supabase
            .from('predictions')
            .update({
              status: 'failed',
              error: 'Failed to store any images',
              updated_at: new Date().toISOString()
            })
            .eq('id', prediction.id);

          if (updateError) {
            console.error('Error updating prediction status:', updateError);
          }

          return NextResponse.json({ error: 'Failed to store images' }, { status: 500 });
        }

        // Update the prediction with storage URLs and status
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            status: webhookData.status,
            storage_urls: validStorageUrls,
            updated_at: new Date().toISOString()
          })
          .eq('id', prediction.id);

        if (updateError) {
          console.error('Error updating prediction:', updateError);
          return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
        }
      } catch (error) {
        console.error('Error storing images:', error);
        return NextResponse.json({ error: 'Error storing images' }, { status: 500 });
      }
    } else {
      // For non-succeeded statuses, just update the status
      const { error: updateError } = await supabase
        .from('predictions')
        .update({
          status: webhookData.status,
          error: webhookData.error,
          updated_at: new Date().toISOString()
        })
        .eq('id', prediction.id);

      if (updateError) {
        console.error('Error updating prediction:', updateError);
        return NextResponse.json({ error: 'Error updating prediction' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 