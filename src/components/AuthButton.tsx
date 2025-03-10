"use client"

import { Button } from '@/components/ui/button'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'

interface AuthButtonProps {
  /**
   * Hide sign-out button on homepage when user is signed in
   * @default false
   */
  hideSignOutOnHomepage?: boolean
  
  /**
   * Whether this button is in a mobile menu context
   * @default false
   */
  isMobileMenu?: boolean
}

export function AuthButton({ 
  hideSignOutOnHomepage = false,
  isMobileMenu = false
}: AuthButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, mounted, signOut, isAuthReady } = useAuth()
  const isHomePage = pathname === '/'

  // Wait for auth to be ready and client-side hydration to complete
  if (!mounted || !isAuthReady) {
    return null
  }

  // User is authenticated
  if (user) {
    // Special case for homepage
    if (isHomePage) {
      if (isMobileMenu) {
        return (
          <>
            <DropdownMenuItem onClick={() => router.push('/create')}>
              Go to App
            </DropdownMenuItem>
            
            {!hideSignOutOnHomepage && (
              <DropdownMenuItem onClick={signOut}>
                Sign out
              </DropdownMenuItem>
            )}
          </>
        )
      }
      
      return (
        <Button 
          variant="outline" 
          className="h-9 w-auto px-3"
          asChild
        >
          <Link href="/create">Go to App</Link>
        </Button>
      )
    }
    
    // On other pages with a signed-in user
    return isMobileMenu ? (
      <DropdownMenuItem onClick={signOut}>
        Sign out
      </DropdownMenuItem>
    ) : (
      <Button 
        variant="outline" 
        className="h-9 w-auto px-3"
        onClick={signOut}
      >
        Sign out
      </Button>
    )
  }

  // User is not authenticated
  return isMobileMenu ? (
    <DropdownMenuItem onClick={() => router.push('/auth/login')}>
      Sign in
    </DropdownMenuItem>
  ) : (
    <Button 
      variant="outline" 
      className="h-9 w-auto px-3"
      onClick={() => router.push('/auth/login')}
    >
      Sign in
    </Button>
  )
} 