"use client"

import { useState, Suspense, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

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
  
  // State for user models
  const [userModels, setUserModels] = useState<Model[]>([]);
  const [isLoadingUserModels, setIsLoadingUserModels] = useState(true); // Initialize to true

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
  const { user } = useAuth();
  const supabaseClient = useRef(createSupabaseBrowserClient());

  // Callback function to handle "Use as Reference" from ImageHistory
  const handleUseAsReference = useCallback((imageUrl: string, originalPrompt: string) => {
    setReferenceImageData({ imageUrl, originalPrompt });
  }, []);

  // Callback function to clear reference image data after it's been used
  const handleReferenceImageUsed = useCallback(() => {
    setReferenceImageData(null);
  }, []);

  // Combined function to fetch all predictions and separate them
  const fetchAllPredictions = useCallback(async (silentUpdate: boolean = false) => {
    if (!user?.id) return;
    
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    if (!silentUpdate) {
      setIsLoadingHistory(true);
      setErrorHistory(null);
    }

    try {
      const { data, error } = await supabaseClient.current
        .from('predictions')
        .select(`
          *,
          models:model_id (
            display_name
          )
        `)
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);
      
      clearTimeout(timeoutId);
      
      if (error) {
        throw error; 
      }
      
      if (data) {
        // Separate pending and completed predictions
        const pendingPredictions = data.filter((item: PredictionData) => 
          ['starting', 'queued', 'processing'].includes(item.status) && !item.is_cancelled
        );
        
        const completedPredictions = data.filter((item: PredictionData) => 
          item.status === 'succeeded' && item.storage_urls
        );

        // Process pending generations
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

        // Process completed generations
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
        setGenerations(processedData);
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
      if (!silentUpdate) {
        setIsLoadingHistory(false);
      }
    }
  }, [user?.id, supabaseClient]);

  useEffect(() => {
    setIsMounted(true);
    // Update allowModelLoadingScreen based on localStorage after mounting
    if (typeof window !== 'undefined') {
      setAllowModelLoadingScreen(localStorage.getItem('photomate_hasShownModelsOnce') !== 'true');
    }
  }, []);

  // Use combined fetch on mount instead of separate calls
  useEffect(() => {
    if (isMounted && user) {
      fetchAllPredictions();
    } else if (!user && isMounted) {
      // Clear data when user signs out
      setPendingGenerations([]);
      setGenerations([]);
      setIsLoadingHistory(false);
    }
  }, [isMounted, user, fetchAllPredictions]);

  // Fetch user models
  useEffect(() => {
    if (isMounted && user) {
      const fetchModels = async () => {
        // setIsLoadingUserModels(true); // No longer needed here, initialized to true
        try {
          const response = await fetch(`/api/model/list?is_cancelled=false&is_deleted=false&status=succeeded`);
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
            setUserModels([]);
            if (typeof window !== 'undefined') {
              localStorage.setItem('photomate_hasShownModelsOnce', 'true');
            }
            setAllowModelLoadingScreen(false);
          }
        } catch (err) {
          console.error('Error fetching user models:', err);
          setUserModels([]);
        } finally {
          setIsLoadingUserModels(false);
        }
      };
      fetchModels();
    } else if (!user && isMounted) {
      setUserModels([]);
      setIsLoadingUserModels(false); // Set to false if no user
      if (typeof window !== 'undefined') {
        localStorage.removeItem('photomate_hasShownModelsOnce');
      }
      setAllowModelLoadingScreen(true);
    }
  }, [isMounted, user]);

  // Load generations from Supabase (wrapper for compatibility with ImageHistory)
  const loadGenerations = useCallback(async (silentUpdate: boolean = false) => {
    try {
      if (!silentUpdate) {
        setIsLoadingHistory(true);
        setErrorHistory(null); // Clear previous errors
      }
      await fetchAllPredictions(silentUpdate);
    } catch {
      // Error handling is now within fetchAllPredictions
    }
  }, [fetchAllPredictions]);

  // Visibility change effect for image history
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted && user) {
        loadGenerations(true); // Silent update
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadGenerations, isMounted, user]);

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

  // Conditional rendering for "no models" screen
  // This shows if loading is complete AND there are no models.
  if (!isLoadingUserModels && (!userModels || userModels.length === 0)) {
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
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
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
      
      <PromptForm 
        pendingGenerations={pendingGenerations}
        setPendingGenerations={setPendingGenerations}
        promptValue={promptValue}
        userModels={userModels}
        isLoadingUserModels={isLoadingUserModels}
        onGenerationStart={() => { /* Potentially do nothing here if polling handles it */ }}
        onGenerationComplete={() => loadGenerations(true)} // Silent refresh
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