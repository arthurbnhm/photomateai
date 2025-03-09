"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { createSupabaseClient } from "@/lib/supabase"
import { MediaFocus } from "@/components/MediaFocus"
import { useAuth } from "@/contexts/AuthContext"

// Define the type for image generation
type ImageGeneration = {
  id: string
  replicate_id: string  // Add replicate_id to the type
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
  format?: string      // Add format information
  modelName?: string   // Add model name information
}

// Define the type for pending generations with potential stall status
type PendingGeneration = {
  id: string
  replicate_id?: string // Store the actual Replicate ID when available
  prompt: string
  aspectRatio: string
  startTime?: string // When the generation started
  potentiallyStalled?: boolean // Flag for generations that might be stalled
  format?: string      // Add format information
  modelName?: string   // Add model name information
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
  input?: {
    output_format?: string
  }
  model_name?: string
  model_id?: string
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

// Add new types for image viewing
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
    return () => setIsMounted(false)
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

  // Load from cache or fetch from Supabase
  const loadGenerations = useCallback(async (forceFetch: boolean = false, silentUpdate: boolean = false) => {
    try {
      // Only set loading state if this isn't a silent update
      if (!silentUpdate) {
        // Set loading state only if we're not already showing generations
        setIsLoading(prev => {
          if (prev) return prev;
          return true;
        });
      }
      
      // Always ensure loading state is reset, even in case of errors
      const resetLoadingState = () => {
        // Use setTimeout to avoid state updates conflicting
        setTimeout(() => {
          setIsLoading(false);
        }, 0);
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
      
      // Build the query with user_id filter if user is authenticated
      let query = supabase
        .from('predictions')
        .select('*')
        .eq('is_deleted', false);
      
      // Add user_id filter if user is authenticated
      if (user?.id) {
        query = query.eq('user_id', user.id);
      }
      
      // Complete the query with ordering and limit
      const { data, error } = await query
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
            aspectRatio: item.aspect_ratio,
            format: item.input?.output_format || 'png',
            modelName: item.model_name || 'Default Model'
          }));
        
        // Update state with functional update to avoid dependency on current state
        setGenerations(prevGenerations => {
          // Only update if data has actually changed
          const currentDataStr = JSON.stringify(prevGenerations);
          const newDataStr = JSON.stringify(processedData);
          
          if (currentDataStr !== newDataStr) {
            // Update cache
            localStorage.setItem(CACHE_KEY, JSON.stringify(processedData));
            localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
            return processedData;
          }
          
          // No change needed
          return prevGenerations;
        });
      }
      
      // Always ensure loading state is reset
      resetLoadingState();
    } catch (err) {
      console.error('Error loading generations:', err);
      setError('Failed to load image history. Please try again later.');
      setIsLoading(false);
    }
  }, [setIsLoading, setGenerations, setError, user?.id]);

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
                    aspectRatio: matchingPending.aspectRatio,
                    format: matchingPending.format || payload.new.input?.output_format || 'png',
                    modelName: matchingPending.modelName || payload.new.model_name || 'Default Model'
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
              loadGenerations(true, true); // Use silent update to avoid UI loading flicker
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
  }, [isMounted, pendingGenerations, loadGenerations, setPendingGenerations]);
  
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
        
        // Use a function update to get the current generations state
        setGenerations(prevGenerations => {
          const updatedGenerations = [...prevGenerations];
          
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
                  aspectRatio: pendingGen.aspectRatio,
                  format: pendingGen.format || prediction.input?.output_format || 'png',
                  modelName: pendingGen.modelName || prediction.model_name || 'Default Model'
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
          
          // Update localStorage cache if needed
          if (hasUpdates) {
            localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
            localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          }
          
          // Return the updated generations
          return hasUpdates ? updatedGenerations : prevGenerations;
        });
        
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
    
    // Set up the initial check
    const startPollingIfNeeded = () => {
      if (shouldStartPolling()) {
        // Run the first check
        checkPendingGenerations();
        
        // Set up an interval for subsequent checks every 5 seconds
        const interval = setInterval(checkPendingGenerations, 5000);
        intervalRef.current = interval;
      } else {
        // Check again in 5 seconds if we should start polling
        const timeout = setTimeout(startPollingIfNeeded, 5000);
        timeoutRef.current = timeout;
      }
    };
    
    // Start the process
    const initialTimeout = setTimeout(startPollingIfNeeded, 1000);
    
    // Cleanup function
    return () => {
      clearTimeout(initialTimeout);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMounted, pendingGenerations, setPendingGenerations]);

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
  }, [pendingGenerations, setPendingGenerations]);

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

  // Function to delete a generation
  const performDeletion = async (id: string): Promise<boolean> => {
    // First check if this is a pending generation with a timestamp ID
    const pendingGen = pendingGenerations.find(gen => gen.id === id);
    
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
      const success = await sendDeleteRequest(completedGen.replicate_id, imageUrls);
      
      if (success) {
        // Only update the UI after successful deletion
        const updatedGenerations = generations.filter(gen => gen.id !== id);
        setGenerations(updatedGenerations);
        localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
      }
      
      return success;
    }
    
    // If we couldn't find the generation or it doesn't have a replicate_id,
    // use the id as a fallback
    console.warn('Could not find replicate_id, using id as fallback:', id);
    const success = await sendDeleteRequest(id);
    
    if (success) {
      // Only update the UI after successful deletion
      const updatedGenerations = generations.filter(gen => gen.id !== id);
      setGenerations(updatedGenerations);
      localStorage.setItem(CACHE_KEY, JSON.stringify(updatedGenerations));
    }
    
    return success;
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
            resolve(false); // Return false to indicate failure
          }
        };
        
        xhr.onerror = function() {
          console.error('Network error while deleting generation with replicate_id:', replicateId);
          resolve(false); // Return false to indicate failure
        };
        
        xhr.send();
      });
    } catch (error) {
      console.error('Exception during deletion:', error);
      return false; // Return false to indicate failure
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
      
      // Call the performDeletion function
      const success = await performDeletion(id);
      
      if (success) {
        toast.success('Image deleted from history');
      } else {
        toast.error('Failed to delete image');
        // Refresh the generations to ensure UI is in sync with server
        loadGenerations(true, true);
      }
      
      setIsDeleting('');
    } catch (error) {
      console.error('Error handling delete:', error);
      toast.error('An error occurred while processing your request');
      setIsDeleting('');
      // Refresh the generations to ensure UI is in sync with server
      loadGenerations(true, true);
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
    
    // Dispatch a custom event to notify other components
    const event = new CustomEvent('imageViewerStateChange', { detail: { isOpen: true } });
    window.dispatchEvent(event);
  }

  // Add function to close image viewer
  const closeImageViewer = useCallback(() => {
    setImageViewer({
      ...imageViewer,
      isOpen: false
    })
    
    // Dispatch a custom event to notify other components
    const event = new CustomEvent('imageViewerStateChange', { detail: { isOpen: false } });
    window.dispatchEvent(event);
  }, [imageViewer]);

  // Add function to navigate to next image
  const handleNavigate = useCallback((newIndex: number) => {
    setImageViewer({
      ...imageViewer,
      currentImageIndex: newIndex
    })
  }, [imageViewer]);

  // Reference for touch handling and keyboard navigation are now handled in MediaFocus
  
  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!imageViewer.isOpen) return;
      
      switch (e.key) {
        case 'ArrowRight':
          if (imageViewer.currentGeneration) {
            const totalImages = imageViewer.currentGeneration.images.length;
            handleNavigate((imageViewer.currentImageIndex + 1) % totalImages);
          }
          break;
        case 'ArrowLeft':
          if (imageViewer.currentGeneration) {
            const totalImages = imageViewer.currentGeneration.images.length;
            handleNavigate((imageViewer.currentImageIndex - 1 + totalImages) % totalImages);
          }
          break;
        case 'Escape':
          closeImageViewer();
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageViewer.isOpen, imageViewer.currentGeneration, imageViewer.currentImageIndex, closeImageViewer, handleNavigate]);

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
      
      {/* Pending generations section */}
      {pendingGenerations.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-4">
            {pendingGenerations.map((generation) => {
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
                        {/* Left side - Tags */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Badges - Only show on desktop for pending generations */}
                          <div className="hidden sm:flex items-center gap-2">
                            {/* Aspect ratio badge */}
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200">
                              {generation.aspectRatio}
                            </Badge>
                            
                            {/* Format badge */}
                            {generation.format && (
                              <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
                                {generation.format.toUpperCase()}
                              </Badge>
                            )}
                            
                            {/* Model badge */}
                            {generation.modelName && (
                              <Badge variant="outline" className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200 max-w-[150px] truncate">
                                {generation.modelName}
                              </Badge>
                            )}
                          </div>
                          
                          {/* Status indicators */}
                          {generation.potentiallyStalled ? (
                            <div className="flex items-center gap-1 ml-2">
                              <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></span>
                              <span className="text-sm font-medium text-amber-500">Stalled</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 ml-2">
                              {hasPartialResults ? (
                                <>
                                  <span className="inline-block w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
                                  <span className="text-sm font-medium text-primary">
                                    Partially Complete
                                  </span>
                                </>
                              ) : (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
                                  Generating
                                </Badge>
                              )}
                              {elapsedTimes[generation.id] !== undefined && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({elapsedTimes[generation.id]}s)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Right side - Action buttons */}
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
                          
                          {generation.potentiallyStalled ? (
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
                          ) : (
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
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {hasPartialResults && partialGeneration && partialGeneration.images ? (
                          // Show partial results with skeletons for missing images
                          <>
                            {partialGeneration.images.map((image, index) => (
                              <div 
                                key={index} 
                                className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer"
                                onClick={() => {
                                  if (!image.isExpired && partialGeneration) {
                                    openImageViewer(partialGeneration, index);
                                  }
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
                                {image.isExpired ? (
                                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                                    <p className="text-sm text-muted-foreground">Image expired</p>
                                  </div>
                                ) : (
                                  <Image 
                                    src={image.url} 
                                    alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                                    fill
                                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
                    {/* Left side - Tags */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Aspect ratio badge - visible on all devices for completed generations */}
                      <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200">
                        {generation.aspectRatio}
                      </Badge>
                      
                      {/* Format badge */}
                      {generation.format && (
                        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
                          {generation.format.toUpperCase()}
                        </Badge>
                      )}
                      
                      {/* Model badge */}
                      {generation.modelName && (
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200 max-w-[150px] truncate">
                          {generation.modelName}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Right side - Actions */}
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
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {generation.images.length > 0 ? (
                      generation.images.map((image, index) => (
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
                              <p className="text-sm text-muted-foreground">Image expired</p>
                            </div>
                          ) : (
                            <Image 
                              src={image.url} 
                              alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 animate-fade-in"
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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