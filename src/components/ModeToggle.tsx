"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  
  // After hydration, we can safely show the UI
  React.useEffect(() => {
    setMounted(true)
  }, [])
  
  // Toggle between light and dark mode
  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }
  
  // Don't render anything until client-side hydration is complete
  if (!mounted) {
    return null
  }
  
  return (
    <Button 
      variant="outline" 
      size="icon"
      className="h-9 w-9"
      onClick={toggleTheme}
      aria-label={resolvedTheme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
    >
      {resolvedTheme === 'dark' ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  )
} 