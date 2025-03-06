"use client"

import { useState, useEffect } from "react"
import { LoadingIndicator } from "@/components/ui/loading-indicator"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"
import { createSupabaseClient } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"

// Define the type for image generation
type ImageGeneration = {
  id: string
  replicate_id: string  // Add replicate_id to the type
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
}

// Define the type for pending generations with potential stall status
type PendingGeneration = {
  id: string
  replicate_id?: string // Store the actual Replicate ID when available
  prompt: string
  aspectRatio: string
  startTime?: string // When the generation started
  potentiallyStalled?: boolean // Flag for generations that might be stalled
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
}

// Add new type for image with status
type ImageWithStatus = {
  url: string
  isExpired: boolean
}

// Local storage keys
const CACHE_KEY = 'photomate_image_cache';
const CACHE_TIMESTAMP_KEY = 'photomate_cache_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Simplified processOutput to only use storage URLs
const processOutput = (storageUrls: string[] | null): ImageWithStatus[] => {
  if (!storageUrls || !Array.isArray(storageUrls)) {
    return [];
  }
  
  return storageUrls.map(url => ({
    url,
    isExpired: false
  }));
};

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

  // Set mounted state on component init
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Load from cache or fetch from Supabase
  const loadGenerations = async (forceFetch: boolean = false, silentUpdate: boolean = false) => {
    try {
      // Only set loading state if this isn't a silent update
      if (!silentUpdate) {
        // Set loading state only if we're not already showing generations
        if (generations.length === 0) {
          setIsLoading(true);
        }
      }
      
      // Always ensure loading state is reset, even in case of errors
      const resetLoadingState = () => {
        // Use setTimeout to avoid state updates conflicting
        setTimeout(() => {
          if (isLoading) {
            setIsLoading(false);
          }
        }, 100);
      };
      
      // Check cache first
      if (!forceFetch) {
        const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        const cachedData = localStorage.getItem(CACHE_KEY);
        
        if (cachedTimestamp && cachedData) {
          const timestamp = parseInt(cachedTimestamp);
          const now = Date.now();
          
          // If cache is still valid
          if (now - timestamp < CACHE_DURATION) {
            try {
              const parsed = JSON.parse(cachedData);
              if (Array.isArray(parsed)) {
                setGenerations(parsed);
                resetLoadingState();
                return;
              }
            } catch (e) {
              console.error('Error parsing cached data:', e);
              // Continue to fetch from API if cache parsing fails
            }
          }
        }
      }
      
      // Fetch from Supabase if cache is invalid or forced refresh
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        throw error;
      }
      
      if (data) {
        // Process the data
        const processedData: ImageGeneration[] = data
          .filter((item: PredictionData) => item.status === 'succeeded' && item.storage_urls)
          .map((item: PredictionData) => ({
            id: item.id,
            replicate_id: item.replicate_id,
            prompt: item.prompt,
            timestamp: item.created_at,
            images: processOutput(item.storage_urls),
            aspectRatio: item.aspect_ratio
          }));
        
        // Only update state if data has actually changed
        const currentDataStr = JSON.stringify(generations);
        const newDataStr = JSON.stringify(processedData);
        
        if (currentDataStr !== newDataStr) {
          // Update state
          setGenerations(processedData);
          
          // Update cache
          localStorage.setItem(CACHE_KEY, JSON.stringify(processedData));
          localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        }
      }
      
      // Always ensure loading state is reset
      resetLoadingState();
    } catch (err) {
      console.error('Error loading generations:', err);
      setError('Failed to load image history. Please try again later.');
      setIsLoading(false);
    }
  };

  // Initial load and Supabase Realtime setup
  useEffect(() => {
    if (!isMounted) return;
    
    loadGenerations(true);
    
    // Set up Supabase Realtime subscription
    const supabase = createSupabaseClient();
    
    // Subscribe to changes in the predictions table for successful generations
    const successChannel = supabase
      .channel('successful-predictions')
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'predictions',
          filter: 'status=eq.succeeded'
        }, 
        (payload) => {
          // Process the updated prediction
          if (payload.new && 
              payload.new.status === 'succeeded' && 
              payload.new.storage_urls && 
              payload.new.storage_urls.length > 0) {
            
            // Look for matching pending generation
            const matchingPending = pendingGenerations.find(p => 
              p.replicate_id === payload.new.replicate_id
            );
            
            if (matchingPending) {
              // Process the new image data
              const processedImages = processOutput(payload.new.storage_urls);
              
              // Update generations state
              setGenerations(prev => {
                const existingIndex = prev.findIndex(g => g.id === matchingPending.id);
                const updatedGenerations = [...prev];
                
                if (existingIndex >= 0) {
                  // Update existing generation
                  updatedGenerations[existingIndex] = {
                    ...updatedGenerations[existingIndex],
                    images: processedImages
                  };
                } else {
                  // Add as new generation
                  const newGeneration = {
                    id: matchingPending.id,
                    replicate_id: payload.new.replicate_id,
                    prompt: matchingPending.prompt,
                    timestamp: new Date().toISOString(),
                    images: processedImages,
                    aspectRatio: matchingPending.aspectRatio
                  };
                  // Add to the beginning of the array
                  updatedGenerations.unshift(newGeneration);
                }
                
                // Update localStorage cache
                localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
                localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
                
                return updatedGenerations;
              });
              
              // Remove from pending
              setPendingGenerations(prev => 
                prev.filter(g => g.id !== matchingPending.id)
              );
            } else {
              loadGenerations(true);
            }
          }
        }
      )
      .subscribe();
    
    // Subscribe to errors and cancelled predictions
    const errorChannel = supabase
      .channel('failed-predictions')
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'predictions',
          filter: 'or(status=eq.failed,is_cancelled=eq.true)'
        }, 
        (payload) => {
          if (payload.new) {
            // Find matching pending generation
            const matchingPending = pendingGenerations.find(p => 
              p.replicate_id === payload.new.replicate_id
            );
            
            if (matchingPending) {
              // Show error toast if there's an error
              if (payload.new.error) {
                toast.error(`Generation failed: ${payload.new.error}`);
              }
              
              // Remove from pending
              setPendingGenerations(prev => 
                prev.filter(g => g.id !== matchingPending.id)
              );
            }
          }
        }
      )
      .subscribe();
    
    // Clean up the subscriptions when component unmounts
    return () => {
      supabase.removeChannel(successChannel);
      supabase.removeChannel(errorChannel);
    };
  }, [isMounted]); // Only depend on mount status, not on pendingGenerations
  
  // Add a fallback polling mechanism for pending generations
  useEffect(() => {
    if (!isMounted || pendingGenerations.length === 0) return;
    
    const checkPendingGenerations = async () => {
      try {
        const supabase = createSupabaseClient();
        
        // Get all pending replicate_ids that we need to check
        const replicateIds = pendingGenerations
          .filter(gen => gen.replicate_id)
          .map(gen => gen.replicate_id);
        
        if (replicateIds.length === 0) return;
        
        // Fetch all predictions with these replicate_ids in a single query
        const { data: predictions, error } = await supabase
          .from('predictions')
          .select('*')
          .in('replicate_id', replicateIds);
        
        if (error) {
          console.error('Error fetching predictions:', error);
          return;
        }
        
        if (!predictions || predictions.length === 0) return;
        
        // Process each prediction
        let hasUpdates = false;
        const completedIds: string[] = [];
        const updatedGenerations = [...generations];
        
        for (const prediction of predictions) {
          // Find the corresponding pending generation
          const pendingGen = pendingGenerations.find(
            gen => gen.replicate_id === prediction.replicate_id
          );
          
          if (!pendingGen) continue;
          
          // Handle completed generations
          if (prediction.status === 'succeeded' && prediction.storage_urls && prediction.storage_urls.length > 0) {
            // Create processed images
            const processedImages = processOutput(prediction.storage_urls);
            
            // Check if we need to update
            const existingIndex = updatedGenerations.findIndex(gen => gen.id === pendingGen.id);
            
            if (existingIndex >= 0) {
              // Update existing generation
              if (updatedGenerations[existingIndex].images.length !== processedImages.length) {
                updatedGenerations[existingIndex] = {
                  ...updatedGenerations[existingIndex],
                  images: processedImages
                };
                hasUpdates = true;
              }
            } else {
              // Add as new generation
              updatedGenerations.unshift({
                id: pendingGen.id,
                replicate_id: prediction.replicate_id,
                prompt: pendingGen.prompt,
                timestamp: new Date().toISOString(),
                images: processedImages,
                aspectRatio: pendingGen.aspectRatio
              });
              hasUpdates = true;
            }
            
            // Mark for removal from pending
            completedIds.push(pendingGen.id);
          }
          
          // Handle cancelled or errored generations
          if (prediction.is_cancelled || prediction.error) {
            completedIds.push(pendingGen.id);
          }
        }
        
        // Update state if needed
        if (hasUpdates) {
          setGenerations(updatedGenerations);
          
          // Update localStorage cache
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
          localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        }
        
        // Remove completed generations from pending
        if (completedIds.length > 0) {
          setPendingGenerations(prev => 
            prev.filter(gen => !completedIds.includes(gen.id))
          );
        }
      } catch (error) {
        console.error('Error in fallback polling:', error);
      }
    };
    
    // Check immediately and then every 3 seconds
    checkPendingGenerations();
    const interval = setInterval(checkPendingGenerations, 3000);
    
    return () => clearInterval(interval);
  }, [isMounted, pendingGenerations, generations]);

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
  }, []);

  // Check for stalled generations
  useEffect(() => {
    if (pendingGenerations.length === 0) return;
    
    // Consider a generation stalled if it's been pending for more than 5 minutes
    const STALL_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    const checkForStalledGenerations = () => {
      const now = Date.now();
      let hasChanges = false;
      
      setPendingGenerations(prev => {
        const updated = prev.map(gen => {
          // Skip if already marked as stalled
          if (gen.potentiallyStalled) return gen;
          
          // Check if this generation has been pending for too long
          if (gen.startTime) {
            const startTime = new Date(gen.startTime).getTime();
            if (now - startTime > STALL_THRESHOLD) {
              hasChanges = true;
              return { ...gen, potentiallyStalled: true };
            }
          }
          
          return gen;
        });
        
        return hasChanges ? updated : prev;
      });
    };
    
    // Check immediately and then every minute
    checkForStalledGenerations();
    const interval = setInterval(checkForStalledGenerations, 60 * 1000);
    return () => clearInterval(interval);
  }, [pendingGenerations]);

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
          prev.filter(gen => !pendingToRemove.map(p => p.id).includes(gen.id))
        );
      }
    }
  }, [generations, pendingGenerations]);

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
  }, [pendingGenerations]);

  // Function to delete a generation
  const deleteGeneration = async (id: string): Promise<boolean> => {
    // First check if this is a pending generation with a timestamp ID
    const pendingGen = pendingGenerations.find(gen => gen.id === id);
    
    // Optimistically update the UI first
    const updatedGenerations = generations.filter(gen => gen.id !== id);
    setGenerations(updatedGenerations);
    localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
    
    // Handle pending generations
    if (pendingGen) {
      // If it's a pending generation with no replicate_id, just return
      if (!pendingGen.replicate_id) {
        clearPendingGeneration(id);
        return true;
      }
      
      // For pending generations with replicate_id, use that for deletion
      const success = await sendDeleteRequest(pendingGen.replicate_id);
      if (success) {
        clearPendingGeneration(id);
      }
      return success;
    }
    
    // For completed generations, find the generation in our state
    const completedGen = generations.find(gen => gen.id === id);
    if (completedGen && completedGen.replicate_id) {
      // Extract the URLs from the images array
      const imageUrls = completedGen.images.map(img => img.url);
      return await sendDeleteRequest(completedGen.replicate_id, imageUrls);
    }
    
    // If we couldn't find the generation or it doesn't have a replicate_id,
    // use the id as a fallback
    console.warn('Could not find replicate_id, using id as fallback:', id);
    return await sendDeleteRequest(id);
  };
  
  // Helper function to send delete request to the API
  const sendDeleteRequest = async (replicateId: string, storageUrls?: string[]): Promise<boolean> => {
    try {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', `/api/history?id=${replicateId}${storageUrls ? `&urls=${encodeURIComponent(JSON.stringify(storageUrls))}` : ''}`, true);
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            console.error('Server error while deleting:', xhr.status, xhr.statusText);
            console.error('Response:', xhr.responseText);
            resolve(true); // Still resolve true as we've updated the UI
          }
        };
        
        xhr.onerror = function() {
          console.error('Network error while deleting generation with replicate_id:', replicateId);
          resolve(true); // Still resolve true as we've updated the UI
        };
        
        xhr.send();
      });
    } catch (error) {
      console.error('Exception during deletion:', error);
      return true; // Return true anyway as we've updated the UI
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
        localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
      }
      
      return true;
    } catch (error) {
      console.error('Error cancelling generation:', error);
      return false;
    }
  };

  // Function to refresh expired images
  const refreshExpiredImages = async (generationId: string) => {
    try {
      const supabase = createSupabaseClient();
      
      const { data: prediction, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('id', generationId)
        .single();
      
      if (error) {
        console.error('Error refreshing images:', error);
        return;
      }
      
      if (prediction?.storage_urls) {
        // Update the generation with storage URLs
        setGenerations(prev => 
          prev.map(gen => 
            gen.id === generationId
              ? {
                  ...gen,
                  images: processOutput(prediction.storage_urls)
                }
              : gen
          )
        );
      }
    } catch (error) {
      console.error('Error refreshing images:', error);
    }
  };

  // Mark image as expired and trigger refresh
  const handleImageError = (generationId: string, imageIndex: number) => {
    setGenerations(prev => 
      prev.map(gen => 
        gen.id === generationId
          ? {
              ...gen,
              images: gen.images.map((img, idx) => 
                idx === imageIndex
                  ? { ...img, isExpired: true }
                  : img
              )
            }
          : gen
      )
    );
    
    // Refresh the images for this generation
    refreshExpiredImages(generationId);
  };

  // Clear a specific pending generation by ID
  const clearPendingGeneration = (id: string) => {
    // Remove from pendingGenerations state
    setPendingGenerations(prev => prev.filter(gen => gen.id !== id));
    
    // Also check if we need to clean up localStorage
    try {
      // Check if there's any localStorage data for this generation
      const pendingKey = `pending_generation_${id}`;
      if (localStorage.getItem(pendingKey)) {
        localStorage.removeItem(pendingKey);
      }
    } catch (error) {
      console.error('Error cleaning up localStorage:', error);
    }
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
      
      // Call the deleteGeneration function
      // Since our implementation is optimistic, we treat this as always successful
      await deleteGeneration(id);
      toast.success('Image deleted from history');
      
      setIsDeleting('');
    } catch (error) {
      console.error('Error handling delete:', error);
      toast.error('An error occurred while processing your request');
      setIsDeleting('');
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

  // Get status badge similar to ModelListTable
  const getStatusBadge = (status: string, hasPartialResults: boolean = false, elapsedTime?: number) => {
    if (status === "generating") {
      if (hasPartialResults) {
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
            Partially Complete
            {elapsedTime !== undefined && (
              <span className="text-xs ml-1">({elapsedTime}s)</span>
            )}
          </Badge>
        );
      }
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
          Generating
          {elapsedTime !== undefined && (
            <span className="text-xs ml-1">({elapsedTime}s)</span>
          )}
        </Badge>
      );
    } else if (status === "stalled") {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
          Stalled
        </Badge>
      );
    } else if (status === "completed") {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
          Completed
        </Badge>
      );
    } else if (status === "failed") {
      return <Badge variant="destructive">Failed</Badge>;
    } else if (status === "canceled") {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300">Canceled</Badge>;
    } else {
      return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Get a pastel colored badge for aspect ratio
  const getAspectRatioBadge = (aspectRatio: string) => {
    // Different pastel colors based on aspect ratio
    switch (aspectRatio) {
      case "1:1":
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200">
            {aspectRatio}
          </Badge>
        );
      case "4:5":
        return (
          <Badge variant="outline" className="bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-200">
            {aspectRatio}
          </Badge>
        );
      case "16:9":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200">
            {aspectRatio}
          </Badge>
        );
      case "9:16":
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200">
            {aspectRatio}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
            {aspectRatio}
          </Badge>
        );
    }
  };

  return (
    <div className="w-full">
      <Toaster />
      <h2 className="text-2xl font-bold mb-6">Your Image History</h2>
      
      {/* Loading indicator for initial history fetch - only show when no generations are loaded yet */}
      {isLoading && generations.length === 0 && pendingGenerations.length === 0 && (
        <LoadingIndicator 
          isLoading={true}
          text="Loading image history..." 
          className="mb-4"
        />
      )}
      
      {/* Pending generations section */}
      {pendingGenerations.length > 0 && (
        <div className="mb-8">
          <div className="space-y-6">
            {pendingGenerations.map((generation) => {
              // Check if this generation already has results in the completed generations
              const completedGeneration = generations.find(item => item.id === generation.id);
              
              // If we already have complete results for this generation, don't show the pending card
              if (completedGeneration && completedGeneration.images && completedGeneration.images.length === 4) {
                return null;
              }
              
              // Check if we have partial results for this generation
              const hasPartialResults = generations.some(gen => 
                gen.id === generation.id && gen.images && gen.images.length > 0
              );
              
              // If we have partial results, find them
              const partialGeneration = hasPartialResults 
                ? generations.find(gen => gen.id === generation.id)
                : null;
              
              return (
                <motion.div
                  key={generation.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="overflow-hidden border-primary/20 shadow-md hover:shadow-lg transition-shadow duration-300">
                    <CardHeader className="p-4 pb-0 space-y-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {getAspectRatioBadge(generation.aspectRatio)}
                          
                          <div className="flex items-center gap-2 ml-2">
                            {generation.potentiallyStalled ? (
                              <>
                                {getStatusBadge("stalled")}
                              </>
                            ) : (
                              <>
                                {getStatusBadge("generating", hasPartialResults, elapsedTimes[generation.id])}
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
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
                          
                          {generation.potentiallyStalled && (
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearPendingGeneration(generation.id);
                              }}
                              className="h-8 w-8 flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors duration-200 cursor-pointer"
                              aria-label="Clear"
                              title="Clear"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                              </svg>
                            </button>
                          )}
                          
                          {!generation.potentiallyStalled && (
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDelete(generation.id);
                              }}
                              disabled={isCancelling === generation.id}
                              className="h-8 w-8 flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Cancel"
                              title="Cancel"
                            >
                              {isCancelling === generation.id ? (
                                <svg className="animate-spin h-4 w-4 text-destructive" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x">
                                  <path d="M18 6 6 18"></path>
                                  <path d="m6 6 12 12"></path>
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="p-4 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {hasPartialResults && partialGeneration && partialGeneration.images ? (
                          // Show partial results with skeletons for missing images
                          <>
                            {partialGeneration.images.map((image, index) => (
                              <div 
                                key={index} 
                                className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group"
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                                {image.isExpired ? (
                                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                                    <p className="text-sm text-muted-foreground">Image expired</p>
                                  </div>
                                ) : (
                                  <img 
                                    src={image.url} 
                                    alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                                    loading="lazy"
                                    onError={() => handleImageError(generation.id, index)}
                                  />
                                )}
                              </div>
                            ))}
                            {/* Only show skeletons for remaining slots if not a completed generation */}
                            {!completedGeneration && Array.from({ length: 4 - (partialGeneration.images?.length || 0) }).map((_, index) => (
                              <Skeleton 
                                key={`skeleton-${index}`} 
                                className="aspect-square rounded-lg"
                              />
                            ))}
                          </>
                        ) : (
                          // Show all skeletons if no results yet
                          Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton 
                              key={index} 
                              className="aspect-square rounded-lg animate-pulse"
                            />
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
      
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
        <div className="space-y-6">
          {generations.map((generation) => (
            <motion.div
              key={generation.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="overflow-hidden border-border shadow-md hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="p-4 pb-0 space-y-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {getAspectRatioBadge(generation.aspectRatio)}
                    </div>
                    
                    <div className="flex items-center gap-2">
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
                          <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-4 pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {generation.images.length > 0 ? (
                      generation.images.map((image, index) => (
                        <div 
                          key={index} 
                          className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                          {image.isExpired ? (
                            <div className="w-full h-full flex items-center justify-center bg-muted/30">
                              <p className="text-sm text-muted-foreground">Image expired</p>
                            </div>
                          ) : (
                            <img 
                              src={image.url} 
                              alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                              loading="lazy"
                              onError={() => handleImageError(generation.id, index)}
                            />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 md:col-span-4 p-4 bg-muted/30 rounded-lg text-center">
                        <p className="text-muted-foreground">No images available</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
} 