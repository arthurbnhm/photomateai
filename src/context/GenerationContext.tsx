"use client"

import { createContext, useContext, useState, ReactNode, useEffect } from 'react'

// Define the type for image generation
type ImageGeneration = {
  id: string
  prompt: string
  timestamp: string
  images: string[]
  aspectRatio: string
}

// Add a type for pending generations with potential stall status
type PendingGeneration = {
  id: string
  prompt: string
  aspectRatio: string
  startTime?: string // When the generation started
  potentiallyStalled?: boolean // Flag for generations that might be stalled
}

type GenerationContextType = {
  isGenerating: boolean
  setIsGenerating: (value: boolean) => void
  refreshHistory: () => void
  lastGeneratedAt: number | null
  clientHistory: ImageGeneration[]
  addToClientHistory: (generation: ImageGeneration) => void
  // Add functions for tracking pending generations
  pendingGenerations: PendingGeneration[]
  addPendingGeneration: (generation: PendingGeneration) => void
  removePendingGeneration: (id: string) => void
  clearStalePendingGenerations: () => void
  clearPendingGeneration: (id: string) => void
  checkForCompletedGenerations: () => Promise<void>
  deleteGeneration: (id: string) => Promise<boolean>
}

const GenerationContext = createContext<GenerationContextType | undefined>(undefined)

// Time in milliseconds after which a pending generation is considered stale
const STALE_GENERATION_THRESHOLD = 10 * 60 * 1000; // 10 minutes

// Time to mark a generation as potentially stalled (3 minutes)
const POTENTIALLY_STALLED_THRESHOLD = 3 * 60 * 1000;

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null)
  const [clientHistory, setClientHistory] = useState<ImageGeneration[]>([])
  // Add state for pending generations
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([])

  // Load client history from localStorage on mount
  useEffect(() => {
    try {
      // Load completed generations
      const savedHistory = localStorage.getItem('imageHistory')
      if (savedHistory) {
        setClientHistory(JSON.parse(savedHistory))
      }
      
      // Load pending generations
      const savedPendingGenerations = localStorage.getItem('pendingGenerations')
      if (savedPendingGenerations) {
        const parsedPending = JSON.parse(savedPendingGenerations) as PendingGeneration[]
        
        // Filter out stale pending generations
        const now = Date.now()
        let activePending = parsedPending.filter(gen => {
          if (!gen.startTime) return false
          
          const genStartTime = new Date(gen.startTime).getTime()
          return (now - genStartTime) < STALE_GENERATION_THRESHOLD
        })
        
        // Load client history to deduplicate
        if (savedHistory) {
          const history = JSON.parse(savedHistory) as ImageGeneration[]
          
          // Filter out pending generations that are already in history
          activePending = activePending.filter(pending => {
            // Check if this pending generation appears in history by ID
            return !history.some(completed => completed.id === pending.id)
          })
        }
        
        // Mark potentially stalled generations
        activePending = activePending.map(gen => {
          if (!gen.startTime) return gen;
          
          const now = Date.now();
          const genStartTime = new Date(gen.startTime).getTime();
          const potentiallyStalled = (now - genStartTime) > POTENTIALLY_STALLED_THRESHOLD;
          
          return {
            ...gen,
            potentiallyStalled
          };
        });
        
        setPendingGenerations(activePending)
      }
    } catch (error) {
      console.error('Error loading data from localStorage:', error)
    }
  }, [])

  // Check for pending generations that might be stalled
  useEffect(() => {
    // Check every 30 seconds to see if any pending generations should be marked as stalled
    const interval = setInterval(() => {
      const now = Date.now()
      setPendingGenerations(prev => 
        prev.map(gen => {
          if (!gen.startTime) return gen;
          
          const genStartTime = new Date(gen.startTime).getTime();
          const potentiallyStalled = (now - genStartTime) > POTENTIALLY_STALLED_THRESHOLD;
          
          // Only update if the stalled status changes
          if (potentiallyStalled !== gen.potentiallyStalled) {
            return {
              ...gen,
              potentiallyStalled
            };
          }
          return gen;
        })
      )
    }, 30000) // Check every 30 seconds
    
    return () => clearInterval(interval)
  }, [])

  // Run this effect when user visibility changes (tab focus)
  useEffect(() => {
    // Define the visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // User has returned to the tab, check for completed generations
        checkForCompletedGenerations()
      }
    }
    
    // Add event listener
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Also check when the component mounts (in case the user navigated within the app)
    checkForCompletedGenerations()
    
    // Clean up event listener
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Save client history to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('imageHistory', JSON.stringify(clientHistory))
      
      // Whenever history changes, ensure we don't have duplicates in pending
      if (pendingGenerations.length > 0) {
        const deduplicatedPending = pendingGenerations.filter(pending => {
          // Keep only pending generations that don't appear in the history
          return !clientHistory.some(completed => completed.id === pending.id)
        })
        
        // If we removed any duplicates, update state
        if (deduplicatedPending.length !== pendingGenerations.length) {
          setPendingGenerations(deduplicatedPending)
        }
      }
    } catch (error) {
      console.error('Error saving history to localStorage:', error)
    }
  }, [clientHistory, pendingGenerations])
  
  // Save pending generations to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('pendingGenerations', JSON.stringify(pendingGenerations))
    } catch (error) {
      console.error('Error saving pending generations to localStorage:', error)
    }
  }, [pendingGenerations])

  const refreshHistory = () => {
    setLastGeneratedAt(Date.now())
  }

  const addToClientHistory = (generation: ImageGeneration) => {
    setClientHistory(prev => {
      // Check if this generation already exists in history to avoid duplicates
      if (prev.some(item => item.id === generation.id)) {
        return prev
      }
      
      const newHistory = [generation, ...prev].slice(0, 10)
      return newHistory
    })
    
    // When adding to history, ensure we remove from pending
    removePendingGeneration(generation.id)
  }

  // Add functions to manage pending generations
  const addPendingGeneration = (generation: PendingGeneration) => {
    // Add start time if not provided
    const genWithStartTime = {
      ...generation,
      startTime: generation.startTime || new Date().toISOString(),
      potentiallyStalled: false
    }
    
    // Check if this generation is already in client history
    const isDuplicate = clientHistory.some(item => item.id === generation.id)
    
    // Only add if not a duplicate of a completed generation
    if (!isDuplicate) {
      setPendingGenerations(prev => [...prev, genWithStartTime])
    }
  }

  const removePendingGeneration = (id: string) => {
    setPendingGenerations(prev => prev.filter(gen => gen.id !== id))
  }
  
  // Clear stale pending generations (older than threshold)
  const clearStalePendingGenerations = () => {
    const now = Date.now()
    setPendingGenerations(prev => {
      // Remove generations that are stale
      const filtered = prev.filter(gen => {
        if (!gen.startTime) return false
        const genStartTime = new Date(gen.startTime).getTime()
        return (now - genStartTime) < STALE_GENERATION_THRESHOLD
      })
      
      // Also remove generations that already exist in client history
      return filtered.filter(pending => 
        !clientHistory.some(completed => completed.id === pending.id)
      )
    })
  }
  
  // Clear a specific pending generation by ID
  const clearPendingGeneration = (id: string) => {
    setPendingGenerations(prev => prev.filter(gen => gen.id !== id));
    console.log(`Manually cleared pending generation with ID ${id}`);
  }
  
  // Function to check if pending generations have completed
  // This helps when user navigates away and back during generation
  const checkForCompletedGenerations = async () => {
    // If no pending generations, nothing to do
    if (pendingGenerations.length === 0) return

    try {
      // Get latest history from API to see if any generations completed
      const response = await fetch('/api/history')
      
      if (response.ok) {
        const latestHistory = await response.json()
        
        if (Array.isArray(latestHistory) && latestHistory.length > 0) {
          // If API returns history, check for completed generations
          let updatedClientHistory = [...clientHistory]
          const pendingToRemove: string[] = []
          
          // Check each pending generation
          for (const pending of pendingGenerations) {
            // Look for this generation in API response
            const completedGeneration = latestHistory.find(item => item.id === pending.id)
            
            if (completedGeneration) {
              // This generation has completed while user was away
              // Add to local history if not already there
              if (!clientHistory.some(item => item.id === pending.id)) {
                updatedClientHistory = [completedGeneration, ...updatedClientHistory].slice(0, 10)
              }
              
              // Mark for removal from pending
              pendingToRemove.push(pending.id)
            }
          }
          
          // Update states if needed
          if (pendingToRemove.length > 0) {
            // Remove completed generations from pending
            setPendingGenerations(prev => 
              prev.filter(gen => !pendingToRemove.includes(gen.id))
            )
            
            // Update client history
            if (updatedClientHistory.length !== clientHistory.length) {
              setClientHistory(updatedClientHistory)
              // Force a refresh of the UI
              refreshHistory()
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking for completed generations:', error)
    }
  }

  // Function to delete a generation from history
  const deleteGeneration = async (id: string): Promise<boolean> => {
    try {
      // First remove from client history
      setClientHistory(prev => prev.filter(gen => gen.id !== id));
      
      // Then try to delete from the server
      try {
        const response = await fetch(`/api/history?id=${id}`, {
          method: 'DELETE',
        });
        
        // If the server returns 404, it means the generation doesn't exist on the server
        // This is fine if we're using client history, so we'll still return true
        if (response.status === 404) {
          return true;
        }
        
        return response.ok;
      } catch (serverError) {
        // If the server request fails but we've already removed from client history,
        // we'll consider this a success
        console.error('Error deleting from server, but removed from client:', serverError);
        return true;
      }
    } catch (error) {
      console.error('Error deleting generation:', error);
      return false;
    }
  };

  return (
    <GenerationContext.Provider value={{ 
      isGenerating, 
      setIsGenerating, 
      refreshHistory,
      lastGeneratedAt,
      clientHistory,
      addToClientHistory,
      pendingGenerations,
      addPendingGeneration,
      removePendingGeneration,
      clearStalePendingGenerations,
      clearPendingGeneration,
      checkForCompletedGenerations,
      deleteGeneration
    }}>
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration() {
  const context = useContext(GenerationContext)
  if (context === undefined) {
    throw new Error('useGeneration must be used within a GenerationProvider')
  }
  return context
} 