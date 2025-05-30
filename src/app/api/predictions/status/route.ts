import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const replicateId = searchParams.get('replicate_id');

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }

    if (!replicateId) {
      return NextResponse.json(
        { error: 'Missing replicate_id parameter', success: false },
        { status: 400 }
      );
    }

    const { data: prediction, error: predictionError } = await supabase
      .from('predictions')
      .select(`
        *,
        models:model_id (
          display_name
        )
      `)
      .eq('replicate_id', replicateId)
      .eq('user_id', user.id) // Ensure user can only access their own predictions
      .eq('is_deleted', false)
      .eq('is_cancelled', false)
      .maybeSingle(); // Use maybeSingle() as replicate_id should be unique for non-deleted/cancelled

    if (predictionError) {
      console.error('Error fetching prediction by replicate_id:', predictionError);
      return NextResponse.json(
        { error: 'Failed to fetch prediction', success: false, details: predictionError.message },
        { status: 500 }
      );
    }

    if (!prediction) {
      return NextResponse.json(
        { error: 'Prediction not found or access denied', success: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      prediction // Return a single prediction object, not an array
    });

  } catch (error) {
    console.error('Error in prediction status API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json(
      {
        error: errorMessage,
        success: false
      },
      { status: 500 }
    );
  }
} 