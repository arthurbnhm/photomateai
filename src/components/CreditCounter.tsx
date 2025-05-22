"use client"

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Coins } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'

// Local storage key for credits
const CREDITS_STORAGE_KEY = 'photomate_user_credits'

// Create a global event system for credit updates
export const creditEvents = {
  update: (newCredits: number) => {
    // Store the latest credit value in localStorage
    localStorage.setItem(CREDITS_STORAGE_KEY, newCredits.toString())
    
    const event = new CustomEvent('credit-update', { detail: { credits: newCredits } })
    window.dispatchEvent(event)
  }
}

export function CreditCounter() {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDecrementing, setIsDecrementing] = useState(false)
  const pathname = usePathname()

  // Skip subscription fetching on the plans page
  const isPlansPage = pathname === '/plans'

  // Fetch user credits on component mount and set up subscription for updates
  useEffect(() => {
    // Don't fetch subscription on the plans page
    if (isPlansPage) {
      setLoading(false)
      return
    }

    const supabase = createSupabaseBrowserClient()
    let mounted = true
    let previousCredits: number | null = null

    // Try to load credits from localStorage first for immediate display
    try {
      const storedCredits = localStorage.getItem(CREDITS_STORAGE_KEY)
      if (storedCredits) {
        const parsedCredits = parseInt(storedCredits, 10)
        if (!isNaN(parsedCredits)) {
          setCredits(parsedCredits)
          setLoading(false)
          previousCredits = parsedCredits
        }
      }
    } catch (err) {
      console.error('Error loading credits from localStorage:', err)
    }

    // Function to fetch credits
    const fetchCredits = async () => {
      try {
        setLoading(true)
        
        // Get current user using getUser() for better security
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          console.error('Error fetching user:', userError)
          if (mounted) {
            setError('Not authenticated')
            setLoading(false)
          }
          return
        }
        
        // Get user's active subscription
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('credits_remaining')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single()
        
        if (subscriptionError) {
          console.error('Error fetching subscription:', subscriptionError)
          if (mounted) {
            setError('No active subscription')
            setLoading(false)
          }
          return
        }
        
        // Update credits state
        if (mounted && subscription) {
          // Check if credits are decreasing
          if (previousCredits !== null && previousCredits > subscription.credits_remaining) {
            setIsDecrementing(true)
            // Reset the decrementing state after animation completes
            setTimeout(() => {
              if (mounted) setIsDecrementing(false)
            }, 2000)
          }
          
          previousCredits = subscription.credits_remaining
          setCredits(subscription.credits_remaining)
          setLoading(false)
          setError(null)
          
          // Store the latest credit value in localStorage
          localStorage.setItem(CREDITS_STORAGE_KEY, subscription.credits_remaining.toString())
        }
      } catch (err) {
        console.error('Unexpected error:', err)
        if (mounted) {
          setError('Failed to load credits')
          setLoading(false)
        }
      }
    }

    // Initial fetch (even if we loaded from localStorage, we still want to get the latest)
    fetchCredits()
    
    // Listen for client-side credit update events
    const handleCreditUpdate = (event: CustomEvent<{ credits: number }>) => {
      if (mounted) {
        // Check if credits are decreasing
        if (previousCredits !== null && previousCredits > event.detail.credits) {
          setIsDecrementing(true)
          // Reset the decrementing state after animation completes
          setTimeout(() => {
            if (mounted) setIsDecrementing(false)
          }, 2000)
        }
        
        previousCredits = event.detail.credits
        setCredits(event.detail.credits)
      }
    }
    
    window.addEventListener('credit-update', handleCreditUpdate as EventListener)
    
    // Cleanup function
    return () => {
      mounted = false
      
      // Remove event listener
      window.removeEventListener('credit-update', handleCreditUpdate as EventListener)
    }
  }, [isPlansPage])

  // If on plans page, don't show the credit counter
  if (isPlansPage) {
    return null
  }

  // Common container styles for consistent appearance
  const containerClasses = "flex items-center gap-1.5 h-9 px-1.5"

  // If loading or error, return appropriate UI
  if (loading && credits === null) {
    return (
      <div className={cn(containerClasses, "opacity-80")}>
        <Coins className="h-4 w-4 text-muted-foreground" />
        <div className="w-6 h-3 bg-muted/40 rounded-sm animate-pulse"></div>
      </div>
    )
  }

  if (error || credits === null) {
    return null
  }

  // Render the animated counter with the credits
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div 
            className={cn(
              containerClasses,
              isDecrementing ? "text-amber-500" : ""
            )}
          >
            <Coins 
              className={cn(
                "h-4 w-4 text-amber-500/80",
                isDecrementing ? "text-amber-500 animate-[pulse_1s_ease-in-out]" : ""
              )} 
            />
            <span className="text-sm font-medium flex items-center text-foreground">
              {credits.toLocaleString()}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <p>Available credits</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} 