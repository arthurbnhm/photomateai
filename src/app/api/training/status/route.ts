import { NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get('id');

  if (!trainingId) {
    return NextResponse.json({ error: 'Training ID is required' }, { status: 400 });
  }

  try {
    const training = await replicate.trainings.get(trainingId);
    return NextResponse.json({
      id: training.id,
      status: training.status,
      output: training.output,
      error: training.error,
      model: training.model, 
      version: training.version, 
    });
  } catch (error: unknown) {
    // Type guard for error with response and status
    let isHttpErrorWithStatus = false;
    let httpStatus: number | undefined = undefined;

    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error
    ) {
      const errorResponse = (error as { response: unknown }).response;
      if (
        typeof errorResponse === 'object' &&
        errorResponse !== null &&
        'status' in errorResponse &&
        typeof (errorResponse as { status: unknown }).status === 'number'
      ) {
        isHttpErrorWithStatus = true;
        httpStatus = (errorResponse as { status: number }).status;
      }
    }

    if (isHttpErrorWithStatus && httpStatus === 404) {
      return NextResponse.json({ error: 'Training not found' }, { status: 404 });
    }
    
    if (error instanceof Error) {
      console.error('Error fetching training status from Replicate:', error.message, { name: error.name, stack: error.stack, cause: error.cause });
    } else {
      console.error('Error fetching training status from Replicate (unknown type):', String(error));
    }
    return NextResponse.json({ error: 'Failed to fetch training status' }, { status: 500 });
  }
} 