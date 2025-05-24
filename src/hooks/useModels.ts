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
  gender?: string;
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
// interface ModelsCache {
//   models: Model[];
//   lastFetched: number;
//   totalPages: number;
//   currentPage: number;
// }

// Create a global models cache
// const modelsCache: Record<string, ModelsCache> = {};
// const CACHE_TTL = 24 * 60 * 60 * 1000; // Cache time to live: 24 hours

export function useModels(newTraining: NewTraining | null = null) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
  // Create a cache key based on user ID and page
  // const getCacheKey = useCallback((userId: string | undefined, pageNum: number) => {
  //   return `${userId || 'anonymous'}_page_${pageNum}`;
  // }, []);

  // Check if cache is still valid
  // const isCacheValid = useCallback((cacheKey: string) => {
  //   const cache = modelsCache[cacheKey];
  //   return cache && 
  //          Date.now() - cache.lastFetched < CACHE_TTL;
  // }, []);

  // Memoize the fetch function
  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = user?.id;
      // const cacheKey = getCacheKey(userId, pageNum);
      
      // Check if we have a valid cache and it's not a forced refresh
      // if (!forceRefresh && isCacheValid(cacheKey)) {
      //   const cache = modelsCache[cacheKey];
      //   setModels(cache.models);
      //   setPage(cache.currentPage);
      //   setTotalPages(cache.totalPages);
      //   setLoading(false);
      //   return;
      // }
      
      // Fetch from API
      const params = new URLSearchParams();
      if (userId) {
        params.append('user_id', userId);
      }
      // params.append('page', pageNum.toString());
      
      const url = `/api/model/list?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      
      const data: ModelListResponse = await response.json();
      
      if (data.success) {
        setModels(data.models);
        // setPage(data.pagination.page);
        // setTotalPages(data.pagination.pages);
        
        // Update the cache
        // modelsCache[cacheKey] = {
        //   models: data.models,
        //   lastFetched: Date.now(),
        //   currentPage: data.pagination.page,
        //   totalPages: data.pagination.pages,
        // };
      } else {
        setError(data.error || "Failed to fetch models");
        setModels([]);
        // setTotalPages(1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setModels([]);
      // setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Handle page change
  // const handlePageChange = useCallback((newPage: number) => {
  //   if (newPage > 0 && newPage <= totalPages) {
  //     setPage(newPage);
  //     fetchModels(newPage);
  //   }
  // }, [totalPages, fetchModels]);

  // Initial fetch
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
    
    // A new training was created, so refetch
    fetchModels();
    
  }, [newTraining, fetchModels]);

  // Functions to remove models from the list
  const removeModelFromState = useCallback((modelId: string) => {
    setModels(prevModels => prevModels.filter(model => model.id !== modelId));
    
    // Also update all caches that might contain this model
    // Object.keys(modelsCache).forEach(key => {
    //   modelsCache[key].models = modelsCache[key].models.filter(model => model.id !== modelId);
    // });
  }, []);

  // Clear all caches - useful when training a new model
  // const invalidateCache = useCallback(() => {
  //   const currentPage = page;
  //   Object.keys(modelsCache).forEach(key => {
  //     delete modelsCache[key];
  //   });
  //   fetchModels(currentPage, true);
  // }, [fetchModels, page]);

  return {
    models,
    loading,
    error,
    // page,
    // totalPages,
    // handlePageChange,
    fetchModels,
    isNewTrainingInModels,
    removeModelFromState,
    // invalidateCache
  };
} 