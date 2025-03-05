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
      console.log('No data in Supabase, returning empty array');
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
    
    console.log('Returning Supabase history with', transformedData.length, 'items');
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
  try {
    // Get the ID from the URL query parameters
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing generation ID' },
        { status: 400 }
      );
    }
    
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
    // Soft delete by updating is_deleted to true
    const { error: updateError } = await supabase
      .from('predictions')
      .update({ is_deleted: true })
      .eq('id', id);
    
    if (updateError) {
      console.error('Error updating prediction in Supabase:', updateError);
      return NextResponse.json(
        { error: 'Failed to mark prediction as deleted' },
        { status: 500 }
      );
    }
    
    console.log(`Marked generation with ID ${id} as deleted in Supabase`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting from image history:', error);
    return NextResponse.json(
      { error: 'Failed to delete from image history' },
      { status: 500 }
    );
  }
} 