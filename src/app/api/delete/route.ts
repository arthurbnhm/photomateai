import { createSupabaseAdmin } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { urls, replicateId } = await request.json();
    
    if (!replicateId) {
      return NextResponse.json(
        { error: 'Missing replicate ID' },
        { status: 400 }
      );
    }
    
    // Initialize Supabase client
    const supabase = createSupabaseAdmin();
    
    // Process storage URLs if provided
    let storageUrls: string[] = [];
    if (urls && Array.isArray(urls)) {
      storageUrls = urls;
    }
    
    // If no URLs were provided, try to fetch them from the database
    if (storageUrls.length === 0) {
      const { data: predictionData, error: fetchError } = await supabase
        .from('predictions')
        .select('storage_urls')
        .eq('replicate_id', replicateId)
        .single();
      
      if (fetchError) {
        console.error('Error fetching storage URLs:', fetchError);
        // Continue with soft delete even if we can't fetch the storage URLs
      } else if (predictionData && predictionData.storage_urls && Array.isArray(predictionData.storage_urls)) {
        storageUrls = predictionData.storage_urls;
      }
    }
    
    // Delete each image from storage
    const deletionResults = [];
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
            
            deletionResults.push({
              url,
              success: !storageError,
              error: storageError ? storageError.message : null
            });
            
            if (storageError) {
              console.error('Error removing file:', storageError);
              // Continue with other files even if one fails
            }
          } else {
            console.error('Unrecognized signed URL format:', url);
            deletionResults.push({
              url,
              success: false,
              error: 'Unrecognized signed URL format'
            });
          }
        } catch (error) {
          console.error('Error processing URL:', url, error);
          deletionResults.push({
            url,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Continue with other files even if one fails
        }
      }
    }
    
    // Mark the prediction as deleted in the database
    const { error: updateError } = await supabase
      .from('predictions')
      .update({ is_deleted: true })
      .eq('replicate_id', replicateId);
    
    if (updateError) {
      console.error('Error updating deletion status:', updateError);
      return NextResponse.json(
        { 
          error: 'Failed to update deletion status',
          filesDeletionResults: deletionResults,
          databaseUpdateSuccess: false
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Files deleted and record marked as deleted',
      filesDeletionResults: deletionResults,
      databaseUpdateSuccess: true
    });
  } catch (error) {
    console.error('Error in delete API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 