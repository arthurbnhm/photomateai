import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
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
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )
  
  // It's important to run `getUser` in the middleware to refresh the session cookie.
  const { data: { user: middlewareUser } } = await supabase.auth.getUser() 

  const pathname = request.nextUrl.pathname
  
  // Find matching protected route
  const protectedRoute = Object.entries(PROTECTED_ROUTES).find(([route]) => 
    pathname === route || pathname.startsWith(`${route}/`)
  )
  
  // If not a protected route, allow access
  if (!protectedRoute) {
    return response
  }

  const [, requirements] = protectedRoute
  
  // Get the authenticated user - use middlewareUser obtained above
  const user = middlewareUser
  
  // Check authentication requirement
  if (requirements.requiresAuth && !user) {
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
    } catch {
      return NextResponse.redirect(new URL('/plans', request.url))
    }
  }
  
  return response
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