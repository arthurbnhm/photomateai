import { NextResponse } from 'next/server';
import { addToHistory, getHistory, deleteFromHistory, type ImageGeneration } from './utils';

export async function GET() {
  try {
    const imageHistory = getHistory();
    console.log('Returning server history with', imageHistory.length, 'items');
    return NextResponse.json(imageHistory);
  } catch (error) {
    console.error('Error fetching image history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image history' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate the request body
    if (!body.prompt || !Array.isArray(body.images) || body.images.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request body. Required fields: prompt, images' },
        { status: 400 }
      );
    }
    
    const newGeneration: ImageGeneration = {
      id: body.id || Date.now().toString(),
      prompt: body.prompt,
      timestamp: body.timestamp || new Date().toISOString(),
      images: body.images,
      aspectRatio: body.aspectRatio || "1:1"
    };
    
    // Use the shared function to add to history
    const savedGeneration = addToHistory(newGeneration);
    
    if (!savedGeneration) {
      return NextResponse.json(
        { error: 'Failed to save generation to history' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(savedGeneration);
  } catch (error) {
    console.error('Error saving to image history:', error);
    return NextResponse.json(
      { error: 'Failed to save to image history' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    // Get the ID from the URL query parameters
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing generation ID' },
        { status: 400 }
      );
    }
    
    // Delete the generation from history
    const success = deleteFromHistory(id);
    
    if (!success) {
      // Instead of returning a 404, we'll return a success response
      // This is because the client might be trying to delete a generation
      // that only exists in client history
      console.log(`Generation with ID ${id} not found in server history, but reporting success`);
    } else {
      console.log(`Deleted generation with ID ${id}`);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting from image history:', error);
    return NextResponse.json(
      { error: 'Failed to delete from image history' },
      { status: 500 }
    );
  }
} 