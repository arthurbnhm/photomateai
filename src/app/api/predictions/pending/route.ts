import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }

    // Get only pending predictions (generations and edits)
    const { data: pendingPredictions, error: predictionsError } = await supabase
      .from('predictions')
      .select(`
        *,
        models:model_id (
          display_name
        )
      `)
      .eq('is_deleted', false)
      .in('status', ['starting', 'queued', 'processing'])
      .eq('is_cancelled', false)
      .order('created_at', { ascending: false });

    if (predictionsError) {
      console.error('Error fetching pending predictions:', predictionsError);
      return NextResponse.json(
        { error: 'Failed to fetch pending predictions', success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      predictions: pendingPredictions || []
    });
  } catch (error) {
    console.error('Error in pending predictions API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        success: false
      },
      { status: 500 }
    );
  }
} 