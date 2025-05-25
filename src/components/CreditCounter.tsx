"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Coins } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'

// Local storage key for credits
const CREDITS_STORAGE_KEY = 'photomate_user_credits'
const CREDITS_TIMESTAMP_KEY = 'photomate_user_credits_timestamp'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache

// Create a global event system for credit updates
export const creditEvents = {
  update: (newCredits: number) => {
    // Store the latest credit value and timestamp in localStorage
    localStorage.setItem(CREDITS_STORAGE_KEY, newCredits.toString())
    localStorage.setItem(CREDITS_TIMESTAMP_KEY, Date.now().toString())
    
    const event = new CustomEvent('credit-update', { detail: { credits: newCredits } })
    window.dispatchEvent(event)
  }
}

// Hook for managing credit state
function useCreditData() {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDecrementing, setIsDecrementing] = useState(false)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  // Check if cached data is still valid
  const getCachedCredits = useCallback(() => {
    try {
      const storedCredits = localStorage.getItem(CREDITS_STORAGE_KEY)
      const storedTimestamp = localStorage.getItem(CREDITS_TIMESTAMP_KEY)
      
      if (storedCredits && storedTimestamp) {
        const timestamp = parseInt(storedTimestamp, 10)
        const isValid = Date.now() - timestamp < CACHE_DURATION
        
        if (isValid) {
          const parsedCredits = parseInt(storedCredits, 10)
          if (!isNaN(parsedCredits)) {
            return parsedCredits
          }
        }
      }
    } catch (err) {
      console.error('Error loading credits from cache:', err)
    }
    return null
  }, [])

  // Fetch credits from Supabase
  const fetchCredits = useCallback(async () => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        throw new Error('Not authenticated')
      }
      
      // Get user's active subscription
      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('credits_remaining')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      
      if (subscriptionError) {
        throw new Error('No active subscription')
      }
      
      return subscription?.credits_remaining ?? 0
    } catch (err) {
      console.error('Error fetching credits:', err)
      throw err
    }
  }, [supabase])

  // Update credits with animation
  const updateCredits = useCallback((newCredits: number, previousCredits: number | null) => {
    // Check if credits are decreasing for animation
    if (previousCredits !== null && previousCredits > newCredits) {
      setIsDecrementing(true)
      // Reset animation after duration
      setTimeout(() => setIsDecrementing(false), 2000)
    }
    
    setCredits(newCredits)
    setError(null)
    setLoading(false)
    
    // Update cache
    localStorage.setItem(CREDITS_STORAGE_KEY, newCredits.toString())
    localStorage.setItem(CREDITS_TIMESTAMP_KEY, Date.now().toString())
  }, [])

  return {
    credits,
    loading,
    error,
    isDecrementing,
    getCachedCredits,
    fetchCredits,
    updateCredits,
    setError,
    setLoading
  }
}

export function CreditCounter() {
  const pathname = usePathname()
  const {
    credits,
    loading,
    error,
    isDecrementing,
    getCachedCredits,
    fetchCredits,
    updateCredits,
    setError,
    setLoading
  } = useCreditData()

  // Skip on plans page
  const isPlansPage = pathname === '/plans'

  useEffect(() => {
    // Don't fetch on plans page
    if (isPlansPage) {
      setLoading(false)
      return
    }

    let mounted = true
    let previousCredits: number | null = null

    // Initialize with cached data
    const cachedCredits = getCachedCredits()
    if (cachedCredits !== null) {
      previousCredits = cachedCredits
      updateCredits(cachedCredits, null)
    }

    // Fetch fresh data
    const loadCredits = async () => {
      try {
        if (!mounted) return
        
        // Only show loading if we don't have cached data
        if (cachedCredits === null) {
          setLoading(true)
        }
        
        const freshCredits = await fetchCredits()
        
        if (mounted) {
          updateCredits(freshCredits, previousCredits)
          previousCredits = freshCredits
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load credits')
          setLoading(false)
        }
      }
    }

    loadCredits()

    // Listen for credit update events
    const handleCreditUpdate = (event: CustomEvent<{ credits: number }>) => {
      if (mounted) {
        updateCredits(event.detail.credits, previousCredits)
        previousCredits = event.detail.credits
      }
    }
    
    window.addEventListener('credit-update', handleCreditUpdate as EventListener)
    
    return () => {
      mounted = false
      window.removeEventListener('credit-update', handleCreditUpdate as EventListener)
    }
  }, [isPlansPage, getCachedCredits, fetchCredits, updateCredits, setError, setLoading])

  // Don't render on plans page
  if (isPlansPage) {
    return null
  }

  // Common container styles
  const containerClasses = "flex items-center gap-1.5 h-9 px-1.5"

  // Loading state (only show skeleton if we don't have any credits data)
  if (loading && credits === null) {
    return (
      <div className={cn(containerClasses, "opacity-80")}>
        <Coins className="h-4 w-4 text-muted-foreground animate-pulse" />
        <div className="w-8 h-3 bg-muted/40 rounded-sm animate-pulse" />
      </div>
    )
  }

  // Error state or no credits
  if (error || credits === null) {
    return null
  }

  // Render the credit counter
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div 
            className={cn(
              containerClasses,
              "transition-colors duration-200",
              isDecrementing && "text-amber-500"
            )}
          >
            <Coins 
              className={cn(
                "h-4 w-4 text-amber-500/80 transition-all duration-200",
                isDecrementing && "text-amber-500 animate-pulse"
              )} 
            />
            <span className="text-sm font-medium tabular-nums">
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