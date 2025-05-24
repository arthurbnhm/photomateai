"use client"

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { AuthResponse, OAuthResponse } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

// Define the shape of the auth context
type AuthContextType = {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  mounted: boolean
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthResponse>
  signUp: (email: string, password: string) => Promise<AuthResponse>
  signInWithOAuth: (provider: 'google') => Promise<OAuthResponse>
  getUser: () => Promise<{ data: { user: User | null } }>
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
  const supabase = createSupabaseBrowserClient()
  const isHomePage = pathname === '/'

  // Initialize authentication state
  useEffect(() => {
    setMounted(true)
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUser = session?.user ?? null
        setUser(newUser)
        setIsLoading(false)
      }
    )

    // Remove the redundant getCurrentUser call - onAuthStateChange will fire immediately
    // and provide the current session state, eliminating duplicate calls
    
    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, router, isHomePage])

  // Auth action handlers with memoization for performance
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
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
    signOut,
    signIn,
    signUp,
    signInWithOAuth,
    getUser,
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