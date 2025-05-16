import { useState, useEffect, useCallback } from 'react';
import { useAuth } from "@/contexts/AuthContext";

interface Training {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  training_id: string;
  is_cancelled?: boolean;
  model_id?: string;
}

interface Model {
  id: string;
  model_id: string;
  model_owner: string;
  display_name: string;
  status: string;
  created_at: string;
  trainings: Training[];
  training_id?: string;
  is_cancelled?: boolean;
  training_status?: string;
}

interface ModelListResponse {
  success: boolean;
  models: Model[];
  error?: string;
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

interface NewTraining {
  id: string;
  status: string;
  url: string;
  modelId?: string;
  modelName?: string;
  modelOwner?: string;
  displayName?: string;
}

// Cache structure
interface ModelsCache {
  models: Model[];
  lastFetched: number;
}

// Create a global models cache
const modelsCache: Record<string, ModelsCache> = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // Cache time to live: 24 hours

export function useModels(newTraining: NewTraining | null = null) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
  // Create a cache key based on user ID
  const getCacheKey = useCallback((userId: string | undefined) => {
    return `${userId || 'anonymous'}`;
  }, []);

  // Check if cache is still valid
  const isCacheValid = useCallback((cacheKey: string) => {
    const cache = modelsCache[cacheKey];
    return cache && 
           Date.now() - cache.lastFetched < CACHE_TTL;
  }, []);

  // Memoize the fetch function
  const fetchModels = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const userId = user?.id;
      const cacheKey = getCacheKey(userId);
      
      // Check if we have a valid cache and it's not a forced refresh
      if (!forceRefresh && isCacheValid(cacheKey)) {
        const cache = modelsCache[cacheKey];
        setModels(cache.models);
        setLoading(false);
        return;
      }
      
      // Fetch from API - remove pageNum from URL
      const url = userId 
        ? `/api/model/list?user_id=${userId}` 
        : `/api/model/list`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      
      const data: ModelListResponse = await response.json();
      
      if (data.success) {
        setModels(data.models);
        
        // Update the cache
        modelsCache[cacheKey] = {
          models: data.models,
          lastFetched: Date.now(),
        };
      } else {
        setError(data.error || "Failed to fetch models");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [user?.id, getCacheKey, isCacheValid]);

  // Initial fetch - remove page dependency
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Function to check if a new training is already in models list
  const isNewTrainingInModels = useCallback(() => {
    if (!newTraining || !models.length) return false;
    
    return models.some(model => {
      // Check for model ID match
      if (newTraining.modelId && model.id === newTraining.modelId) return true;
      
      // Check for name/owner match if modelId isn't available
      if (newTraining.modelName && newTraining.modelOwner) {
        return model.model_id === newTraining.modelName && 
               model.model_owner === newTraining.modelOwner;
      }
      
      // Check for training ID match in any model's trainings
      return model.trainings.some(training => 
        training.id === newTraining.id || 
        training.training_id === newTraining.id
      );
    });
  }, [newTraining, models]);

  // Update for new training - removing polling
  useEffect(() => {
    if (!newTraining) return;
    
    // A new training was created, so invalidate the cache by forcing a refresh
    fetchModels(true);
    
  }, [newTraining, fetchModels]);

  // Functions to remove models from the list and cache
  const removeModelFromState = useCallback((modelId: string) => {
    setModels(prevModels => prevModels.filter(model => model.id !== modelId));
    
    // Also update all caches that might contain this model
    Object.keys(modelsCache).forEach(key => {
      modelsCache[key].models = modelsCache[key].models.filter(model => model.id !== modelId);
    });
  }, []);

  // Clear all caches - useful when training a new model
  const invalidateCache = useCallback(() => {
    Object.keys(modelsCache).forEach(key => {
      delete modelsCache[key];
    });
    fetchModels(true);
  }, [fetchModels]);

  return {
    models,
    loading,
    error,
    fetchModels,
    isNewTrainingInModels,
    removeModelFromState,
    invalidateCache
  };
} 