import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const trainingId = searchParams.get('training_id');
    
    if (!trainingId) {
      return NextResponse.json({ 
        success: false, 
        error: 'training_id parameter is required' 
      }, { status: 400 });
    }
    
    const supabase = createServerClient();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }
    
    // Fetch only the training status
    const { data, error } = await supabase
      .from('trainings')
      .select('status')
      .eq('training_id', trainingId)
      .single();
    
    if (error) {
      return NextResponse.json({ 
        success: false, 
        error: 'Training not found' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      status: data.status
    });
  } catch {
    return NextResponse.json({ 
      success: false, 
      error: 'Server error' 
    }, { status: 500 });
  }
} 