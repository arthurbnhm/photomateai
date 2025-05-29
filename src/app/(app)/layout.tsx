"use client"

import { useAuth } from '@/contexts/AuthContext'
import { Navbar } from "@/components/Navbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoading: authLoading } = useAuth()

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <>
        <Navbar />
        <main className="flex-1">
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        </main>
      </>
    )
  }

  // If user not authenticated, middleware should have redirected
  if (!user) {
    return null
  }

  // Middleware handles all subscription checks, so just render children
  return (
    <>
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
    </>
  )
} 