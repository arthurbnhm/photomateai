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

// Local storage keys
const PENDING_GENERATIONS_KEY = 'photomate_pending_generations';
const CLIENT_HISTORY_KEY = 'photomate_client_history';

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null)
  const [clientHistory, setClientHistory] = useState<ImageGeneration[]>([])
  // Add state for pending generations
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Load saved state from localStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Load pending generations
        const savedPendingGenerations = localStorage.getItem(PENDING_GENERATIONS_KEY);
        if (savedPendingGenerations) {
          const parsed = JSON.parse(savedPendingGenerations);
          if (Array.isArray(parsed)) {
            setPendingGenerations(parsed);
            console.log('Restored pending generations from localStorage:', parsed.length);
          }
        }

        // Load client history
        const savedClientHistory = localStorage.getItem(CLIENT_HISTORY_KEY);
        if (savedClientHistory) {
          const parsed = JSON.parse(savedClientHistory);
          if (Array.isArray(parsed)) {
            setClientHistory(parsed);
            console.log('Restored client history from localStorage:', parsed.length);
          }
        }

        // Check for completed generations immediately after restoring state
        setTimeout(() => {
          checkForCompletedGenerations();
        }, 500);

        setIsInitialized(true);
      } catch (error) {
        console.error('Error loading state from localStorage:', error);
        setIsInitialized(true);
      }
    }
  }, []);

  // Save pending generations to localStorage whenever they change
  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      localStorage.setItem(PENDING_GENERATIONS_KEY, JSON.stringify(pendingGenerations));
    }
  }, [pendingGenerations, isInitialized]);

  // Save client history to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      localStorage.setItem(CLIENT_HISTORY_KEY, JSON.stringify(clientHistory));
    }
  }, [clientHistory, isInitialized]);

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

  // Set up a polling interval to check for completed generations
  useEffect(() => {
    // Skip if not initialized yet
    if (!isInitialized) return;
    
    // Initial check
    checkForCompletedGenerations();
    
    // Set up polling interval - check every 10 seconds
    const interval = setInterval(() => {
      checkForCompletedGenerations();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [isInitialized]);

  const refreshHistory = () => {
    console.log('Refreshing history, triggering UI update');
    setLastGeneratedAt(Date.now());
  }

  const addToClientHistory = (generation: ImageGeneration) => {
    console.log('Adding to client history:', generation);
    setClientHistory(prev => {
      // Check if this generation already exists in history to avoid duplicates
      if (prev.some(item => item.id === generation.id)) {
        console.log('Generation already exists in history, not adding duplicate');
        return prev;
      }
      
      const newHistory = [generation, ...prev].slice(0, 10);
      console.log('New client history:', newHistory);
      return newHistory;
    });
    
    // When adding to history, ensure we remove from pending
    removePendingGeneration(generation.id);
    
    // Refresh history to trigger UI update
    refreshHistory();
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
      console.log('Checking for completed generations, pending count:', pendingGenerations.length);
      
      // Initialize Supabase client
      const supabase = createSupabaseClient();
      
      // For each pending generation, check if it has completed in Supabase
      const pendingToRemove: string[] = [];
      let updatedClientHistory = [...clientHistory];
      let historyChanged = false;
      
      // First, check for pending generations that don't have a replicate_id yet
      const pendingWithoutReplicateId = pendingGenerations.filter(pg => !pg.replicate_id);
      if (pendingWithoutReplicateId.length > 0) {
        console.log('Checking for pending generations without replicate_id:', pendingWithoutReplicateId.length);
        
        // For each pending generation without replicate_id, try to find it in the database by prompt
        for (const pending of pendingWithoutReplicateId) {
          // Skip if no prompt (shouldn't happen, but just in case)
          if (!pending.prompt) continue;
          
          // Look for a prediction with this prompt that was created around the same time
          const startTime = pending.startTime ? new Date(pending.startTime) : new Date();
          const fiveMinutesAgo = new Date(startTime.getTime() - 5 * 60 * 1000);
          const fiveMinutesLater = new Date(startTime.getTime() + 5 * 60 * 1000);
          
          const { data: predictions, error } = await supabase
            .from('predictions')
            .select('*')
            .eq('prompt', pending.prompt)
            .gte('created_at', fiveMinutesAgo.toISOString())
            .lte('created_at', fiveMinutesLater.toISOString())
            .order('created_at', { ascending: false });
          
          if (error) {
            console.error('Error looking up prediction by prompt:', error);
            continue;
          }
          
          if (predictions && predictions.length > 0) {
            // Found a matching prediction, update the pending generation with the replicate_id
            console.log('Found matching prediction for pending generation:', pending.id, predictions[0].replicate_id);
            
            // Update the pending generation with the replicate_id
            setPendingGenerations(prev => 
              prev.map(pg => 
                pg.id === pending.id 
                  ? { ...pg, replicate_id: predictions[0].replicate_id } 
                  : pg
              )
            );
            
            // If the prediction has output, add it to client history
            if (predictions[0].output && Array.isArray(predictions[0].output) && predictions[0].output.length > 0) {
              const generation: ImageGeneration = {
                id: predictions[0].id,
                prompt: predictions[0].prompt,
                timestamp: predictions[0].created_at,
                images: predictions[0].output,
                aspectRatio: predictions[0].aspect_ratio
              };
              
              // If the prediction is succeeded, mark it for removal from pending
              if (predictions[0].status === 'succeeded') {
                pendingToRemove.push(pending.id);
              }
              
              // Update client history
              const existingIndex = updatedClientHistory.findIndex(item => item.id === predictions[0].id);
              if (existingIndex === -1) {
                updatedClientHistory = [generation, ...updatedClientHistory].slice(0, 10);
                historyChanged = true;
              } else if (updatedClientHistory[existingIndex].images.length < generation.images.length) {
                updatedClientHistory[existingIndex] = generation;
                historyChanged = true;
              }
            }
          }
        }
      }
      
      // Now check for pending generations that have a replicate_id
      for (const pending of pendingGenerations) {
        // Skip if we don't have a replicate_id yet
        if (!pending.replicate_id) {
          continue;
        }
        
        console.log(`Checking status for pending generation with replicate_id: ${pending.replicate_id}`);
        
        // Try to find a prediction with this replicate_id (completed or in-progress with partial results)
        const { data: prediction, error } = await supabase
          .from('predictions')
          .select('*')
          .eq('replicate_id', pending.replicate_id)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking for prediction:', error);
          continue;
        }
        
        console.log('Prediction status check result:', prediction?.status, 'Output length:', prediction?.output?.length || 0);
        
        // If no prediction found, skip
        if (!prediction) {
          console.log('No prediction found for replicate_id:', pending.replicate_id);
          continue;
        }
        
        // Check if prediction is cancelled
        if (prediction.is_cancelled === true) {
          console.log('Found cancelled prediction:', pending.id);
          pendingToRemove.push(pending.id);
          continue;
        }
        
        // Check if prediction has output (partial or complete)
        if (prediction.output && Array.isArray(prediction.output) && prediction.output.length > 0) {
          console.log('Found prediction with output:', pending.id, 'Images:', prediction.output.length);
          
          // Create a generation object
          const generation: ImageGeneration = {
            id: prediction.id,
            prompt: prediction.prompt,
            timestamp: prediction.created_at,
            images: prediction.output,
            aspectRatio: prediction.aspect_ratio
          };
          
          // If the prediction is succeeded, mark it for removal from pending
          if (prediction.status === 'succeeded') {
            console.log('Prediction completed successfully, removing from pending:', pending.id);
            pendingToRemove.push(pending.id);
          }
          
          // Update client history if this generation is not already there or if it has more images
          const existingIndex = updatedClientHistory.findIndex(item => item.id === prediction.id);
          if (existingIndex === -1) {
            // Add new generation to the beginning of the history
            console.log('Adding new generation to history:', prediction.id);
            updatedClientHistory = [generation, ...updatedClientHistory].slice(0, 10);
            historyChanged = true;
          } else if (updatedClientHistory[existingIndex].images.length < generation.images.length) {
            // Update existing generation with new images
            console.log('Updating existing generation with new images:', 
              'Old count:', updatedClientHistory[existingIndex].images.length,
              'New count:', generation.images.length);
            updatedClientHistory[existingIndex] = generation;
            historyChanged = true;
          }
        }
      }
      
      // Update states if needed
      if (pendingToRemove.length > 0) {
        console.log('Removing completed/cancelled generations from pending:', pendingToRemove);
        // Remove completed generations from pending
        setPendingGenerations(prev => 
          prev.filter(gen => !pendingToRemove.includes(gen.id))
        );
      }
      
      // Update client history if it changed
      if (historyChanged) {
        console.log('Updating client history with new/updated generations');
        setClientHistory(updatedClientHistory);
        // Force a refresh of the UI
        refreshHistory();
      } else {
        console.log('No changes to client history detected');
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