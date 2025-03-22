"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  // Update theme-color meta tag based on theme
  React.useEffect(() => {
    const updateThemeColor = () => {
      const isDark = document.documentElement.classList.contains('dark')
      const metaThemeColor = document.querySelector('meta[name="theme-color"]')
      
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#181818' : '#ffffff')
      } else {
        const meta = document.createElement('meta')
        meta.name = 'theme-color'
        meta.content = isDark ? '#181818' : '#ffffff'
        document.head.appendChild(meta)
      }
    }

    // Set initial theme color
    updateThemeColor()
    
    // Update theme color when theme changes
    const observer = new MutationObserver(updateThemeColor)
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    })
    
    return () => observer.disconnect()
  }, [])
  
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
} 