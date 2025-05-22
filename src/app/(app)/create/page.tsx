"use client"

import { useState, Suspense, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
}

// Define a type for prediction data from Supabase (moved from ImageHistory)
type PredictionData = {
  id: string
  replicate_id: string
  prompt: string
  aspect_ratio: string
  status: string
  storage_urls: string[] | null
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

// Simplified processOutput (moved from ImageHistory)
const processOutput = (storageUrls: string[] | null): ImageWithStatus[] => {
  if (!storageUrls || !Array.isArray(storageUrls)) {
    return [];
  }
  return storageUrls.map(url => ({
    url,
    isExpired: false
  }));
};

// Define default images as a constant outside the component
const DEFAULT_HEADER_IMAGES = ["/landing/01.webp", "/landing/02.webp", "/landing/03.webp"];

// Create a client component for the Create page content
function CreatePageContent() {
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([]);
  const [promptValue, setPromptValue] = useState("");

  // State for generations, loading, and error (moved from ImageHistory)
  const [generations, setGenerations] = useState<ImageGeneration[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { user } = useAuth();
  const supabaseClient = useRef(createSupabaseBrowserClient());

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Separate Supabase fetch logic (moved from ImageHistory)
  const fetchFromSupabase = useCallback(async (silentUpdate: boolean = false) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    if (!silentUpdate) {
      // Set loading true only if it's not a silent update at the beginning of the try block
      // setIsLoadingHistory(true); // Already set by loadGenerations
    }

    try {
      let query = supabaseClient.current
        .from('predictions')
        .select(`
          *,
          models:model_id (
            display_name
          )
        `)
        .eq('is_deleted', false);
      
      if (user?.id) {
        query = query.eq('user_id', user.id);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50); // Limit to 50, can be adjusted
      
      clearTimeout(timeoutId);
      
      if (error) {
        // Even if 'error' is not an Error instance, throw it to be caught below.
        // The catch block will provide more details.
        throw error; 
      }
      
      if (data) {
        const processedData: ImageGeneration[] = data
          .filter((item: PredictionData) => item.status === 'succeeded' && item.storage_urls)
          .map((item: PredictionData) => {
            const modelDisplayName = item.models?.display_name || 'Default Model';
            return {
              id: item.id,
              replicate_id: item.replicate_id,
              prompt: item.prompt,
              timestamp: item.created_at,
              images: processOutput(item.storage_urls),
              aspectRatio: item.aspect_ratio,
              format: item.format || item.input?.output_format || 'webp',
              modelDisplayName: modelDisplayName
            };
          });
        setGenerations(processedData);
      }
      
      // This was inside the try block, move to finally or ensure it's called in catch too
      // if (!silentUpdate) {
      //   setIsLoadingHistory(false);
      // }
    } catch (fetchError: unknown) { 
      clearTimeout(timeoutId);
      console.error("Full error object in fetchFromSupabase catch:", JSON.stringify(fetchError, null, 2));

      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          console.warn('Fetch generations aborted due to timeout');
          // setErrorHistory('Failed to load image history: Request timed out.'); // setErrorHistory is handled by loadGenerations caller
        } else {
          console.error('Error fetching generations (Error instance):', fetchError);
          setErrorHistory(`Failed to load image history: ${fetchError.message}`);
        }
      } else {
        // Handle non-Error objects thrown (e.g., plain objects from Supabase client)
        let errorMessage = 'An unknown error occurred while loading image history.';
        if (typeof fetchError === 'object' && fetchError !== null && 'message' in fetchError) {
          errorMessage = `Failed to load image history: ${(fetchError as { message: string }).message}`;
        }
        console.error('Unknown error object fetching generations:', fetchError);
        setErrorHistory(errorMessage);
      }
    } finally {
      if (!silentUpdate) {
        setIsLoadingHistory(false);
      }
    }
  }, [user?.id, supabaseClient, setErrorHistory, setIsLoadingHistory]); // Added supabaseClient, setErrorHistory, setIsLoadingHistory

  // Load generations from Supabase (moved from ImageHistory)
  const loadGenerations = useCallback(async (silentUpdate: boolean = false) => {
    try {
      if (!silentUpdate) {
        setIsLoadingHistory(true);
        setErrorHistory(null); // Clear previous errors
      }
      await fetchFromSupabase(silentUpdate);
    } catch {
      // Error handling is now within fetchFromSupabase
      // setErrorHistory is set there if needed.
      // setIsLoadingHistory(false) is also handled in fetchFromSupabase's finally block.
    }
  }, [fetchFromSupabase]);

  // Initial data load (moved from ImageHistory)
  useEffect(() => {
    if (isMounted && user) {
      loadGenerations(false);
    }
  }, [isMounted, user, loadGenerations]);

  // Keep the visibility change effect to reload when the tab becomes visible again
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
    if (isLoadingHistory) {
      return DEFAULT_HEADER_IMAGES;
    }

    if (generations && generations.length > 0) {
      const allImageUrls = generations.flatMap(g => g.images.map(img => img.url)).filter(url => url && typeof url === 'string');
      if (allImageUrls.length >= 3) {
        const shuffled = [...allImageUrls].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 3);
      } else {
        return DEFAULT_HEADER_IMAGES;
      }
    }
    return DEFAULT_HEADER_IMAGES;
  }, [generations, isLoadingHistory]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
      <div className="mb-8 hidden sm:flex items-center justify-center space-x-4">
        <div className="flex items-center cursor-default">
          {isLoadingHistory ? (
            <>
              <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white transform -rotate-6 mr-[-10px]">
                <div className="w-full h-full bg-gray-300 animate-pulse"></div>
              </div>
              <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white z-10 transform scale-110">
                <div className="w-full h-full bg-gray-300 animate-pulse"></div>
              </div>
              <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white transform rotate-6 ml-[-10px]">
                <div className="w-full h-full bg-gray-300 animate-pulse"></div>
              </div>
            </>
          ) : (
            selectedHeaderImages.map((src: string, index: number) => (
              <div 
                key={src || index}
                className={`relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-white transition-all duration-300 ease-out hover:-translate-y-1 hover:z-20 ${
                  index === 0 ? 'transform -rotate-6 mr-[-10px] hover:rotate-[-10deg] hover:scale-110' :
                  index === 1 ? 'z-10 transform scale-110 hover:scale-125' :
                  'transform rotate-6 ml-[-10px] hover:rotate-[10deg] hover:scale-110'
                }`}
              >
                <Image src={src} alt={`Header image ${index + 1}`} fill className="object-cover" sizes="32px" unoptimized={!src.startsWith("/landing/")} />
              </div>
            ))
          )}
        </div>
        <h1 className="text-3xl font-semibold">Create images of yourself</h1>
      </div>
      <PromptForm 
        pendingGenerations={pendingGenerations}
        setPendingGenerations={setPendingGenerations}
        promptValue={promptValue}
        onGenerationStart={() => { /* Potentially do nothing here if polling handles it */ }}
        onGenerationComplete={() => loadGenerations(true)} // Silent refresh
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