"use client"

import React, { useEffect, useRef, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import NextImage from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch"

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
  const transformComponentRef = useRef<ReactZoomPanPinchRef>(null)
  
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
  
  // Lock body scroll when viewer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Prevent browser zoom on open
      document.body.style.touchAction = 'none'
      
      return () => {
        document.body.style.overflow = ''
        document.body.style.touchAction = ''
      }
    }
  }, [isOpen])
  
  // Reset zoom when image changes
  useEffect(() => {
    if (transformComponentRef.current) {
      transformComponentRef.current.resetTransform()
    }
  }, [currentImageIndex])
  
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex flex-col items-center justify-center z-[99999] bg-background"
          onClick={onClose}
        >
          {/* Top bar */}
          <div 
            className="absolute top-0 w-full flex items-center justify-between z-20 p-4"
            onClick={(e) => e.stopPropagation()}
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
          <div className="flex-1 w-full flex items-center justify-center px-4 pb-32" onClick={(e) => e.stopPropagation()}>
            <TransformWrapper
              ref={transformComponentRef}
              initialScale={1}
              initialPositionX={0}
              initialPositionY={0}
              minScale={0.5}
              maxScale={5}
              wheel={{ 
                wheelDisabled: isMobile,
                step: 0.2,
                activationKeys: [],
                excluded: ["button", "svg"]
              }}
              pinch={{ 
                disabled: false,
                step: 0.2
              }}
              doubleClick={{ mode: "toggle" }}
              panning={{ excluded: ["button", "svg"] }}
              centerOnInit={true}
              centerZoomedOut={true}
              limitToBounds={false}
              velocityAnimation={{
                sensitivity: 1,
                animationTime: 200,
              }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  {/* Desktop zoom controls */}
                  {!isMobile && (
                    <div className="absolute top-20 right-4 flex flex-col gap-2 z-20">
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
                          resetTransform()
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
                  
                  <TransformComponent
                    wrapperStyle={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    contentStyle={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: "100%",
                    }}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "fit-content",
                      height: "fit-content",
                      maxWidth: "100%",
                      maxHeight: "100%",
                    }}>
                      <NextImage
                        src={currentImage.url}
                        alt={`Generated image for "${currentGeneration.prompt}"`}
                        className="object-contain select-none"
                        width={1024}
                        height={1024}
                        style={{ 
                          maxWidth: '90vw',
                          maxHeight: '60vh',
                          width: 'auto', 
                          height: 'auto'
                        }}
                        priority={true}
                        unoptimized={true}
                        draggable={false}
                      />
                    </div>
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          </div>
          
          {/* Navigation arrows */}
          <Button 
            onClick={prevImage}
            variant="outline"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button 
            onClick={nextImage}
            variant="outline"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {/* Thumbnails */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-background/80 backdrop-blur-md border-t border-border/50" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              {/* Thumbnail strip */}
              <div className="relative">
                <div 
                  ref={thumbnailContainerRef} 
                  className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 pt-2 justify-center"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
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