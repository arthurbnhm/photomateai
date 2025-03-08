"use client"

import React, { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { useImageViewer } from "@/contexts/ImageViewerContext"

// Define the types needed for the component
export type ImageWithStatus = {
  url: string
  isExpired: boolean
}

export type ImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
}

type MediaFocusProps = {
  isOpen: boolean
  currentGeneration: ImageGeneration | null
  currentImageIndex: number
  onClose: () => void
  onNavigate: (newIndex: number) => void
}

export function MediaFocus({
  isOpen,
  currentGeneration,
  currentImageIndex,
  onClose,
  onNavigate
}: MediaFocusProps) {
  // Use the image viewer context
  const { setImageViewerOpen } = useImageViewer()
  
  // Lock body scroll when viewer is open
  useEffect(() => {
    setImageViewerOpen(isOpen)
    
    if (isOpen) {
      // Save the current scroll position and disable scrolling
      const scrollY = window.scrollY
      
      // Freeze the body
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      
      // Adding a class to html to prevent any scrolling
      document.documentElement.classList.add('media-focus-active')
      
      return () => {
        // Restore body scrolling when the component unmounts or closes
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        
        // Remove the class
        document.documentElement.classList.remove('media-focus-active')
        
        // Restore scroll position
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen, setImageViewerOpen])
  
  // Touch swipe handling
  const touchStartXRef = useRef<number | null>(null)
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
  }
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return
    
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartXRef.current - touchEndX
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextImage()
      else prevImage()
    }
    
    touchStartXRef.current = null
  }
  
  // Navigation
  const nextImage = () => {
    if (!currentGeneration) return
    const totalImages = currentGeneration.images.length
    onNavigate((currentImageIndex + 1) % totalImages)
  }

  const prevImage = () => {
    if (!currentGeneration) return
    const totalImages = currentGeneration.images.length
    onNavigate((currentImageIndex - 1 + totalImages) % totalImages)
  }
  
  // Preload images
  useEffect(() => {
    if (isOpen && currentGeneration) {
      const totalImages = currentGeneration.images.length
      const nextIndex = (currentImageIndex + 1) % totalImages
      const prevIndex = (currentImageIndex - 1 + totalImages) % totalImages
      
      if (nextIndex !== currentImageIndex) {
        const nextImg = new Image()
        nextImg.src = currentGeneration.images[nextIndex].url
      }
      
      if (prevIndex !== currentImageIndex) {
        const prevImg = new Image()
        prevImg.src = currentGeneration.images[prevIndex].url
      }
    }
  }, [isOpen, currentGeneration, currentImageIndex])
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'ArrowRight': nextImage(); break
        case 'ArrowLeft': prevImage(); break
        case 'Escape': onClose(); break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentGeneration, currentImageIndex])

  // Download functionality
  const downloadImage = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!currentGeneration || !currentGeneration.images[currentImageIndex]) return
    
    try {
      const imageUrl = currentGeneration.images[currentImageIndex].url
      const promptText = currentGeneration.prompt.slice(0, 20).replace(/[^a-z0-9]/gi, '_')
      const filename = `photomate_${promptText}_${currentImageIndex + 1}.png`
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      
      if (isMobile && navigator.share && navigator.canShare) {
        try {
          const response = await fetch(imageUrl)
          const blob = await response.blob()
          const file = new File([blob], filename, { type: 'image/png' })
          const shareData = { files: [file] }
          
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData)
              toast.success('Image shared successfully')
            } catch (shareError: unknown) {
              if (shareError && typeof shareError === 'object' && 'name' in shareError && shareError.name === 'AbortError') {
                console.log('Share cancelled by user')
              } else {
                console.error('Error sharing image:', shareError)
                await performRegularDownload(imageUrl, filename)
              }
            }
            return
          }
        } catch (error) {
          console.error('Error preparing image for sharing:', error)
        }
      }
      
      await performRegularDownload(imageUrl, filename)
    } catch (error) {
      console.error('Error downloading image:', error)
      toast.error('Failed to download image')
    }
  }
  
  const performRegularDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', filename)
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      }, 100)
      
      toast.success('Image downloaded successfully')
    } catch (error) {
      console.error('Error in regular download:', error)
      toast.error('Failed to download image')
      throw error
    }
  }

  if (!isOpen || !currentGeneration) return null

  // We return a Portal to ensure the viewer is rendered at the root level
  return (
    <div 
      className="fixed inset-0 bg-background z-[9999] flex items-center justify-center"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0, 
        right: 0, 
        bottom: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        border: 'none',
        overflow: 'hidden'
      }}
    >
      {/* Theme-aware background overlay */}
      <div 
        className="absolute inset-0 bg-background opacity-100" 
        style={{ pointerEvents: 'none' }}
      />

      {/* Main image */}
      <motion.img 
        key={currentImageIndex}
        src={currentGeneration.images[currentImageIndex].url} 
        alt={`Generated image for "${currentGeneration.prompt}"`}
        className="object-contain max-h-[70vh] max-w-[90vw] h-auto w-auto rounded-md z-10 relative"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        onError={() => toast.error("Failed to load image")}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Image counter (top center) */}
      <div 
        className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-card/80 backdrop-blur-sm 
                    px-3 py-1.5 rounded-full text-sm font-medium z-20 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {currentImageIndex + 1} / {currentGeneration.images.length}
      </div>

      {/* Action buttons (top right) */}
      <div 
        className="absolute top-4 right-4 flex gap-2 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <Button 
          onClick={downloadImage}
          variant="outline"
          size="icon"
          className="h-10 w-10 bg-card/80 backdrop-blur-sm border-border"
        >
          <Download className="h-4 w-4" />
        </Button>
        
        <Button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          variant="outline"
          size="icon"
          className="h-10 w-10 bg-card/80 backdrop-blur-sm border-border"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation buttons (left/right sides) */}
      <Button 
        onClick={(e) => { e.stopPropagation(); prevImage(); }}
        variant="outline"
        size="icon"
        className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 bg-card/80 backdrop-blur-sm z-20 border-border"
        aria-label="Previous image"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <Button 
        onClick={(e) => { e.stopPropagation(); nextImage(); }}
        variant="outline"
        size="icon"
        className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 bg-card/80 backdrop-blur-sm z-20 border-border"
        aria-label="Next image"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Thumbnails (bottom) */}
      <div 
        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 
                    bg-card/80 backdrop-blur-sm p-3 rounded-lg max-w-[90vw] 
                    overflow-x-auto z-20 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {currentGeneration.images.map((image, index) => (
            <button
              key={index}
              onClick={() => onNavigate(index)}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border-2 flex-shrink-0 transition ${
                index === currentImageIndex ? 'border-primary scale-110' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              aria-label={`View image ${index + 1}`}
              aria-current={index === currentImageIndex ? 'true' : 'false'}
            >
              <img 
                src={image.url} 
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}