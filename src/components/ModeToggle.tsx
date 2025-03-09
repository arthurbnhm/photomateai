"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  
  // After hydration, we can safely show the UI
  React.useEffect(() => {
    setMounted(true)
  }, [])
  
  // Don't render anything until client-side hydration is complete
  if (!mounted) {
    return null
  }
  
  // Only calculate these classes on the client side after hydration
  const isDark = resolvedTheme === 'dark'
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="icon"
          className="h-9 w-9 p-0 relative"
          aria-label="Toggle theme"
        >
          <Sun className={`h-[18px] w-[18px] transition-all duration-300 ${
            isDark ? 'opacity-0 scale-0' : 'opacity-100 scale-100'
          }`} />
          <Moon className={`absolute h-[18px] w-[18px] transition-all duration-300 ${
            isDark ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
          }`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 