import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Define maximum total file size (100MB)
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB in bytes

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client with user session
    const supabase = createServerClient();
    
    // Get the current user
    const { data, error: userError } = await supabase.auth.getUser();
    let user = data.user;
    
    if (userError || !user) {
      // Check for Authorization header as fallback
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // Authenticate with the token
        const { data: { user: tokenUser }, error: tokenError } = await supabase.auth.getUser(token);
        
        if (tokenError || !tokenUser) {
          return NextResponse.json(
            { error: 'Unauthorized: Invalid token', success: false },
            { status: 401 }
          );
        }
        
        // Use the token user
        user = tokenUser;
      } else {
        return NextResponse.json(
          { error: 'Unauthorized', success: false },
          { status: 401 }
        );
      }
    }

    // Ensure the request is multipart/form-data
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type. Expected multipart/form-data', success: false },
        { status: 400 }
      );
    }

    // Get the form data
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided', success: false },
        { status: 400 }
      );
    }

    // Check if the total file size exceeds the limit
    let totalSize = 0;
    for (const file of files) {
      if (file instanceof File) {
        totalSize += file.size;
      }
    }
    
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { 
          error: `Total file size of ${(totalSize / (1024 * 1024)).toFixed(2)}MB exceeds the 100MB limit`,
          success: false
        },
        { status: 400 }
      );
    }

    // Process each file
    const uploadResults = [];
    for (const file of files) {
      if (!(file instanceof File)) {
        continue;
      }

      // Generate a unique file path
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
      const filePath = `${user.id}/${fileName}`;

      try {
        // Upload the file to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from('training-files')
          .upload(filePath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          uploadResults.push({
            fileName: file.name,
            success: false,
            error: uploadError.message
          });
          continue;
        }

        // Get the URL for the uploaded file
        const { data: urlData } = await supabase.storage
          .from('training-files')
          .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

        if (!urlData?.signedUrl) {
          uploadResults.push({
            fileName: file.name,
            success: false,
            error: 'Failed to generate signed URL'
          });
          continue;
        }

        uploadResults.push({
          fileName: file.name,
          success: true,
          url: urlData.signedUrl,
          path: filePath
        });
      } catch (error) {
        uploadResults.push({
          fileName: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Check if any files were successfully uploaded
    const successfulUploads = uploadResults.filter(result => result.success);
    if (successfulUploads.length === 0) {
      return NextResponse.json(
        { 
          error: 'Failed to upload any files',
          uploadResults,
          success: false
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uploadResults,
      message: `Successfully uploaded ${successfulUploads.length} files`
    });
  } catch (error) {
    console.error('Error in upload API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        success: false
      },
      { status: 500 }
    );
  }
} 