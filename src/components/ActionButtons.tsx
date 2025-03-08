"use client"

import { ReactNode, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AuthButton } from '@/components/AuthButton'
import { ModeToggle } from '@/components/ModeToggle'
import { useImageViewer } from '@/contexts/ImageViewerContext'

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
   * This will leave only the "Go to App" button visible
   * @default true
   */
  hideSignOutOnHomepage?: boolean
  
  /**
   * Position of the buttons
   * @default 'top-right'
   */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'custom'
  
  /**
   * Custom CSS classes to apply to the container
   */
  className?: string
  
  /**
   * Gap between buttons
   * @default 'gap-3'
   */
  gap?: string
  
  /**
   * Additional buttons to render
   */
  children?: ReactNode
}

/**
 * A reusable component that combines authentication and theme toggle buttons
 */
export function ActionButtons({
  showAuthButton = true,
  showThemeToggle = true,
  hideSignOutOnHomepage = true,
  position = 'top-right',
  className = '',
  gap = 'gap-3',
  children
}: ActionButtonsProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  
  // Use the image viewer context
  const { isImageViewerOpen } = useImageViewer()
  
  // Set mounted to true after hydration
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Don't render anything until client-side hydration is complete
  if (!mounted) {
    return null
  }
  
  // If the image viewer is open, don't render the action buttons
  if (isImageViewerOpen) {
    return null
  }
  
  // Automatically hide auth button on auth pages
  const isAuthPage = pathname?.startsWith('/auth')
  const shouldShowAuthButton = showAuthButton && !isAuthPage
  
  // Define position classes
  const positionClasses = {
    'top-right': 'fixed top-6 right-6',
    'top-left': 'fixed top-6 left-6',
    'bottom-right': 'fixed bottom-6 right-6',
    'bottom-left': 'fixed bottom-6 left-6',
    'custom': ''
  }
  
  const containerClasses = `z-[100] pointer-events-auto flex items-center ${gap} ${position !== 'custom' ? positionClasses[position] : ''} ${className}`
  
  // If no buttons to show and no children, don't render anything
  if (!shouldShowAuthButton && !showThemeToggle && !children) {
    return null
  }
  
  return (
    <div className={containerClasses}>
      {children}
      {shouldShowAuthButton && (
        <AuthButton hideSignOutOnHomepage={hideSignOutOnHomepage} />
      )}
      {showThemeToggle && <ModeToggle />}
    </div>
  )
} 