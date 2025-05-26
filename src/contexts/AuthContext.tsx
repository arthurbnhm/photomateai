"use client"

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { AuthResponse, OAuthResponse } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { SimpleCache } from '@/lib/cache'

// Define types for credits data (matching existing credits API)
interface CreditsData {
  has_credits: boolean;
  credits_remaining: number;
  models_remaining: number;
  plan: string;
  subscription_active: boolean;
  expired?: boolean;
}

// Define the shape of the auth context
type AuthContextType = {
  // User state
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  mounted: boolean
  
  // Credits state (simplified)
  credits: CreditsData | null
  creditsLoading: boolean
  
  // Auth actions
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthResponse>
  signUp: (email: string, password: string) => Promise<AuthResponse>
  signInWithOAuth: (provider: 'google') => Promise<OAuthResponse>
  getUser: () => Promise<{ data: { user: User | null } }>
  
  // Data refresh actions
  refreshCredits: () => Promise<void>
  invalidateCache: () => void
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Internal hook with the authentication logic
function useAuthImplementation() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [credits, setCredits] = useState<CreditsData | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const supabase = createSupabaseBrowserClient()
  const isHomePage = pathname === '/'

  // Fetch credits data with caching
  const fetchCreditsData = useCallback(async (useCache: boolean = true) => {
    if (!user?.id) return;

    setCreditsLoading(true);
    
    try {
      if (useCache) {
        // Try to get cached data first
        const cachedData = SimpleCache.get<CreditsData>(SimpleCache.KEYS.CREDITS);
        if (cachedData) {
          setCredits(cachedData);
          setCreditsLoading(false);
          
          // If cache is not stale, use it and return
          if (!SimpleCache.isStale(SimpleCache.KEYS.CREDITS)) {
            return;
          }
          // If stale, continue to fetch fresh data in background
        }
      }

      // Fetch fresh data from credits API
      const response = await fetch('/api/credits/check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ensure cookies are sent
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Credits API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          url: response.url
        });
        throw new Error(`Failed to fetch credits data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Update state
      setCredits(data);

      // Cache the data
      SimpleCache.set(SimpleCache.KEYS.CREDITS, data, SimpleCache.DURATIONS.CREDITS);
      
    } catch (error) {
      console.error('Error fetching credits data:', error);
      // Set fallback state
      setCredits({
        has_credits: false,
        credits_remaining: 0,
        models_remaining: 0,
        plan: 'none',
        subscription_active: false,
        expired: false,
      });
    } finally {
      setCreditsLoading(false);
    }
  }, [user?.id]);

  // Manual refresh function
  const refreshCredits = useCallback(async () => {
    SimpleCache.invalidate(SimpleCache.KEYS.CREDITS);
    await fetchCreditsData(false);
  }, [fetchCreditsData]);

  const invalidateCache = useCallback(() => {
    SimpleCache.clear();
  }, []);

  // Initialize authentication state
  useEffect(() => {
    setMounted(true)
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const newUser = session?.user ?? null
        setUser(newUser)
        setIsLoading(false)
        
        // Clear auth-related cache when user changes
        if (event === 'SIGNED_OUT') {
          SimpleCache.clear();
          setCredits(null);
        } else if (newUser && event === 'SIGNED_IN') {
          // Fetch credits data for newly signed in user
          // Don't fetch on landing page - it's not needed there
          const isLandingPage = typeof window !== 'undefined' && window.location.pathname === '/';
          if (!isLandingPage) {
            setTimeout(() => fetchCreditsData(false), 100); // Slight delay to ensure state is set
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchCreditsData])

  // Fetch credits data when user is available and mounted
  useEffect(() => {
    if (mounted && user && !isLoading) {
      // Don't fetch credits data on the landing page - it's not needed
      const isLandingPage = typeof window !== 'undefined' && window.location.pathname === '/';
      if (!isLandingPage) {
        fetchCreditsData();
      }
    }
  }, [mounted, user, isLoading, fetchCreditsData]);

  // Listen for events that should refresh credits
  useEffect(() => {
    const handleCreditsRefresh = () => {
      refreshCredits();
    };

    // Listen for generation completion events
    window.addEventListener('generation-completed', handleCreditsRefresh);
    window.addEventListener('training-completed', handleCreditsRefresh);
    window.addEventListener('subscription-changed', handleCreditsRefresh);
    
    // Refresh when window becomes visible (user comes back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        // Check if cache is stale and refresh if needed
        if (SimpleCache.isStale(SimpleCache.KEYS.CREDITS, 60 * 1000)) { // 1 minute threshold
          fetchCreditsData();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('generation-completed', handleCreditsRefresh);
      window.removeEventListener('training-completed', handleCreditsRefresh);
      window.removeEventListener('subscription-changed', handleCreditsRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, fetchCreditsData, refreshCredits]);

  // Auth action handlers with memoization for performance
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setCredits(null)
    SimpleCache.clear()
    router.refresh()
    if (!isHomePage) {
      router.push('/auth/login')
    }
  }, [supabase, router, isHomePage])

  const signIn = useCallback((email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
  }, [supabase])

  const signUp = useCallback((email: string, password: string) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
      },
    })
  }, [supabase])

  const signInWithOAuth = useCallback((provider: 'google') => {
    return supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
      },
    })
  }, [supabase])

  const getUser = useCallback(async () => {
    return supabase.auth.getUser()
  }, [supabase])

  // Return the auth context
  return {
    user,
    isLoading,
    mounted,
    credits,
    creditsLoading,
    signOut,
    signIn,
    signUp,
    signInWithOAuth,
    getUser,
    refreshCredits,
    invalidateCache,
    isAuthenticated: !!user,
  }
}

// Provider component that wraps your app and makes auth object available to any
// child component that calls useAuth().
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthImplementation()
  
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

// Hook for components to get the auth object and re-render when it changes.
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 