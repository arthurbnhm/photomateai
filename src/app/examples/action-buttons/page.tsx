"use client"

import { ActionButtons } from "@/components/ActionButtons"
import { Button } from "@/components/ui/button"
import { Bell, Settings } from "lucide-react"
import Link from "next/link"

export default function ActionButtonsExamplePage() {
  return (
    <div className="container mx-auto py-10 space-y-16">
      <div>
        <h1 className="text-3xl font-bold mb-6">ActionButtons Component Examples</h1>
        <p className="text-muted-foreground mb-10">
          This page demonstrates different configurations of the ActionButtons component.
        </p>
      </div>

      {/* Default configuration - already in the top-right corner from layout */}
      <section className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Default Configuration (from layout)</h2>
        <p className="text-muted-foreground">
          The default ActionButtons component is already visible in the top-right corner of the page.
          It includes both the auth button and theme toggle.
        </p>
      </section>

      {/* Automatic auth button hiding */}
      <section className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Automatic Auth Button Hiding</h2>
        <p className="text-muted-foreground mb-4">
          The component automatically hides the auth button when on authentication pages (paths starting with <code>/auth</code>).
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button asChild>
            <Link href="/auth/login">Go to Auth Page</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            (Notice the auth button will disappear on the auth page)
          </p>
        </div>
      </section>

      {/* Hide sign-out on homepage */}
      <section className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Hide Sign-out on Homepage</h2>
        <p className="text-muted-foreground mb-4">
          When a user is signed in and on the homepage, you can choose to hide the sign-out button, 
          leaving only the &quot;Go to App&quot; button visible.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button asChild>
            <Link href="/">Go to Homepage</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            (On the homepage, only the &quot;Go to App&quot; button will be shown when signed in)
          </p>
        </div>
      </section>

      {/* Custom positions */}
      <section className="border rounded-lg p-6 relative h-80">
        <h2 className="text-xl font-semibold mb-4">Custom Positions</h2>
        
        <ActionButtons 
          position="top-left" 
          showAuthButton={false}
        />
        
        <ActionButtons 
          position="bottom-right" 
          showThemeToggle={false}
        />
        
        <ActionButtons 
          position="bottom-left" 
          showAuthButton={false}
          showThemeToggle={false}
        >
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Settings className="h-5 w-5" />
          </Button>
        </ActionButtons>
        
        <p className="text-muted-foreground text-center mt-20">
          Look at each corner of this section to see different ActionButtons configurations.
        </p>
      </section>
      
      {/* Custom styling */}
      <section className="border rounded-lg p-6 mb-20">
        <h2 className="text-xl font-semibold mb-4">Custom Styling</h2>
        
        <div className="flex justify-center">
          <ActionButtons 
            position="custom" 
            className="bg-primary/10 p-3 rounded-full"
            gap="gap-2"
          >
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full">
              <Bell className="h-5 w-5" />
            </Button>
          </ActionButtons>
        </div>
        
        <p className="text-muted-foreground text-center mt-6">
          This example shows custom styling with a rounded background and custom gap.
        </p>
      </section>
    </div>
  )
} 