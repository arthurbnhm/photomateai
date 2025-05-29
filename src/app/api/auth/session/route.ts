import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Check if user has an active subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('is_active, subscription_end_date')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    // Determine subscription status
    let subscriptionActive = false
    if (subscription) {
      const now = new Date()
      const endDate = new Date(subscription.subscription_end_date)
      subscriptionActive = subscription.is_active && now <= endDate
    }

    // Create session with subscription status
    await createSession({
      userId: user.id,
      email: user.email || '',
      subscriptionActive,
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    })

    return NextResponse.json({ 
      success: true,
      subscriptionActive,
      redirectTo: subscriptionActive ? '/create' : '/plans'
    })

  } catch (error) {
    console.error('Session creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 