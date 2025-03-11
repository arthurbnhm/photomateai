import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { SupabaseClient } from '@supabase/supabase-js'

type Subscription = {
  user_id: string;
  plan: string;
  credits_remaining: number;
  models_remaining: number;
  subscription_start_date: string;
  subscription_end_date: string;
  is_active: boolean;
}

// Define protected routes and their requirements
const PROTECTED_ROUTES = {
  '/create': { requiresAuth: true, requiresSubscription: true },
  '/plans': { requiresAuth: true, requiresSubscription: false },
  '/api/generate': { requiresAuth: true, requiresSubscription: true },
  '/api/train': { requiresAuth: true, requiresSubscription: true },
  '/api/models': { requiresAuth: true, requiresSubscription: true },
} as const

export async function middleware(request: NextRequest) {
  const supabase = await createClient()
  
  // Get the pathname from the URL
  const pathname = request.nextUrl.pathname
  
  // Find matching protected route
  const protectedRoute = Object.entries(PROTECTED_ROUTES).find(([route]) => 
    pathname === route || pathname.startsWith(`${route}/`)
  )
  
  // If not a protected route, allow access
  if (!protectedRoute) {
    return NextResponse.next()
  }

  const [, requirements] = protectedRoute
  
  // Get the authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  // Check authentication requirement
  if (requirements.requiresAuth && (!user || userError)) {
    const redirectUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // Check subscription requirement
  if (requirements.requiresSubscription && user) {
    try {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
  
      // If no active subscription found, redirect to plans page
      if (!subscription) {
        return NextResponse.redirect(new URL('/plans', request.url))
      }
      
      // Validate that subscription is still valid (not expired)
      const now = new Date()
      const startDate = new Date(subscription.subscription_start_date)
      const endDate = new Date(subscription.subscription_end_date)
      
      if (now < startDate || now > endDate) {
        // Update subscription to inactive if expired
        if (now > endDate) {
          await supabase
            .from('subscriptions')
            .update({ is_active: false })
            .eq('user_id', user.id)
        }
        
        return NextResponse.redirect(new URL('/plans', request.url))
      }

      // Check if user has enough credits/models for the operation
      if (pathname.startsWith('/api/')) {
        const hasEnoughResources = await checkResourceLimits(supabase, subscription, pathname)
        if (!hasEnoughResources) {
          return new NextResponse(
            JSON.stringify({ error: 'Insufficient resources. Please upgrade your plan.' }),
            { status: 403, headers: { 'content-type': 'application/json' } }
          )
        }
      }
    } catch (error) {
      return NextResponse.redirect(new URL('/plans', request.url))
    }
  }
  
  return NextResponse.next()
}

async function checkResourceLimits(
  supabase: SupabaseClient,
  subscription: Subscription,
  pathname: string
) {
  // For generate endpoint, check credits
  if (pathname.startsWith('/api/generate') && subscription.credits_remaining <= 0) {
    return false
  }
  
  // For train endpoint, check models
  if (pathname.startsWith('/api/train')) {
    const { count } = await supabase
      .from('models')
      .select('*', { count: 'exact' })
      .eq('user_id', subscription.user_id)
      .gte('created_at', subscription.subscription_start_date)
      .lt('created_at', subscription.subscription_end_date)
    
    if (count && count >= subscription.models_remaining) {
      return false
    }
  }
  
  return true
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
} 