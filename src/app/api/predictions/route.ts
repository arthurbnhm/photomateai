import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const isDeleted = searchParams.get('is_deleted') === 'true';
    const isCancelled = searchParams.get('is_cancelled');
    const hasLikedImages = searchParams.get('has_liked_images') === 'true';

    const supabase = await createSupabaseServerClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', success: false },
        { status: 401 }
      );
    }
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session', success: false },
        { status: 401 }
      );
    }

    // Build the query - RLS policies will automatically filter by user_id
    let query = supabase
      .from('predictions')
      .select(`
        *,
        models:model_id (
          display_name
        )
      `)
      .eq('is_deleted', isDeleted)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Add optional filters
    if (status) {
      query = query.eq('status', status);
    }
    
    if (isCancelled !== null) {
      query = query.eq('is_cancelled', isCancelled === 'true');
    }

    // Filter for predictions with liked images (for favorites)
    if (hasLikedImages) {
      query = query.not('liked_images', 'is', null);
    }

    const { data: predictions, error: predictionsError } = await query;

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
      return NextResponse.json(
        { error: 'Failed to fetch predictions', success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      predictions: predictions || [],
      pagination: {
        limit,
        total: predictions?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in predictions API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        success: false
      },
      { status: 500 }
    );
  }
} 