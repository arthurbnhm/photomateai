"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { MediaFocus } from "@/components/MediaFocus"
import { useAuth } from "@/contexts/AuthContext"

// Define the type for image generation
type ImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
  format?: string
  modelDisplayName?: string  // Renamed for consistency
}

// Define the type for pending generations with potential stall status
type PendingGeneration = {
  id: string
  replicate_id?: string
  prompt: string
  aspectRatio: string
  startTime?: string
  format?: string
  modelDisplayName?: string  // Renamed for consistency
}

// Define a type for prediction data from Supabase
type PredictionData = {
  id: string
  replicate_id: string
  prompt: string
  aspect_ratio: string
  status: string
  storage_urls: string[] | null
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
  model_id: string  // Reference to the model's model_id (not database id)
  // Joined data from models table
  models?: {
    display_name: string  // Human-readable model name
  } | null
}

// Add new type for image with status
type ImageWithStatus = {
  url: string
  isExpired: boolean
}

// Simplified processOutput to only use storage URLs
const processOutput = (storageUrls: string[] | null): ImageWithStatus[] => {
  if (!storageUrls || !Array.isArray(storageUrls)) {
    return [];
  }
  
  return storageUrls.map(url => ({
    url,
    isExpired: false // Always initialize as not expired
  }));
};

// Define the type for image viewing
type ImageViewerState = {
  isOpen: boolean
  currentGeneration: ImageGeneration | null
  currentImageIndex: number
}

export function ImageHistory({
  pendingGenerations,
  setPendingGenerations
}: {
  pendingGenerations: PendingGeneration[];
  setPendingGenerations: React.Dispatch<React.SetStateAction<PendingGeneration[]>>;
}) {
  const [generations, setGenerations] = useState<ImageGeneration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState<string | null>(null)
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({})
  const [isMounted, setIsMounted] = useState(false)
  const { user } = useAuth()
  
  // Create a Supabase client reference - not using realtime subscriptions
  // so no need to call removeAllChannels() on cleanup
  const supabaseClient = useRef(createBrowserSupabaseClient());
  
  // Refs for polling mechanism
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Local state for image viewer
  const [imageViewer, setImageViewer] = useState<ImageViewerState>({
    isOpen: false,
    currentGeneration: null,
    currentImageIndex: 0
  })

  // Set mounted state on component init
  useEffect(() => {
    setIsMounted(true)
    return () => {
      setIsMounted(false)
      // No need to clean up Supabase client since we're not using realtime subscriptions
    }
  }, [])

  // Add effect to prevent scrolling when modal is open
  useEffect(() => {
    if (imageViewer.isOpen) {
      // Prevent scrolling on the body when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      // Re-enable scrolling when modal is closed
      document.body.style.overflow = '';
    }
    
    // Cleanup function to ensure scrolling is re-enabled when component unmounts
    return () => {
      document.body.style.overflow = '';
    };
  }, [imageViewer.isOpen]);

  // Separate Supabase fetch logic
  const fetchFromSupabase = useCallback(async (silentUpdate: boolean = false) => {
    // Add timeout to the fetch operation
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout
    
    try {
      // Build the query with user_id filter if user is authenticated
      let query = supabaseClient.current
        .from('predictions')
        .select(`
          *,
          models:model_id (
            display_name
          )
        `)
        .eq('is_deleted', false);
      
      // Add user_id filter if user is authenticated
      if (user?.id) {
        query = query.eq('user_id', user.id);
      }
      
      // Complete the query with ordering and limit
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);
      
      clearTimeout(timeoutId);
      
      if (error) {
        throw error;
      }
      
      if (data) {
        // Process the data
        const processedData: ImageGeneration[] = data
          .filter((item: PredictionData) => item.status === 'succeeded' && item.storage_urls)
          .map((item: PredictionData) => {
            // Get the display name directly from the joined models table
            const modelDisplayName = item.models?.display_name || 'Default Model';
            
            return {
              id: item.id,
              replicate_id: item.replicate_id,
              prompt: item.prompt,
              timestamp: item.created_at,
              images: processOutput(item.storage_urls),
              aspectRatio: item.aspect_ratio,
              format: item.format || item.input?.output_format || 'webp',
              modelDisplayName: modelDisplayName  // Consistent property naming
            };
          });
        
        // Update state immediately without checking for changes
        setGenerations(processedData);
      }
      
      if (!silentUpdate) {
        setIsLoading(false);
      }
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn('Fetch aborted due to timeout');
      } else {
        throw fetchError;
      }
    } finally {
      clearTimeout(timeoutId);
      if (!silentUpdate) {
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  // Load generations from Supabase
  const loadGenerations = useCallback(async (silentUpdate: boolean = false) => {
    try {
      // Only set loading state if this isn't a silent update
      if (!silentUpdate) {
        setIsLoading(true);
      }
      
      await fetchFromSupabase(silentUpdate);
    } catch (err) {
      console.error('Error loading generations:', err);
      setError('Failed to load image history. Please try again later.');
      setIsLoading(false);
    }
  }, [fetchFromSupabase]);

  // Initial data load
  useEffect(() => {
    if (isMounted && user) {
      // Initial load
      loadGenerations(false);
    }
  }, [isMounted, user, loadGenerations]);

  // Add a fallback polling mechanism for pending generations
  useEffect(() => {
    if (!isMounted || pendingGenerations.length === 0) return;
    
    // Check if any generation has been running for at least 30 seconds
    const shouldStartPolling = () => {
      const now = Date.now();
      return pendingGenerations.some(gen => {
        if (!gen.startTime) return false;
        const startTime = new Date(gen.startTime).getTime();
        return (now - startTime) >= 30000; // 30 seconds threshold
      });
    };
    
    const checkPendingGenerations = async () => {
      try {
        // Skip if no generation has been running long enough
        if (!shouldStartPolling()) return;
        
        // Get all pending replicate_ids that we need to check
        const replicateIds = pendingGenerations
          .filter(gen => gen.replicate_id)
          .map(gen => gen.replicate_id);
        
        if (replicateIds.length === 0) return;
        
        // Add timeout to the fetch operation
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5000); // 5 second timeout
        
        try {
          // Fetch all predictions with these replicate_ids in a single query
          // Include a join with the models table
          const { data, error } = await supabaseClient.current
            .from('predictions')
            .select(`
              *,
              models:model_id (
                display_name
              )
            `)
            .in('replicate_id', replicateIds);
            
          clearTimeout(timeoutId);
            
          if (error) {
            throw error;
          }
          
          if (data && data.length > 0) {
            let shouldRefreshGenerations = false;
            
            // Process each prediction
            data.forEach((prediction: PredictionData) => {
              // Find the matching pending generation
              const matchingPending = pendingGenerations.find(p => 
                p.replicate_id === prediction.replicate_id
              );
              
              if (matchingPending) {
                if (prediction.status === 'succeeded' && prediction.storage_urls) {
                  // Process the new image data
                  const processedImages = processOutput(prediction.storage_urls);
                  
                  // Get the model display name directly from the joined models table
                  const modelDisplayName = prediction.models?.display_name || 'Default Model';
                  
                  // Update generations state
                  setGenerations(prev => {
                    const existingIndex = prev.findIndex(g => g.id === matchingPending.id);
                    const updatedGenerations = [...prev];
                    
                    if (existingIndex >= 0) {
                      // Update existing generation
                      updatedGenerations[existingIndex] = {
                        ...updatedGenerations[existingIndex],
                        images: processedImages,
                        modelDisplayName: modelDisplayName  // Consistent naming
                      };
                    } else {
                      // Add as new generation
                      const newGeneration = {
                        id: matchingPending.id,
                        replicate_id: prediction.replicate_id,
                        prompt: matchingPending.prompt,
                        timestamp: new Date().toISOString(),
                        images: processedImages,
                        aspectRatio: matchingPending.aspectRatio,
                        format: prediction.format || matchingPending.format || prediction.input?.output_format || 'webp',
                        modelDisplayName: modelDisplayName  // Consistent naming
                      };
                      // Add to the beginning of the array
                      updatedGenerations.unshift(newGeneration);
                    }
                    
                    return updatedGenerations;
                  });
                  
                  // Remove from pending
                  setPendingGenerations(prev => 
                    prev.filter(g => g.id !== matchingPending.id)
                  );
                } else if (prediction.status === 'failed' || prediction.is_cancelled) {
                  // Show error toast if there's an error
                  if (prediction.error) {
                    toast.error(`Generation failed: ${prediction.error}`);
                  }
                  
                  // Remove from pending
                  setPendingGenerations(prev => 
                    prev.filter(g => g.id !== matchingPending.id)
                  );
                } else {
                  // Update elapsed time display
                  setElapsedTimes(prev => ({
                    ...prev,
                    [matchingPending.id]: Math.floor((Date.now() - new Date(matchingPending.startTime || '').getTime()) / 1000)
                  }));
                }
              } else {
                // If we have a prediction that wasn't in pending, it might be
                // a new generation that we missed
                shouldRefreshGenerations = true;
              }
            });
            
            // Do a silent refresh if needed
            if (shouldRefreshGenerations) {
              loadGenerations(true); // Silent update
            }
          }
        } catch (fetchError: unknown) {
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.warn('Fetch aborted due to timeout');
            // Timeout handled gracefully - no need to bubble up
          } else {
            throw fetchError;
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (err) {
        console.error('Error checking pending generations:', err);
      }
    };
    
    // Start polling mechanism
    const pollInterval = 5000; // 5 seconds between polls (changed from 10000)
    
    // Clear any existing intervals/timeouts
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Set up new polling interval
    intervalRef.current = setInterval(checkPendingGenerations, pollInterval);
    
    // Check immediately on mount or when pendingGenerations changes
    // Small delay to avoid overlapping with initial load
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(checkPendingGenerations, 1000);
    
    // Clean up
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isMounted, pendingGenerations, loadGenerations, setPendingGenerations]);

  // Keep the visibility change effect to reload when the tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadGenerations(true);
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadGenerations]);

  // Update UI when generations change
  useEffect(() => {
    // If we have generations that match pending ones, remove them from pending
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

  // Update elapsed times
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
    
    // Update immediately and then every second
    updateElapsedTimes();
    const interval = setInterval(updateElapsedTimes, 1000);
    return () => clearInterval(interval);
  }, [pendingGenerations, setPendingGenerations]);

  const performDeletion = async (id: string): Promise<boolean> => {
    try {
      setIsDeleting(id);
      
      // Find the generation to delete
      const generationToDelete = generations.find(g => g.id === id);
      if (!generationToDelete) {
        toast.error("Generation not found");
        return false;
      }
      
      // Get the replicate_id and image URLs
      const { replicate_id, images } = generationToDelete;
      const imageUrls = images.map(img => img.url);
      
      // Send the delete request to the API
      const success = await sendDeleteRequest(replicate_id, imageUrls);
      
      if (success) {
        // Update the UI by removing the deleted generation
        setGenerations(prevGenerations => 
          prevGenerations.filter(g => g.id !== id)
        );
        
        toast.success("Image deleted successfully");
        return true;
      } else {
        toast.error("Failed to delete image");
        return false;
      }
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("An error occurred while deleting the image");
      return false;
    } finally {
      setIsDeleting(null);
    }
  };
  
  const sendDeleteRequest = async (replicateId: string, storageUrls?: string[]): Promise<boolean> => {
    try {
      // Add timeout to the operation
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 15000); // 15 second timeout
      
      try {
        // Call the API to handle both database update and file deletion
        const deleteResponse = await fetch('/api/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            urls: storageUrls,
            replicateId
          }),
          signal: abortController.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Error deleting generation:', errorData);
          return false;
        }
        
        const responseData = await deleteResponse.json();
        
        // Log any storage deletion issues but still consider it a success if the database was updated
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

  // Function to cancel a pending generation
  const cancelGeneration = async (id: string, replicateId?: string): Promise<boolean> => {
    try {
      // Call the cancel API endpoint with either the replicate_id or the prediction id
      const predictionId = replicateId || id;
      
      const response = await fetch('/api/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ predictionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error cancelling prediction:', errorData);
        return false;
      }

      // Remove from pending generations
      clearPendingGeneration(id);
      
      // Update local state if it exists in generations
      const existingIndex = generations.findIndex(gen => gen.id === id);
      if (existingIndex >= 0) {
        const updatedGenerations = [...generations];
        // Mark as cancelled in the UI
        updatedGenerations.splice(existingIndex, 1);
        setGenerations(updatedGenerations);
      }
      
      return true;
    } catch (error) {
      console.error('Error cancelling generation:', error);
      return false;
    }
  };

  // Simplified handleImageError without retry mechanism
  const handleImageError = (generationId: string, imageIndex: number) => {
    // Instead of retrying multiple times, just attempt to refresh the URL once
    console.log(`Attempting to refresh image: ${generationId}-${imageIndex}`);
    
    // Force a re-render of the image by updating the URL with a cache-busting parameter
    setGenerations(prev => 
      prev.map(gen => 
        gen.id === generationId
          ? {
              ...gen,
              images: gen.images.map((img, idx) => 
                idx === imageIndex
                  ? { ...img, url: `${img.url}${img.url.includes('?') ? '&' : '?'}t=${Date.now()}` }
                  : img
              )
            }
          : gen
      )
    );
  };

  // Clear a specific pending generation by ID
  const clearPendingGeneration = (id: string) => {
    // Remove from pendingGenerations state
    setPendingGenerations(prev => prev.filter(gen => gen.id !== id));
  };

  const handleDelete = async (id: string) => {
    try {
      // First check if this is a pending generation
      const isPending = pendingGenerations.some(gen => gen.id === id);
      
      if (isPending) {
        // For pending generations, we should cancel instead of delete
        setIsCancelling(id);
        const pendingGen = pendingGenerations.find(gen => gen.id === id);
        const success = await cancelGeneration(id, pendingGen?.replicate_id);
        
        if (success) {
          toast.success('Generation cancelled successfully');
        } else {
          toast.error('Failed to cancel generation');
        }
        
        setIsCancelling('');
        return;
      }
      
      // If we get here, try to delete from database
      setIsDeleting(id);
      
      // Call the performDeletion function
      const success = await performDeletion(id);
      
      if (success) {
        toast.success('Image deleted from history');
      } else {
        toast.error('Failed to delete image');
        // Refresh the generations to ensure UI is in sync with server
        loadGenerations(true);
      }
      
      setIsDeleting('');
    } catch (error) {
      console.error('Error handling delete:', error);
      toast.error('An error occurred while processing your request');
      setIsDeleting('');
      // Refresh the generations to ensure UI is in sync with server
      loadGenerations(true);
    }
  };

  const copyPromptToClipboard = (prompt: string) => {
    navigator.clipboard.writeText(prompt)
      .then(() => {
        toast.success('Prompt copied to clipboard');
      })
      .catch((err) => {
        console.error('Failed to copy prompt:', err);
        toast.error('Failed to copy prompt');
      });
  };

  // Add function to open image viewer
  const openImageViewer = (generation: ImageGeneration, imageIndex: number) => {
    setImageViewer({
      isOpen: true,
      currentGeneration: generation,
      currentImageIndex: imageIndex
    })
  }

  // Add function to close image viewer
  const closeImageViewer = useCallback(() => {
    setImageViewer({
      ...imageViewer,
      isOpen: false
    })
  }, [imageViewer]);

  // Add function to navigate to next image
  const handleNavigate = useCallback((newIndex: number) => {
    setImageViewer({
      ...imageViewer,
      currentImageIndex: newIndex
    })
  }, [imageViewer]);

  // Create a combined and sorted list of all generations
  const getAllGenerations = useCallback(() => {
    // Start with completed generations
    const allGenerations = [...generations];
    
    // Add pending generations that aren't already in the completed list
    pendingGenerations.forEach(pending => {
      const existingIndex = allGenerations.findIndex(gen => gen.id === pending.id);
      
      // If this pending generation isn't in the completed list or doesn't have all images
      if (existingIndex === -1 || 
          (existingIndex >= 0 && allGenerations[existingIndex].images.length < 4)) {
        // Create a virtual generation for the pending item
        const virtualGeneration = {
          id: pending.id,
          replicate_id: pending.replicate_id || '',
          prompt: pending.prompt,
          timestamp: pending.startTime || new Date().toISOString(),
          images: [],
          aspectRatio: pending.aspectRatio,
          format: pending.format,
          modelDisplayName: pending.modelDisplayName,
          isPending: true
        };
        allGenerations.push(virtualGeneration);
      }
    });
    
    // Sort by timestamp (newest first)
    return allGenerations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [generations, pendingGenerations]);

  return (
    <div className="w-full space-y-6">
      <Toaster />
      
      {/* Image Viewer Modal */}
      <MediaFocus 
        isOpen={imageViewer.isOpen}
        currentGeneration={imageViewer.currentGeneration}
        currentImageIndex={imageViewer.currentImageIndex}
        onClose={closeImageViewer}
        onNavigate={handleNavigate}
      />
      
      {!isLoading && error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive">{error}</p>
        </div>
      ) : !isLoading && generations.length === 0 && pendingGenerations.length === 0 ? (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground">No images generated yet.</p>
          <p className="text-sm text-muted-foreground/80 mt-2">
            Use the form above to create your first image!
          </p>
        </div>
      ) : !isLoading && (
        <div className="space-y-8">
          {getAllGenerations().map((generation) => {
              const isPending = pendingGenerations.some(p => p.id === generation.id);
              const pending = isPending ? pendingGenerations.find(p => p.id === generation.id) : null;
              
              return (
                <div
                  key={`generation-${generation.id}`}
                  className="space-y-3"
                >
                  {/* Header section with badges and buttons */}
                  <div className="flex items-center justify-between gap-3">
                    {/* Left side - Tags */}
                    <div className="flex items-center gap-2">
                      {/* Badges */}
                      <div className={isPending ? 'hidden sm:flex items-center gap-2' : 'flex items-center gap-2'}>
                        {/* Aspect ratio badge */}
                        <Badge variant="outline" className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 !border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40 dark:border-blue-800/30">
                          {generation.aspectRatio}
                        </Badge>
                        
                        {/* Format badge */}
                        {generation.format && (
                          <Badge variant="outline" className="!bg-green-200 !text-green-800 hover:!bg-green-300 !border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/40 dark:border-green-800/30">
                            {generation.format.toUpperCase()}
                          </Badge>
                        )}
                        
                        {/* Model badge */}
                        {generation.modelDisplayName && (
                          <Badge variant="outline" className="!bg-purple-200 !text-purple-800 hover:!bg-purple-300 !border-purple-300 max-w-[150px] truncate dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/40 dark:border-purple-800/30">
                            {generation.modelDisplayName}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Status indicators for pending generations - Now in a separate div outside the badge container */}
                      {isPending && pending && (
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
                    
                    {/* Right side - Actions */}
                    <div className="flex items-center gap-2 ml-auto">
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
                      
                      {isPending ? (
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
                  
                  {/* Image grid section */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {!isPending && generation.images && generation.images.length > 0 ? (
                      // Show available images for completed generations
                      <>
                        {generation.images.map((image, index) => (
                          <div 
                            key={index} 
                            className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer"
                            onClick={() => {
                              if (!image.isExpired) {
                                openImageViewer(generation, index);
                              }
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                            {image.isExpired ? (
                              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                                <p className="text-sm text-muted-foreground">Image unavailable</p>
                              </div>
                            ) : (
                              <Image 
                                src={image.url} 
                                alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                onError={() => handleImageError(generation.id, index)}
                                priority={true}
                                loading="eager"
                                unoptimized={true}
                              />
                            )}
                          </div>
                        ))}
                        
                        {/* Show skeletons for remaining slots if not all images are loaded */}
                        {generation.images.length < 4 && Array.from({ length: 4 - generation.images.length }).map((_, index) => (
                          <Skeleton 
                            key={`skeleton-${index}`} 
                            className="aspect-square rounded-lg animate-pulse"
                          />
                        ))}
                      </>
                    ) : (
                      // Show all skeletons for pending generations
                      Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton 
                          key={index} 
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