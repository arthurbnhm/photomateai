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

type ImageGeneration = {
  id: string
  prompt: string
  timestamp: string
  images: string[]
  aspectRatio: string
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
    // Function to fetch image history
    const fetchImageHistory = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Fetch the actual image history from an API endpoint
        const response = await fetch('/api/history')
        if (!response.ok) {
          throw new Error('Failed to fetch image history')
        }
        const data = await response.json()
        console.log('Fetched image history:', data)
        
        if (Array.isArray(data) && data.length > 0) {
          setGenerations(data)
          setUseClientHistory(false)
        } else {
          console.log('Server history is empty, using client history:', clientHistory)
          setGenerations(clientHistory)
          setUseClientHistory(true)
        }
        
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching image history:', err)
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
      const success = await deleteGeneration(id);
      
      if (success) {
        // If using client history, the context will update it automatically
        // If using server history, we need to remove it from our local state
        if (!useClientHistory) {
          setGenerations(prev => prev.filter(gen => gen.id !== id));
        }
        // Force a refresh to ensure UI is updated
        refreshHistory();
      } else {
        console.error('Failed to delete generation');
        // Even if the server delete failed, we should update the UI
        // to remove the generation from the local state
        setGenerations(prev => prev.filter(gen => gen.id !== id));
      }
    } catch (error) {
      console.error('Error deleting generation:', error);
      // Even if there was an error, we should update the UI
      setGenerations(prev => prev.filter(gen => gen.id !== id));
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
                    {generation.images.map((image, index) => (
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
                        />
                      </div>
                    ))}
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