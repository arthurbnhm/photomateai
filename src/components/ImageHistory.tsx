"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { MediaFocus } from "@/components/MediaFocus"
import { AlertTriangle } from 'lucide-react';

// Define the type for image generation (now passed as prop)
export type ImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
  format?: string
  modelDisplayName?: string
}

// Define the type for pending generations (already passed as prop)
export type PendingGeneration = {
  id: string
  replicate_id?: string
  prompt: string
  aspectRatio: string
  startTime?: string
  format?: string
  modelDisplayName?: string
}

// Define a type for image with status (now passed as prop)
export type ImageWithStatus = {
  url: string
  isExpired: boolean
  loadError?: boolean;
  isLiked?: boolean; // Add liked status for individual images
  generationId?: string; // Add generation ID for favorites page consistency
  // errorCount?: number; // Alternative for controlled retries, not used in this version
}

// Define a type for prediction data from Supabase (used in polling logic)
// This might still be needed if polling logic remains complex here
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
  currentGeneration: ImageGeneration | null
  currentImageIndex: number
}

// Define props for ImageHistory
interface ImageHistoryProps {
  generations: ImageGeneration[];
  setGenerations: React.Dispatch<React.SetStateAction<ImageGeneration[]>>;
  isLoading: boolean;
  error: string | null;
  loadGenerations: (silentUpdate?: boolean) => Promise<void>;
  pendingGenerations: PendingGeneration[];
  setPendingGenerations: React.Dispatch<React.SetStateAction<PendingGeneration[]>>;
  setPromptValue: (value: string) => void;
}

export function ImageHistory({ 
  generations, 
  setGenerations, 
  isLoading, 
  error, 
  loadGenerations, 
  pendingGenerations, 
  setPendingGenerations, 
  setPromptValue 
}: ImageHistoryProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState<string | null>(null)
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({}) 
  const [isMounted, setIsMounted] = useState(false)
  
  const supabaseClient = useRef(createSupabaseBrowserClient()); // Still needed for polling and delete/cancel
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [imageViewer, setImageViewer] = useState<ImageViewerState>({
    isOpen: false,
    currentGeneration: null,
    currentImageIndex: 0
  })

  useEffect(() => {
    setIsMounted(true)
    return () => {
      setIsMounted(false)
    }
  }, [])

  useEffect(() => {
    if (imageViewer.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [imageViewer.isOpen]);

  // Polling mechanism for pending generations
  useEffect(() => {
    if (!isMounted || pendingGenerations.length === 0) return;
    
    const shouldStartPolling = () => {
      const now = Date.now();
      return pendingGenerations.some(gen => {
        if (!gen.startTime) return false;
        const startTime = new Date(gen.startTime).getTime();
        return (now - startTime) >= 10000; // Check after 10 seconds (was 30s)
      });
    };
    
    const checkPendingGenerations = async () => {
      try {
        if (!shouldStartPolling()) return;
        
        const replicateIds = pendingGenerations
          .filter(gen => gen.replicate_id)
          .map(gen => gen.replicate_id as string);
        
        if (replicateIds.length === 0) return;

        if (!supabaseClient.current) {
          console.error("Supabase client not initialized in ImageHistory polling");
          return;
        }
        
        const abortController = new AbortController();
        const fetchTimeoutId = setTimeout(() => abortController.abort(), 5000);
        
        try {
          const { data, error: fetchDbError } = await supabaseClient.current!
            .from('predictions')
            .select(`
              *,
              models:model_id (
                display_name
              )
            `)
            .in('replicate_id', replicateIds)
            .abortSignal(abortController.signal);
            
          clearTimeout(fetchTimeoutId);
            
          if (fetchDbError) {
            throw fetchDbError;
          }
          
          if (data && data.length > 0) {
            let shouldRefreshParentGenerations = false;
            
            data.forEach((prediction: PredictionData) => {
              const matchingPending = pendingGenerations.find(p => 
                p.replicate_id === prediction.replicate_id
              );
              
              if (matchingPending) {
                if (prediction.status === 'succeeded' && prediction.storage_urls) {
                  // The parent component (CreatePageContent) is responsible for updating `generations`.
                  // We can call loadGenerations(true) to ask the parent to refresh.
                  shouldRefreshParentGenerations = true;
                  
                  // Remove from local pendingGenerations state in ImageHistory
                  setPendingGenerations(prev => 
                    prev.filter(g => g.id !== matchingPending.id)
                  );
                } else if (prediction.status === 'failed' || prediction.is_cancelled) {
                  if (prediction.error) {
                    toast.error(`Generation failed: ${prediction.error}`);
                  }
                  setPendingGenerations(prev => 
                    prev.filter(g => g.id !== matchingPending.id)
                  );
                } else {
                  setElapsedTimes(prev => ({
                    ...prev,
                    [matchingPending.id]: Math.floor((Date.now() - new Date(matchingPending.startTime || '').getTime()) / 1000)
                  }));
                }
              } else {
                shouldRefreshParentGenerations = true;
              }
            });
            
            if (shouldRefreshParentGenerations) {
              loadGenerations(true); // Call prop to refresh parent's generation list
            }
          }
        } catch (fetchError: unknown) {
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.warn('Polling fetch aborted due to timeout');
          } else {
            throw fetchError;
          }
        } finally {
          clearTimeout(fetchTimeoutId);
        }
      } catch (err) {
        console.error('Error checking pending generations:', err);
      }
    };
    
    const pollInterval = 5000;
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(checkPendingGenerations, pollInterval);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(checkPendingGenerations, 1000);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isMounted, pendingGenerations, loadGenerations, setPendingGenerations, supabaseClient]); // Added supabaseClient dependency

  // Update UI when generations prop changes (from parent)
  useEffect(() => {
    if (generations.length > 0 && pendingGenerations.length > 0) {
      const completedIds = generations.map(gen => gen.id);
      const pendingToRemove = pendingGenerations.filter(pending => 
        completedIds.includes(pending.id)
      );
      
      if (pendingToRemove.length > 0) {
        setPendingGenerations(prev => 
          prev.filter(gen => !pendingToRemove.some(p => p.id === gen.id))
        );
      }
    }
  }, [generations, pendingGenerations, setPendingGenerations]);

  // Update elapsed times (remains the same)
  useEffect(() => {
    if (pendingGenerations.length === 0) return;
    
    const updateElapsedTimes = () => {
      const now = Date.now();
      const updatedTimes: Record<string, number> = {};
      pendingGenerations.forEach(gen => {
        if (gen.startTime) {
          const startTime = new Date(gen.startTime).getTime();
          const elapsedSeconds = Math.floor((now - startTime) / 1000);
          updatedTimes[gen.id] = elapsedSeconds;
        }
      });
      setElapsedTimes(updatedTimes);
    };
    
    updateElapsedTimes();
    const interval = setInterval(updateElapsedTimes, 1000);
    return () => clearInterval(interval);
  }, [pendingGenerations]);

  const sendDeleteRequest = async (replicateId: string, storageUrls?: string[]): Promise<boolean> => {
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 15000);
      
      try {
        const deleteResponse = await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: storageUrls, replicateId }),
          signal: abortController.signal
        });
        clearTimeout(timeoutId);
        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Error deleting generation:', errorData);
          return false;
        }
        const responseData = await deleteResponse.json();
        if (!responseData.storageDeleteSuccess && responseData.databaseUpdateSuccess) {
          console.warn('Some files may not have been deleted from storage, but the record was marked as deleted');
        }
        return responseData.databaseUpdateSuccess;
      } catch (fetchError: unknown) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.warn('Delete operation aborted due to timeout');
          return false;
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error('Error sending delete request:', error);
      return false;
    }
  };

  const cancelGeneration = async (id: string, replicateId?: string): Promise<boolean> => {
    try {
      const predictionId = replicateId || id;
      const response = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error cancelling prediction:', errorData);
        return false;
      }

      // Remove from pendingGenerations state (local to ImageHistory)
      setPendingGenerations(prev => prev.filter(gen => gen.id !== id));
      
      // Ask parent to refresh its list, as a cancelled item might need to be removed from display
      loadGenerations(true);
      
      return true;
    } catch (error) {
      console.error('Error cancelling generation:', error);
      return false;
    }
  };

  const handleImageError = (generationId: string, imageIndex: number) => {
    setGenerations(prevGens =>
      prevGens.map(gen => {
        if (gen.id !== generationId) {
          return gen;
        }

        const newImages = gen.images.map((img, idx) => {
          if (idx !== imageIndex) {
            return img;
          }

          // Guard against img being null or undefined
          if (!img) {
            console.error(
              `Image object is null/undefined at index ${imageIndex} for generation ${generationId} during error handling.`
            );
            // Return a placeholder error object to maintain array structure and indicate error
            return {
              url: "", // Or a specific placeholder error image URL
              isExpired: true, // Consistent with how other errors might be handled
              loadError: true,
            };
          }

          // If already marked as error, no change. Otherwise, mark it.
          if (img.loadError) {
            return img;
          }

          console.warn(
            `Image failed to load: generation ${generationId}, image ${imageIndex}, URL: ${img.url}`
          );
          return { ...img, loadError: true };
        });

        // Check if there was an actual change to avoid unnecessary re-render.
        // This comparison needs to be robust to null/undefined in old gen.images vs new placeholder.
        const changed = gen.images.length !== newImages.length || gen.images.some((oldImg, idx) => {
          const newImg = newImages[idx];
          if (!oldImg && newImg) return true; // Old was null/undefined, new one (placeholder) exists
          if (oldImg && !newImg) return true; // Old existed, new one is somehow gone (should not happen with map)
          if (oldImg && newImg) { // Both exist, compare relevant property
            return oldImg.loadError !== newImg.loadError;
          }
          return false; // Both null/undefined, no change
        });

        if (changed) {
          return { ...gen, images: newImages };
        }
        return gen;
      })
    );
  };

  const toggleImageFavorite = async (generationId: string, imageUrl: string, currentLikedStatus: boolean) => {
    try {
      const newLikedStatus = !currentLikedStatus;
      
      // Optimistic update
      setGenerations(prevGens =>
        prevGens.map(gen => {
          if (gen.id !== generationId) {
            return gen;
          }
          
          const newImages = gen.images.map(img => {
            if (img.url === imageUrl) {
              return { ...img, isLiked: newLikedStatus };
            }
            return img;
          });
          
          return { ...gen, images: newImages };
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

      // Show success toast
      // toast.success(newLikedStatus ? 'Added to favorites' : 'Removed from favorites')

    } catch (error) {
      console.error('Error toggling favorite:', error)
      
      // Revert optimistic update on error
      setGenerations(prevGens =>
        prevGens.map(gen => {
          if (gen.id !== generationId) {
            return gen;
          }
          
          const newImages = gen.images.map(img => {
            if (img.url === imageUrl) {
              return { ...img, isLiked: currentLikedStatus };
            }
            return img;
          });
          
          return { ...gen, images: newImages };
        })
      );
      
      // toast.error('Failed to update favorite status')
    }
  };

  const handleDelete = async (id: string) => {
    const isPending = pendingGenerations.some(gen => gen.id === id);
    
    if (isPending) {
      setIsCancelling(id);
      const pendingGen = pendingGenerations.find(gen => gen.id === id);
      try {
        const success = await cancelGeneration(id, pendingGen?.replicate_id);
        if (success) {
          toast.success('Generation cancelled successfully');
          // Parent will refresh via loadGenerations(true) called in cancelGeneration
        } else {
          toast.error('Failed to cancel generation');
        }
      } catch (e) {
        console.error("Error during cancellation in handleDelete:", e);
        toast.error('An error occurred during cancellation.');
      } finally {
        setIsCancelling(null);
      }
      return;
    }
    
    const generationIndex = generations.findIndex(g => g.id === id);
    if (generationIndex === -1) {
      toast.error("Generation not found for deletion.");
      return;
    }
    const generationToDelete = { ...generations[generationIndex] };

    // Optimistic UI update using setGenerations prop
    setGenerations(prevGenerations => prevGenerations.filter(g => g.id !== id));
    
    setIsDeleting(id);

    sendDeleteRequest(generationToDelete.replicate_id, generationToDelete.images.map(img => img.url))
      .then(success => {
        if (success) {
          // toast.success("Image deleted successfully"); // Optional: parent handles refresh
          loadGenerations(true); // Ensure parent re-fetches to confirm deletion
        } else {
          toast.error("Failed to delete image. Restoring...");
          // Rollback UI by calling setGenerations with the original item re-inserted
          setGenerations(prev => {
            const restored = [...prev];
            restored.splice(generationIndex, 0, generationToDelete);
            return restored.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
        }
      })
      .catch(error => {
        console.error('Error during background image deletion:', error);
        toast.error("Deletion error. Restoring...");
        setGenerations(prev => {
          const restored = [...prev];
          restored.splice(generationIndex, 0, generationToDelete);
          return restored.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        });
      })
      .finally(() => {
        setIsDeleting(null);
      });
  };

  const copyPromptToClipboard = (prompt: string) => {
    navigator.clipboard.writeText(prompt)
      .then(() => {
        setPromptValue(prompt);
      })
      .catch((err) => {
        console.error('Failed to copy prompt:', err);
      });
  };

  const openImageViewer = (generation: ImageGeneration, imageIndex: number) => {
    setImageViewer({
      isOpen: true,
      currentGeneration: generation,
      currentImageIndex: imageIndex
    })
  }

  const closeImageViewer = useCallback(() => {
    setImageViewer(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleNavigate = useCallback((newIndex: number) => {
    setImageViewer(prev => ({ ...prev, currentImageIndex: newIndex }));
  }, []);

  const getAllGenerations = useCallback(() => {
    const allDisplayableGenerations: (ImageGeneration & { isPending?: boolean })[] = [...generations];
    
    pendingGenerations.forEach(pending => {
      const existingIndex = allDisplayableGenerations.findIndex(gen => gen.id === pending.id);
      if (existingIndex === -1 || 
          (existingIndex >= 0 && allDisplayableGenerations[existingIndex].images.length < 4)) {
        const virtualGeneration: ImageGeneration & { isPending?: boolean } = {
          id: pending.id,
          replicate_id: pending.replicate_id || '',
          prompt: pending.prompt,
          timestamp: pending.startTime || new Date().toISOString(),
          images: [], // Pending items don't have images to display yet
          aspectRatio: pending.aspectRatio,
          format: pending.format,
          modelDisplayName: pending.modelDisplayName,
          isPending: true
        };
        // If it's truly new, add it. If it exists but incomplete, replace (or update)
        if (existingIndex === -1) {
            allDisplayableGenerations.push(virtualGeneration);
        } else {
            // This case suggests a mismatch or partial update from parent, 
            // best to rely on parent's `generations` for completed data.
            // For display, we can ensure a pending marker if necessary.
            if (!allDisplayableGenerations[existingIndex].isPending) {
                 allDisplayableGenerations[existingIndex] = {
                    ...allDisplayableGenerations[existingIndex],
                    // Ensure it has the isPending flag if it's in pendingGenerations
                    // and not fully loaded in `generations` prop
                    isPending: true 
                 };
            }
        }
      }
    });
    
    return allDisplayableGenerations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [generations, pendingGenerations]);

  return (
    <div className="w-full space-y-6">
      <Toaster />
      
      <MediaFocus 
        isOpen={imageViewer.isOpen}
        currentGeneration={imageViewer.currentGeneration}
        currentImageIndex={imageViewer.currentImageIndex}
        onClose={closeImageViewer}
        onNavigate={handleNavigate}
        onUpdateGeneration={(updatedGeneration) => {
          // Update the generation in our local state when favorites are toggled in MediaFocus
          setGenerations(prevGens =>
            prevGens.map(gen => 
              gen.id === updatedGeneration.id ? updatedGeneration : gen
            )
          )
          
          // Also update the imageViewer if this is the currently viewed generation
          setImageViewer(prev => {
            if (prev.currentGeneration?.id === updatedGeneration.id) {
              return {
                ...prev,
                currentGeneration: updatedGeneration
              }
            }
            return prev
          })
        }}
      />
      
      {isLoading && generations.length === 0 && pendingGenerations.length === 0 ? (
        // Show skeleton loaders only when initially loading and no data at all
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={`skel-gen-${i}`} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-12 rounded-md" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={`skel-img-${j}`} className="aspect-square rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !isLoading && error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => loadGenerations(false)} variant="link" className="mt-2">Try again</Button>
        </div>
      ) : !isLoading && getAllGenerations().length === 0 ? (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground">No images generated yet.</p>
          <p className="text-sm text-muted-foreground/80 mt-2">
            Use the form above to create your first image!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {getAllGenerations().map((generation) => {
              // isPending is now a property of the items from getAllGenerations
              const isGenPending = generation.isPending || pendingGenerations.some(p => p.id === generation.id && generation.images.length === 0);
              
              return (
                <div
                  key={`generation-${generation.id}`}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={isGenPending ? 'hidden sm:flex items-center gap-2' : 'flex items-center gap-2'}>
                        <Badge variant="outline" className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 !border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40 dark:border-blue-800/30">
                          {generation.aspectRatio}
                        </Badge>
                        {generation.format && (
                          <Badge variant="outline" className="!bg-green-200 !text-green-800 hover:!bg-green-300 !border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/40 dark:border-green-800/30">
                            {generation.format.toUpperCase()}
                          </Badge>
                        )}
                        {generation.modelDisplayName && (
                          <Badge variant="outline" className="!bg-purple-200 !text-purple-800 hover:!bg-purple-300 !border-purple-300 max-w-[150px] truncate dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/40 dark:border-purple-800/30">
                            {generation.modelDisplayName}
                          </Badge>
                        )}
                      </div>
                      
                      {isGenPending && (
                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
                            Generating
                          </div>
                          {elapsedTimes[generation.id] !== undefined && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({elapsedTimes[generation.id]}s)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => copyPromptToClipboard(generation.prompt)}
                        className="h-8 w-8"
                        aria-label="Copy Prompt"
                        title="Copy Prompt"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clipboard">
                          <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                        </svg>
                      </Button>
                      
                      {isGenPending ? (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => cancelGeneration(generation.id, generation.replicate_id)}
                          disabled={isCancelling === generation.id}
                          className="h-8 w-8"
                          aria-label="Cancel"
                          title="Cancel Generation"
                        >
                          {isCancelling === generation.id ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
                              <path d="M18 6 6 18"/>
                              <path d="m6 6 12 12"/>
                            </svg>
                          )}
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleDelete(generation.id)}
                          disabled={isDeleting === generation.id}
                          className="h-8 w-8"
                          aria-label="Delete"
                          title="Delete"
                        >
                          {isDeleting === generation.id ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              <line x1="10" x2="10" y1="11" y2="17"/>
                              <line x1="14" x2="14" y1="11" y2="17"/>
                            </svg>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {!isGenPending && generation.images && generation.images.length > 0 ? (
                      <>
                        {generation.images.map((image, index) => (
                          <div 
                            key={`${generation.id}-img-${index}`}
                            className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer"
                            onClick={() => {
                              // Allow opening in viewer even if there was a loadError, 
                              // as MediaFocus might have its own way of handling/displaying it.
                              // Or prevent if image.loadError is true and image.isExpired is false.
                              if (!image.isExpired) { 
                                openImageViewer(generation, index);
                              }
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                            
                            {/* Heart Icon for Favorite */}
                            <button
                              className="absolute top-2 right-2 z-20 p-1.5 transition-all duration-200 group-hover:scale-110"
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent opening the viewer
                                toggleImageFavorite(generation.id, image.url, image.isLiked || false);
                              }}
                              aria-label={image.isLiked ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill={image.isLiked ? "currentColor" : "none"} 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                className={`transition-colors duration-200 ${
                                  image.isLiked 
                                    ? "text-red-500 drop-shadow-[0_2px_4px_rgba(255,255,255,0.8)]" 
                                    : "text-white drop-shadow-[0_2px_4px_rgba(255,255,255,0.9)] hover:text-red-500"
                                }`}
                                style={{
                                  filter: 'drop-shadow(0 0 3px rgba(255, 255, 255, 0.7))'
                                }}
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
                                alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                onError={() => handleImageError(generation.id, index)}
                                loading="lazy"
                                unoptimized={true}
                              />
                            )}
                          </div>
                        ))}
                        {generation.images.length < 4 && Array.from({ length: 4 - generation.images.length }).map((_, index) => (
                          <Skeleton 
                            key={`skeleton-fill-${index}`}
                            className="aspect-square rounded-lg animate-pulse"
                          />
                        ))}
                      </>
                    ) : (
                      Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton 
                          key={`skeleton-pending-${index}`} 
                          className="aspect-square rounded-lg animate-pulse"
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  )
} 