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
  format?: string
  input?: {
    output_format?: string
  }
  model_id: string
  models?: {
    display_name: string
  } | null
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
            console.log(`💾 Restored ${cacheMap.size} cached pages from localStorage`);
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
        console.log(`💾 Saved ${predictionsCache.size} pages to localStorage cache`);
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
      console.log(`🎯 Cache HIT for page ${page} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
      return cached;
    }
    if (cached) {
      console.log(`⏰ Cache EXPIRED for page ${page} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
    } else {
      console.log(`❌ Cache MISS for page ${page}`);
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
    console.log(`💾 Caching page ${page} with ${data.length} predictions`);
    setPredictionsCache(prev => new Map(prev).set(key, {
      data,
      timestamp: Date.now(),
      pagination
    }));
  }, []);
  
  // Remove a specific prediction from all cached pages
  const removePredictionFromCache = useCallback((predictionId: string) => {
    console.log(`🗑️ Removing prediction ${predictionId} from cache`);
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
    console.log(`💖 Updating favorite status in cache: ${predictionId}, ${imageUrl}, ${isLiked}`);
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
  const [isLoadingUserModels, setIsLoadingUserModels] = useState(true); // Initialize to true
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

  // Callback function to handle "Use as Reference" from ImageHistory
  const handleUseAsReference = useCallback((imageUrl: string, originalPrompt: string) => {
    setReferenceImageData({ imageUrl, originalPrompt });
  }, []);

  // Callback function to clear reference image data after it's been used
  const handleReferenceImageUsed = useCallback(() => {
    setReferenceImageData(null);
  }, []);

  // Combined function to fetch all predictions and separate them with caching
  const fetchAllPredictions = useCallback(async (silentUpdate: boolean = false, page: number = currentPage, append: boolean = false) => {
    console.log(`🔍 fetchAllPredictions called: page=${page}, silentUpdate=${silentUpdate}, append=${append}`);
    
    if (isFetchingPredictions.current) {
      console.log(`⏸️ Already fetching, skipping page ${page}`);
      return;
    }
    
    // Set loading state BEFORE checking cache (this was the bug!)
    if (!silentUpdate && !append) {
      setIsLoadingHistory(true);
      setErrorHistory(null);
    } else if (append) {
      setIsLoadingMore(true);
    }
    
    // Check cache first for completed predictions
    // Skip cache for page 1 with silent updates (polling for pending generations)
    const shouldCheckCache = !(page === 1 && silentUpdate);
    console.log(`🔍 shouldCheckCache: ${shouldCheckCache} (page=${page}, silentUpdate=${silentUpdate})`);
    
    if (shouldCheckCache) {
      const cachedData = getCachedData(page, false);
      if (cachedData) {
        console.log(`🎯 Using cached data for page ${page}, returning early`);
        
        // Filter only completed predictions from cache
        const completedPredictions = cachedData.data.filter((item: PredictionData) => 
          item.status === 'succeeded' && item.storage_urls && item.storage_urls.length > 0
        );

        // Process cached data
        const processedData: ImageGeneration[] = completedPredictions.map((item: PredictionData) => {
          const modelDisplayName = item.models?.display_name || 'Default Model';
          return {
            id: item.id,
            replicate_id: item.replicate_id,
            prompt: item.prompt,
            timestamp: item.created_at,
            images: processOutput(item.storage_urls, item.liked_images),
            aspectRatio: item.aspect_ratio,
            format: item.format || item.input?.output_format || 'webp',
            modelDisplayName: modelDisplayName
          };
        });

        // Update pagination state
        setHasNextPage(cachedData.pagination.hasNextPage);
        setCurrentPage(cachedData.pagination.page);

        // Only update generations if we have valid data or if this is page 1 (initial load)
        // This prevents clearing existing generations when cached filtered data is empty
        if (processedData.length > 0 || page === 1) {
          // For infinite scroll, append to existing generations; otherwise replace
          if (append && page > 1) {
            setGenerations(prev => [...prev, ...processedData]);
          } else {
            setGenerations(processedData);
          }
        } else {
          console.log(`📭 Cached data for page ${page} was empty after filtering, keeping existing generations`);
        }

        // For page 1, still need to fetch fresh pending generations
        if (page === 1) {
          console.log(`🔄 Page 1 cached, but fetching fresh pending generations`);
          try {
            const response = await fetch(`/api/predictions?is_deleted=false&limit=${itemsPerPage}&page=1`);
            if (response.ok) {
              const { success, predictions } = await response.json();
              if (success && predictions) {
                const pendingPredictions = predictions.filter((item: PredictionData) => 
                  ['starting', 'queued', 'processing'].includes(item.status) && !item.is_cancelled
                );
                
                if (pendingPredictions.length > 0) {
                  const pendingGens: PendingGeneration[] = pendingPredictions.map((item: PredictionData) => ({
                    id: item.id,
                    replicate_id: item.replicate_id,
                    prompt: item.prompt || '',
                    aspectRatio: item.aspect_ratio || '1:1',
                    startTime: item.created_at,
                    format: item.format || item.input?.output_format || 'webp',
                    modelDisplayName: item.models?.display_name || 'Unknown Model'
                  }));
                  setPendingGenerations(pendingGens);
                } else {
                  setPendingGenerations([]);
                }
              }
            }
          } catch (error) {
            console.warn('Failed to fetch fresh pending generations:', error);
          }
        }

        // IMPORTANT: Clear loading state even when using cache
        if (!silentUpdate && !append) {
          setIsLoadingHistory(false);
        } else if (append) {
          setIsLoadingMore(false);
        }

        return; // Use cached data, no need to fetch
      }
    }
    
    console.log(`🌐 Making API call for page ${page}`);
    isFetchingPredictions.current = true;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    try {
      // Use the new predictions API endpoint with pagination
      const response = await fetch(`/api/predictions?is_deleted=false&limit=${itemsPerPage}&page=${page}`, {
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
        // Cache the data (excluding pending generations from cache)
        const completedPredictionsForCache = predictions.filter((item: PredictionData) => 
          item.status === 'succeeded' && item.storage_urls && item.storage_urls.length > 0
        );
        
        if (completedPredictionsForCache.length > 0) {
          setCachedData(page, completedPredictionsForCache, pagination, false);
        }

        // Update pagination state
        setCurrentPage(pagination.page);
        setHasNextPage(pagination.hasNextPage);
        
        // Separate pending and completed predictions
        const pendingPredictions = predictions.filter((item: PredictionData) => 
          ['starting', 'queued', 'processing'].includes(item.status) && !item.is_cancelled
        );
        
        // Filter for only completed predictions with images
        const completedPredictions = predictions.filter((item: PredictionData) => 
          item.status === 'succeeded' && item.storage_urls && item.storage_urls.length > 0
        );

        // Only update pending generations if we're on the first page or this is a silent update
        if (page === 1 || silentUpdate) {
          if (pendingPredictions.length > 0) {
            const pendingGens: PendingGeneration[] = pendingPredictions.map((item: PredictionData) => ({
              id: item.id,
              replicate_id: item.replicate_id,
              prompt: item.prompt || '',
              aspectRatio: item.aspect_ratio || '1:1',
              startTime: item.created_at,
              format: item.format || item.input?.output_format || 'webp',
              modelDisplayName: item.models?.display_name || 'Unknown Model'
            }));
            setPendingGenerations(pendingGens);
          } else {
            setPendingGenerations([]);
          }
        }

        // Process all returned predictions since API guarantees they're displayable
        const processedData: ImageGeneration[] = completedPredictions.map((item: PredictionData) => {
          const modelDisplayName = item.models?.display_name || 'Default Model';
          return {
            id: item.id,
            replicate_id: item.replicate_id,
            prompt: item.prompt,
            timestamp: item.created_at,
            images: processOutput(item.storage_urls, item.liked_images),
            aspectRatio: item.aspect_ratio,
            format: item.format || item.input?.output_format || 'webp',
            modelDisplayName: modelDisplayName
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
      console.error("Full error object in fetchAllPredictions catch:", JSON.stringify(fetchError, null, 2));

      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          console.warn('Fetch predictions aborted due to timeout');
        } else {
          console.error('Error fetching predictions (Error instance):', fetchError);
          setErrorHistory(`Failed to load predictions: ${fetchError.message}`);
        }
      } else {
        let errorMessage = 'An unknown error occurred while loading predictions.';
        if (typeof fetchError === 'object' && fetchError !== null && 'message' in fetchError) {
          errorMessage = `Failed to load predictions: ${(fetchError as { message: string }).message}`;
        }
        console.error('Unknown error object fetching predictions:', fetchError);
        setErrorHistory(errorMessage);
      }
    } finally {
      if (!silentUpdate && !append) {
        setIsLoadingHistory(false);
      } else if (append) {
        setIsLoadingMore(false);
      }
      isFetchingPredictions.current = false;
    }
  }, [currentPage, itemsPerPage, getCachedData, setCachedData]); // Updated dependencies

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

  // Initial data fetching effect - only runs once when user and mounted state are ready
  useEffect(() => {
    if (isMounted && user) {
      // Fetch both predictions and models in parallel on initial load
      Promise.all([
        fetchAllPredictions(false, 1), // Always start with page 1
        fetchUserModels()
      ]).catch(error => {
        console.error('Error during initial data fetch:', error);
      });
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
    }
  }, [isMounted, user]); // Only depend on mount state and user, not the fetch functions

  // Load generations from Supabase (wrapper for compatibility with ImageHistory)
  const loadGenerations = useCallback(async (silentUpdate: boolean = false) => {
    try {
      if (!silentUpdate) {
        setIsLoadingHistory(true);
        setErrorHistory(null); // Clear previous errors
      }
      await fetchAllPredictions(silentUpdate, 1); // Always reset to page 1 for regular loads
    } catch {
      // Error handling is now within fetchAllPredictions
    }
  }, [fetchAllPredictions]);

  // Infinite scroll load more handler
  const handleLoadMore = useCallback(async () => {
    if (!hasNextPage || isLoadingMore) return;
    
    const nextPage = currentPage + 1;
    await fetchAllPredictions(false, nextPage, true); // append = true for infinite scroll
  }, [hasNextPage, isLoadingMore, currentPage, fetchAllPredictions]);

  // Visibility change effect for image history
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted && user) {
        // Only refresh predictions when tab becomes visible, not models
        fetchAllPredictions(true, currentPage); // Silent update
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchAllPredictions, currentPage, isMounted, user]);

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


  // Conditional rendering for the initial model loading screen
  if (isLoadingUserModels && allowModelLoadingScreen) {
    return null;
  }

  // Early return if user is not authenticated (prevents flash on logout)
  if (!user) {
    return null;
  }

  // Conditional rendering for "no models" screen
  // This shows if loading is complete AND there are no models AND no error (genuine no models case).
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
                    borderColor: 'rgba(255, 255, 255, 0.9)', // Explicit white border override
                    outline: 'none' // Remove any outline
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

  // Main content (PromptForm, ImageHistory)
  // This is reached if:
  // 1. !isLoadingUserModels && userModels.length > 0 (models loaded and exist)
  // 2. isLoadingUserModels && !allowModelLoadingScreen (models loading in background after initial check)
  // 3. !isLoadingUserModels && userModelsError (error loading models, but show interface anyway)
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
              onClick={() => fetchUserModels()}
              disabled={isLoadingUserModels}
            >
              {isLoadingUserModels ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </div>
      )}
      
      <div className="mb-8 hidden sm:flex items-center justify-center space-x-4">
        <div className="flex items-center cursor-default relative">
          {/* Subtle background glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-full blur-3xl scale-150 opacity-60 animate-pulse" />
          
          { /* Loading state for header images based on selectedHeaderImages logic */ }
          {selectedHeaderImages === DEFAULT_HEADER_IMAGES && (isLoadingHistory || (isLoadingUserModels && allowModelLoadingScreen)) ? (
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
      {!has_credits && userModels && userModels.length > 0 && (
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
          isLoading={isLoadingHistory} // This is for ImageHistory's own loading state
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