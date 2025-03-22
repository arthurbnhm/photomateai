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
      // Get the computed background color from CSS variables
      const computedStyle = getComputedStyle(document.documentElement)
      const backgroundColor = computedStyle.getPropertyValue('--background')
      
      const metaThemeColor = document.querySelector('meta[name="theme-color"]')
      
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', backgroundColor || (document.documentElement.classList.contains('dark') ? '#121212' : '#ffffff'))
      } else {
        const meta = document.createElement('meta')
        meta.name = 'theme-color'
        meta.content = backgroundColor || (document.documentElement.classList.contains('dark') ? '#121212' : '#ffffff')
        document.head.appendChild(meta)
      }
    }

    // Set initial theme color after a short delay to ensure CSS variables are loaded
    setTimeout(updateThemeColor, 100)
    
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