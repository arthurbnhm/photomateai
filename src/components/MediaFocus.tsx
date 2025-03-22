"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import NextImage from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { createBrowserSupabaseClient } from "@/lib/supabase"

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
  format?: string      // Add format from prediction
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
  const [mounted, setMounted] = React.useState(false)
  const supabase = createBrowserSupabaseClient()
  
  // Handle mounting for portal
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])
  
  // Lock body scroll when viewer is open
  useEffect(() => {
    if (isOpen) {
      // Simply prevent scrolling without changing document position
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden' // Also lock html element
      
      return () => {
        // Just restore scrolling when done
        document.body.style.overflow = ''
        document.documentElement.style.overflow = ''
      }
    }
  }, [isOpen])
  
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
  const nextImage = useCallback(() => {
    if (!currentGeneration) return
    const totalImages = currentGeneration.images.length
    onNavigate((currentImageIndex + 1) % totalImages)
  }, [currentGeneration, currentImageIndex, onNavigate]);

  const prevImage = useCallback(() => {
    if (!currentGeneration) return
    const totalImages = currentGeneration.images.length
    onNavigate((currentImageIndex - 1 + totalImages) % totalImages)
  }, [currentGeneration, currentImageIndex, onNavigate]);
  
  // Simplified preloading that immediately preloads all images in the current generation
  useEffect(() => {
    if (isOpen && currentGeneration) {
      // Force immediate load of all images in this generation
      currentGeneration.images.forEach(image => {
        if (!image.isExpired) {
          const img = new Image();
          img.src = image.url;
        }
      });
    }
  }, [isOpen, currentGeneration]);
  
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
  const downloadImage = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!currentGeneration || !currentGeneration.images[currentImageIndex]) return
    
    try {
      const imageUrl = currentGeneration.images[currentImageIndex].url

      // Extract the path from the signed URL
      // The URL format is like: https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>
      const url = new URL(imageUrl)
      const pathSegments = url.pathname.split('/')
      const bucketIndex = pathSegments.findIndex(segment => segment === 'sign') + 2
      if (bucketIndex >= pathSegments.length) {
        throw new Error('Invalid storage URL format')
      }
      const path = pathSegments.slice(bucketIndex).join('/')
      
      // Get the original filename from the path
      const filename = path.split('/').pop() || 'image'

      // Download directly from Supabase storage
      const { data: blob, error } = await supabase.storage
        .from('images')
        .download(path)

      if (error) {
        throw error
      }

      // Check if we should use mobile share
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (isMobile && navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: blob.type })
          const shareData = { files: [file] }
          
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData)
            toast.success('Image shared successfully')
            return
          }
        } catch (shareError: unknown) {
          if (shareError && typeof shareError === 'object' && 'name' in shareError && shareError.name === 'AbortError') {
            console.log('Share cancelled by user')
            return
          }
          // If sharing fails, fall back to regular download
          console.error('Error sharing:', shareError)
        }
      }

      // Regular download flow
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

  // If not mounted or not open or no generation, return null
  if (!mounted || !isOpen || !currentGeneration) return null

  // Render modal content inside a portal
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex flex-col items-center justify-center z-[99999]"
          onClick={onClose}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Theme-aware backdrop overlay */}
          <div 
            className="absolute inset-0 bg-background" 
            aria-hidden="true"
          />
          
          {/* Main content container */}
          <div 
            className="relative flex flex-col items-center justify-between w-full h-full z-10 px-2 sm:px-[3vw] md:px-[4vw] lg:px-[5vw] py-2 sm:py-[2vh] md:py-[3vh]"
          >
            {/* Top bar with counter and controls */}
            <div 
              className="w-full flex items-center justify-between z-20 px-2 sm:px-[2vw] md:px-[3vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-muted py-1 sm:py-[1vh] px-2 sm:px-4 rounded-full text-xs sm:text-sm font-medium text-foreground">
                {currentImageIndex + 1} / {currentGeneration.images.length}
              </div>
              
              <div className="flex gap-2 sm:gap-[2vw]">
                <Button 
                  onClick={downloadImage}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 sm:h-[5vh] sm:w-[5vh] sm:min-h-[2.5rem] sm:min-w-[2.5rem]"
                >
                  <Download className="h-[40%] w-[40%]" />
                </Button>
                
                <Button 
                  onClick={(e) => { e.stopPropagation(); onClose(); }}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 sm:h-[5vh] sm:w-[5vh] sm:min-h-[2.5rem] sm:min-w-[2.5rem]"
                >
                  <X className="h-[40%] w-[40%]" />
                </Button>
              </div>
            </div>
            
            {/* Middle section with image and navigation */}
            <div 
              className="flex-1 w-full flex items-center justify-center relative my-2 sm:my-[3vh] md:my-[4vh] lg:my-[5vh]"
            >
              {/* Main image */}
              <motion.div
                key={currentImageIndex}
                className="relative rounded-md overflow-hidden lg:max-h-[75vh] xl:max-h-[80vh]"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                style={{
                  maxWidth: '95vw',
                  maxHeight: '60vh',
                  width: '100%',
                  height: '100%'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <NextImage
                  src={currentGeneration.images[currentImageIndex].url}
                  alt={`Generated image for "${currentGeneration.prompt}"`}
                  className="object-contain rounded-md lg:max-h-[75vh] xl:max-h-[80vh]"
                  width={1024}
                  height={1024}
                  style={{ 
                    maxWidth: '100%',
                    maxHeight: '60vh',
                    width: 'auto', 
                    height: 'auto',
                    margin: '0 auto'
                  }}
                  onError={(e) => {
                    console.error("Image failed to load:", e);
                    toast.error("Image could not be loaded");
                  }}
                  unoptimized={true}
                  priority={true}
                />
              </motion.div>
              
              {/* Left/Right arrows */}
              <div className="absolute inset-x-0 w-full flex items-center justify-between px-1 sm:px-[1vw] md:px-[2vw] lg:px-[3vw]">
                <Button 
                  onClick={(e) => { e.stopPropagation(); prevImage(); }}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 sm:h-[5vh] sm:w-[5vh] sm:min-h-[2.5rem] sm:min-w-[2.5rem] z-30"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-[40%] w-[40%]" />
                </Button>
                
                <Button 
                  onClick={(e) => { e.stopPropagation(); nextImage(); }}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 sm:h-[5vh] sm:w-[5vh] sm:min-h-[2.5rem] sm:min-w-[2.5rem] z-30"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-[40%] w-[40%]" />
                </Button>
              </div>
            </div>
            
            {/* Bottom section with thumbnails - no background */}
            <div 
              className="w-full z-20 px-2 sm:px-[2vw] md:px-[3vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto py-2 sm:py-[2vh] rounded-lg overflow-x-auto">
                <div className="flex items-center gap-2 sm:gap-[1vw] md:gap-[2vw] justify-center">
                  {currentGeneration.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => onNavigate(index)}
                      className={`w-12 h-12 sm:w-[15vw] sm:h-[15vw] max-w-16 max-h-16 sm:max-w-[5rem] sm:max-h-[5rem] min-w-[3rem] min-h-[3rem] 
                                  rounded-md overflow-hidden border border-input bg-background 
                                  flex-shrink-0 transition relative ${
                        index === currentImageIndex ? 'ring-2 ring-ring/50 scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                      aria-label={`View image ${index + 1}`}
                      aria-current={index === currentImageIndex ? 'true' : 'false'}
                    >
                      <AspectRatio ratio={1} className="h-full w-full">
                        <NextImage 
                          src={image.url} 
                          alt={`Thumbnail ${index + 1}`}
                          className="object-cover"
                          fill
                          sizes="(max-width: 640px) 12vw, 15vw"
                          priority={true}
                          loading="eager"
                          unoptimized={true}
                        />
                      </AspectRatio>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}