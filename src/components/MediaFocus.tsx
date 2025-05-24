"use client"

import React, { useEffect, useRef, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import NextImage from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { useGesture } from "@use-gesture/react"
import { useSpring, animated, config } from "@react-spring/web"

// Define the types needed for the component
export type ImageWithStatus = {
  url: string
  isExpired: boolean
  isLiked?: boolean // Add liked status for individual images
  generationId?: string // Add generation ID for favorites page
}

export type ImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
  format?: string      // Add format from prediction
}

type MediaFocusProps = {
  isOpen: boolean
  currentGeneration: ImageGeneration | null
  currentImageIndex: number
  onClose: () => void
  onNavigate: (newIndex: number) => void
  onUpdateGeneration?: (updatedGeneration: ImageGeneration) => void // Add this for updating generation data
  allImages?: ImageWithStatus[] // Add this for showing all favorite images in thumbnail strip
}

export function MediaFocus({
  isOpen,
  currentGeneration,
  currentImageIndex,
  onClose,
  onNavigate,
  onUpdateGeneration,
  allImages
}: MediaFocusProps) {
  const [mounted, setMounted] = React.useState(false)
  const supabase = createSupabaseBrowserClient()
  const thumbnailContainerRef = useRef<HTMLDivElement>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  
  // Zoom and pan state
  const [{ scale, x, y }, api] = useSpring(() => ({
    scale: 1,
    x: 0,
    y: 0,
    config: config.gentle
  }))
  
  // Simple mobile detection
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768
  }, [])
  
  // Handle mounting for portal
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])
  
  // Comprehensive UI zoom prevention
  useEffect(() => {
    if (!isOpen) return
    
    // Save original viewport meta
    const originalMeta = document.querySelector('meta[name="viewport"]')
    const originalContent = originalMeta?.getAttribute('content') || ''
    
    // Update viewport to prevent zoom
    if (originalMeta) {
      originalMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    }
    
    // Lock body scroll and prevent touch actions
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    
    // Prevent zoom with keyboard shortcuts
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=')) {
        e.preventDefault()
      }
    }
    
    // Prevent zoom with mouse wheel + ctrl/cmd
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    
    // Prevent touch zoom on the entire document
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }
    
    // Prevent double tap zoom
    let lastTouchEnd = 0
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }
    
    // Add event listeners with capture phase
    document.addEventListener('keydown', preventKeyboardZoom, { capture: true })
    document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true })
    document.addEventListener('touchstart', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchmove', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false, capture: true })
    
    // Add CSS to prevent zoom on specific elements
    const style = document.createElement('style')
    style.id = 'media-focus-zoom-prevention'
    style.textContent = `
      body.media-focus-open {
        touch-action: none !important;
        -webkit-touch-action: none !important;
        -ms-touch-action: none !important;
        overscroll-behavior: none !important;
      }
      body.media-focus-open * {
        touch-action: none !important;
        -webkit-touch-action: none !important;
        -ms-touch-action: none !important;
      }
      body.media-focus-open input,
      body.media-focus-open textarea,
      body.media-focus-open select {
        font-size: 16px !important;
      }
    `
    document.head.appendChild(style)
    document.body.classList.add('media-focus-open')
    
    return () => {
      // Restore original viewport
      if (originalMeta) {
        originalMeta.setAttribute('content', originalContent)
      }
      
      // Restore body styles
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      document.body.classList.remove('media-focus-open')
      
      // Remove event listeners
      document.removeEventListener('keydown', preventKeyboardZoom, { capture: true })
      document.removeEventListener('wheel', preventWheelZoom, { capture: true })
      document.removeEventListener('touchstart', preventTouchZoom, { capture: true })
      document.removeEventListener('touchmove', preventTouchZoom, { capture: true })
      document.removeEventListener('touchend', preventDoubleTapZoom, { capture: true })
      
      // Remove style
      document.getElementById('media-focus-zoom-prevention')?.remove()
    }
  }, [isOpen])
  
  // Reset zoom when image changes
  useEffect(() => {
    api.start({ scale: 1, x: 0, y: 0 })
  }, [currentImageIndex, api])
  
  // Zoom functions
  const zoomIn = useCallback(() => {
    api.start({ scale: Math.min(5, scale.get() * 1.3) })
  }, [api, scale])
  
  const zoomOut = useCallback(() => {
    api.start({ scale: Math.max(0.5, scale.get() * 0.7) })
  }, [api, scale])
  
  const resetZoom = useCallback(() => {
    api.start({ scale: 1, x: 0, y: 0 })
  }, [api])
  
  // Gesture handling with improved zoom isolation
  const bind = useGesture(
    {
      onDrag: ({ offset: [x, y], pinching, event }) => {
        event?.stopPropagation?.()
        if (!pinching && scale.get() > 1) {
          api.start({ x, y })
        }
      },
      onPinch: ({ offset: [s], event }) => {
        event?.stopPropagation?.()
        const newScale = Math.max(0.5, Math.min(5, s))
        api.start({ scale: newScale })
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault()
        event.stopPropagation()
        
        // Only zoom if not using ctrl/cmd (which would be browser zoom)
        if (!event.ctrlKey && !event.metaKey) {
          const scaleFactor = 1 - dy * 0.01
          const newScale = Math.max(0.5, Math.min(5, scale.get() * scaleFactor))
          api.start({ scale: newScale })
        }
      },
      onDoubleClick: ({ event }) => {
        event?.stopPropagation?.()
        if (scale.get() > 1) {
          resetZoom()
        } else {
          api.start({ scale: 2 })
        }
      }
    },
    {
      drag: {
        from: () => [x.get(), y.get()],
        bounds: () => {
          const s = scale.get()
          const maxX = (s - 1) * 150
          const maxY = (s - 1) * 150
          return { left: -maxX, right: maxX, top: -maxY, bottom: maxY }
        },
        rubberband: true
      },
      pinch: {
        scaleBounds: { min: 0.5, max: 5 },
        rubberband: true,
        from: () => [scale.get(), 0]
      },
      wheel: {
        preventDefault: true
      }
    }
  )
  
  // Navigation
  const nextImage = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!currentGeneration) return
    const totalImages = allImages ? allImages.length : currentGeneration.images.length
    onNavigate((currentImageIndex + 1) % totalImages)
  }, [currentGeneration, currentImageIndex, onNavigate, allImages])

  const prevImage = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!currentGeneration) return
    const totalImages = allImages ? allImages.length : currentGeneration.images.length
    onNavigate((currentImageIndex - 1 + totalImages) % totalImages)
  }, [currentGeneration, currentImageIndex, onNavigate, allImages])
  
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
  }, [isOpen, nextImage, prevImage, onClose])

  // Download functionality
  const downloadImage = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!currentGeneration || !currentGeneration.images[currentImageIndex]) return
    
    try {
      const imageUrl = currentGeneration.images[currentImageIndex].url
      const url = new URL(imageUrl)
      const pathSegments = url.pathname.split('/')
      const bucketIndex = pathSegments.findIndex(segment => segment === 'sign') + 2
      if (bucketIndex >= pathSegments.length) {
        throw new Error('Invalid storage URL format')
      }
      const path = pathSegments.slice(bucketIndex).join('/')
      const filename = path.split('/').pop() || 'image'

      const { data: blob, error } = await supabase.storage
        .from('images')
        .download(path)

      if (error) throw error

      // Mobile share or download
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (isMobileDevice && navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: blob.type })
          const shareData = { files: [file] }
          
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData)
            toast.success('Image shared successfully')
            return
          }
        } catch {
          // Fallback to download
        }
      }

      // Regular download
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)

      toast.success('Image downloaded successfully')
    } catch (error) {
      console.error('Error downloading image:', error)
      toast.error('Failed to download image')
    }
  }

  // Favorite toggle
  const toggleImageFavorite = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!currentGeneration) return
    
    const currentImage = allImages ? allImages[currentImageIndex] : currentGeneration.images[currentImageIndex]
    if (!currentImage) return
    
    const currentLikedStatus = currentImage.isLiked || false
    const newLikedStatus = !currentLikedStatus
    
    try {
      // Optimistic update
      const updatedImages = currentGeneration.images.map((img, index) => {
        if (index === currentImageIndex) {
          return { ...img, isLiked: newLikedStatus }
        }
        return img
      })
      
      const updatedGeneration = { ...currentGeneration, images: updatedImages }
      
      if (onUpdateGeneration) {
        onUpdateGeneration(updatedGeneration)
      }

      // API call
      const response = await fetch('/api/favorite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          predictionId: currentImage.generationId || currentGeneration.id,
          imageUrl: currentImage.url,
          isLiked: newLikedStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update favorite status')
      }

    } catch (error) {
      console.error('Error toggling favorite:', error)
      
      // Revert on error
      const revertedImages = currentGeneration.images.map((img, index) => {
        if (index === currentImageIndex) {
          return { ...img, isLiked: currentLikedStatus }
        }
        return img
      })
      
      const revertedGeneration = { ...currentGeneration, images: revertedImages }
      
      if (onUpdateGeneration) {
        onUpdateGeneration(revertedGeneration)
      }
    }
  }

  // Auto-scroll thumbnails
  const scrollToCurrentThumbnail = useCallback(() => {
    if (!thumbnailContainerRef.current) return
    
    const container = thumbnailContainerRef.current
    const thumbnails = container.querySelectorAll('button')
    const currentThumbnail = thumbnails[currentImageIndex]
    
    if (!currentThumbnail) return
    
    const containerRect = container.getBoundingClientRect()
    const thumbnailRect = currentThumbnail.getBoundingClientRect()
    
    const padding = 60
    const isNearLeftEdge = thumbnailRect.left < containerRect.left + padding
    const isNearRightEdge = thumbnailRect.right > containerRect.right - padding
    
    if (isNearLeftEdge || isNearRightEdge) {
      const thumbnailCenter = currentThumbnail.offsetLeft + currentThumbnail.offsetWidth / 2
      const containerCenter = container.offsetWidth / 2
      const scrollPosition = thumbnailCenter - containerCenter
      
      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth'
      })
    }
  }, [currentImageIndex])
  
  useEffect(() => {
    scrollToCurrentThumbnail()
  }, [currentImageIndex, scrollToCurrentThumbnail])

  if (!mounted || !isOpen || !currentGeneration) return null

  const currentImage = allImages ? allImages[currentImageIndex] : currentGeneration.images[currentImageIndex]

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex flex-col items-center justify-center z-[99999] bg-background"
          onClick={onClose}
          style={{ touchAction: 'none' }}
        >
          {/* Top bar */}
          <div 
            className="absolute top-0 w-full flex items-center justify-between z-20 p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'none' }}
          >
            <div className="bg-muted py-2 px-4 rounded-full text-sm font-medium">
              {currentImageIndex + 1} / {allImages ? allImages.length : currentGeneration.images.length}
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={downloadImage}
                variant="outline"
                size="icon"
              >
                <Download className="h-4 w-4" />
              </Button>
              
              <Button 
                onClick={toggleImageFavorite}
                variant="outline"
                size="icon"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill={currentImage.isLiked ? "currentColor" : "none"} 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className={currentImage.isLiked ? "text-red-500" : "text-foreground"}
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </Button>
              
              <Button 
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                variant="outline"
                size="icon"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Main image with zoom */}
          <div 
            ref={imageContainerRef}
            className="flex-1 w-full flex items-center justify-center px-4 pb-32" 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'none' }}
          >
            <animated.div
              {...bind()}
              style={{
                scale,
                x,
                y,
                touchAction: 'none',
                cursor: scale.get() > 1 ? 'grab' : 'default'
              }}
              className="flex items-center justify-center"
            >
              <NextImage
                src={currentImage.url}
                alt={`Generated image for "${currentGeneration.prompt}"`}
                className="object-contain select-none pointer-events-none"
                width={1024}
                height={1024}
                style={{ 
                  maxWidth: '90vw',
                  maxHeight: '60vh',
                  width: 'auto', 
                  height: 'auto',
                  touchAction: 'none'
                }}
                priority={true}
                unoptimized={true}
                draggable={false}
              />
            </animated.div>
            
            {/* Desktop zoom controls */}
            {!isMobile && (
              <div className="absolute top-20 right-4 flex flex-col gap-2 z-20" style={{ touchAction: 'none' }}>
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    zoomIn()
                  }}
                  variant="outline"
                  size="icon"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    resetZoom()
                  }}
                  variant="outline"
                  size="icon"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    zoomOut()
                  }}
                  variant="outline"
                  size="icon"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Navigation arrows */}
          <Button 
            onClick={prevImage}
            variant="outline"
            size="icon"
            className="absolute left-4 -translate-y-1/2"
            style={{ top: 'calc(50% - 4rem)', touchAction: 'none' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button 
            onClick={nextImage}
            variant="outline"
            size="icon"
            className="absolute right-4 -translate-y-1/2"
            style={{ top: 'calc(50% - 4rem)', touchAction: 'none' }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {/* Thumbnails */}
          <div 
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-background/80 backdrop-blur-md border-t border-border/50" 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'none' }}
          >
            <div className="p-6">
              {/* Thumbnail strip */}
              <div className="relative">
                <div 
                  ref={thumbnailContainerRef} 
                  className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 pt-2 justify-center"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    touchAction: 'pan-x'
                  }}
                >
                  {(allImages || currentGeneration.images).map((image, index) => (
                    <button
                      key={`thumb-${index}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigate(index)
                      }}
                      className={`group relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all duration-300 transform ${
                        index === currentImageIndex 
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110 shadow-lg' 
                          : 'ring-1 ring-border/50 hover:ring-2 hover:ring-primary/50 hover:scale-105 opacity-70 hover:opacity-100'
                      }`}
                      aria-label={`View image ${index + 1}`}
                      style={{ touchAction: 'none' }}
                    >
                      {/* Image */}
                      <div className="relative w-full h-full">
                        <NextImage 
                          src={image.url} 
                          alt={`Thumbnail ${index + 1}`}
                          className="object-cover transition-transform duration-300 group-hover:scale-110"
                          fill
                          sizes="80px"
                          unoptimized={true}
                        />
                        
                        {/* Gradient overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-black/20 to-transparent transition-opacity duration-300 ${
                          index === currentImageIndex ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                        }`} />
                      </div>
                      
                      {/* Focus indicator */}
                      {index === currentImageIndex && (
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-xl blur-sm" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Fade edges for overflow indication */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}