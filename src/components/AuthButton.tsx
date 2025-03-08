"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'

interface AuthButtonProps {
  /**
   * Hide sign-out button on homepage when user is signed in
   * This will leave only the "Go to App" button visible
   * @default false
   */
  hideSignOutOnHomepage?: boolean
}

export function AuthButton({ hideSignOutOnHomepage = false }: AuthButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()
  const isHomePage = pathname === '/'
  const isAuthPage = pathname === '/auth/login'

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setMounted(true)
      
      // Redirect to login page if user is not authenticated and not already on the login page
      if (!user && !isAuthPage && !isHomePage) {
        router.push('/auth/login')
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        
        // Redirect to login page if user signs out and not on the homepage
        if (event === 'SIGNED_OUT' && !isHomePage) {
          router.push('/auth/login')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase.auth, router, isAuthPage, isHomePage])

  const handleSignIn = async () => {
    router.push('/auth/login')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  // Don't render anything until client-side hydration is complete
  if (!mounted) {
    return null
  }

  if (user) {
    // On homepage with a signed-in user
    if (isHomePage) {
      return (
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            size="icon" 
            className="h-9 w-auto px-3"
            asChild
          >
            <Link href="/create">Go to App</Link>
          </Button>
          
          {/* Only show sign out button on homepage if not hidden */}
          {!hideSignOutOnHomepage && (
            <Button 
              variant="outline" 
              size="icon" 
              className="h-9 w-auto px-3"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          )}
        </div>
      )
    }
    
    // On other pages with a signed-in user
    return (
      <Button 
        variant="outline" 
        size="icon" 
        className="h-9 w-auto px-3"
        onClick={handleSignOut}
      >
        Sign out
      </Button>
    )
  }

  // User is not signed in
  return (
    <Button 
      variant="outline" 
      size="icon" 
      className="h-9 w-auto px-3"
      onClick={handleSignIn}
    >
      Sign in
    </Button>
  )
} 