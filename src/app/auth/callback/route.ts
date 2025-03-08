import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    
    try {
      // Exchange the auth code for a session
      await supabase.auth.exchangeCodeForSession(code)
      
      // Check if the user is authenticated
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        console.log("User authenticated, redirecting to /create")
        // Redirect to the create page if authenticated
        // Ensure we're using the full URL with origin
        return NextResponse.redirect(new URL('/create', requestUrl.origin))
      }
    } catch (error) {
      console.error("Authentication error:", error)
      // If there's an error, redirect to the error page
      return NextResponse.redirect(new URL('/error', requestUrl.origin))
    }
  }

  // Redirect to the home page if not authenticated
  return NextResponse.redirect(new URL('/', requestUrl.origin))
} 