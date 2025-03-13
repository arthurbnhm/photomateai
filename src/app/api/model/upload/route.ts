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

// Handle file upload for model training
async function handleFileUpload(request: NextRequest, supabase: SupabaseClient, userId: string) {
  try {
    const formData = await request.formData();
    const modelOwner = formData.get('modelOwner') as string;
    const modelName = formData.get('modelName') as string;
    const files = formData.getAll('files') as File[];

    if (!modelOwner || !modelName || files.length === 0) {
      console.error('Missing required parameters for upload');
      return NextResponse.json(
        { error: 'Model owner, name, and files are required', success: false },
        { status: 400 }
      );
    }

    // Find the model in Supabase
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .eq('user_id', userId)
      .single();

    if (modelError) {
      // Continue anyway since we can still upload the files
    } else {
      // Update the model with the user ID if it's not already set
      if (modelData && !modelData.user_id) {
        const { error: updateError } = await supabase
          .from('models')
          .update({ user_id: userId })
          .eq('id', modelData.id);
          
        if (updateError) {
          console.warn(`Failed to update model with user ID: ${updateError.message}`);
          // Continue anyway
        }
      }
    }
    
    try {
      // Create a zip file using JSZip
      const zip = new JSZip();
      
      // Add each file to the zip with a simple name
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        
        // Use a simple numeric name to avoid any pattern matching issues
        zip.file(`${i}.jpg`, arrayBuffer);
      }
      
      // Generate the zip file with maximum compression
      const zipContent = await zip.generateAsync({ 
        type: 'arraybuffer',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 9
        }
      });
      
      // Check if zip size is approaching limit
      const sizeLimit = 50 * 1024 * 1024; // 50MB
      if (zipContent.byteLength > sizeLimit * 0.8) {
        console.warn(`⚠️ Zip file size (${Math.round(zipContent.byteLength / (1024 * 1024))} MB) is approaching the bucket limit (${sizeLimit / (1024 * 1024)} MB)`);
      }
      
      // Upload the zip file to Supabase
      const zipPath = `${modelOwner}/${modelName}/images.zip`;
      
      const { error: uploadError } = await supabase.storage
        .from('training-files')
        .upload(zipPath, zipContent, {
          contentType: 'application/zip',
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        return NextResponse.json(
          { error: `Failed to upload zip file: ${uploadError.message}`, success: false },
          { status: 500 }
        );
      }
      
      // Generate a signed URL that expires in 1 hour
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('training-files')
        .createSignedUrl(zipPath, 60 * 60); // 1 hour in seconds

      if (signedUrlError || !signedUrlData) {
        return NextResponse.json(
          { error: `Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`, success: false },
          { status: 500 }
        );
      }
      
      // Update the model with the zip URL if we found the model
      if (modelData) {
        const { error: updateError } = await supabase
          .from('models')
          .update({ 
            status: 'files_uploaded'
          })
          .eq('id', modelData.id);

        if (updateError) {
          // Continue anyway since the files were uploaded
        }
      }

      return NextResponse.json({
        success: true,
        zipUrl: signedUrlData.signedUrl,
        message: `Successfully uploaded ${files.length} files as a zip`
      });
    } catch (zipError) {
      console.error('Error generating or processing zip file:', zipError);
      return NextResponse.json(
        { error: `Failed to generate zip file: ${zipError instanceof Error ? zipError.message : 'Unknown error'}`, success: false },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error handling file upload:', error);
    console.error('Full error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to upload files',
        success: false
      },
      { status: 500 }
    );
  }
} 