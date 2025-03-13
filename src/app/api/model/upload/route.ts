import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import JSZip from 'jszip';

// Remove the config export as it's not needed in App Router
export async function POST(request: NextRequest) {
  // Check if the request has been processed by middleware
  if (!request.headers.get('x-middleware-next')) {
    return NextResponse.json(
      { error: 'Request not processed by middleware', success: false },
      { status: 400 }
    );
  }

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

    // Check content type
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type. Expected multipart/form-data', success: false },
        { status: 400 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const modelOwner = formData.get('modelOwner') as string;
    const modelName = formData.get('modelName') as string;
    const files = formData.getAll('files') as File[];

    if (!modelOwner || !modelName || files.length === 0) {
      return NextResponse.json(
        { error: 'Model owner, name, and files are required', success: false },
        { status: 400 }
      );
    }

    // Verify model exists
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('id')
      .eq('model_owner', modelOwner)
      .eq('model_id', modelName)
      .eq('user_id', user.id)
      .single();

    if (modelError) {
      return NextResponse.json(
        { error: 'Model not found', success: false },
        { status: 404 }
      );
    }

    // Create and upload zip
    const zip = new JSZip();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      zip.file(`${i}${file.name.substring(file.name.lastIndexOf('.'))}`, await file.arrayBuffer());
    }
    
    const zipData = await zip.generateAsync({ 
      type: 'arraybuffer',
      compression: 'DEFLATE' 
    });
    
    const zipPath = `${modelOwner}/${modelName}/images.zip`;
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('training-files')
      .upload(zipPath, zipData, {
        contentType: 'application/zip',
        upsert: true
      });

    if (uploadError) {
      return NextResponse.json(
        { error: 'Failed to upload zip file', success: false },
        { status: 500 }
      );
    }
    
    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('training-files')
      .createSignedUrl(zipPath, 60 * 60);

    if (!urlData?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate signed URL', success: false },
        { status: 500 }
      );
    }

    // Update model status
    await supabase
      .from('models')
      .update({ status: 'files_uploaded' })
      .eq('id', modelData.id);

    return NextResponse.json({
      success: true,
      zipUrl: urlData.signedUrl,
      message: `Successfully uploaded ${files.length} files`
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Upload failed', success: false },
      { status: 500 }
    );
  }
} 