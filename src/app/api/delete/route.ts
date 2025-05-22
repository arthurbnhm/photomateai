import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { urls, replicateId, predictionId } = await request.json();
    
    if (!replicateId && !predictionId) {
      return NextResponse.json(
        { error: 'Missing identifier: either replicateId or predictionId is required' },
        { status: 400 }
      );
    }
    
    // Initialize Supabase client with user session
    const supabase = await createSupabaseServerClient();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Process storage URLs if provided
    let storageUrls: string[] = [];
    if (urls && Array.isArray(urls)) {
      storageUrls = urls;
    }
    
    // Build the query to find the prediction
    let query = supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id);
      
    if (replicateId) {
      query = query.eq('replicate_id', replicateId);
    } else if (predictionId) {
      query = query.eq('id', predictionId);
    }
    
    // Get the prediction data
    const { data: predictionData, error: fetchError } = await query.single();
    
    if (fetchError) {
      console.error('Error fetching prediction:', fetchError);
      return NextResponse.json(
        { error: 'Prediction not found or access denied' },
        { status: 404 }
      );
    }
    
    // If no URLs were provided, try to use the ones from the database
    if (storageUrls.length === 0 && predictionData.storage_urls && Array.isArray(predictionData.storage_urls)) {
      storageUrls = predictionData.storage_urls;
    }
    
    // Delete each image from storage
    const deletionResults = [];
    let storageDeleteSuccess = true;
    
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
            
            const success = !storageError;
            deletionResults.push({
              url,
              success,
              error: storageError ? storageError.message : null
            });
            
            if (storageError) {
              console.error('Error removing file:', storageError);
              storageDeleteSuccess = false;
            }
          } else {
            console.error('Unrecognized signed URL format:', url);
            deletionResults.push({
              url,
              success: false,
              error: 'Unrecognized signed URL format'
            });
            storageDeleteSuccess = false;
          }
        } catch (error) {
          console.error('Error processing URL:', url, error);
          deletionResults.push({
            url,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          storageDeleteSuccess = false;
        }
      }
    }
    
    // Mark the prediction as deleted in the database
    const { error: updateError } = await supabase
      .from('predictions')
      .update({ is_deleted: true })
      .eq('id', predictionData.id)
      .eq('user_id', user.id);
    
    if (updateError) {
      console.error('Error updating deletion status:', updateError);
      return NextResponse.json(
        { 
          error: 'Failed to update deletion status',
          filesDeletionResults: deletionResults,
          databaseUpdateSuccess: false,
          storageDeleteSuccess
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Files deleted and record marked as deleted',
      filesDeletionResults: deletionResults,
      databaseUpdateSuccess: true,
      storageDeleteSuccess,
      allSuccessful: storageDeleteSuccess || storageUrls.length === 0
    });
  } catch (error) {
    console.error('Error in delete API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 