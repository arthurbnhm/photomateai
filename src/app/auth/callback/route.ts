import { createClient } from '@/utils/supabase/server'
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
      // Redirect to the create page if authenticated
      // Use the origin from the request URL to ensure it works in all environments
      const redirectUrl = new URL('/create', requestUrl.origin)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect to the home page if not authenticated
  return NextResponse.redirect(new URL('/', requestUrl.origin))
} 