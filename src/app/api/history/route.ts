import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

// Define the type for image generation
type ImageGeneration = {
  id: string;
  prompt: string;
  timestamp: string;
  images: string[];
  aspectRatio: string;
};

// Type for Supabase prediction records
type PredictionRecord = {
  id: string
  replicate_id: string
  prompt: string
  aspect_ratio: string
  status: string
  input: Record<string, unknown>
  output: string[] | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export async function GET() {
  try {
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
    // Fetch successful predictions from Supabase
    const { data: predictionData, error: supabaseError } = await supabase
      .from('predictions')
      .select('*')
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (supabaseError) {
      throw new Error(`Failed to fetch from Supabase: ${supabaseError.message}`);
    }
    
    // If no data from Supabase, return empty array
    if (!predictionData || predictionData.length === 0) {
      return NextResponse.json([]);
    }
    
    // Transform Supabase records to ImageGeneration format
    const transformedData: ImageGeneration[] = predictionData
      .filter((pred: PredictionRecord) => pred.output && Array.isArray(pred.output))
      .map((pred: PredictionRecord) => ({
        id: pred.id,
        prompt: pred.prompt,
        timestamp: pred.created_at,
        images: Array.isArray(pred.output) ? pred.output : [],
        aspectRatio: pred.aspect_ratio
      }));
    
    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching image history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image history' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.prompt || !Array.isArray(body.images) || body.images.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request body. Required fields: prompt, images' },
        { status: 400 }
      );
    }
    
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
    // Check if this is from a Replicate prediction
    if (body.replicate_id) {
      // Update the existing prediction record
      const { error: updateError } = await supabase
        .from('predictions')
        .update({
          output: body.images,
          status: 'succeeded',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('replicate_id', body.replicate_id);
      
      if (updateError) {
        console.error('Error updating prediction in Supabase:', updateError);
        return NextResponse.json(
          { error: 'Failed to update prediction in database' },
          { status: 500 }
        );
      }
    } else {
      // Create a new prediction record
      const { error: insertError } = await supabase
        .from('predictions')
        .insert({
          replicate_id: `manual-${Date.now()}`,
          prompt: body.prompt,
          aspect_ratio: body.aspectRatio || "1:1",
          status: 'succeeded',
          input: { prompt: body.prompt },
          output: body.images,
          created_at: body.timestamp || new Date().toISOString(),
          completed_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Error inserting prediction to Supabase:', insertError);
        return NextResponse.json(
          { error: 'Failed to save prediction to database' },
          { status: 500 }
        );
      }
    }
    
    // Create response object
    const newGeneration: ImageGeneration = {
      id: body.id || Date.now().toString(),
      prompt: body.prompt,
      timestamp: body.timestamp || new Date().toISOString(),
      images: body.images,
      aspectRatio: body.aspectRatio || "1:1"
    };
    
    return NextResponse.json(newGeneration);
  } catch (error) {
    console.error('Error saving to image history:', error);
    return NextResponse.json(
      { error: 'Failed to save to image history' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  // Set CORS headers to ensure the browser can access the response
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers 
    });
  }

  try {
    // Get the ID from the URL query parameters
    const url = new URL(request.url);
    const replicateId = url.searchParams.get('id');
    const urlsParam = url.searchParams.get('urls');
    
    if (!replicateId) {
      return new Response(
        JSON.stringify({ error: 'Missing replicate ID' }),
        { status: 400, headers }
      );
    }
    
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
    // Process storage URLs if provided
    let storageUrls: string[] = [];
    if (urlsParam) {
      try {
        storageUrls = JSON.parse(urlsParam);
      } catch (_error) {
        void _error; // Explicitly indicate we're ignoring this variable
        // Continue even if we can't parse the URLs
      }
    }
    
    // If no URLs were provided or parsing failed, try to fetch them from the database
    if (storageUrls.length === 0) {
      const { data: predictionData, error: fetchError } = await supabase
        .from('predictions')
        .select('storage_urls')
        .eq('replicate_id', replicateId)
        .single();
      
      if (fetchError) {
        // Continue with soft delete even if we can't fetch the storage URLs
      } else if (predictionData && predictionData.storage_urls && Array.isArray(predictionData.storage_urls)) {
        storageUrls = predictionData.storage_urls;
      }
    }
    
    // Delete each image from storage
    if (storageUrls.length > 0) {
      for (const url of storageUrls) {
        try {
          // Extract the path from the URL
          // URLs are in the format: https://[project].supabase.co/storage/v1/object/sign/[bucket]/[userId]/[fileName]?token=...
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/');
          
          // Find the index of 'sign' and get everything after it
          const signIndex = pathParts.indexOf('sign');
          
          if (signIndex !== -1 && signIndex < pathParts.length - 1) {
            const bucket = pathParts[signIndex + 1];
            const path = pathParts.slice(signIndex + 2).join('/');
            
            const { error: storageError } = await supabase.storage
              .from(bucket)
              .remove([path]);
            
            if (storageError) {
              console.error('Error removing file:', storageError);
              // Continue with other files even if one fails
            }
          } else {
            console.error('Unrecognized signed URL format:', url);
          }
        } catch (_error) {
          void _error; // Explicitly indicate we're ignoring this variable
          // Continue with other files even if one fails
        }
      }
    }
    
    // Soft delete by updating is_deleted to true
    const { error: updateError } = await supabase
      .from('predictions')
      .update({ is_deleted: true })
      .eq('replicate_id', replicateId);
    
    if (updateError) {
      console.error('Error updating prediction in Supabase:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to mark prediction as deleted', details: updateError }),
        { status: 500, headers }
      );
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error deleting from image history:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to delete from image history', details: errorMessage }),
      { status: 500, headers }
    );
  }
} 