"use client"

import { ReactNode, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AuthButton } from '@/components/AuthButton'
import { ModeToggle } from '@/components/ModeToggle'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useAuth } from '@/hooks/useAuth'

// Simple SignOutButton component
function SignOutButton({ isMobileMenu = false }) {
  const { signOut } = useAuth()
  
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

export interface ActionButtonsProps {
  /**
   * Show the authentication button
   * @default true
   */
  showAuthButton?: boolean
  
  /**
   * Show the theme toggle button
   * @default true
   */
  showThemeToggle?: boolean
  
  /**
   * Hide sign-out button on homepage when user is signed in
   * @default true
   */
  hideSignOutOnHomepage?: boolean
  
  /**
   * Whether the image viewer is open
   * @default false
   */
  isImageViewerOpen?: boolean
  
  /**
   * Additional buttons to render
   */
  children?: ReactNode
}

/**
 * Floating action buttons that disappear when scrolling down and reappear when scrolling up
 */
export function ActionButtons({
  showAuthButton = true,
  showThemeToggle = true,
  hideSignOutOnHomepage = true,
  isImageViewerOpen: propIsImageViewerOpen = false,
  children
}: ActionButtonsProps) {
  // State
  const [mounted, setMounted] = useState(false)
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(propIsImageViewerOpen)
  const [visible, setVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [menuPreloaded, setMenuPreloaded] = useState(false)
  
  // Hooks
  const pathname = usePathname()
  const { isAuthReady, user } = useAuth()
  
  // Computed values
  const isAuthPage = pathname?.startsWith('/auth')
  const shouldShowAuthButton = showAuthButton && !isAuthPage
  const isHomePage = pathname === '/'
  const showSignOutButton = user && isHomePage && !hideSignOutOnHomepage
  
  // Scroll and visibility handling
  useEffect(() => {
    setMounted(true)
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setVisible(false)
        setMobileMenuOpen(false) // Close mobile menu when scrolling down
      } else {
        setVisible(true)
      }
      
      setLastScrollY(currentScrollY)
    }
    
    // Listen for image viewer state changes
    const handleImageViewerStateChange = (event: CustomEvent<{ isOpen: boolean }>) => {
      setIsImageViewerOpen(event.detail.isOpen)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('imageViewerStateChange', handleImageViewerStateChange as EventListener)
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('imageViewerStateChange', handleImageViewerStateChange as EventListener)
    }
  }, [lastScrollY])
  
  // Update image viewer state when prop changes
  useEffect(() => {
    setIsImageViewerOpen(propIsImageViewerOpen)
  }, [propIsImageViewerOpen])

  // Preload menu content
  useEffect(() => {
    if (mounted && !menuPreloaded) {
      const timer = setTimeout(() => {
        setMenuPreloaded(true)
      }, 500)
      
      return () => clearTimeout(timer)
    }
  }, [mounted, menuPreloaded])

  // Menu open state handler
  const handleMenuOpenChange = (open: boolean) => {
    // Only allow opening the menu if auth is ready
    if (open && !isAuthReady) {
      return;
    }
    setMobileMenuOpen(open);
  };
  
  // Don't render until hydrated or if image viewer is open
  if (!mounted || isImageViewerOpen) {
    return null
  }
  
  // If no buttons to show and no children, don't render anything
  if (!shouldShowAuthButton && !showThemeToggle && !children) {
    return null
  }
  
  return (
    <div 
      className={`
        fixed md:top-4 md:right-4 top-6 right-6 z-[100] 
        transition-all duration-300 ease-in-out
        ${visible ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0'}
        max-w-[calc(100%-2rem)] sm:max-w-none
      `}
    >
      {/* Desktop navigation */}
      <div className="hidden md:flex items-center gap-3">
        {children}
        <div className="flex items-center gap-3">
          {shouldShowAuthButton && (
            <AuthButton hideSignOutOnHomepage={hideSignOutOnHomepage} isMobileMenu={false} />
          )}
          {showSignOutButton && (
            <SignOutButton isMobileMenu={false} />
          )}
          {showThemeToggle && <ModeToggle />}
        </div>
      </div>

      {/* Mobile navigation */}
      <div className="flex md:hidden items-center gap-2">
        {/* Theme toggle is always visible on mobile */}
        {showThemeToggle && <ModeToggle />}
        
        {/* Burger menu */}
        <DropdownMenu open={mobileMenuOpen} onOpenChange={handleMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="icon" 
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              onMouseEnter={() => setMenuPreloaded(true)} // Preload on hover
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          
          {/* Only render menu when needed and auth is ready */}
          {((mobileMenuOpen || menuPreloaded) && isAuthReady) && (
            <DropdownMenuContent 
              align="end" 
              className="w-[200px] mt-2"
              forceMount
              sideOffset={6}
            >
              {children}
              
              {(shouldShowAuthButton || showSignOutButton) && children && (
                <DropdownMenuSeparator />
              )}
              
              {shouldShowAuthButton && (
                <AuthButton 
                  hideSignOutOnHomepage={hideSignOutOnHomepage} 
                  isMobileMenu={true} 
                />
              )}
              
              {showSignOutButton && (
                <SignOutButton isMobileMenu={true} />
              )}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </div>
    </div>
  )
} 