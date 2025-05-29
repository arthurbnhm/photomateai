import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    // Create Supabase client
    const supabase = await createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Check if user is authenticated
    if (!user || userError) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to check credits' },
        { status: 401 }
      );
    }
    
    // Get user's active subscription with credits
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('credits_remaining, models_remaining, plan, subscription_end_date, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (subscriptionError) {
      if (subscriptionError.code === 'PGRST116') {
        // No rows found - user has no active subscription
        return NextResponse.json({
          has_credits: false,
          credits_remaining: 0,
          models_remaining: 0,
          plan: 'none',
          subscription_active: false
        });
      } else {
        // Other database error
        return NextResponse.json(
          { error: 'Database error while checking subscription' },
          { status: 500 }
        );
      }
    }
    
    if (!subscription) {
      return NextResponse.json({
        has_credits: false,
        credits_remaining: 0,
        models_remaining: 0,
        plan: 'none',
        subscription_active: false
      });
    }
    
    // Check if subscription is still valid (not expired)
    const now = new Date();
    const endDate = new Date(subscription.subscription_end_date);
    const isExpired = now > endDate;
    
    if (isExpired) {
      // Mark subscription as inactive if expired
      await supabase
        .from('subscriptions')
        .update({ is_active: false })
        .eq('user_id', user.id);
      
      return NextResponse.json({
        has_credits: false,
        credits_remaining: 0,
        models_remaining: 0,
        plan: subscription.plan,
        subscription_active: false,
        expired: true
      });
    }
    
    return NextResponse.json({
      has_credits: subscription.credits_remaining > 0,
      credits_remaining: subscription.credits_remaining,
      models_remaining: subscription.models_remaining,
      plan: subscription.plan,
      subscription_active: true,
      expired: false
    });
    
  } catch (error) {
    console.error('Error checking credits:', error);
    return NextResponse.json(
      { error: 'Internal server error while checking credits' },
      { status: 500 }
    );
  }
} 