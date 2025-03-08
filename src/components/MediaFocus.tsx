"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { useImageViewer } from "@/contexts/ImageViewerContext"
import Image from "next/image"

// Define a type for DOMException which includes AbortError
interface DOMExceptionWithAbort extends DOMException {
  name: string;
}

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
  
  // Update the global context when the component mounts/unmounts or when isOpen changes
  useEffect(() => {
    setImageViewerOpen(isOpen)
    
    // Clean up when component unmounts
    return () => {
      if (isOpen) {
        setImageViewerOpen(false)
      }
    }
  }, [isOpen, setImageViewerOpen])
  
  // Reference for touch handling
  const touchStartXRef = useRef<number | null>(null)
  
  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
  }
  
  // Handle touch end for swipe navigation
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return
    
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartXRef.current - touchEndX
    
    // Detect left/right swipe (with a threshold of 50px)
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swiped left, go to next image
        nextImage()
      } else {
        // Swiped right, go to previous image
        prevImage()
      }
    }
    
    touchStartXRef.current = null
  }
  
  // Add function to navigate to next image (wrapped in useCallback)
  const nextImage = useCallback(() => {
    if (!currentGeneration) return
    
    const totalImages = currentGeneration.images.length
    onNavigate((currentImageIndex + 1) % totalImages)
  }, [currentGeneration, currentImageIndex, onNavigate]);

  // Add function to navigate to previous image (wrapped in useCallback)
  const prevImage = useCallback(() => {
    if (!currentGeneration) return
    
    const totalImages = currentGeneration.images.length
    onNavigate((currentImageIndex - 1 + totalImages) % totalImages)
  }, [currentGeneration, currentImageIndex, onNavigate]);
  
  // Preload adjacent images when current image changes
  useEffect(() => {
    if (isOpen && currentGeneration) {
      const totalImages = currentGeneration.images.length
      const nextIndex = (currentImageIndex + 1) % totalImages
      const prevIndex = (currentImageIndex - 1 + totalImages) % totalImages
      
      // Preload next and previous images
      if (nextIndex !== currentImageIndex) {
        const nextImageUrl = currentGeneration.images[nextIndex].url
        const preloadImage = new window.Image()
        preloadImage.src = nextImageUrl
      }
      
      if (prevIndex !== currentImageIndex) {
        const prevImageUrl = currentGeneration.images[prevIndex].url
        const preloadImage = new window.Image()
        preloadImage.src = prevImageUrl
      }
    }
  }, [isOpen, currentGeneration, currentImageIndex]);
  
  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'ArrowRight':
          nextImage()
          break
        case 'ArrowLeft':
          prevImage()
          break
        case 'Escape':
          onClose()
          break
        default:
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentGeneration, currentImageIndex, nextImage, prevImage, onClose])

  // Add function to download the current image
  const downloadImage = async (e: React.MouseEvent) => {
    // Prevent event propagation to avoid closing the viewer
    e.stopPropagation();
    
    if (!currentGeneration || !currentGeneration.images[currentImageIndex]) {
      return
    }
    
    try {
      const imageUrl = currentGeneration.images[currentImageIndex].url
      const promptText = currentGeneration.prompt.slice(0, 20).replace(/[^a-z0-9]/gi, '_')
      const filename = `photomate_${promptText}_${currentImageIndex + 1}.png`
      
      // Check if we're on a mobile device
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      
      // Try to use Web Share API for mobile devices if available
      if (isMobile && navigator.share && navigator.canShare) {
        try {
          // Fetch the image and create a blob
          const response = await fetch(imageUrl)
          const blob = await response.blob()
          
          // Create a file from the blob
          const file = new File([blob], filename, { type: 'image/png' })
          
          // Check if we can share this file
          const shareData = { files: [file] }
          
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData)
              toast.success('Image shared successfully')
            } catch (shareError: unknown) {
              // Check if it's an AbortError (user cancelled the share)
              const error = shareError as DOMExceptionWithAbort;
              if (error && error.name === 'AbortError') {
                // User cancelled the share, don't show an error
                console.log('Share cancelled by user')
              } else {
                console.error('Error sharing image:', shareError)
                // Fall back to regular download for other errors
                await performRegularDownload(imageUrl, filename)
              }
            }
            return
          }
        } catch (error) {
          console.error('Error preparing image for sharing:', error)
          // Fall back to regular download if sharing preparation fails
        }
      }
      
      // Regular download for desktop or if sharing fails/isn't available
      await performRegularDownload(imageUrl, filename)
      
    } catch (error) {
      console.error('Error downloading image:', error)
      toast.error('Failed to download image')
    }
  }
  
  // Helper function to perform regular download
  const performRegularDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      
      // Create a temporary anchor element
      const link = document.createElement('a')
      link.href = blobUrl
      
      // Set the download attribute to force download instead of navigation
      link.setAttribute('download', filename)
      
      // Simulate a click without adding to DOM (prevents navigation)
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl) // Free up memory
      }, 100)
      
      toast.success('Image downloaded successfully')
    } catch (error) {
      console.error('Error in regular download:', error)
      toast.error('Failed to download image')
      throw error // Re-throw to be handled by the caller
    }
  }

  if (!isOpen || !currentGeneration) {
    return null
  }

  return (
    <div 
      className="fixed inset-0 bg-white dark:bg-black z-[9999] flex flex-col isolate overflow-hidden"
      onClick={(e) => {
        // Only close if clicking directly on the background container
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{ height: '100dvh' }}
    >
      {/* Header with counter and buttons */}
      <div className="flex items-center justify-between w-full p-4 z-10">
        {/* Image counter indicator */}
        <div className="bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
          {currentImageIndex + 1} / {currentGeneration.images.length}
        </div>
        
        {/* Close and download buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={downloadImage}
            variant="outline"
            size="icon"
            className="h-10 w-10 shadow-sm bg-background border-border"
            aria-label="Download image"
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </Button>
          
          <Button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            variant="outline"
            size="icon"
            className="h-10 w-10 shadow-sm bg-background border-border"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Main content area with image and navigation */}
      <div 
        className="flex-1 flex items-center justify-center relative"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Image container */}
        <motion.div 
          className="relative"
          key={currentImageIndex}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Image 
            src={currentGeneration.images[currentImageIndex].url} 
            alt={`Generated image for "${currentGeneration.prompt}"`}
            className="object-contain rounded-md"
            width={1024}
            height={1024}
            style={{
              maxHeight: '60vh',
              maxWidth: '90vw',
              width: 'auto',
              height: 'auto'
            }}
            priority
            unoptimized={currentGeneration.images[currentImageIndex].url.includes('replicate.delivery')}
            onError={() => toast.error("Failed to load image")}
          />
        </motion.div>
        
        {/* Navigation arrows */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between w-full px-4 sm:px-8 pointer-events-none">
          <Button 
            onClick={prevImage}
            variant="outline"
            size="icon"
            className="h-10 w-10 pointer-events-auto shadow-sm bg-background border-border"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button 
            onClick={nextImage}
            variant="outline"
            size="icon"
            className="h-10 w-10 pointer-events-auto shadow-sm bg-background border-border"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Thumbnails at bottom */}
      <div className="p-4 flex items-center justify-center bg-background/5 backdrop-blur-sm">
        <div className="bg-background/90 backdrop-blur-sm p-3 rounded-lg shadow-md max-w-[90vw] overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-3">
            {currentGeneration.images.map((image, index) => (
              <motion.button
                key={index}
                onClick={() => onNavigate(index)}
                className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-md overflow-hidden border-2 transition-all flex-shrink-0 ${
                  index === currentImageIndex ? 'border-primary scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                aria-label={`View image ${index + 1}`}
                aria-current={index === currentImageIndex ? 'true' : 'false'}
                whileHover={{ scale: index === currentImageIndex ? 1.1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Image 
                  src={image.url} 
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  width={64}
                  height={64}
                  unoptimized={image.url.includes('replicate.delivery')}
                  priority={index === currentImageIndex}
                />
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}