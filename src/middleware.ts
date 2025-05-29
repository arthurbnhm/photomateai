import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// Define routes that need basic auth redirect
const AUTH_REQUIRED_ROUTES = [
  '/plans',
  '/api/credits',
] as const

// Define routes that need subscription (checked optimistically via session)
const SUBSCRIPTION_REQUIRED_ROUTES = [
  '/create',
  '/train', 
  '/favorites',
  '/api/generate',
  '/api/model',
  '/api/training',
  '/api/favorite',
  '/api/delete',
  '/api/cancel',
  '/api/predictions',
] as const

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Check route requirements
  const requiresAuth = AUTH_REQUIRED_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  )
  const requiresSubscription = SUBSCRIPTION_REQUIRED_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  )
  
  // If no special requirements, allow access
  if (!requiresAuth && !requiresSubscription) {
    return NextResponse.next()
  }

  // Get session from cookie (fast optimistic check)
  const session = await getSession()
  
  // If no session at all, redirect to login
  if (!session) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  
  // Check if session is expired
  if (session.expiresAt < Date.now()) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  
  // If only auth is required (like /plans), allow access
  if (requiresAuth && !requiresSubscription) {
    return NextResponse.next()
  }
  
  // For subscription-required routes, check subscription status from session
  if (requiresSubscription && !session.subscriptionActive) {
    return NextResponse.redirect(new URL('/plans', request.url))
  }
  
  // All checks passed, allow access
  return NextResponse.next()
}

export const config = {
  matcher: [
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