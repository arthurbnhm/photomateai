"use client"

import { useState, Suspense, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Coins } from "lucide-react";

// Define the PendingGeneration type
type PendingGeneration = {
  id: string
  replicate_id?: string
  prompt: string
  aspectRatio: string
  startTime?: string
  format?: string
  modelDisplayName?: string
  is_edit?: boolean
}

// Define the type for image generation (moved from ImageHistory)
type ImageGeneration = {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
  format?: string
  modelDisplayName?: string
  is_edit?: boolean
  edits?: EditData[]
}

// Define type for edit data
type EditData = {
  id: string
  replicate_id: string
  prompt: string
  storage_urls: string[] | null
  status: string
  created_at: string
  source_image_url: string
  error?: string | null
}

// Define a type for image with status (moved from ImageHistory)
type ImageWithStatus = {
  url: string
  isExpired: boolean
  isLiked?: boolean
  generationId?: string
}

// Define a type for prediction data from Supabase (moved from ImageHistory)
type PredictionData = {
  id: string
  replicate_id: string
  prompt: string
  aspect_ratio: string
  status: string
  storage_urls: string[] | null
  liked_images?: string[] | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  is_deleted: boolean
  is_cancelled: boolean
  is_edit?: boolean
  format?: string
  input?: {
    output_format?: string
  }
  model_id: string
  models?: {
    display_name: string
  } | null
  edits?: EditData[]
}

// Define the Model interface (similar to PromptForm)
interface Model {
  id: string;
  model_id: string;
  display_name: string;
  // Add other fields if necessary, matching the API response
}

// Define type for pending generation database response
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface PendingGenerationDbRow {
  id: string;
  replicate_id: string;
  prompt: string;
  aspect_ratio: string;
  created_at: string;
  format?: string;
  input?: {
    output_format?: string;
  };
  model_id: string;
  models?: {
    display_name: string;
  } | null;
}

// Simplified processOutput (moved from ImageHistory)
const processOutput = (storageUrls: string[] | null, likedImages: string[] | null = null): ImageWithStatus[] => {
  if (!storageUrls || !Array.isArray(storageUrls)) {
    return [];
  }
  return storageUrls.map(url => ({
    url,
    isExpired: false,
    isLiked: likedImages ? likedImages.includes(url) : false
  }));
};

// Define default images as a constant outside the component
const DEFAULT_HEADER_IMAGES = ["/landing/01.webp", "/landing/02.webp", "/landing/03.webp"];

// Add localStorage utilities for header image selection
const HEADER_IMAGES_KEY = 'photomate_header_images';
const HEADER_IMAGES_TIMESTAMP_KEY = 'photomate_header_images_timestamp';

const getStoredHeaderImages = (): string[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(HEADER_IMAGES_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to get stored header images:', error);
    return null;
  }
};

const setStoredHeaderImages = (images: string[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HEADER_IMAGES_KEY, JSON.stringify(images));
    localStorage.setItem(HEADER_IMAGES_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.warn('Failed to store header images:', error);
  }
};

const getStoredHeaderImagesTimestamp = (): number => {
  if (typeof window === 'undefined') return 0;
  try {
    const timestamp = localStorage.getItem(HEADER_IMAGES_TIMESTAMP_KEY);
    return timestamp ? parseInt(timestamp, 10) : 0;
  } catch (error) {
    console.warn('Failed to get stored header images timestamp:', error);
    return 0;
  }
};

// Helper function to select header images deterministically
const selectHeaderImages = (allImageUrls: string[], userId?: string): string[] => {
  if (allImageUrls.length < 3) return DEFAULT_HEADER_IMAGES;
  
  // Use user ID as seed for consistent selection per user
  const seed = userId ? userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 12345;
  
  // Simple seeded random function
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  // Create indices array and shuffle with seeded random
  const indices = Array.from({ length: allImageUrls.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  // Return first 3 images from shuffled indices
  return indices.slice(0, 3).map(i => allImageUrls[i]);
};

// Create a client component for the Create page content
function CreatePageContent() {
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([]);
  const [promptValue, setPromptValue] = useState("");

  // State for generations, loading, and error (moved from ImageHistory)
  const [generations, setGenerations] = useState<ImageGeneration[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);
  
  // Infinite scroll state (replaces pagination)
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const itemsPerPage = 20;
  
  // Cache for completed predictions - using persistent localStorage
  const [predictionsCache, setPredictionsCache] = useState<Map<string, {
    data: PredictionData[];
    timestamp: number;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }>>(new Map());
  
  // Cache TTL (10 minutes for completed predictions)
  const CACHE_TTL = 10 * 60 * 1000;

  // Initialize cache from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('photomate_predictions_cache');
        if (stored) {
          const parsedCache = JSON.parse(stored) as Record<string, {
            data: PredictionData[];
            timestamp: number;
            pagination: {
              page: number;
              limit: number;
              total: number;
              totalPages: number;
              hasNextPage: boolean;
              hasPreviousPage: boolean;
            };
          }>;
          const cacheMap = new Map();
          
          // Convert stored object back to Map and check TTL
          Object.entries(parsedCache).forEach(([key, value]) => {
            if (Date.now() - value.timestamp < CACHE_TTL) {
              cacheMap.set(key, value);
            }
          });
          
          if (cacheMap.size > 0) {
            setPredictionsCache(cacheMap);
          }
        }
      } catch (error) {
        console.warn('Failed to restore cache from localStorage:', error);
      }
    }
  }, [CACHE_TTL]);

  // Save cache to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && predictionsCache.size > 0) {
      try {
        const cacheObject = Object.fromEntries(predictionsCache);
        localStorage.setItem('photomate_predictions_cache', JSON.stringify(cacheObject));
      } catch (error) {
        console.warn('Failed to save cache to localStorage:', error);
      }
    }
  }, [predictionsCache]);

  // Cache utility functions
  const getCacheKey = (page: number, isDeleted = false) => `predictions_${isDeleted}_${page}`;
  
  const getCachedData = useCallback((page: number, isDeleted = false) => {
    const key = getCacheKey(page, isDeleted);
    const cached = predictionsCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }
    return null;
  }, [predictionsCache, CACHE_TTL]);
  
  const setCachedData = useCallback((page: number, data: PredictionData[], pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }, isDeleted = false) => {
    const key = getCacheKey(page, isDeleted);
    setPredictionsCache(prev => new Map(prev).set(key, {
      data,
      timestamp: Date.now(),
      pagination
    }));
  }, []);
  
  // Remove a specific prediction from all cached pages
  const removePredictionFromCache = useCallback((predictionId: string) => {
    setPredictionsCache(prev => {
      const newCache = new Map(prev);
      let cacheUpdated = false;
      
      newCache.forEach((cacheEntry, key) => {
        const filteredData = cacheEntry.data.filter(item => item.id !== predictionId);
        if (filteredData.length !== cacheEntry.data.length) {
          newCache.set(key, {
            ...cacheEntry,
            data: filteredData
          });
          cacheUpdated = true;
        }
      });
      
      if (cacheUpdated && typeof window !== 'undefined') {
        try {
          const cacheObject = Object.fromEntries(newCache);
          localStorage.setItem('photomate_predictions_cache', JSON.stringify(cacheObject));
        } catch (error) {
          console.warn('Failed to update cache in localStorage:', error);
        }
      }
      
      return newCache;
    });
  }, []);

  // Update favorite status in cache without clearing
  const updateFavoriteInCache = useCallback((predictionId: string, imageUrl: string, isLiked: boolean) => {
    setPredictionsCache(prev => {
      const newCache = new Map(prev);
      let cacheUpdated = false;
      
      newCache.forEach((cacheEntry, key) => {
        const updatedData = cacheEntry.data.map(item => {
          if (item.id === predictionId) {
            const currentLikedImages = item.liked_images || [];
            let newLikedImages: string[];
            
            if (isLiked) {
              // Add to liked images if not already there
              newLikedImages = currentLikedImages.includes(imageUrl) 
                ? currentLikedImages 
                : [...currentLikedImages, imageUrl];
            } else {
              // Remove from liked images
              newLikedImages = currentLikedImages.filter(url => url !== imageUrl);
            }
            
            cacheUpdated = true;
            return {
              ...item,
              liked_images: newLikedImages
            };
          }
          return item;
        });
        
        if (cacheUpdated) {
          newCache.set(key, {
            ...cacheEntry,
            data: updatedData
          });
        }
      });
      
      if (cacheUpdated && typeof window !== 'undefined') {
        try {
          const cacheObject = Object.fromEntries(newCache);
          localStorage.setItem('photomate_predictions_cache', JSON.stringify(cacheObject));
        } catch (error) {
          console.warn('Failed to update cache in localStorage:', error);
        }
      }
      
      return newCache;
    });
  }, []);

  // State for user models
  const [userModels, setUserModels] = useState<Model[]>([]);
  const [isLoadingUserModels, setIsLoadingUserModels] = useState(true);
  const [userModelsError, setUserModelsError] = useState<string | null>(null);

  // State to control the initial model loading screen
  // Initialize to true to match SSR, then update in useEffect
  const [allowModelLoadingScreen, setAllowModelLoadingScreen] = useState(true);

  // State for reference image communication between ImageHistory and PromptForm
  const [referenceImageData, setReferenceImageData] = useState<{
    imageUrl: string;
    originalPrompt: string;
  } | null>(null);

  // Store the cancel function from PromptForm
  const [cancelPendingGeneration, setCancelPendingGeneration] = useState<((id: string) => boolean) | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const { user, credits } = useAuth();
  
  // Derived state from credits
  const has_credits = credits?.has_credits || false;

  // Add refs to track ongoing fetches to prevent duplicates
  const isFetchingPredictions = useRef(false);
  const isFetchingModels = useRef(false);
  const isFetchingPending = useRef(false);
  const lastPendingFetchTimestamp = useRef<number>(0); // Added for debounce
  const initialDataFetched = useRef(false); // Added to prevent double initial fetch

  // Add ref to track ongoing handleCompletedPrediction calls
  const processingCompletedPredictions = useRef<Set<string>>(new Set());

  // Callback function to handle "Use as Reference" from ImageHistory
  const handleUseAsReference = useCallback((imageUrl: string, originalPrompt: string) => {
    setReferenceImageData({ imageUrl, originalPrompt });
  }, []);

  // Callback function to clear reference image data after it's been used
  const handleReferenceImageUsed = useCallback(() => {
    setReferenceImageData(null);
  }, []);

  // NEW: Separate function to fetch only pending predictions
  const fetchPendingPredictions = useCallback(async () => {
    const now = Date.now();
    // Prevent concurrent fetches or fetching too rapidly (e.g., within 2 seconds of last attempt that got a response)
    if (isFetchingPending.current || (now - lastPendingFetchTimestamp.current < 2000)) {
      // console.log(`Skipping pending fetch: isFetchingPending=${isFetchingPending.current}, timeSinceLast=${now - lastPendingFetchTimestamp.current}`);
      return;
    }

    isFetchingPending.current = true;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 5000); // 5s timeout
    let responseReceived = false;

    try {
      const response = await fetch('/api/predictions/pending', {
        signal: abortController.signal
      });
      clearTimeout(timeoutId);
      responseReceived = true; // A response (good or bad) was received

      if (!response.ok) {
        throw new Error(`Failed to fetch pending predictions: ${response.status} ${response.statusText}`);
      }
      
      const { success, predictions, error: apiError } = await response.json();
      
      if (!success) {
        console.error('API error fetching pending predictions:', apiError || 'Failed to fetch pending predictions');
        setPendingGenerations([]); // Or handle error as per application logic
        return; // Exit if API reported not successful
      }
      
      if (predictions) {
        const pendingGens: PendingGeneration[] = predictions.map((item: PredictionData) => ({
          id: item.id,
          replicate_id: item.replicate_id,
          prompt: item.prompt || '',
          aspectRatio: item.aspect_ratio || '1:1',
          startTime: item.created_at,
          format: item.format || item.input?.output_format || 'webp',
          modelDisplayName: item.models?.display_name || 'Unknown Model',
          is_edit: item.is_edit,
        }));
        setPendingGenerations(pendingGens);
      } else {
        setPendingGenerations([]);
      }
      
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId); // Ensure timeout is cleared on any catch
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn('Fetch pending predictions aborted due to timeout.');
        // For AbortError or true network errors, responseReceived remains false, so timestamp isn't updated below.
      } else {
        console.error('Error fetching pending predictions:', fetchError);
      }
      // Optionally clear or maintain previous state on error
      // setPendingGenerations([]); 
    } finally {
      if (responseReceived) { // Update timestamp if a response was received from the server
        lastPendingFetchTimestamp.current = Date.now();
      }
      isFetchingPending.current = false;
    }
  }, [setPendingGenerations]);

  // NEW: Separate function to fetch only completed predictions (with caching)
  const fetchCompletedPredictions = useCallback(async (page: number = currentPage, append: boolean = false) => {
    if (isFetchingPredictions.current) {
      return;
    }
    
    // Set loading state
    if (!append) {
      setIsLoadingHistory(true);
      setErrorHistory(null);
    } else {
      setIsLoadingMore(true);
    }
    
    // Always check cache for completed predictions (no bypassing!)
    const cachedData = getCachedData(page, false);
    if (cachedData) {
      // Process cached data
      const processedData: ImageGeneration[] = cachedData.data.map((item: PredictionData) => {
        const modelDisplayName = item.models?.display_name || 'Default Model';
        return {
          id: item.id,
          replicate_id: item.replicate_id,
          prompt: item.prompt,
          timestamp: item.created_at,
          images: processOutput(item.storage_urls, item.liked_images),
          aspectRatio: item.aspect_ratio,
          format: item.format || item.input?.output_format || 'webp',
          modelDisplayName: modelDisplayName,
          is_edit: item.is_edit,
          edits: item.edits || [] // Include cached edits data
        };
      });

      // Update pagination state
      setHasNextPage(cachedData.pagination.hasNextPage);
      setCurrentPage(cachedData.pagination.page);

      // For infinite scroll, append to existing generations; otherwise replace
      if (append && page > 1) {
        setGenerations(prev => [...prev, ...processedData]);
      } else {
        setGenerations(processedData);
      }

      // Clear loading state
      if (!append) {
        setIsLoadingHistory(false);
      } else {
        setIsLoadingMore(false);
      }
      return; // Use cached data, no need to fetch
    }
    
    isFetchingPredictions.current = true;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    try {
      const response = await fetch(`/api/predictions?is_deleted=false&is_edit=false&limit=${itemsPerPage}&page=${page}&include_edits=true`, {
        signal: abortController.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch predictions: ${response.status} ${response.statusText}`);
      }
      
      const { success, predictions, pagination, error } = await response.json();
      
      if (!success) {
        throw new Error(error || 'Failed to fetch predictions');
      }
      
      if (predictions && pagination) {
        // Cache the completed predictions with their edits
        setCachedData(page, predictions, pagination, false);

        // Update pagination state
        setCurrentPage(pagination.page);
        setHasNextPage(pagination.hasNextPage);
        
        // Process completed predictions
        const processedData: ImageGeneration[] = predictions.map((item: PredictionData) => {
          const modelDisplayName = item.models?.display_name || 'Default Model';
          return {
            id: item.id,
            replicate_id: item.replicate_id,
            prompt: item.prompt,
            timestamp: item.created_at,
            images: processOutput(item.storage_urls, item.liked_images),
            aspectRatio: item.aspect_ratio,
            format: item.format || item.input?.output_format || 'webp',
            modelDisplayName: modelDisplayName,
            is_edit: item.is_edit,
            edits: item.edits || [] // Include fetched edits data
          };
        });
        
        // For infinite scroll, append to existing generations; otherwise replace
        if (append && page > 1) {
          setGenerations(prev => [...prev, ...processedData]);
        } else {
          setGenerations(processedData);
        }
      }
      
    } catch (fetchError: unknown) { 
      clearTimeout(timeoutId);
      console.error("Error fetching completed predictions:", fetchError);

      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          console.warn('Fetch completed predictions aborted due to timeout');
        } else {
          setErrorHistory(`Failed to load predictions: ${fetchError.message}`);
        }
      } else {
        setErrorHistory('An unknown error occurred while loading predictions.');
      }
    } finally {
      if (!append) {
        setIsLoadingHistory(false);
      } else {
        setIsLoadingMore(false);
      }
      isFetchingPredictions.current = false;
    }
  }, [currentPage, itemsPerPage, getCachedData, setCachedData]);

  // NEW: Function to invalidate cache and refetch page 1 when a prediction completes
  const handleCompletedPrediction = useCallback(async (replicateId: string) => {
    if (processingCompletedPredictions.current.has(replicateId)) {
      return;
    }
    processingCompletedPredictions.current.add(replicateId);

    try {
      // Step 1: Invalidate the cache for page 1 to ensure consistency
      setPredictionsCache(prev => {
        const newCache = new Map(prev);
        const key = getCacheKey(1, false);
        newCache.delete(key);
        
        // Also clear from localStorage
        if (typeof window !== 'undefined') {
          try {
            const cacheObject = Object.fromEntries(newCache);
            localStorage.setItem('photomate_predictions_cache', JSON.stringify(cacheObject));
          } catch (error) {
            console.warn('Failed to update cache in localStorage:', error);
          }
        }
        
        return newCache;
      });
      
      // Step 2: Add a small delay to ensure the API has the updated data
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 3: Fetch page 1 data and update UI state directly
      let retryCount = 0;
      const maxRetries = 3;
      let predictionFound = false;
      
      while (retryCount <= maxRetries && !predictionFound) {
        try {
          // Make API call to get fresh page 1 data
          const response = await fetch(`/api/predictions?is_deleted=false&is_edit=false&limit=${itemsPerPage}&page=1`);
          
          if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
          }
          
          const { success, predictions, pagination } = await response.json();
          
          if (success && predictions) {
            // Check if our completed prediction is in the response
            const foundInResponse = predictions.some((pred: PredictionData) => pred.replicate_id === replicateId);
            
            if (foundInResponse || retryCount === maxRetries) {
              predictionFound = true;
              
              // Update cache with fresh data
              setCachedData(1, predictions, pagination, false);
              
              // Process and update UI state directly
              const processedData: ImageGeneration[] = predictions.map((item: PredictionData) => {
                const modelDisplayName = item.models?.display_name || 'Default Model';
                return {
                  id: item.id,
                  replicate_id: item.replicate_id,
                  prompt: item.prompt,
                  timestamp: item.created_at,
                  images: processOutput(item.storage_urls, item.liked_images),
                  aspectRatio: item.aspect_ratio,
                  format: item.format || item.input?.output_format || 'webp',
                  modelDisplayName: modelDisplayName,
                  is_edit: item.is_edit
                };
              });
              
              // Update generations state (replace, not append)
              setGenerations(processedData);

              // Successfully updated completed predictions, now refresh pending list
              await fetchPendingPredictions();
              
            } else if (retryCount < maxRetries) {
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
            }
          } else {
            throw new Error('API response was not successful');
          }
        } catch (fetchError) {
          console.error(`Error on retry ${retryCount + 1}:`, fetchError);
          if (retryCount < maxRetries) {
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            // Final fallback: call the original fetchCompletedPredictions
            isFetchingPredictions.current = false; // Reset flag before calling
            await fetchCompletedPredictions(1, false);
            break;
          }
        }
      }
      
    } catch (fetchError: unknown) {
      console.error('Error in handleCompletedPrediction (outer try):', fetchError);
      // Fallback: call the original fetchCompletedPredictions
      isFetchingPredictions.current = false; // Reset flag before calling
      await fetchCompletedPredictions(1, false);
    } finally {
      // Remove from processing set
      processingCompletedPredictions.current.delete(replicateId);
    }
  }, [setPredictionsCache, getCacheKey, itemsPerPage, setCachedData, processOutput, setGenerations, fetchPendingPredictions]);

  // UPDATED: Combined function that calls both separate functions
  const fetchAllPredictions = useCallback(async (silentUpdate: boolean = false, page: number = currentPage, append: boolean = false) => {
    // For initial loads and page changes, fetch completed predictions
    if (!silentUpdate || page > 1) {
      await fetchCompletedPredictions(page, append);
    }
    
    // Always fetch pending predictions on page 1 (for both initial loads and silent updates)
    if (page === 1) {
      await fetchPendingPredictions();
    }
  }, [currentPage, fetchCompletedPredictions, fetchPendingPredictions]);

  // Fetch user models function
  const fetchUserModels = useCallback(async () => {
    if (isFetchingModels.current) return;
    
    isFetchingModels.current = true;
    setUserModelsError(null); // Clear previous errors
    try {
      const response = await fetch('/api/model/list?is_cancelled=false&is_deleted=false&status=succeeded');
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      const data = await response.json();
      if (data.success && data.models) {
        setUserModels(data.models);
        if (typeof window !== 'undefined') {
          localStorage.setItem('photomate_hasShownModelsOnce', 'true');
        }
        setAllowModelLoadingScreen(false);
      } else {
        // User genuinely has no models
        setUserModels([]);
        if (typeof window !== 'undefined') {
          localStorage.setItem('photomate_hasShownModelsOnce', 'true');
        }
        setAllowModelLoadingScreen(false);
      }
    } catch (err) {
      console.error('Error fetching user models:', err);
      setUserModelsError(err instanceof Error ? err.message : 'Failed to fetch models');
      // Don't clear userModels on error - keep previous state if any
    } finally {
      setIsLoadingUserModels(false);
      isFetchingModels.current = false;
    }
  }, []); // Stable dependency array since we use refs

  useEffect(() => {
    setIsMounted(true);
    // Update allowModelLoadingScreen based on localStorage after mounting
    if (typeof window !== 'undefined') {
      setAllowModelLoadingScreen(localStorage.getItem('photomate_hasShownModelsOnce') !== 'true');
    }
  }, []);

  // Cleanup effect for processing state
  useEffect(() => {
    const currentProcessingRef = processingCompletedPredictions.current;
    return () => {
      // Clear processing state on unmount
      currentProcessingRef.clear();
    };
  }, []);

  // Initial data fetching effect - only runs once when user and mounted state are ready
  useEffect(() => {
    if (isMounted && user) {
      if (!initialDataFetched.current) {
        initialDataFetched.current = true; // Set immediately to prevent re-entry
        // Fetch both predictions and models in parallel on initial load
        Promise.all([
          fetchAllPredictions(false, 1), // Always start with page 1
          fetchUserModels()
        ]).catch(error => {
          console.error('Error during initial data fetch:', error);
          // Optionally reset initialDataFetched.current = false here if retries are desired
          // For now, to prevent potential loops on persistent errors, we don't reset it.
        });
      }
    } else if (!user && isMounted) {
      // Clear data when user signs out
      setPendingGenerations([]);
      setGenerations([]);
      setUserModels([]);
      setUserModelsError(null);
      setIsLoadingHistory(false);
      setIsLoadingUserModels(false);
      // Reset pagination state
      setCurrentPage(1);
      setHasNextPage(false);
      setIsLoadingMore(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('photomate_hasShownModelsOnce');
      }
      setAllowModelLoadingScreen(true);
      initialDataFetched.current = false; // Reset for next login
    }
  }, [isMounted, user, fetchAllPredictions, fetchUserModels]); // Only depend on mount state and user, not the fetch functions

  // Load generations from Supabase (wrapper for compatibility with ImageHistory)
  const loadGenerations = useCallback(async (silentUpdate: boolean = false) => {
    try {
      if (!silentUpdate) {
        setIsLoadingHistory(true);
        setErrorHistory(null); // Clear previous errors
      }
      
      // For regular loads, fetch both completed and pending
      // For silent updates, only fetch pending to avoid cache bypass
      if (!silentUpdate) {
        await fetchCompletedPredictions(1); // Reset to page 1 for regular loads
        await fetchPendingPredictions();
      } else {
        await fetchPendingPredictions(); // Only fetch pending on silent updates
      }
    } catch {
      // Error handling is now within the individual fetch functions
    }
  }, [fetchCompletedPredictions, fetchPendingPredictions]);

  // Infinite scroll load more handler
  const handleLoadMore = useCallback(async () => {
    if (!hasNextPage || isLoadingMore) return;
    
    const nextPage = currentPage + 1;
    await fetchCompletedPredictions(nextPage, true); // append = true for infinite scroll
  }, [hasNextPage, isLoadingMore, currentPage, fetchCompletedPredictions]);

  // Visibility change effect for image history
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted && user) {
        // Only fetch pending predictions when tab becomes visible
        // This prevents unnecessary cache bypassing for completed predictions
        fetchPendingPredictions();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchPendingPredictions, isMounted, user]);

  const selectedHeaderImages = useMemo(() => {
    // Show default images if either history or user models are still in their initial loading phase controlled by allowModelLoadingScreen
    if (isLoadingHistory || (isLoadingUserModels && allowModelLoadingScreen)) {
      return DEFAULT_HEADER_IMAGES;
    }

    if (generations && generations.length > 0) {
      const allImageUrls = generations.flatMap(g => g.images.map(img => img.url)).filter(url => url && typeof url === 'string');
      
      if (allImageUrls.length >= 3) {
        // Check if we have stored header images
        const storedImages = getStoredHeaderImages();
        const storedTimestamp = getStoredHeaderImagesTimestamp();
        
        // Get the timestamp of the most recent generation
        const mostRecentGenTimestamp = generations.length > 0 
          ? new Date(generations[0].timestamp).getTime() 
          : 0;
        
        // Use stored images if they exist and are still valid (no newer generations)
        if (storedImages && 
            storedImages.length === 3 && 
            storedTimestamp >= mostRecentGenTimestamp &&
            storedImages.every(url => allImageUrls.includes(url))) {
          return storedImages;
        }
        
        // Select new images deterministically and store them
        const selectedImages = selectHeaderImages(allImageUrls, user?.id);
        setStoredHeaderImages(selectedImages);
        return selectedImages;
      } else {
        return DEFAULT_HEADER_IMAGES;
      }
    }
    return DEFAULT_HEADER_IMAGES;
  }, [generations, isLoadingHistory, isLoadingUserModels, allowModelLoadingScreen, user?.id]);

  // Conditional rendering for "no models" screen
  if (!isLoadingUserModels && !userModelsError && (!userModels || userModels.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] sm:min-h-[60vh] p-4 text-center">
        <div className="max-w-xl">
          <div className="mb-8 flex items-center justify-center space-x-4">
            <div className="flex items-center cursor-default relative">
              {/* Subtle background glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-full blur-3xl scale-150 opacity-60 animate-pulse" />
              
              {DEFAULT_HEADER_IMAGES.map((src, index) => (
                <div 
                  key={src || index}
                  className={`group relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden shadow-lg border-2 border-white/90 backdrop-blur-sm
                    transition-all duration-500 ease-out
                    hover:-translate-y-2 hover:z-30 hover:shadow-2xl hover:shadow-primary/25
                    ${index === 0 ? 
                      'transform -rotate-6 mr-[-12px] sm:mr-[-15px] hover:rotate-[-12deg] hover:scale-125 animate-float-1' : 
                      index === 1 ? 
                      'z-10 transform scale-110 hover:scale-140 animate-float-2' : 
                      'transform rotate-6 ml-[-12px] sm:ml-[-15px] hover:rotate-[12deg] hover:scale-125 animate-float-3'
                    }
                    animate-fade-in-up focus:outline-none focus:ring-0`}
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: 'both',
                    borderColor: 'rgba(255, 255, 255, 0.9)',
                    outline: 'none'
                  }}
                >
                  {/* Shimmer effect overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                  
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/20 group-hover:to-primary/10 transition-all duration-500 ease-out rounded-lg" />
                  
                  {/* Main image */}
                  <Image 
                    src={src} 
                    alt={`Illustrative image ${index + 1}`} 
                    fill 
                    className="object-cover group-hover:brightness-110 group-hover:contrast-105 transition-all duration-500 ease-out" 
                    sizes="(max-width: 640px) 40px, 48px" 
                  />
                </div>
              ))}
            </div>
          </div>
          <h1 className="text-3xl font-semibold mb-4 animate-fade-in-up" style={{animationDelay: '300ms', animationFillMode: 'both'}}>Create Your First AI Model</h1>
          <p className="text-muted-foreground mb-6 animate-fade-in-up" style={{animationDelay: '400ms', animationFillMode: 'both'}}>
            You haven&apos;t trained any AI models yet. Train a model with your photos to start generating unique images of yourself!
          </p>
          <div className="animate-fade-in-up" style={{animationDelay: '500ms', animationFillMode: 'both'}}>
            <Link href="/train" passHref>
              <Button size="lg" variant="default">
                Train Your Model
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Conditional rendering for the initial model loading screen
  if (isLoadingUserModels && allowModelLoadingScreen) {
    return null;
  }

  // Early return if user is not authenticated (layout will handle this)
  if (!user || !isMounted) {
    return null;
  }

  // Main content (PromptForm, ImageHistory)
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
      {/* Error message for model fetching */}
      {userModelsError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-800 font-medium">Unable to load your AI models</p>
              <p className="text-red-600 text-sm mt-1">{userModelsError}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {/* TODO: Add retry logic */}}
              disabled={isLoadingUserModels}
            >
              {isLoadingUserModels ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </div>
      )}
      
      {/* Header with dynamic images */}
      <div className="mb-8 hidden sm:flex items-center justify-center space-x-4">
        <div className="flex items-center cursor-default relative">
          {/* Subtle background glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-full blur-3xl scale-150 opacity-60 animate-pulse" />
          
          { /* Loading state for header images based on selectedHeaderImages logic */ }
          {selectedHeaderImages === DEFAULT_HEADER_IMAGES && (isLoadingHistory || isLoadingUserModels) ? (
            <>
              <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white transform -rotate-6 mr-[-10px] animate-pulse">
                <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"></div>
              </div>
              <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white z-10 transform scale-110 animate-pulse">
                <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"></div>
              </div>
              <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white transform rotate-6 ml-[-10px] animate-pulse">
                <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"></div>
              </div>
            </>
          ) : (
            selectedHeaderImages.map((src: string, index: number) => (
              <div 
                key={src || index}
                className={`group relative w-8 h-8 rounded-md overflow-hidden shadow-lg border-2 border-white/90 backdrop-blur-sm
                  transition-all duration-500 ease-out
                  hover:-translate-y-2 hover:z-30 hover:shadow-2xl hover:shadow-primary/25
                  ${index === 0 ? 
                    'transform -rotate-6 mr-[-10px] hover:rotate-[-12deg] hover:scale-125 animate-float-1' : 
                    index === 1 ? 
                    'z-10 transform scale-110 hover:scale-140 animate-float-2' : 
                    'transform rotate-6 ml-[-10px] hover:rotate-[12deg] hover:scale-125 animate-float-3'
                  }
                  animate-fade-in-up focus:outline-none focus:ring-0`}
                style={{
                  animationDelay: `${index * 100}ms`,
                  animationFillMode: 'both',
                  borderColor: 'rgba(255, 255, 255, 0.9)', // Explicit white border override
                  outline: 'none' // Remove any outline
                }}
              >
                {/* Shimmer effect overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/20 group-hover:to-primary/10 transition-all duration-500 ease-out rounded-md" />
                
                {/* Main image */}
                <Image 
                  src={src} 
                  alt={`Header image ${index + 1}`} 
                  fill 
                  className="object-cover group-hover:brightness-110 group-hover:contrast-105 transition-all duration-500 ease-out" 
                  sizes="32px" 
                  unoptimized={!src.startsWith("/landing/")} 
                />
              </div>
            ))
          )}
        </div>
        <h1 className="text-3xl font-semibold animate-fade-in-up" style={{animationDelay: '300ms', animationFillMode: 'both'}}>
          Create images of yourself
        </h1>
      </div>
      
      {/* No credits banner - shown prominently but allows access to other features */}
      {!has_credits && (
        <div className="mb-6 p-6 bg-gradient-to-br from-orange-50/80 via-orange-50/60 to-background/80 dark:from-orange-900/20 dark:via-orange-900/10 dark:to-background/80 border border-orange-200/60 dark:border-orange-800/40 rounded-xl backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/50 dark:to-orange-800/50 rounded-full flex items-center justify-center">
                <Coins className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100">Out of Generation Credits</h3>
                <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                  You&apos;ve used all your generation credits this month! Your trained models are ready and waiting — get more credits to continue creating amazing AI images.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
              <Button
                onClick={() => {/* TODO: Implement buy credits functionality */}}
                size="sm"
                className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white shadow-md hover:shadow-lg font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                Buy Credits
              </Button>
              <Button
                onClick={() => {/* TODO: Implement upgrade plan functionality */}}
                variant="outline"
                size="sm"
                className="border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/30"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Upgrade Plan
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <PromptForm 
        key={user ? user.id : 'promptform-nouser'}
        pendingGenerations={pendingGenerations}
        setPendingGenerations={setPendingGenerations}
        promptValue={promptValue}
        userModels={userModels}
        isLoadingUserModels={isLoadingUserModels}
        onGenerationStart={() => { /* Potentially do nothing here if polling handles it */ }}
        referenceImageData={referenceImageData}
        handleReferenceImageUsed={handleReferenceImageUsed}
        onCancelPendingGeneration={setCancelPendingGeneration}
      />
      <div className="w-full pt-8">
        <ImageHistory 
          generations={generations}
          setGenerations={setGenerations}
          isLoading={isLoadingHistory}
          error={errorHistory}
          loadGenerations={loadGenerations}
          pendingGenerations={pendingGenerations}
          setPendingGenerations={setPendingGenerations}
          setPromptValue={setPromptValue}
          handleUseAsReference={handleUseAsReference}
          cancelPendingGeneration={cancelPendingGeneration}
          hasNextPage={hasNextPage}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
          onRemovePredictionFromCache={removePredictionFromCache}
          onUpdateFavoriteInCache={updateFavoriteInCache}
          onFetchCompletedPredictions={handleCompletedPrediction}
        />
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading...</div>}>
      <CreatePageContent />
    </Suspense>
  );
} 