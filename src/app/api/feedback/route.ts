import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { feedback, user_id } = await request.json();

    if (!feedback || !user_id) {
      return NextResponse.json(
        { error: 'Feedback and user_id are required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('feedback')
      .insert({
        feedback,
        user_id,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error inserting feedback:', error);
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Feedback submitted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in feedback API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 