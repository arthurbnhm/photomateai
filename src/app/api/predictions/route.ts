import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const isDeleted = searchParams.get('is_deleted') === 'true';
    const isCancelled = searchParams.get('is_cancelled');
    const hasLikedImages = searchParams.get('has_liked_images') === 'true';

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

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

    // First, get the total count for pagination - only count displayable predictions
    let countQuery = supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', isDeleted)
      .eq('status', 'succeeded')
      .not('storage_urls', 'is', null);

    // Add the same filters to count query (excluding status since we hardcoded 'succeeded')
    if (isCancelled !== null) {
      countQuery = countQuery.eq('is_cancelled', isCancelled === 'true');
    }

    if (hasLikedImages) {
      countQuery = countQuery.not('liked_images', 'is', null);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Error getting predictions count:', countError);
      return NextResponse.json(
        { error: 'Failed to get predictions count', success: false },
        { status: 500 }
      );
    }

    // Build the main query - only get displayable predictions
    let query = supabase
      .from('predictions')
      .select(`
        *,
        models:model_id (
          display_name
        )
      `)
      .eq('is_deleted', isDeleted)
      .eq('status', 'succeeded')
      .not('storage_urls', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Add optional filters (excluding status since we hardcoded 'succeeded')
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

    const totalPages = Math.ceil((count || 0) / limit);

    return NextResponse.json({
      success: true,
      predictions: predictions || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
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