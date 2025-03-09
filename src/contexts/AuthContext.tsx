"use client"

import React, { createContext, useContext, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { AuthResponse, OAuthResponse, Session } from '@supabase/supabase-js'

// Import the useAuth hook directly from the file
import { useAuth as useAuthHook } from '../hooks/useAuth'

// Define the shape of the auth context
type AuthContextType = {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isAuthReady: boolean
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthResponse>
  signUp: (email: string, password: string) => Promise<AuthResponse>
  signInWithOAuth: (provider: 'google') => Promise<OAuthResponse>
  getSession: () => Promise<{ data: { session: Session | null } }>
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Provider component that wraps your app and makes auth object available to any
// child component that calls useAuth().
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthHook()
  
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