"use client"

import { useState, useEffect } from "react"
import { useGeneration } from "@/context/GenerationContext"
import { LoadingIndicator } from "@/components/ui/loading-indicator"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"

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
          <h3 className="text-lg font-medium mb-4 text-blue-600 dark:text-blue-400">
            Currently Generating
          </h3>
          <div className="space-y-8">
            {pendingGenerations.map((generation) => (
              <div 
                key={generation.id} 
                className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden shadow-lg"
              >
                <div className="p-4">
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
                            <span className="inline-block w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse"></span>
                            <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Stalled</span>
                          </>
                        ) : (
                          <>
                            <span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Generating</span>
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
                          className="ml-2 text-xs font-medium px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-md transition-colors duration-200 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    
                    <span className="text-xs font-medium px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full">
                      {generation.aspectRatio}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div 
                      key={index} 
                      className="aspect-square bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center shadow-sm"
                    >
                      <svg className="w-10 h-10 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {!isLoading && error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">Using client-side history as fallback.</p>
        </div>
      ) : !isLoading && generations.length === 0 && pendingGenerations.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
          <p className="text-gray-600 dark:text-gray-300">No images generated yet.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Use the form above to create your first image!
          </p>
        </div>
      ) : !isLoading && (
        <div className="space-y-8">
          {generations.map((generation) => (
            <div 
              key={generation.id} 
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-lg"
            >
              <div className="p-4">
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
                      className="flex items-center gap-1.5 ml-2"
                    >
                      {isDeleting === generation.id ? (
                        <>
                          <svg className="animate-spin h-4 w-4 mr-1.5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Deleting
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                          </svg>
                          Delete
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <span className="text-xs font-medium px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                    {generation.aspectRatio}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
                {generation.images.map((image, index) => (
                  <div 
                    key={index} 
                    className="aspect-square relative overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
                  >
                    <img 
                      src={image} 
                      alt={`Generated image ${index + 1} for "${generation.prompt}"`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 