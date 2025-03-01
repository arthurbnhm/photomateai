import { NextResponse } from 'next/server';

// Define the type for image generation history
type ImageGeneration = {
  id: string;
  prompt: string;
  timestamp: string;
  images: string[];
  aspectRatio: string;
};

// In-memory storage for development purposes
// In a production app, this would be a database
let imageHistory: ImageGeneration[] = [];

// Function to add a new generation to history
export function addToHistory(generation: ImageGeneration) {
  console.log('Adding to server history:', generation);
  
  // Validate the generation object
  if (!generation.id || !generation.prompt || !generation.timestamp || !Array.isArray(generation.images)) {
    console.error('Invalid generation object:', generation);
    return null;
  }
  
  // Add to the beginning of the array
  imageHistory.unshift(generation);
  
  // Keep only the last 10 generations
  imageHistory = imageHistory.slice(0, 10);
  
  console.log('Current server history length:', imageHistory.length);
  
  return generation;
}

export async function GET() {
  try {
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
    
    const newGeneration = {
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
    
    // Find the index of the generation with the given ID
    const index = imageHistory.findIndex(gen => gen.id === id);
    
    if (index === -1) {
      // Instead of returning a 404, we'll return a success response
      // This is because the client might be trying to delete a generation
      // that only exists in client history
      console.log(`Generation with ID ${id} not found in server history, but reporting success`);
      return NextResponse.json({ success: true });
    }
    
    // Remove the generation from the history
    imageHistory.splice(index, 1);
    
    console.log(`Deleted generation with ID ${id}. Remaining: ${imageHistory.length}`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting from image history:', error);
    return NextResponse.json(
      { error: 'Failed to delete from image history' },
      { status: 500 }
    );
  }
} 