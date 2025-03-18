import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase-server';

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client for user authentication
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
    const file = formData.get('file');
    const metadataString = formData.get('metadata');
    
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No file provided or invalid file', success: false },
        { status: 400 }
      );
    }

    let metadata = {};
    if (metadataString && typeof metadataString === 'string') {
      try {
        metadata = JSON.parse(metadataString);
      } catch (error) {
        console.error('Error parsing metadata:', error);
      }
    }

    // Upload the file to Replicate
    const replicateFile = await replicate.files.create(file, metadata);

    return NextResponse.json({
      success: true,
      fileUrl: replicateFile.urls.get,
      fileId: replicateFile.id,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Error in upload-replicate API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        success: false
      },
      { status: 500 }
    );
  }
} 