import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  
  // Get the pathname from the URL
  const pathname = request.nextUrl.pathname
  
  // Check if the path is a protected route
  const isProtectedRoute = pathname.startsWith('/create')
  
  // Skip auth check for non-protected routes
  if (!isProtectedRoute) {
    return response
  }
  
  // Get the auth cookie
  const supabaseSession = request.cookies.get('sb-session')
  
  // If there's no session and the route is protected, redirect to login
  if (!supabaseSession && isProtectedRoute) {
    const redirectUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(redirectUrl)
  }
  
  return response
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