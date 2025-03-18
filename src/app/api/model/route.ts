import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Parse the body to determine which action to perform
    const body = await request.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required parameter: action', success: false },
        { status: 400 }
      );
    }
    
    // Route to the appropriate API endpoint based on the action
    let response;
    
    switch (action) {
      case 'create':
        response = await fetch(new URL('/api/model/create', request.url), {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(body)
        });
        break;
      
      case 'train':
        response = await fetch(new URL('/api/model/train', request.url), {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(body)
        });
        break;
      
      default:
        return NextResponse.json(
          { error: `Unsupported action: ${action}`, success: false },
          { status: 400 }
        );
    }
    
    // Return the response from the appropriate endpoint
    return NextResponse.json(await response.json(), { status: response.status });
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