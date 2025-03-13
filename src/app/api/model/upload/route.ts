import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

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

    // Check if this is a file upload request
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type. Expected multipart/form-data', success: false },
        { status: 400 }
      );
    }

    return await handleFileUpload(request, supabase, user.id);
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        success: false
      },
      { status: 500 }
    );
  }
}

// Handle file upload for model training - ultra-simple implementation
async function handleFileUpload(request: NextRequest, supabase: SupabaseClient, userId: string) {
  try {
    // Parse form data
    const formData = await request.formData();
    const modelOwner = formData.get('modelOwner') as string;
    const modelName = formData.get('modelName') as string;
    const files = formData.getAll('files') as File[];

    // Basic validation
    if (!modelOwner || !modelName || files.length === 0) {
      return NextResponse.json(
        { error: 'Model owner, name, and files are required', success: false },
        { status: 400 }
      );
    }

    // Find or update the model (keep this part as is)
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .eq('user_id', userId)
      .single();

    if (!modelError && modelData && !modelData.user_id) {
      await supabase
        .from('models')
        .update({ user_id: userId })
        .eq('id', modelData.id);
    }

    // ULTRA SIMPLE ZIP CREATION - no fancy options, no streams, no complications
    try {
      // Create a basic zip
      const zip = new JSZip();
      
      // Add files with numeric names only - nothing fancy
      for (let i = 0; i < files.length; i++) {
        const fileData = await files[i].arrayBuffer();
        // Preserve original file extension if available, otherwise use generic index
        const originalName = files[i].name;
        const filename = originalName ? 
          // Use simple index + original filename to maintain file type
          `${i}_${originalName}` :
          // Fallback to just an index if no filename
          `file_${i}`;
        
        // Add to zip with original filename/extension
        zip.file(filename, fileData);
      }
      
      // Generate with minimal options
      const zipData = await zip.generateAsync({ 
        type: 'arraybuffer',
        compression: 'DEFLATE' 
      });
      
      // Simple path
      const zipPath = `${modelOwner}/${modelName}/images.zip`;
      
      // Upload to Supabase
      const { error: uploadError } = await supabase.storage
        .from('training-files')
        .upload(zipPath, zipData, {
          contentType: 'application/zip',
          upsert: true
        });

      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message, success: false },
          { status: 500 }
        );
      }
      
      // Get URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from('training-files')
        .createSignedUrl(zipPath, 60 * 60);

      if (urlError) {
        return NextResponse.json(
          { error: urlError.message, success: false },
          { status: 500 }
        );
      }
      
      // Update model status if needed
      if (modelData) {
        await supabase
          .from('models')
          .update({ status: 'files_uploaded' })
          .eq('id', modelData.id);
      }

      // Success!
      return NextResponse.json({
        success: true,
        zipUrl: urlData?.signedUrl,
        message: `Successfully uploaded ${files.length} files`
      });
    } catch (error) {
      console.error('Error creating zip:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Error creating zip file', success: false },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error handling upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed', success: false },
      { status: 500 }
    );
  }
} 