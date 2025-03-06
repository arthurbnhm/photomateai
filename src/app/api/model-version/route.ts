import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

// Define the expected response type based on the documentation
interface ModelVersionResponse {
  previous: string | null;
  next: string | null;
  results: Array<{
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: Record<string, unknown>;
  }>;
}

// Initialize Replicate with API token
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Disable caching for Next.js App Router
replicate.fetch = (url, options) => {
  return fetch(url, { ...options, cache: "no-store" });
};

// Helper function to get the latest model version
async function getLatestModelVersion(owner: string, name: string): Promise<string | null> {
  try {
    // Get the list of versions from Replicate
    const versionsResponse = await replicate.models.versions.list(owner, name) as unknown as ModelVersionResponse;
    
    // According to the documentation, the response should have a 'results' array
    if (versionsResponse && 
        'results' in versionsResponse && 
        Array.isArray(versionsResponse.results) && 
        versionsResponse.results.length > 0) {
      return versionsResponse.results[0].id;
    }
    
    return null;
  } catch (_error) {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the model owner and name from the URL parameters
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const name = searchParams.get('name');

    // Check if owner and name are provided
    if (!owner || !name) {
      return NextResponse.json(
        { error: 'Model owner and name are required' },
        { status: 400 }
      );
    }

    // Check if API token is available
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { 
          error: "Missing Replicate API token. Please add your token to the .env file or environment variables.",
          details: "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens"
        },
        { status: 401 }
      );
    }

    // Get the latest model version
    const latestVersion = await getLatestModelVersion(owner, name);
    if (!latestVersion) {
      return NextResponse.json(
        { 
          error: `No versions found for model ${owner}/${name}`,
          details: "The model may not exist or may not have any published versions."
        },
        { status: 404 }
      );
    }

    // Return the latest version
    return NextResponse.json({
      success: true,
      owner,
      name,
      version: latestVersion
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: errorMessage,
        details: "There was an error fetching the model version. Please try again later."
      },
      { status: 500 }
    );
  }
} 