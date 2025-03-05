"use client"

import { useState, useEffect } from "react"
import { useGeneration } from "@/context/GenerationContext"
import { LoadingIndicator } from "@/components/ui/loading-indicator"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"
import { createSupabaseClient } from "@/lib/supabase"

type ImageGeneration = {
  id: string
  prompt: string
  timestamp: string
  images: string[]
  aspectRatio: string
}

// Type for Supabase prediction records
type PredictionRecord = {
  id: string
  replicate_id: string
  prompt: string
  aspect_ratio: string
  status: string
  input: Record<string, unknown>
  output: string[] | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  is_deleted: boolean
  is_cancelled: boolean
}

export function ImageHistory() {
  const { lastGeneratedAt, clientHistory, pendingGenerations, clearStalePendingGenerations, clearPendingGeneration, checkForCompletedGenerations, deleteGeneration, refreshHistory } = useGeneration()
  const [generations, setGenerations] = useState<ImageGeneration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [useClientHistory, setUseClientHistory] = useState(false)
  const [hasRestoredPending, setHasRestoredPending] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({})

  // Update elapsed time every second
  useEffect(() => {
    if (pendingGenerations.length === 0) return;

    const updateElapsedTimes = () => {
      const now = Date.now();
      const times: Record<string, number> = {};

      pendingGenerations.forEach(gen => {
        if (gen.startTime) {
          const startTime = new Date(gen.startTime).getTime();
          const elapsedSeconds = Math.floor((now - startTime) / 1000);
          times[gen.id] = elapsedSeconds;
        }
      });

      setElapsedTimes(times);
    };

    // Update immediately
    updateElapsedTimes();

    // Then update every second
    const interval = setInterval(updateElapsedTimes, 1000);
    
    return () => clearInterval(interval);
  }, [pendingGenerations]);

  // Check for stale generations on initial load
  useEffect(() => {
    if (!hasRestoredPending && pendingGenerations.length > 0) {
      // Clear any stale generations once on component mount
      clearStalePendingGenerations();
      setHasRestoredPending(true);
    }
  }, [clearStalePendingGenerations, pendingGenerations.length, hasRestoredPending]);
  
  // Check for completed generations when component mounts or visibility changes
  useEffect(() => {
    // Check when component mounts
    checkForCompletedGenerations();
    
    // Set up visibility change listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // When user returns to tab or navigates back to page
        checkForCompletedGenerations();
      }
    };
    
    // Add event listener
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    // Clean up
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForCompletedGenerations]);

  useEffect(() => {
    // Function to fetch image history from Supabase
    const fetchImageHistory = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Initialize Supabase client
        const supabase = createSupabaseClient()
        
        // Fetch successful predictions from Supabase with more permissive query
        const { data: predictionData, error: supabaseError } = await supabase
          .from('predictions')
          .select('*')
          .eq('status', 'succeeded')
          .eq('is_deleted', false)
          .or('is_cancelled.is.null,is_cancelled.eq.false') // Accept both null and false values
          .order('created_at', { ascending: false })
          .limit(20)
        
        if (supabaseError) {
          throw new Error(`Failed to fetch from Supabase: ${supabaseError.message}`)
        }
        
        console.log('Fetched predictions from Supabase:', predictionData)
        
        if (Array.isArray(predictionData) && predictionData.length > 0) {
          // Transform Supabase records to ImageGeneration format
          const transformedData: ImageGeneration[] = predictionData
            .filter((pred: PredictionRecord) => {
              // More detailed logging to debug the issue
              if (!pred.output) {
                console.log('Prediction has no output:', pred.id);
                return false;
              }
              if (!Array.isArray(pred.output)) {
                console.log('Prediction output is not an array:', pred.id, typeof pred.output);
                return false;
              }
              if (pred.output.length === 0) {
                console.log('Prediction output array is empty:', pred.id);
                return false;
              }
              return true;
            })
            .map((pred: PredictionRecord) => ({
              id: pred.id,
              prompt: pred.prompt,
              timestamp: pred.created_at,
              images: Array.isArray(pred.output) ? pred.output : [],
              aspectRatio: pred.aspect_ratio
            }))
          
          console.log('Transformed image data:', transformedData);
          setGenerations(transformedData)
          setUseClientHistory(false)
        } else {
          console.log('Supabase history is empty, using client history:', clientHistory)
          setGenerations(clientHistory)
          setUseClientHistory(true)
        }
        
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching image history from Supabase:', err)
        setError(err instanceof Error ? err.message : 'Failed to load image history')
        
        // Use client history as fallback
        console.log('Using client history as fallback:', clientHistory)
        setGenerations(clientHistory)
        setUseClientHistory(true)
        
        setIsLoading(false)
      }
    }
    
    fetchImageHistory()
    // Refresh when lastGeneratedAt changes or clientHistory changes
  }, [lastGeneratedAt, clientHistory])
  
  // If we're using client history, update generations when clientHistory changes
  useEffect(() => {
    if (useClientHistory) {
      setGenerations(clientHistory)
    }
  }, [clientHistory, useClientHistory])
  
  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(id);
      
      if (useClientHistory) {
        // Use the existing delete function for client history
        const success = await deleteGeneration(id);
        
        if (success) {
          // The context will update clientHistory automatically
          refreshHistory();
        } else {
          console.error('Failed to delete generation from client history');
        }
      } else {
        // Mark as deleted in Supabase instead of deleting
        const supabase = createSupabaseClient();
        const { error: updateError } = await supabase
          .from('predictions')
          .update({ is_deleted: true })
          .eq('id', id);
        
        if (updateError) {
          console.error('Failed to mark as deleted in Supabase:', updateError);
          toast.error("Failed to delete image");
        } else {
          // Remove from local state
          setGenerations(prev => prev.filter(gen => gen.id !== id));
          toast.success("Image deleted successfully");
        }
      }
    } catch (error) {
      console.error('Error deleting generation:', error);
      toast.error("Failed to delete image");
    } finally {
      setIsDeleting(null);
    }
  };

  const copyPromptToClipboard = (prompt: string) => {
    navigator.clipboard.writeText(prompt)
      .then(() => {
        toast.success("Prompt copied to clipboard");
      })
      .catch((error) => {
        console.error("Failed to copy prompt:", error);
        toast.error("Failed to copy prompt");
      });
  };

  const handleCancel = async (id: string) => {
    try {
      setIsDeleting(id); // Reuse the isDeleting state to show loading
      
      console.log(`Attempting to cancel generation with local ID: ${id}`);
      
      // First attempt: Find replicate_id in pending generations
      let pendingGen = pendingGenerations.find(pg => pg.id === id);
      let replicate_id = pendingGen?.replicate_id;
      
      console.log("Found pending generation:", pendingGen);
      
      // If we don't have a replicate_id yet, try a few times with a small delay
      let retries = 0;
      const maxRetries = 3;
      
      while (!replicate_id && retries < maxRetries) {
        retries++;
        console.log(`Retry ${retries}/${maxRetries}: Waiting for replicate_id to become available...`);
        
        // Wait a second
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check again if we have the pending generation with replicate_id
        pendingGen = pendingGenerations.find(pg => pg.id === id);
        replicate_id = pendingGen?.replicate_id;
        console.log(`After retry ${retries}, pending generation:`, pendingGen);
      }
      
      // Second attempt: If not found in pending generations, try to find in Supabase database
      // This might happen if the UI state and database state are out of sync
      if (!replicate_id) {
        console.log("No replicate_id found in pending generations. Trying to find in Supabase...");
        
        // Look up any related prediction in Supabase
        const supabase = createSupabaseClient();
        
        // Search for the most recent prediction with a matching prompt (if we have one)
        if (pendingGen?.prompt) {
          const { data, error } = await supabase
            .from('predictions')
            .select('replicate_id, created_at')
            .eq('prompt', pendingGen.prompt)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (error) {
            console.error("Error looking up prediction by prompt:", error);
          } else if (data && data.length > 0) {
            replicate_id = data[0].replicate_id;
            console.log(`Found replicate_id ${replicate_id} in database by matching prompt`);
          }
        }
        
        // If still not found and we've exhausted all options
        if (!replicate_id) {
          console.log("Could not find replicate_id after all attempts");
          toast.error("Unable to cancel - could not find prediction ID. The generation may still be initializing.");
          setIsDeleting(null);
          return;
        }
      }
      
      console.log(`Sending cancellation request for prediction: ${replicate_id}`);
      
      const response = await fetch('/api/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ predictionId: replicate_id }),
      });
      
      const result = await response.json();
      console.log("Cancel API response:", result);
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel prediction');
      }
      
      // Remove from pending generations if it's there
      if (pendingGenerations.some(pg => pg.id === id)) {
        clearPendingGeneration(id);
      }
      
      toast.success("Image generation cancelled");
      refreshHistory();
    } catch (error) {
      console.error('Error cancelling prediction:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to cancel generation');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="w-full">
      <Toaster />
      <h2 className="text-2xl font-bold mb-6">Your Image History</h2>
      
      {/* Loading indicator for initial history fetch */}
      <LoadingIndicator 
        isLoading={isLoading} 
        text="Loading image history..." 
        className="mb-4"
      />
      
      {/* Pending generations section */}
      {pendingGenerations.length > 0 && (
        <div className="mb-8">
          <div className="space-y-6">
            {pendingGenerations.map((generation) => (
              <motion.div
                key={generation.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="overflow-hidden border-primary/20 shadow-md hover:shadow-lg transition-shadow duration-300">
                  <CardHeader className="p-4 pb-0 space-y-0">
                    {/* All controls in a single horizontal line */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => copyPromptToClipboard(generation.prompt)}
                          className="flex items-center gap-1.5"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clipboard">
                            <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                          </svg>
                          Copy Prompt
                        </Button>
                        
                        <div className="flex items-center gap-2 ml-2">
                          {generation.potentiallyStalled ? (
                            <>
                              <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></span>
                              <span className="text-sm font-medium text-amber-500">Stalled</span>
                            </>
                          ) : (
                            <>
                              <span className="inline-block w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
                              <span className="text-sm font-medium text-primary">Generating</span>
                              {elapsedTimes[generation.id] !== undefined && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({elapsedTimes[generation.id]}s)
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        
                        {generation.potentiallyStalled && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              clearPendingGeneration(generation.id);
                            }}
                            className="ml-2 text-xs font-medium px-2 py-1 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors duration-200 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                        
                        {!generation.potentiallyStalled && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCancel(generation.id);
                            }}
                            disabled={isDeleting === generation.id}
                            className="ml-2 text-xs font-medium px-2 py-1 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isDeleting === generation.id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                      
                      <span className="text-xs font-medium px-3 py-1.5 bg-primary/10 text-primary rounded-full border border-primary/20">
                        {generation.aspectRatio}
                      </span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-4 pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton 
                          key={index} 
                          className="aspect-square rounded-lg"
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}
      
      {!isLoading && error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive">{error}</p>
          <p className="text-sm text-destructive/80 mt-2">Using client-side history as fallback.</p>
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
                  {/* All controls in a single horizontal line */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => copyPromptToClipboard(generation.prompt)}
                        className="flex items-center gap-1.5"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-clipboard">
                          <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                        </svg>
                        Copy Prompt
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDelete(generation.id)}
                        disabled={isDeleting === generation.id}
                        className="flex items-center gap-1.5"
                      >
                        {isDeleting === generation.id ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              <line x1="10" x2="10" y1="11" y2="17"/>
                              <line x1="14" x2="14" y1="11" y2="17"/>
                            </svg>
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <span className="text-xs font-medium px-3 py-1.5 bg-primary/10 text-primary rounded-full border border-primary/20">
                      {generation.aspectRatio}
                    </span>
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
                          <img 
                            src={image} 
                            alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              console.error(`Failed to load image: ${image}`);
                              // Fallback to a placeholder
                              e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                              e.currentTarget.style.padding = "25%";
                              e.currentTarget.style.background = "#f0f0f0";
                            }}
                          />
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