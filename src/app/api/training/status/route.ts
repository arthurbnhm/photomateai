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
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response: unknown }).response === 'object' &&
      (error as { response: unknown }).response !== null &&
      'status' in (error as { response: unknown }).response &&
      typeof (error as { response: { status: unknown } }).response.status === 'number' 
    ) {
      const status = (error as { response: { status: number } }).response.status;
      if (status === 404) {
        return NextResponse.json({ error: 'Training not found' }, { status: 404 });
      }
    }
    if (error instanceof Error) {
      console.error('Error fetching training status from Replicate:', error.message, { name: error.name, stack: error.stack, cause: error.cause });
    } else {
      console.error('Error fetching training status from Replicate (unknown type):', String(error));
    }
    return NextResponse.json({ error: 'Failed to fetch training status' }, { status: 500 });
  }
} 