import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSession } from '@/lib/session'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createSupabaseServerClient()
    
    await supabase.auth.exchangeCodeForSession(code)
    
    // Check if the user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
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

      // Redirect based on subscription status
      if (subscriptionActive) {
        return NextResponse.redirect(new URL('/create', requestUrl.origin))
      } else {
        return NextResponse.redirect(new URL('/plans', requestUrl.origin))
      }
    }
  }

  // Redirect to the home page if not authenticated
  return NextResponse.redirect(new URL('/', requestUrl.origin))
} 