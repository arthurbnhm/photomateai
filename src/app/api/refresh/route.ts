import { NextResponse } from 'next/server';
import { createSupabaseAdmin, createSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { predictionId } = body;
    
    if (!predictionId) {
      return NextResponse.json({ error: 'Missing prediction ID' }, { status: 400 });
    }
    
    // Get user session for auth check
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Use admin client for storage operations
    const supabaseAdmin = createSupabaseAdmin();
    
    // Get the prediction with its storage_urls
    const { data: prediction, error: predictionError } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', predictionId)
      .single();
    
    if (predictionError || !prediction) {
      return NextResponse.json({ error: 'Prediction not found' }, { status: 404 });
    }
    
    // Verify user owns this prediction or skip check for records without user_id
    if (prediction.user_id && prediction.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized access to prediction' }, { status: 403 });
    }
    
    if (!prediction.storage_urls || !Array.isArray(prediction.storage_urls) || prediction.storage_urls.length === 0) {
      return NextResponse.json({ error: 'No images to refresh' }, { status: 400 });
    }
    
    // Extract file paths from the existing URLs and migrate to new format if needed
    const refreshedUrls = await Promise.all(prediction.storage_urls.map(async (url: string) => {
      try {
        // Parse the URL to extract the path
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        
        // Find the index of 'sign' and get everything after it
        const signIndex = pathParts.indexOf('sign');
        
        if (signIndex === -1 || signIndex >= pathParts.length - 1) {
          console.error('Invalid URL format:', url);
          return null;
        }
        
        const bucket = pathParts[signIndex + 1];
        const path = pathParts.slice(signIndex + 2).join('/');
        
        // Create a new signed URL for the current path (already in userId/fileName format)
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60); // 1 hour in seconds
        
        if (signedUrlError || !signedUrlData) {
          console.error('Failed to generate signed URL:', signedUrlError);
          return null;
        }
        
        return signedUrlData.signedUrl;
      } catch (error) {
        console.error('Error refreshing URL:', error);
        return null;
      }
    }));
    
    // Filter out null values (failed refreshes)
    const validRefreshedUrls = refreshedUrls.filter(url => url !== null) as string[];
    
    if (validRefreshedUrls.length === 0) {
      return NextResponse.json({ error: 'Failed to refresh any URLs' }, { status: 500 });
    }
    
    // Update the prediction with the new URLs
    const { error: updateError } = await supabaseAdmin
      .from('predictions')
      .update({
        storage_urls: validRefreshedUrls,
        updated_at: new Date().toISOString()
      })
      .eq('id', predictionId);
    
    if (updateError) {
      return NextResponse.json({ error: 'Failed to update prediction with refreshed URLs' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, urls: validRefreshedUrls });
  } catch (error) {
    console.error('Error in refresh endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 