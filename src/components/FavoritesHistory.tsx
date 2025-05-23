"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { MediaFocus } from "@/components/MediaFocus"
import { AlertTriangle, Heart } from 'lucide-react'
import { useAuth } from "@/contexts/AuthContext"

// Define the type for image generation with liked images
export type FavoriteImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  likedImages: FavoriteImage[]
  images: FavoriteImage[]
  aspectRatio: string
  format?: string
  modelDisplayName?: string
}

// Define a type for favorite image
export type FavoriteImage = {
  url: string
  isExpired: boolean
  loadError?: boolean
  isLiked?: boolean
  generationId?: string // Add generation ID for proper tracking
}

// Define a type for prediction data from Supabase
type PredictionData = {
  id: string
  replicate_id: string
  prompt: string
  aspect_ratio: string
  status: string
  storage_urls: string[] | null
  liked_images?: string[] | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  is_deleted: boolean
  is_cancelled: boolean
  format?: string
  input?: {
    output_format?: string
  }
  model_id: string
  models?: {
    display_name: string
  } | null
}

// Define the type for image viewing
type ImageViewerState = {
  isOpen: boolean
  currentGeneration: FavoriteImageGeneration | null
  currentImageIndex: number
  allFavoriteImages: FavoriteImage[]
}

export function FavoritesHistory() {
  const [favoriteGenerations, setFavoriteGenerations] = useState<FavoriteImageGeneration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  
  const supabaseClient = useRef(createSupabaseBrowserClient())
  const { user } = useAuth()
  
  const [imageViewer, setImageViewer] = useState<ImageViewerState>({
    isOpen: false,
    currentGeneration: null,
    currentImageIndex: 0,
    allFavoriteImages: []
  })

  useEffect(() => {
    setIsMounted(true)
    return () => {
      setIsMounted(false)
    }
  }, [])

  useEffect(() => {
    if (imageViewer.isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [imageViewer.isOpen])

  // Process favorite images from prediction data
  const processFavoriteImages = (storageUrls: string[] | null, likedImages: string[] | null): FavoriteImage[] => {
    if (!storageUrls || !likedImages || !Array.isArray(storageUrls) || !Array.isArray(likedImages)) {
      return []
    }
    
    // Only return images that are in the liked images array
    return storageUrls
      .filter(url => likedImages.includes(url))
      .map(url => ({
        url,
        isExpired: false
      }))
  }

  // Fetch favorite images from Supabase
  const loadFavoriteGenerations = useCallback(async (silentUpdate: boolean = false) => {
    if (!user) {
      setIsLoading(false)
      setFavoriteGenerations([])
      return
    }

    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 10000)

    if (!silentUpdate) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const { data, error: fetchError } = await supabaseClient.current
        .from('predictions')
        .select(`
          *,
          models:model_id (
            display_name
          )
        `)
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('status', 'succeeded')
        .not('liked_images', 'is', null) // Only get predictions that have liked images
        .order('created_at', { ascending: false })
        .limit(50)
        .abortSignal(abortController.signal)
      
      clearTimeout(timeoutId)
      
      if (fetchError) {
        throw fetchError
      }
      
      if (data) {
        const processedData: FavoriteImageGeneration[] = data
          .filter((item: PredictionData) => {
            const likedImages = processFavoriteImages(item.storage_urls, item.liked_images || null)
            return likedImages.length > 0 // Only include generations that actually have liked images
          })
          .map((item: PredictionData) => {
            const likedImages = processFavoriteImages(item.storage_urls, item.liked_images || null)
            const modelDisplayName = item.models?.display_name || 'Default Model'
            return {
              id: item.id,
              replicate_id: item.replicate_id,
              prompt: item.prompt,
              timestamp: item.created_at,
              likedImages: likedImages,
              images: likedImages,
              aspectRatio: item.aspect_ratio,
              format: item.format || item.input?.output_format || 'webp',
              modelDisplayName: modelDisplayName
            }
          })
        
        setFavoriteGenerations(processedData)
      }
      
    } catch (fetchError: unknown) { 
      clearTimeout(timeoutId)
      console.error("Error fetching favorite generations:", fetchError)

      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          console.warn('Fetch favorites aborted due to timeout')
        } else {
          setError(`Failed to load favorites: ${fetchError.message}`)
        }
      } else {
        setError('An unknown error occurred while loading favorites.')
      }
    } finally {
      if (!silentUpdate) {
        setIsLoading(false)
      }
    }
  }, [user, supabaseClient])

  // Initial data load
  useEffect(() => {
    if (isMounted) {
      loadFavoriteGenerations(false)
    }
  }, [isMounted, loadFavoriteGenerations])

  // Remove from favorites
  const removeFavorite = async (generationId: string, imageUrl: string) => {
    try {
      // Optimistic update - remove the image from local state
      setFavoriteGenerations(prevGens =>
        prevGens.map(gen => {
          if (gen.id !== generationId) {
            return gen
          }
          
          const newLikedImages = gen.likedImages.filter(img => img.url !== imageUrl)
          return { ...gen, likedImages: newLikedImages }
        }).filter(gen => gen.likedImages.length > 0) // Remove generations with no liked images
      )

      // API call
      const response = await fetch('/api/favorite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          predictionId: generationId,
          imageUrl: imageUrl,
          isLiked: false,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to remove from favorites')
      }

      // toast.success('Removed from favorites')

    } catch (error) {
      console.error('Error removing favorite:', error)
      
      // Reload data to restore correct state
      loadFavoriteGenerations(true)
      
      // toast.error('Failed to remove from favorites')
    }
  }

  const handleImageError = (generationId: string, imageIndex: number) => {
    setFavoriteGenerations(prevGens =>
      prevGens.map(gen => {
        if (gen.id !== generationId) {
          return gen
        }

        const newLikedImages = gen.likedImages.map((img, idx) => {
          if (idx !== imageIndex) {
            return img
          }

          if (!img) {
            return {
              url: "",
              isExpired: true,
              loadError: true,
            }
          }

          if (img.loadError) {
            return img
          }

          return { ...img, loadError: true }
        })

        return { ...gen, likedImages: newLikedImages }
      })
    )
  }

  const openImageViewer = (generation: FavoriteImageGeneration, imageIndex: number) => {
    // Create a flattened array of all favorite images with isLiked: true and generation ID
    const allFavoriteImages = favoriteGenerations.flatMap(gen => 
      gen.likedImages.map(img => ({
        ...img,
        isLiked: true, // Ensure all favorite images are marked as liked
        generationId: gen.id // Add generation ID so MediaFocus knows which generation this image belongs to
      }))
    )
    
    // Calculate the correct index in the flattened array
    let flattenedIndex = 0
    for (const gen of favoriteGenerations) {
      if (gen.id === generation.id) {
        flattenedIndex += imageIndex
        break
      }
      flattenedIndex += gen.likedImages.length
    }
    
    setImageViewer({
      isOpen: true,
      currentGeneration: generation,
      currentImageIndex: flattenedIndex,
      allFavoriteImages: allFavoriteImages
    })
  }

  const closeImageViewer = useCallback(() => {
    setImageViewer(prev => ({ ...prev, isOpen: false }))
  }, [])

  const handleNavigate = useCallback((newIndex: number) => {
    setImageViewer(prev => ({ ...prev, currentImageIndex: newIndex }))
  }, [])

  return (
    <div className="w-full space-y-6">
      <Toaster />
      
      <MediaFocus 
        isOpen={imageViewer.isOpen}
        currentGeneration={imageViewer.currentGeneration}
        currentImageIndex={imageViewer.currentImageIndex}
        onClose={closeImageViewer}
        onNavigate={handleNavigate}
        allImages={imageViewer.allFavoriteImages}
        onUpdateGeneration={(updatedGeneration) => {
          // Convert ImageGeneration to FavoriteImageGeneration and update state
          setFavoriteGenerations(prevGens =>
            prevGens.map(gen => {
              if (gen.id === updatedGeneration.id) {
                // Create a new FavoriteImageGeneration with updated images
                const updatedFavoriteGen: FavoriteImageGeneration = {
                  ...gen,
                  images: updatedGeneration.images,
                  likedImages: updatedGeneration.images.filter(img => img.isLiked) as FavoriteImage[]
                }
                return updatedFavoriteGen
              }
              return gen
            }).filter(gen => gen.likedImages.length > 0) // Remove generations with no liked images
          )
          
          // Also update the imageViewer if this is the currently viewed generation
          setImageViewer(prev => {
            if (prev.currentGeneration?.id === updatedGeneration.id) {
              // Convert to FavoriteImageGeneration for the viewer
              const updatedFavoriteGen: FavoriteImageGeneration = {
                ...prev.currentGeneration,
                images: updatedGeneration.images,
                likedImages: updatedGeneration.images.filter(img => img.isLiked) as FavoriteImage[]
              }
              
              // Also update the allFavoriteImages array
              const updatedAllFavorites = favoriteGenerations.flatMap(gen => 
                gen.id === updatedGeneration.id 
                  ? updatedGeneration.images.filter(img => img.isLiked).map(img => ({
                      ...img,
                      isLiked: true, // Ensure all favorite images are marked as liked
                      generationId: gen.id // Add generation ID
                    })) as FavoriteImage[]
                  : gen.likedImages.map(img => ({
                      ...img,
                      isLiked: true, // Ensure all favorite images are marked as liked
                      generationId: gen.id // Add generation ID
                    }))
              )
              
              return {
                ...prev,
                currentGeneration: updatedFavoriteGen,
                allFavoriteImages: updatedAllFavorites
              }
            }
            return prev
          })
        }}
      />
      
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 dark:from-red-950/20 dark:via-pink-950/20 dark:to-rose-950/20 border border-red-100 dark:border-red-900/20 p-8 mb-8">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-pink-500/5 to-rose-500/5"></div>
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-red-500/10 to-pink-500/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-full blur-xl"></div>
        
        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-lg border border-red-200/50 dark:border-red-800/50">
              <Heart className="h-8 w-8 text-red-500 fill-current" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 via-pink-600 to-rose-600 bg-clip-text text-transparent">
                Your Favorite Images
              </h1>
              <p className="text-muted-foreground mt-1">
                Your curated collection of beloved AI-generated artwork
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {isLoading ? (
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={`skel-gen-${i}`} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-12 rounded-md" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={`skel-img-${j}`} className="aspect-square rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => loadFavoriteGenerations(false)} variant="link" className="mt-2">Try again</Button>
        </div>
      ) : favoriteGenerations.length === 0 ? (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No favorite images yet.</p>
          <p className="text-sm text-muted-foreground/80 mt-2">
            Click the heart icon on any image to add it to your favorites!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {favoriteGenerations.flatMap((generation) =>
            generation.likedImages.map((image, index) => (
              <div 
                key={`${generation.id}-liked-img-${index}`}
                className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer"
                onClick={() => {
                  if (!image.isExpired) { 
                    openImageViewer(generation, index)
                  }
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                
                {/* Remove from Favorites Button */}
                <button
                  className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/20 backdrop-blur-sm hover:bg-black/40 transition-all duration-200 group-hover:scale-110"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFavorite(generation.id, image.url)
                  }}
                  aria-label="Remove from favorites"
                  title="Remove from favorites"
                >
                  <Heart className="h-4 w-4 text-red-500 fill-current" />
                </button>
                
                {image.isExpired ? (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <p className="text-sm text-muted-foreground">Image unavailable</p>
                  </div>
                ) : image.loadError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-destructive/10">
                    <AlertTriangle className="h-8 w-8 text-destructive/70" />
                    <p className="text-xs text-destructive/90 mt-1">Load error</p>
                  </div>
                ) : (
                  <Image 
                    src={image.url} 
                    alt={`Favorite image ${index + 1} for "${generation.prompt}"`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    onError={() => handleImageError(generation.id, index)}
                    loading="lazy"
                    unoptimized={true}
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
} 