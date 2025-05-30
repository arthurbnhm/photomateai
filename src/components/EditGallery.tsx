"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { MediaFocus } from "@/components/MediaFocus"
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useAuth } from "@/contexts/AuthContext"

// Define the type for edit image generation with edited images
export type EditImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  editedImages: EditImage[]
  images: EditImage[]
  aspectRatio: string
  format?: string
  modelDisplayName?: string
  sourceImageUrl?: string
  sourcePredictionId?: string
}

// Define a type for edit image
export type EditImage = {
  url: string
  isExpired: boolean
  loadError?: boolean
  isLiked?: boolean
  generationId?: string // Add generation ID for proper tracking
  editPrompt?: string // Store the edit prompt for this image
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
  is_edit: boolean
  source_image_url?: string
  source_prediction_id?: string
  format?: string
  input?: {
    output_format?: string
  }
  model_id: string | null
}

// Define the type for image viewing
type ImageViewerState = {
  isOpen: boolean
  currentGeneration: EditImageGeneration | null
  currentImageIndex: number
  allEditedImages: EditImage[]
}

export function EditGallery() {
  const [editGenerations, setEditGenerations] = useState<EditImageGeneration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  
  const { user } = useAuth()
  
  const [imageViewer, setImageViewer] = useState<ImageViewerState>({
    isOpen: false,
    currentGeneration: null,
    currentImageIndex: 0,
    allEditedImages: []
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

  // Process edit images from prediction data
  const processEditImages = (storageUrls: string[] | null, likedImages: string[] | null, editPrompt: string): EditImage[] => {
    if (!storageUrls || !Array.isArray(storageUrls)) {
      return []
    }
    
    return storageUrls.map(url => ({
      url,
      isExpired: false,
      isLiked: likedImages?.includes(url) || false,
      editPrompt: editPrompt
    }))
  }

  // Fetch edit images from Supabase
  const loadEditGenerations = useCallback(async (silentUpdate: boolean = false) => {
    if (!user) {
      setIsLoading(false)
      setEditGenerations([])
      return
    }

    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 10000)

    if (!silentUpdate) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const response = await fetch('/api/predictions?is_deleted=false&status=succeeded&is_edit=true&limit=50', {
        signal: abortController.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch edit predictions: ${response.status} ${response.statusText}`);
      }
      
      const { success, predictions, error: apiError } = await response.json();
      
      if (!success) {
        throw new Error(apiError || 'Failed to fetch edit predictions');
      }
      
      if (predictions) {
        const processedData: EditImageGeneration[] = predictions
          .filter((item: PredictionData) => {
            const editImages = processEditImages(item.storage_urls, item.liked_images || null, item.prompt)
            return editImages.length > 0 // Only include edits that have images
          })
          .map((item: PredictionData) => {
            const editImages = processEditImages(item.storage_urls, item.liked_images || null, item.prompt)
            return {
              id: item.id,
              replicate_id: item.replicate_id,
              prompt: item.prompt,
              timestamp: item.created_at,
              editedImages: editImages,
              images: editImages,
              aspectRatio: item.aspect_ratio,
              format: item.format || item.input?.output_format || 'webp',
              modelDisplayName: 'flux-kontext-pro', // Edit model is always flux-kontext-pro
              sourceImageUrl: item.source_image_url,
              sourcePredictionId: item.source_prediction_id
            }
          })
        
        setEditGenerations(processedData)
      }
      
    } catch (fetchError: unknown) { 
      clearTimeout(timeoutId)
      console.error("Error fetching edit generations:", fetchError)

      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          console.warn('Fetch edits aborted due to timeout')
        } else {
          setError(`Failed to load edits: ${fetchError.message}`)
        }
      } else {
        setError('An unknown error occurred while loading edits.')
      }
    } finally {
      if (!silentUpdate) {
        setIsLoading(false)
      }
    }
  }, [user])

  // Initial data load
  useEffect(() => {
    if (isMounted) {
      loadEditGenerations(false)
    }
  }, [isMounted, loadEditGenerations])

  // Toggle favorite status
  const toggleImageFavorite = async (generationId: string, imageUrl: string, currentLikedStatus: boolean) => {
    try {
      const newLikedStatus = !currentLikedStatus;
      
      // Optimistic update
      setEditGenerations(prevGens =>
        prevGens.map(gen => {
          if (gen.id !== generationId) {
            return gen;
          }
          
          const newEditedImages = gen.editedImages.map(img => {
            if (img.url === imageUrl) {
              return { ...img, isLiked: newLikedStatus };
            }
            return img;
          });
          
          return { ...gen, editedImages: newEditedImages, images: newEditedImages };
        })
      );

      // API call
      const response = await fetch('/api/favorite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          predictionId: generationId,
          imageUrl: imageUrl,
          isLiked: newLikedStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update favorite status')
      }

    } catch (error) {
      console.error('Error toggling favorite:', error)
      
      // Revert optimistic update on error
      setEditGenerations(prevGens =>
        prevGens.map(gen => {
          if (gen.id !== generationId) {
            return gen;
          }
          
          const newEditedImages = gen.editedImages.map(img => {
            if (img.url === imageUrl) {
              return { ...img, isLiked: currentLikedStatus };
            }
            return img;
          });
          
          return { ...gen, editedImages: newEditedImages, images: newEditedImages };
        })
      );
    }
  };

  const handleImageError = (generationId: string, imageIndex: number) => {
    setEditGenerations(prevGens =>
      prevGens.map(gen => {
        if (gen.id !== generationId) {
          return gen
        }

        const newEditedImages = gen.editedImages.map((img, idx) => {
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

        return { ...gen, editedImages: newEditedImages, images: newEditedImages }
      })
    )
  }

  const openImageViewer = (generation: EditImageGeneration, imageIndex: number) => {
    // Create a flattened array of all edited images with generation ID and edit prompt
    const allEditedImages = editGenerations.flatMap(gen => 
      gen.editedImages.map(img => ({
        ...img,
        generationId: gen.id // Add generation ID so MediaFocus knows which generation this image belongs to
      }))
    )
    
    // Calculate the correct index in the flattened array
    let flattenedIndex = 0
    for (const gen of editGenerations) {
      if (gen.id === generation.id) {
        flattenedIndex += imageIndex
        break
      }
      flattenedIndex += gen.editedImages.length
    }
    
    setImageViewer({
      isOpen: true,
      currentGeneration: generation,
      currentImageIndex: flattenedIndex,
      allEditedImages: allEditedImages
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
        allImages={imageViewer.allEditedImages}
        onUpdateGeneration={(updatedGeneration) => {
          // Convert ImageGeneration to EditImageGeneration and update state
          setEditGenerations(prevGens =>
            prevGens.map(gen => {
              if (gen.id === updatedGeneration.id) {
                // Create a new EditImageGeneration with updated images
                const updatedEditGen: EditImageGeneration = {
                  ...gen,
                  images: updatedGeneration.images,
                  editedImages: updatedGeneration.images as EditImage[]
                }
                return updatedEditGen
              }
              return gen
            })
          )
          
          // Also update the imageViewer if this is the currently viewed generation
          setImageViewer(prev => {
            if (prev.currentGeneration?.id === updatedGeneration.id) {
              // Convert to EditImageGeneration for the viewer
              const updatedEditGen: EditImageGeneration = {
                ...prev.currentGeneration,
                images: updatedGeneration.images,
                editedImages: updatedGeneration.images as EditImage[]
              }
              
              // Also update the allEditedImages array
              const updatedAllEdited = editGenerations.flatMap(gen => 
                gen.id === updatedGeneration.id 
                  ? updatedGeneration.images.map(img => ({
                      ...img,
                      generationId: gen.id, // Add generation ID
                      editPrompt: gen.prompt // Add edit prompt
                    })) as EditImage[]
                  : gen.editedImages.map(img => ({
                      ...img,
                      generationId: gen.id // Add generation ID
                    }))
              )
              
              return {
                ...prev,
                currentGeneration: updatedEditGen,
                allEditedImages: updatedAllEdited
              }
            }
            return prev
          })
        }}
      />
      
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 via-indigo-50 to-violet-50 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-violet-950/20 border border-purple-100 dark:border-purple-900/20 p-8 mb-8">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/5 to-violet-500/5"></div>
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-full blur-xl"></div>
        
        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-lg border border-purple-200/50 dark:border-purple-800/50">
              <Sparkles className="h-8 w-8 text-purple-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Your AI Edits
              </h1>
              <p className="text-muted-foreground mt-1">
                Your collection of AI-transformed and enhanced images
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
          <Button onClick={() => loadEditGenerations(false)} variant="link" className="mt-2">Try again</Button>
        </div>
      ) : editGenerations.length === 0 ? (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No edited images yet.</p>
          <p className="text-sm text-muted-foreground/80 mt-2">
            Start creating AI edits to see them here!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {editGenerations.flatMap((generation) =>
            generation.editedImages.map((image, index) => (
              <div 
                key={`${generation.id}-edited-img-${index}`}
                className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer"
                onClick={() => {
                  if (!image.isExpired) { 
                    openImageViewer(generation, index)
                  }
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                
                {/* Heart Icon for Favorite */}
                <button
                  className={`absolute top-2 right-2 z-20 p-2 transition-all duration-300 group-hover:scale-110 rounded-lg backdrop-blur-sm shadow-lg hover:shadow-xl border ${
                    image.isLiked 
                      ? "bg-red-500/90 hover:bg-red-500 border-red-400/50 hover:border-red-300" 
                      : "bg-black/20 hover:bg-black/40 border-white/20 hover:border-white/40"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleImageFavorite(generation.id, image.url, image.isLiked || false)
                  }}
                  aria-label={image.isLiked ? "Remove from favorites" : "Add to favorites"}
                  title={image.isLiked ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill={image.isLiked ? "currentColor" : "none"} 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className={`transition-all duration-300 ${
                      image.isLiked 
                        ? "text-white" 
                        : "text-white hover:text-red-300 hover:fill-red-300/20"
                    }`}
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
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
                    alt={`AI Edit: ${image.editPrompt || 'Edited image'}`}
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