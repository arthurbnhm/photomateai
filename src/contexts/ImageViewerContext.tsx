"use client"

import { createContext, useContext, ReactNode, useState } from 'react'

// Define the context type
type ImageViewerContextType = {
  isImageViewerOpen: boolean
  setImageViewerOpen: (isOpen: boolean) => void
}

// Create the context with default values
const ImageViewerContext = createContext<ImageViewerContextType>({
  isImageViewerOpen: false,
  setImageViewerOpen: () => {}
})

// Provider component
export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [isImageViewerOpen, setImageViewerOpen] = useState(false)

  return (
    <ImageViewerContext.Provider value={{ isImageViewerOpen, setImageViewerOpen }}>
      {children}
    </ImageViewerContext.Provider>
  )
}

// Hook to use the context
export function useImageViewer() {
  return useContext(ImageViewerContext)
} 