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
    console.log(`Fetching versions for model ${owner}/${name}...`);
    
    // Get the list of versions from Replicate
    const versionsResponse = await replicate.models.versions.list(owner, name) as unknown as ModelVersionResponse;
    console.log('Raw versions response type:', typeof versionsResponse);
    
    // Log a sample of the response to avoid huge logs
    if (versionsResponse) {
      if ('results' in versionsResponse && Array.isArray(versionsResponse.results)) {
        console.log('Response has results property');
        console.log('First few results:', versionsResponse.results.slice(0, 2));
      } else {
        console.log('Response sample:', JSON.stringify(versionsResponse).substring(0, 200) + '...');
      }
    }
    
    // According to the documentation, the response should have a 'results' array
    if (versionsResponse && 
        'results' in versionsResponse && 
        Array.isArray(versionsResponse.results) && 
        versionsResponse.results.length > 0) {
      console.log(`Found ${versionsResponse.results.length} versions for model ${owner}/${name}`);
      console.log(`Latest version ID: ${versionsResponse.results[0].id}`);
      return versionsResponse.results[0].id;
    }
    
    console.error(`No model versions found for ${owner}/${name} or unexpected response format`);
    console.error('Response structure:', JSON.stringify(versionsResponse, null, 2));
    return null;
  } catch (error) {
    console.error(`Error fetching model versions for ${owner}/${name}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the model owner and name from the URL parameters
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const name = searchParams.get('name');

    console.log(`Received request for model version: owner=${owner}, name=${name}`);

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
      console.error('REPLICATE_API_TOKEN is not set');
      return NextResponse.json(
        { 
          error: "Missing Replicate API token. Please add your token to the .env file or environment variables.",
          details: "You need a Replicate API token to use this feature. Get one at https://replicate.com/account/api-tokens"
        },
        { status: 401 }
      );
    }

    console.log(`API token available: ${apiToken ? 'Yes' : 'No'}`);

    // Get the latest model version
    const latestVersion = await getLatestModelVersion(owner, name);
    if (!latestVersion) {
      console.error(`No versions found for model ${owner}/${name}`);
      return NextResponse.json(
        { 
          error: `No versions found for model ${owner}/${name}`,
          details: "The model may not exist or may not have any published versions."
        },
        { status: 404 }
      );
    }

    console.log(`Latest version for ${owner}/${name}: ${latestVersion}`);

    // Return the latest version
    return NextResponse.json({
      success: true,
      owner,
      name,
      version: latestVersion
    });
  } catch (error) {
    console.error('Error in model-version API route:', error);
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