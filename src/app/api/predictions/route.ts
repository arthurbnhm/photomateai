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
    const replicateId = searchParams.get('replicate_id');

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

    // If replicateId is provided, fetch only that specific prediction
    if (replicateId) {
      const { data: singlePrediction, error: singleError } = await supabase
        .from('predictions')
        .select(`
          *,
          models:model_id (
            display_name
          )
        `)
        .eq('replicate_id', replicateId)
        .eq('is_deleted', false)
        .eq('status', 'succeeded')
        .not('storage_urls', 'is', null)
        .maybeSingle();

      if (singleError) {
        console.error('Error fetching single prediction:', singleError);
        return NextResponse.json(
          { error: 'Failed to fetch prediction', success: false },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        predictions: singlePrediction ? [singlePrediction] : [],
        pagination: {
          page: 1,
          limit: 1,
          total: singlePrediction ? 1 : 0,
          totalPages: singlePrediction ? 1 : 0,
          hasNextPage: false,
          hasPreviousPage: false
        }
      });
    }

    // Continue with normal pagination logic for non-single requests
    // Get total count for pagination - only count completed predictions (succeeded)
    let countQuery = supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', isDeleted)
      .eq('status', 'succeeded')
      .not('storage_urls', 'is', null);

    // Add the same filters to count query 
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

    // Get only completed predictions with pagination
    let completedQuery = supabase
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

    // Add optional filters
    if (isCancelled !== null) {
      completedQuery = completedQuery.eq('is_cancelled', isCancelled === 'true');
    }

    // Filter for predictions with liked images (for favorites)
    if (hasLikedImages) {
      completedQuery = completedQuery.not('liked_images', 'is', null);
    }

    const { data: completedPredictions, error: predictionsError } = await completedQuery;

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
      predictions: completedPredictions || [],
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