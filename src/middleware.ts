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
  // App pages - require auth + subscription  
  '/create': { requiresAuth: true, requiresSubscription: true },
  '/train': { requiresAuth: true, requiresSubscription: true },
  '/favorites': { requiresAuth: true, requiresSubscription: true },
  
  // Plans page - require auth only (for upgrading)
  '/plans': { requiresAuth: true, requiresSubscription: false },
  
  // API routes - require auth + subscription
  '/api/generate': { requiresAuth: true, requiresSubscription: true },
  '/api/model/train': { requiresAuth: true, requiresSubscription: true },
  '/api/model/list': { requiresAuth: true, requiresSubscription: true },
  '/api/model/upload': { requiresAuth: true, requiresSubscription: true },
  '/api/training': { requiresAuth: true, requiresSubscription: true },
  '/api/favorite': { requiresAuth: true, requiresSubscription: true },
  '/api/delete': { requiresAuth: true, requiresSubscription: true },
  '/api/cancel': { requiresAuth: true, requiresSubscription: true },
  '/api/predictions': { requiresAuth: true, requiresSubscription: true },
  
  // Credits API - require auth only (for checking)
  '/api/credits': { requiresAuth: true, requiresSubscription: false },
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
  
  // Get user session (refreshes session cookie)
  const { data: { user } } = await supabase.auth.getUser() 

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
  
  // For train endpoint, check models_remaining (it's a decrementing counter)
  // But don't check for status endpoints - they're read-only operations
  if (pathname.startsWith('/api/model/train') || 
      (pathname.startsWith('/api/training') && !pathname.includes('/status'))) {
    // Simply check if there are models remaining - no need to count existing models
    // since models_remaining is decremented by the webhook when training succeeds
    if (subscription.models_remaining <= 0) {
      return false
    }
  }
  
  return true
}

export const config = {
  matcher: [
    // Only run middleware on protected routes - much more efficient!
    '/create/:path*',
    '/train/:path*', 
    '/favorites/:path*',
    '/plans/:path*',
    '/api/generate/:path*',
    '/api/model/:path*',
    '/api/training/:path*',
    '/api/favorite/:path*',
    '/api/delete/:path*',
    '/api/cancel/:path*',
    '/api/predictions/:path*',
    '/api/credits/:path*',
  ],
} 