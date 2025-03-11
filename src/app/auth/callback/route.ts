import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    
    await supabase.auth.exchangeCodeForSession(code)
    
    // Check if the user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      // Check if user has an active subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      // If they have an active subscription, redirect to create page
      if (subscription) {
        return NextResponse.redirect(new URL('/create', requestUrl.origin))
      }
      
      // Otherwise redirect to plans page to choose a plan
      return NextResponse.redirect(new URL('/plans', requestUrl.origin))
    }
  }

  // Redirect to the home page if not authenticated
  return NextResponse.redirect(new URL('/', requestUrl.origin))
} 