import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { SupabaseClient } from '@supabase/supabase-js';

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
    if (contentType.includes('multipart/form-data')) {
      // Forward to the upload endpoint
      const uploadResponse = await fetch(new URL('/api/model/upload', request.url), {
        method: 'POST',
        body: request.body,
        headers: request.headers,
        // This ensures cookies and credentials are forwarded
        credentials: 'include',
        // @ts-expect-error - Add the duplex option which is required but not in TypeScript definitions yet
        duplex: 'half'
      });
      
      // Return the response directly
      const responseData = await uploadResponse.json();
      return NextResponse.json(responseData, { status: uploadResponse.status });
    }

    // For JSON requests, parse the body
    const body = await request.json();
    const action = body.action;

    // Handle different actions
    switch (action) {
      case 'create':
        // Forward to the create endpoint
        const createResponse = await fetch(new URL('/api/model/create', request.url), {
          method: 'POST',
          body: JSON.stringify(body),
          headers: request.headers,
          // This ensures cookies and credentials are forwarded
          credentials: 'include',
          // @ts-expect-error - Add the duplex option which is required but not in TypeScript definitions yet
          duplex: 'half'
        });
        
        // Return the response directly
        const createData = await createResponse.json();
        return NextResponse.json(createData, { status: createResponse.status });

      case 'train':
        // Forward to the train endpoint
        const trainResponse = await fetch(new URL('/api/model/train', request.url), {
          method: 'POST',
          body: JSON.stringify(body),
          headers: request.headers,
          // This ensures cookies and credentials are forwarded
          credentials: 'include',
          // @ts-expect-error - Add the duplex option which is required but not in TypeScript definitions yet
          duplex: 'half'
        });
        
        // Return the response directly
        const trainData = await trainResponse.json();
        return NextResponse.json(trainData, { status: trainResponse.status });

      case 'initBucket':
        // Initialize the storage bucket
        return await initializeBucket(supabase);

      default:
        return NextResponse.json(
          { error: 'Invalid action', success: false },
          { status: 400 }
        );
    }
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

// Initialize the storage bucket
async function initializeBucket(supabase: SupabaseClient) {
  try {
    // Check if the bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    void buckets; // Explicitly indicate we're ignoring this variable
    void bucketsError; // Explicitly indicate we're ignoring this variable
    const bucketExists = buckets?.some(bucket => bucket.name === 'training-files');
    
    if (!bucketExists) {
      try {
        // Try to create the bucket
        const { error: createBucketError } = await supabase.storage.createBucket('training-files', {
          public: false, // Set to private as per RLS policies
          fileSizeLimit: 250 * 1024 * 1024, // 250MB limit
        });
        
        if (createBucketError) {
          // Continue anyway, as the bucket might already exist but not be visible to this user
        }
      } catch (error) {
        void error; // Explicitly indicate we're ignoring this variable
        // Continue anyway, as the bucket might already exist
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error initializing bucket:', error);
    return NextResponse.json(
      { error: 'Failed to initialize storage bucket', success: false },
      { status: 500 }
    );
  }
} 