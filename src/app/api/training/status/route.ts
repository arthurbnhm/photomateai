import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trainingId = searchParams.get('id');

  if (!trainingId) {
    return NextResponse.json({ error: 'Training ID is required' }, { status: 400 });
  }

  try {
    // Initialize Supabase client
    const supabase = await createSupabaseServerClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Query the trainings table with user authorization
    const { data: training, error } = await supabase
      .from('trainings')
      .select('training_id, status, error, started_at, completed_at, predict_time, cost, user_id')
      .eq('training_id', trainingId)
      .eq('user_id', user.id) // Ensure user can only access their own trainings
      .single();

    if (error || !training) {
      return NextResponse.json({ error: 'Training not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: training.training_id,
      status: training.status,
      error: training.error,
      started_at: training.started_at,
      completed_at: training.completed_at,
      predict_time: training.predict_time,
      cost: training.cost
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error fetching training status from Supabase:', error.message, { name: error.name, stack: error.stack });
    } else {
      console.error('Error fetching training status from Supabase (unknown type):', String(error));
    }
    return NextResponse.json({ error: 'Failed to fetch training status' }, { status: 500 });
  }
} 