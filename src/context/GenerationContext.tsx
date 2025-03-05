"use client"

import { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

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
  replicate_id?: string // Store the actual Replicate ID when available
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

  // Mark potentially stalled generations periodically
  useEffect(() => {
    if (pendingGenerations.length === 0) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      
      setPendingGenerations(prev => 
        prev.map(gen => {
          if (!gen.startTime) return gen;
          
          const genStartTime = new Date(gen.startTime).getTime();
          const potentiallyStalled = (now - genStartTime) > POTENTIALLY_STALLED_THRESHOLD;
          
          return {
            ...gen,
            potentiallyStalled
          };
        })
      );
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [pendingGenerations]);

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
      // Initialize Supabase client
      const supabase = createSupabaseClient();
      
      // For each pending generation, check if it has completed in Supabase
      const pendingToRemove: string[] = [];
      let updatedClientHistory = [...clientHistory];
      
      for (const pending of pendingGenerations) {
        // Skip if we don't have a replicate_id yet
        if (!pending.replicate_id) {
          console.log(`Skipping check for pending generation ${pending.id} - no replicate_id available yet`);
          continue;
        }
        
        console.log(`Checking status for pending generation with replicate_id: ${pending.replicate_id}`);
        
        // Try to find a completed prediction with this replicate_id
        const { data: completedPrediction, error } = await supabase
          .from('predictions')
          .select('*')
          .eq('replicate_id', pending.replicate_id)
          .or('status.eq.succeeded,is_cancelled.eq.true')
          .maybeSingle();
        
        if (error) {
          console.error('Error checking for completed prediction:', error);
          continue;
        }
        
        console.log('Checking prediction status:', pending.id, completedPrediction);
        
        // Check if prediction is completed or cancelled
        if (completedPrediction) {
          // If it's cancelled, just remove from pending without adding to history
          if (completedPrediction.is_cancelled === true) {
            console.log('Found cancelled prediction:', pending.id);
            pendingToRemove.push(pending.id);
            continue;
          }
          
          // If it's succeeded and has output, add to history
          if (completedPrediction.status === 'succeeded' && completedPrediction.output) {
            console.log('Found completed prediction with output:', pending.id, completedPrediction.output);
            // This generation has completed
            const completedGeneration: ImageGeneration = {
              id: completedPrediction.id,
              prompt: completedPrediction.prompt,
              timestamp: completedPrediction.created_at,
              images: Array.isArray(completedPrediction.output) ? completedPrediction.output : [],
              aspectRatio: completedPrediction.aspect_ratio
            };
            
            // Add to client history if not already there
            if (!clientHistory.some(item => item.id === completedPrediction.id)) {
              updatedClientHistory = [completedGeneration, ...updatedClientHistory].slice(0, 10);
            }
            
            // Mark for removal from pending
            pendingToRemove.push(pending.id);
          }
        }
      }
      
      // Update states if needed
      if (pendingToRemove.length > 0) {
        // Remove completed generations from pending
        setPendingGenerations(prev => 
          prev.filter(gen => !pendingToRemove.includes(gen.id))
        );
        
        // Update client history
        if (updatedClientHistory.length !== clientHistory.length) {
          setClientHistory(updatedClientHistory);
          // Force a refresh of the UI
          refreshHistory();
        }
      }
    } catch (error) {
      console.error('Error checking for completed generations:', error);
    }
  }

  // Function to delete a generation from history
  const deleteGeneration = async (id: string): Promise<boolean> => {
    try {
      // First remove from client history
      setClientHistory(prev => prev.filter(gen => gen.id !== id));
      
      // Then try to delete from Supabase
      const supabase = createSupabaseClient();
      const { error } = await supabase
        .from('predictions')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting from Supabase:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting generation:', error);
      return false;
    }
  }

  return (
    <GenerationContext.Provider
      value={{
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
      }}
    >
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