"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'

// Global auth state that persists between renders/components
let globalAuthState: {
  user: User | null;
  initialized: boolean;
} = {
  user: null,
  initialized: false
};

export function useAuth() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(() => globalAuthState.initialized ? globalAuthState.user : null)
  const [isLoading, setIsLoading] = useState(!globalAuthState.initialized)
  const [mounted, setMounted] = useState(false)
  const supabase = createSupabaseClient()
  const isHomePage = pathname === '/'
  const isAuthPage = pathname === '/auth/login'
  const initialStateChecked = useRef(globalAuthState.initialized)

  // Initialize authentication state
  useEffect(() => {
    // Set mounted state immediately
    setMounted(true)
    
    // Skip initialization if already done globally
    if (initialStateChecked.current) {
      return;
    }
    
    initialStateChecked.current = true;
    
    // Try to get user from localStorage first for immediate UI rendering
    const getUserFromLocalStorage = () => {
      try {
        if (typeof window !== 'undefined') {
          const storedSession = localStorage.getItem('supabase.auth.token')
          if (storedSession) {
            try {
              const parsedSession = JSON.parse(storedSession)
              if (parsedSession?.currentSession?.user) {
                return parsedSession.currentSession.user;
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      } catch {
        // Ignore localStorage errors
      }
      return null;
    };
    
    // Try to get user from localStorage first
    const storedUser = getUserFromLocalStorage();
    if (storedUser) {
      setUser(storedUser);
      globalAuthState = { user: storedUser, initialized: true };
      setIsLoading(false);
      return; // Skip API call if we have a valid user
    }
    
    // Otherwise fetch from API
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
        globalAuthState = { user, initialized: true };
        
        // Redirect to login page if needed
        if (!user && !isAuthPage && !isHomePage) {
          router.push('/auth/login')
        }
      } catch (error) {
        console.error('Error fetching user:', error)
        globalAuthState = { user: null, initialized: true };
      } finally {
        setIsLoading(false)
      }
    }

    getUser()

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const newUser = session?.user ?? null;
        setUser(newUser)
        globalAuthState = { user: newUser, initialized: true };
        
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

  // Auth action handlers with memoization for performance
  const signOut = useCallback(() => {
    return supabase.auth.signOut().then(() => {
      globalAuthState = { user: null, initialized: true };
      router.refresh()
      if (!isHomePage) {
        router.push('/auth/login')
      }
    })
  }, [supabase.auth, router, isHomePage])

  const signIn = useCallback((email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
  }, [supabase.auth])

  const signUp = useCallback((email: string, password: string) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [supabase.auth])

  const signInWithOAuth = useCallback((provider: 'google') => {
    return supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [supabase.auth])

  const getSession = useCallback(async () => {
    return supabase.auth.getSession()
  }, [supabase.auth])

  // Return the auth context
  return {
    user,
    isLoading,
    mounted,
    signOut,
    signIn,
    signUp,
    signInWithOAuth,
    getSession,
    isAuthenticated: !!user,
    isAuthReady: globalAuthState.initialized
  }
} 