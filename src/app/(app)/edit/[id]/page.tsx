"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { X, Sparkles, Loader2, AlertCircle, Download, Share2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import TextareaAutosize from 'react-textarea-autosize'
import { useParams, useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { useGesture } from "@use-gesture/react"
import { useSpring, animated, config } from "@react-spring/web"
import { Badge } from "@/components/ui/badge"
import { downloadImageMobileNative, extractStoragePathFromUrl, getFilenameFromPath } from "@/lib/downloadUtils"

interface ActiveGenerationState {
  status: 'idle' | 'processing' | 'completed' | 'failed'
  replicateId?: string
  dbPredictionId?: string
  resultImageUrl?: string
  error?: string
  promptUsed?: string
}

interface DisplayedImage {
  id: string
  url: string
  prompt: string
  isOriginal: boolean
  replicateId?: string
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued'
}

interface StoredEdit {
  id: string
  replicate_id: string
  prompt: string
  storage_urls: string[] | null
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued'
  created_at: string
  source_prediction_id: string
  source_image_url: string
  error?: string | null
}

interface CachedEditData {
  id: string
  prompt: string
  storage_urls: string[]
  selectedImageUrl: string
  selectedImageIndex: number
  edits: EditData[]
}

// Define type for edit data (should match the one from ImageHistory)
interface EditData {
  id: string
  replicate_id: string
  prompt: string
  storage_urls: string[] | null
  status: string
  created_at: string
  source_image_url: string
  error?: string | null
}

interface ImageDimensions {
  width: number
  height: number
  aspectRatio: number
}

export default function EditImagePage() {
  const router = useRouter()
  const params = useParams()
  const originalPredictionId = params.id as string
  // const sourceImageIndex = parseInt(searchParams.get('source_image_index') || "0", 10) // No longer needed

  const { user, credits, refreshCredits } = useAuth()
  const supabase = createSupabaseBrowserClient()

  const [editPrompt, setEditPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeGenerationState, setActiveGenerationState] = useState<ActiveGenerationState>({ status: 'idle' })
  const [originalImageDetails, setOriginalImageDetails] = useState<{ id: string; url: string; prompt: string } | null>(null)
  const [previousEdits, setPreviousEdits] = useState<StoredEdit[]>([])
  const [currentDisplay, setCurrentDisplay] = useState<DisplayedImage | null>(null)

  // Page-level loading/error for initial data fetch
  const [initialDataLoading, setInitialDataLoading] = useState(true)
  const [initialDataError, setInitialDataError] = useState<string | null>(null)

  // States for the main display image
  const [mainImageDisplayLoaded, setMainImageDisplayLoaded] = useState(false)
  const [mainImageDisplayError, setMainImageDisplayError] = useState(false)
  
  const [sourceImageForCurrentEdit, setSourceImageForCurrentEdit] = useState<{ id: string; url: string; prompt: string } | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Refs for thumbnail buttons
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasCredits = credits?.has_credits || false
  const [isMobile, setIsMobile] = useState(false)

  // Zoom and pan state
  const [{ scale, x, y }, api] = useSpring(() => ({
    scale: 1,
    x: 0,
    y: 0,
    config: config.gentle
  }))

  const resetZoom = useCallback(() => {
    api.start({ scale: 1, x: 0, y: 0 });
  }, [api]);

  // Comprehensive UI zoom prevention
  useEffect(() => {
    // Save original viewport meta
    const originalMeta = document.querySelector('meta[name="viewport"]')
    const originalContent = originalMeta?.getAttribute('content') || ''
    
    // Update viewport to prevent zoom
    if (originalMeta) {
      originalMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    }
    
    // Allow vertical scroll, prevent text selection
    document.body.style.touchAction = 'pan-y'
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    
    // Prevent zoom with keyboard shortcuts
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=')) {
        e.preventDefault()
      }
    }
    
    // Prevent zoom with mouse wheel + ctrl/cmd
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    
    // Prevent touch zoom on the entire document
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }
    
    // Prevent double tap zoom
    let lastTouchEnd = 0
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }
    
    // Add event listeners with capture phase
    document.addEventListener('keydown', preventKeyboardZoom, { capture: true })
    document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true })
    document.addEventListener('touchstart', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchmove', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false, capture: true })
    
    // Add CSS to prevent zoom on specific elements
    const style = document.createElement('style')
    style.id = 'edit-page-zoom-prevention'
    style.textContent = `
      body.edit-page-open {
        touch-action: pan-y !important; /* Allow vertical scrolling */
        overscroll-behavior: none !important; /* Prevent pull-to-refresh etc. */
      }
      /* The 'body.edit-page-open *' rule that set touch-action: none has been removed 
         to avoid overly restricting child elements. */
      body.edit-page-open input,
      body.edit-page-open textarea,
      body.edit-page-open select {
        font-size: 16px !important; /* Prevent auto-zoom on focus on iOS */
        touch-action: manipulation !important; /* Allow default touch interactions like scrolling within textareas */
      }
    `
    document.head.appendChild(style)
    document.body.classList.add('edit-page-open')
    
    return () => {
      // Restore original viewport
      if (originalMeta) {
        originalMeta.setAttribute('content', originalContent)
      }
      
      // Restore body styles
      document.body.style.touchAction = ''
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      document.body.classList.remove('edit-page-open')
      
      // Remove event listeners
      document.removeEventListener('keydown', preventKeyboardZoom, { capture: true })
      document.removeEventListener('wheel', preventWheelZoom, { capture: true })
      document.removeEventListener('touchstart', preventTouchZoom, { capture: true })
      document.removeEventListener('touchmove', preventTouchZoom, { capture: true })
      document.removeEventListener('touchend', preventDoubleTapZoom, { capture: true })
      
      // Remove style
      document.getElementById('edit-page-zoom-prevention')?.remove()
    }
  }, [])

  useEffect(() => {
    const checkIsMobile = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 768)
      }
    }
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  useEffect(() => {
    const userId = user?.id

    if (originalPredictionId && supabase && userId) {
      const fetchInitialData = async () => {
        setInitialDataLoading(true)
        setMainImageDisplayLoaded(false)
        setMainImageDisplayError(false)
        setInitialDataError(null)
        setPreviousEdits([]) // Reset previous edits on each fetch
        setActiveGenerationState({ status: 'idle' }); // Reset active generation state

        try {
          // 1. Fetch prediction from DB to check ownership and deletion status
          const { data: dbPrediction, error: dbError } = await supabase
            .from('predictions')
            .select('id, prompt, storage_urls, is_deleted, user_id, input') // Add any other base fields needed
            .eq('id', originalPredictionId)
            .eq('user_id', userId)
            .single();

          if (dbError) {
            console.error("Error fetching prediction from DB:", dbError);
            const errorMessage = dbError.message.toLowerCase().includes("rows returned 0") || dbError.message.toLowerCase().includes("failed to fetch")
              ? "Image not found or access denied. It may have been deleted or you might not have permission to view it."
              : `Failed to load image data: ${dbError.message}`;
            throw new Error(errorMessage);
          }

          if (!dbPrediction) { // Should be caught by dbError typically, but as a safeguard
            throw new Error("Image not found or access denied. It may have been deleted or you might not have permission to view it.");
          }

          if (dbPrediction.is_deleted) {
            throw new Error("This image has been deleted and can no longer be edited.");
          }

          // 2. Prediction is valid and not deleted. Now try to use sessionStorage.
          const cachedDataString = sessionStorage.getItem(`edit_data_${originalPredictionId}`);
          if (cachedDataString) {
            const cachedEditData: CachedEditData = JSON.parse(cachedDataString);
            console.log("Using cached edit data from sessionStorage for original image and edits")
            
            const initialSourceDetails = { 
              id: dbPrediction.id, // Use ID from DB
              url: cachedEditData.selectedImageUrl, // URL from cache (the specific image selected by user)
              prompt: dbPrediction.prompt, // Prompt from DB
            };
            setOriginalImageDetails(initialSourceDetails);
            setSourceImageForCurrentEdit(initialSourceDetails);
            setCurrentDisplay({ 
              ...initialSourceDetails,
              isOriginal: true, // Assuming the first view is the 'original' for the edit session
              status: 'succeeded' 
            });
            setEditPrompt("");

            const editsForThisImage = (cachedEditData.edits || []).filter(edit => 
              edit.source_image_url === cachedEditData.selectedImageUrl
            );
            
            const storedEdits: StoredEdit[] = editsForThisImage.map(edit => ({
              ...edit,
              status: edit.status as 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued',
              source_prediction_id: dbPrediction.id 
            }));
            
            setPreviousEdits(storedEdits);
            console.log("Loaded edits from sessionStorage:", storedEdits);

            const stillProcessingEdit = storedEdits.find(edit =>
              (edit.status === 'starting' || edit.status === 'processing' || edit.status === 'queued') && edit.replicate_id
            );
            if (stillProcessingEdit) {
              setActiveGenerationState({
                status: 'processing',
                replicateId: stillProcessingEdit.replicate_id,
                dbPredictionId: stillProcessingEdit.id,
                promptUsed: stillProcessingEdit.prompt,
              });
            }
          } else {
            // No cached data, but prediction is valid and not deleted.
            // This is where the "Please select an image..." error comes from.
            console.warn(`No cached data for ${originalPredictionId}, but DB prediction is valid. Showing 'select from history' message.`);
            throw new Error("Please select an image to edit from your image history. Cache for this edit session was not found.");
          }

        } catch (err) {
          console.error("Failed to fetch initial page data:", err)
          const errorMessage = err instanceof Error ? err.message : "Failed to load image data."
          setInitialDataError(errorMessage)
          setMainImageDisplayError(true) // Ensure error state is reflected in UI for image area
          setOriginalImageDetails(null)
          setCurrentDisplay(null)
        } finally {
          setInitialDataLoading(false)
        }
      }
      fetchInitialData()
    } else if (!supabase || !userId) {
      setInitialDataLoading(false)
      setInitialDataError((!userId && supabase) ? "User not authenticated." : "Supabase client issue or user not loaded.")
      setMainImageDisplayError(true)
    }
  }, [originalPredictionId, supabase, user?.id /* sourceImageIndex removed as it's implicit in selectedImageUrl */])

  const cleanupPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    // Focus textarea when original image is loaded and we are ready for a new edit.
    // This happens when currentDisplay is the original image and no active generation.
    if (currentDisplay?.isOriginal && activeGenerationState.status === 'idle' && !initialDataLoading) {
       const timer = setTimeout(() => textareaRef.current?.focus(), 150)
       return () => clearTimeout(timer)
    }
  }, [currentDisplay, activeGenerationState.status, initialDataLoading])

  const handleGenerateNewEdit = useCallback(async () => {
    if (!editPrompt.trim() || isGenerating || !hasCredits || !user || !originalImageDetails || !originalPredictionId || !sourceImageForCurrentEdit) {
      if (!sourceImageForCurrentEdit) {
        console.error("Source image for current edit is not set.");
        setActiveGenerationState(prev => ({ ...prev, status: 'failed', error: "Cannot start edit: source image missing."}));
      }
      return;
    }
    
    setIsGenerating(true)
    if (sourceImageForCurrentEdit) {
      setCurrentDisplay({ 
        ...sourceImageForCurrentEdit, 
        isOriginal: sourceImageForCurrentEdit.id === originalImageDetails?.id, 
        status: 'processing' 
      }); 
    }
    setMainImageDisplayLoaded(false); 

    setActiveGenerationState({ status: 'processing', promptUsed: editPrompt.trim() })

    try {
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prompt: editPrompt.trim(), 
            imageUrl: sourceImageForCurrentEdit!.url, 
            originalPredictionId,
            sourcePredictionId: sourceImageForCurrentEdit!.id
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create edit')
      }
      const result = await response.json() 
      
      setActiveGenerationState(prev => ({ 
        ...prev, 
        status: result.status === 'starting' || result.status === 'processing' ? 'processing' : result.status, 
        replicateId: result.replicate_id,
        dbPredictionId: result.id, 
      }));

      const newPendingEdit: StoredEdit = {
        id: result.id,
        replicate_id: result.replicate_id,
        prompt: editPrompt.trim(),
        storage_urls: null,
        status: result.status || 'starting', 
        created_at: new Date().toISOString(),
        source_prediction_id: sourceImageForCurrentEdit!.id,
        source_image_url: sourceImageForCurrentEdit!.url,
      };
      setPreviousEdits(prevEdits => [newPendingEdit, ...prevEdits].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      
      if(refreshCredits) refreshCredits();

    } catch (error) {
      console.error('New Edit error:', error)
      const message = error instanceof Error ? error.message : "Failed to create new edit"
      setActiveGenerationState(prev => ({ ...prev, status: 'failed', error: message }));
      if (sourceImageForCurrentEdit) {
        setCurrentDisplay({ 
          ...sourceImageForCurrentEdit, 
          isOriginal: sourceImageForCurrentEdit.id === originalImageDetails?.id 
        });
      }
      setMainImageDisplayLoaded(true); 
    } finally {
      setIsGenerating(false)
    }
  }, [editPrompt, isGenerating, hasCredits, user, originalImageDetails, originalPredictionId, refreshCredits, sourceImageForCurrentEdit])

  // Call this when user wants to start a completely new edit,
  // typically after a previous one completed or failed.
  const handleStartNewEditSession = useCallback(() => {
    // Always reset to the original image as the source for new edits
    setSourceImageForCurrentEdit(originalImageDetails);
    if (originalImageDetails) {
      setCurrentDisplay({ ...originalImageDetails, isOriginal: true, status: 'succeeded' });
    }
    setEditPrompt("");
    setActiveGenerationState({ status: 'idle' });
    setMainImageDisplayLoaded(false); 
    setMainImageDisplayError(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [originalImageDetails, setSourceImageForCurrentEdit, setCurrentDisplay, setEditPrompt, setActiveGenerationState, setMainImageDisplayLoaded, setMainImageDisplayError]);

  // Reset zoom when image changes
  useEffect(() => {
    api.start({ scale: 1, x: 0, y: 0 })
  }, [currentDisplay, api])

  // Gesture handling with improved zoom isolation
  const bind = useGesture(
    {
      onDrag: ({ offset: [x, y], pinching, event }) => {
        event?.stopPropagation?.()
        if (!pinching && scale.get() > 1) {
          api.start({ x, y })
        }
      },
      onPinch: ({ offset: [s], event }) => {
        event?.stopPropagation?.()
        const newScale = Math.max(0.5, Math.min(5, s))
        api.start({ scale: newScale })
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault()
        event.stopPropagation()
        
        // Only zoom if not using ctrl/cmd (which would be browser zoom)
        if (!event.ctrlKey && !event.metaKey) {
          const scaleFactor = 1 - dy * 0.01
          const newScale = Math.max(0.5, Math.min(5, scale.get() * scaleFactor))
          api.start({ scale: newScale })
        }
      },
      onDoubleClick: ({ event }) => {
        event?.stopPropagation?.()
        if (scale.get() > 1) {
          resetZoom()
        } else {
          api.start({ scale: 2 })
        }
      }
    },
    {
      drag: {
        from: () => [x.get(), y.get()],
        bounds: () => {
          const s = scale.get()
          const maxX = (s - 1) * 300 // Increased bounds for larger container
          const maxY = (s - 1) * 300
          return { left: -maxX, right: maxX, top: -maxY, bottom: maxY }
        },
        rubberband: true
      },
      pinch: {
        scaleBounds: { min: 0.5, max: 5 },
        rubberband: true,
        from: () => [scale.get(), 0]
      },
      wheel: {
        preventDefault: true
      }
    }
  )

  const pollWithFallback = useCallback(async (attempt = 0) => {
    if (!activeGenerationState.replicateId || activeGenerationState.status !== 'processing') return

    try {
      // Use the new endpoint to fetch status by replicate_id
      const response = await fetch(`/api/predictions/status?replicate_id=${activeGenerationState.replicateId}`)
      if (!response.ok) {
        // It's possible the prediction is not found yet if this polls very quickly after creation
        // or if there's an actual server error.
        if (response.status === 404 && attempt < 5) { // Try a few times if 404
            console.warn(`[EditPage Polling] Prediction ${activeGenerationState.replicateId} not found yet (attempt ${attempt + 1}). Retrying...`);
            const nextDelay = 1000 * (attempt + 1); // Incremental backoff for not found
            pollTimeoutRef.current = setTimeout(() => pollWithFallback(attempt + 1), nextDelay);
            return;
        }
        throw new Error(`Failed to fetch prediction status: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      // The new endpoint returns { success: true, prediction: { ... } }
      const currentEditPrediction = data.success ? data.prediction : null;
      
      console.log('[EditPage Polling] Received data from /api/predictions/status:', data);
      console.log('[EditPage Polling] currentEditPrediction:', currentEditPrediction);
      console.log('[EditPage Polling] Current activeGenerationState before update:', JSON.parse(JSON.stringify(activeGenerationState)));

      if (currentEditPrediction && currentEditPrediction.replicate_id === activeGenerationState.replicateId) {
        // Update this specific edit in the previousEdits list
        setPreviousEdits(prevEdits => 
          prevEdits.map(edit => 
            edit.replicate_id === currentEditPrediction.replicate_id 
            ? { 
                ...edit, 
                status: currentEditPrediction.status, 
                storage_urls: currentEditPrediction.storage_urls, 
                error: currentEditPrediction.error 
              } 
            : edit
          ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        )
        
        // Update activeGenerationState and currentDisplay based on polled status
        if (currentEditPrediction.status === 'succeeded' && currentEditPrediction.storage_urls?.[0]) {
          console.log('[EditPage Polling] SUCCESS! Image generated. Replicate ID:', currentEditPrediction.replicate_id, 'DB ID:', currentEditPrediction.id, 'URL:', currentEditPrediction.storage_urls[0]);
          
          const newActiveState = {
            ...activeGenerationState, // Preserve existing dbPredictionId and promptUsed
            status: 'completed' as const,
            resultImageUrl: currentEditPrediction.storage_urls![0],
            // Ensure dbPredictionId from the initial state is used if currentEditPrediction.id is somehow different,
            // though ideally they should match if dbPredictionId in activeGenerationState was set from currentEditPrediction.id
            dbPredictionId: activeGenerationState.dbPredictionId || currentEditPrediction.id 
          };
          setActiveGenerationState(newActiveState);

          const newDisplayState = {
            id: currentEditPrediction.id,
            url: currentEditPrediction.storage_urls![0],
            prompt: currentEditPrediction.prompt || activeGenerationState.promptUsed || "",
            isOriginal: false,
            status: 'succeeded' as const,
            replicateId: currentEditPrediction.replicate_id
          };
          setCurrentDisplay(newDisplayState);
          
          console.log('[EditPage Polling] Updated activeGenerationState:', JSON.parse(JSON.stringify(newActiveState)));
          console.log('[EditPage Polling] Updated currentDisplay:', JSON.parse(JSON.stringify(newDisplayState)));
          console.log('[EditPage Polling] CHECKING RENDER CONDITION: newDisplayState.id === newActiveState.dbPredictionId is', newDisplayState.id === newActiveState.dbPredictionId);
          console.log(`IDs for check: display.id = ${newDisplayState.id}, active.dbPredictionId = ${newActiveState.dbPredictionId}`);

          cleanupPolling()
          if(refreshCredits) refreshCredits()
          return
        }
        
        if (currentEditPrediction.status === 'failed') {
          setActiveGenerationState(prev => ({
            ...prev,
            status: 'failed',
            error: currentEditPrediction.error || 'Edit failed',
          }))
          setCurrentDisplay(prev => 
            prev && prev.id === currentEditPrediction.id 
            ? { ...prev, status: 'failed', url: prev.url } // Keep URL for failed, so main display can show original based on sourceImageForCurrentEdit
            : prev
          )
          cleanupPolling()
          return
        }
      }

      // Continue polling if still processing (and not caught by 404 retry logic above)
      // This part is reached if status is still processing, or if there was an error not handled above (e.g. 500)
      // for which we might want to retry with backoff.
      if (currentEditPrediction && (currentEditPrediction.status === 'starting' || currentEditPrediction.status === 'processing' || currentEditPrediction.status === 'queued')) {
        const nextDelay = attempt < 3 ? 2000 : 5000 // Faster initial polls, then slow down
        pollTimeoutRef.current = setTimeout(() => pollWithFallback(attempt + 1), nextDelay)
      } else if (!currentEditPrediction) {
        // This case implies an issue like the prediction was deleted or some other non-recoverable error from the API
        // after initial 404 retries, or a success:false response for other reasons.
        console.error(`[EditPage Polling] Could not retrieve prediction ${activeGenerationState.replicateId} after several attempts or received error. Stopping poll.`);
        setActiveGenerationState(prev => ({
            ...prev,
            status: 'failed',
            error: data.error || 'Failed to retrieve prediction status after multiple attempts.',
        }));
        cleanupPolling();
        // Optionally, update currentDisplay to reflect this failure if this was the active one
      }

    } catch (error) {
      console.error(`Polling error (attempt ${attempt + 1}):`, error)
      // More robust error handling for retries
      if (attempt < 5) { // Limit total retries on generic errors
        const errorDelay = Math.min(2000 + attempt * 1000, 10000) // Exponential backoff for errors
        pollTimeoutRef.current = setTimeout(() => pollWithFallback(attempt + 1), errorDelay)
      } else {
        console.error(`[EditPage Polling] Max retries reached for ${activeGenerationState.replicateId}. Stopping poll due to error:`, error);
        setActiveGenerationState(prev => ({
            ...prev,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Max polling retries reached.',
        }));
        cleanupPolling();
        // Optionally, update currentDisplay
      }
    }
  }, [activeGenerationState.replicateId, activeGenerationState.status, activeGenerationState.promptUsed, activeGenerationState.dbPredictionId, refreshCredits, cleanupPolling])

  useEffect(() => {
    if (activeGenerationState.status === 'processing' && activeGenerationState.replicateId) {
      cleanupPolling() // Clear previous poll before starting a new one
      console.log(`Starting polling for active edit: ${activeGenerationState.replicateId}`)
      
      // Ensure the processing edit is represented in previousEdits list
      setPreviousEdits(prev => {
        const exists = prev.some(e => e.replicate_id === activeGenerationState.replicateId)
        if (!exists && activeGenerationState.dbPredictionId && sourceImageForCurrentEdit && activeGenerationState.replicateId) {
          const newProcessingEntry: StoredEdit = {
            id: activeGenerationState.dbPredictionId,
            replicate_id: activeGenerationState.replicateId!,
            prompt: activeGenerationState.promptUsed || editPrompt,
            storage_urls: null,
            status: 'processing',
            created_at: new Date().toISOString(),
            source_prediction_id: sourceImageForCurrentEdit.id,
            source_image_url: sourceImageForCurrentEdit.url,
            error: null,
          }
          return [newProcessingEntry, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }
        return prev.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      })
      
      pollWithFallback(0) // Start polling
    }
    
    return () => {
      if (activeGenerationState.status !== 'processing' || !activeGenerationState.replicateId) {
        cleanupPolling()
      }
    }
  }, [activeGenerationState.status, activeGenerationState.replicateId, activeGenerationState.dbPredictionId, activeGenerationState.promptUsed, editPrompt, sourceImageForCurrentEdit, pollWithFallback, cleanupPolling])

  // This handles loading of the main image in the display area (original or an edit)
  const handleMainImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
      aspectRatio: img.naturalWidth / img.naturalHeight
    })
    setMainImageDisplayLoaded(true)
    setMainImageDisplayError(false)
  }, [])

  // Persist previousEdits to sessionStorage whenever they change
  useEffect(() => {
    // Only update sessionStorage if initial data is loaded and we have the necessary details.
    if (!initialDataLoading && originalPredictionId && originalImageDetails && previousEdits) {
      const sessionStorageKey = `edit_data_${originalPredictionId}`;
      const currentCachedDataString = sessionStorage.getItem(sessionStorageKey);

      if (currentCachedDataString) {
        try {
          const currentCachedData: CachedEditData = JSON.parse(currentCachedDataString);

          // Convert StoredEdit[] to EditData[] for storing in cache.
          // EditData type (used in CachedEditData) does not include source_prediction_id.
          const newEditsForCache: EditData[] = previousEdits.map(edit => ({
            id: edit.id,
            replicate_id: edit.replicate_id,
            prompt: edit.prompt,
            storage_urls: edit.storage_urls,
            status: edit.status as 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued', // Ensure status is correctly typed
            created_at: edit.created_at,
            source_image_url: edit.source_image_url,
            error: edit.error,
            // source_prediction_id from StoredEdit is intentionally omitted
          }));

          // Check if the edits array has actually changed to prevent unnecessary writes.
          // Deep comparison can be expensive, but for a small array of edits, it's acceptable here.
          if (JSON.stringify(currentCachedData.edits || []) !== JSON.stringify(newEditsForCache)) {
            const updatedCachedData: CachedEditData = {
              ...currentCachedData, // Preserves original id, prompt, storage_urls, selectedImageUrl, selectedImageIndex from the initially cached data
              edits: newEditsForCache, // Update only the edits part
            };
            
            sessionStorage.setItem(sessionStorageKey, JSON.stringify(updatedCachedData));
            console.log(`[EditImagePage] Updated sessionStorage for ${originalPredictionId} with new edits.`);
          }
        } catch (e) {
          console.error("[EditImagePage] Error updating sessionStorage for edits:", e);
        }
      } else {
        // This might happen if the user navigates directly to the edit page without going through ImageHistory
        // or if sessionStorage was cleared. The page should still function but might not have pre-loaded edits if reloaded.
        console.warn(`[EditImagePage] Could not find initial cached data in sessionStorage for ${originalPredictionId} to update edits. New edits will still be tracked in component state.`);
      }
    }
  }, [previousEdits, originalPredictionId, originalImageDetails, initialDataLoading]);

  const allDisplayableItems: DisplayedImage[] = useMemo(() => {
    if (!originalImageDetails) return [];
    
    // Start with the original image
    const items: DisplayedImage[] = [{
       id: originalImageDetails.id,
       url: originalImageDetails.url,
       prompt: originalImageDetails.prompt,
       isOriginal: true,
       status: 'succeeded' // Original is always considered 'succeeded' in terms of displayability
    }];
    
    previousEdits.forEach(edit => {
      // Determine URL: use stored URL if succeeded, otherwise original (or placeholder if original not loaded yet)
      let displayUrl = originalImageDetails.url; // Default to original
      if (edit.status === 'succeeded' && edit.storage_urls?.[0]) {
        displayUrl = edit.storage_urls[0];
      } else if (activeGenerationState.dbPredictionId === edit.id && activeGenerationState.status === 'processing'){
        // If this edit is the one actively processing, might still show original as placeholder
        displayUrl = originalImageDetails.url; 
      }
      // For failed or other statuses without a result URL, we'll show the original anwyay in the thumbnail
      // or handle it in the thumbnail component (e.g. show an icon).

      items.push({
        id: edit.id,
        url: displayUrl, 
        prompt: edit.prompt,
        isOriginal: false,
        replicateId: edit.replicate_id,
        status: edit.status
      });
    });

    // Sort: Original image first, then by creation date (newest edits first)
    return items.sort((a, b) => {
        if (a.isOriginal && !b.isOriginal) return -1;
        if (!a.isOriginal && b.isOriginal) return 1;
        if (a.isOriginal && b.isOriginal) return 0; // Should not happen if only one original
        
        // Both are edits, sort by date
        const editA = previousEdits.find(e => e.id === a.id);
        const editB = previousEdits.find(e => e.id === b.id);
        if (editA && editB) {
            return new Date(editB.created_at).getTime() - new Date(editA.created_at).getTime();
        }
        return 0; // Fallback, should not be reached if data is consistent
    });
  }, [originalImageDetails, previousEdits, activeGenerationState.dbPredictionId, activeGenerationState.status]);

  // Function to handle clicking on a thumbnail (original or previous edit)
  const handleThumbnailClick = useCallback((item: DisplayedImage) => {
    if (activeGenerationState.status === 'processing' && activeGenerationState.replicateId !== item.replicateId) {
        cleanupPolling(); 
    }

    setCurrentDisplay(item); // Show the clicked item
    setMainImageDisplayLoaded(false); 
    setMainImageDisplayError(false);
    
    // Source for NEXT edit remains the original image. Do NOT update sourceImageForCurrentEdit here based on 'item'.
    // originalImageDetails is set on load and handleStartNewEditSession ensures sourceImageForCurrentEdit is reset to it.
    // If originalImageDetails itself is null (error case), sourceImageForCurrentEdit will also be null.

    setEditPrompt(""); // Clear prompt for new edit instruction (which will apply to original)
    
    // Scroll the selected thumbnail into view
    const itemIndex = allDisplayableItems.findIndex(dItem => dItem.id === item.id);
    if (itemIndex !== -1 && thumbnailRefs.current[itemIndex]) {
      thumbnailRefs.current[itemIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
    
    if (!item.isOriginal && (item.status === 'succeeded' || item.status === 'failed')) {
        setActiveGenerationState({
            status: item.status === 'succeeded' ? 'completed' : 'failed',
            replicateId: item.replicateId,
            dbPredictionId: item.id,
            resultImageUrl: item.status === 'succeeded' ? item.url : undefined,
            error: item.status === 'failed' ? (previousEdits.find(e=>e.id === item.id)?.error || "Previously failed") : undefined,
            promptUsed: item.prompt
        });
    } else if (item.isOriginal) {
        if (activeGenerationState.status !== 'processing' || activeGenerationState.replicateId === item.replicateId) {
           setActiveGenerationState({ status: 'idle' });
        }
    } else if (!item.isOriginal && (item.status === 'starting' || item.status === 'processing' || item.status === 'queued')) {
        setActiveGenerationState({
            status: 'processing',
            replicateId: item.replicateId,
            dbPredictionId: item.id,
            promptUsed: item.prompt
        });
    }
  }, [allDisplayableItems, previousEdits, activeGenerationState.status, activeGenerationState.replicateId, activeGenerationState.dbPredictionId, cleanupPolling, setActiveGenerationState, setCurrentDisplay, setMainImageDisplayLoaded, setMainImageDisplayError, setEditPrompt]);

  const containerDimensions = useMemo(() => {
    if (!imageDimensions) return { width: isMobile ? 'min(85vw, 400px)' : '400px', height: isMobile ? 'min(50vh, 400px)' : '400px' };
    const maxWidth = isMobile ? Math.min(window.innerWidth * 0.85, 500) : 500;
    const maxHeight = isMobile ? Math.min(window.innerHeight * 0.55, 500) : 500; // Increased height slightly
    let width = maxWidth;
    let height = width / imageDimensions.aspectRatio;
    if (height > maxHeight) { height = maxHeight; width = height * imageDimensions.aspectRatio; }
    width = Math.max(width, isMobile ? 250 : 350); // Increased min width
    height = Math.max(height, isMobile ? 250 : 350); // Increased min height
    return { width: `${width}px`, height: `${height}px` };
  }, [imageDimensions, isMobile])

  // useEffect for handleKeyDown is now placed here, after its dependencies are defined.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.back();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && 
          activeGenerationState.status === 'idle' && editPrompt.trim() && 
          originalImageDetails && (mainImageDisplayLoaded || !mainImageDisplayError)) {
        e.preventDefault();
        handleGenerateNewEdit();
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!allDisplayableItems || allDisplayableItems.length === 0) return;
        e.preventDefault();
        const currentIndex = currentDisplay 
          ? allDisplayableItems.findIndex(item => item.id === currentDisplay.id) 
          : -1;
        let nextIndex;
        if (currentIndex === -1) {
          nextIndex = e.key === 'ArrowRight' ? 0 : allDisplayableItems.length - 1;
        } else {
          if (e.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % allDisplayableItems.length;
          } else { 
            nextIndex = (currentIndex - 1 + allDisplayableItems.length) % allDisplayableItems.length;
          }
        }
        if (allDisplayableItems[nextIndex]) {
          handleThumbnailClick(allDisplayableItems[nextIndex]);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // cleanupPolling(); // Removed as cleanupPolling is in handleThumbnailClick and other places.
    };
  }, [
    router, 
    activeGenerationState.status, // Specific part of state
    editPrompt, 
    originalImageDetails, 
    mainImageDisplayLoaded, 
    mainImageDisplayError, 
    handleGenerateNewEdit, // Callback
    allDisplayableItems, // Memoized array
    currentDisplay, // State
    handleThumbnailClick // Callback
    // Removed activeGenerationState (full object) and cleanupPolling from deps as they caused issues or were not directly needed by handleKeyDown logic
  ]);

  if (initialDataLoading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex items-center justify-between p-4 lg:p-6 border-b border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="lg:hidden rounded-lg"> <X className="w-5 h-5" /> </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg lg:text-xl font-semibold text-foreground">Magic Edit</h1>
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">BETA</Badge>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground">Loading image details...</p>
            </div>
          </div>
           <Button variant="ghost" size="icon" onClick={() => router.back()} className="hidden lg:flex rounded-lg"> <X className="w-5 h-5" /> </Button>
        </header>
        <main className="flex-1 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-primary" /></main>
      </div>
    )
  }

  if (initialDataError || !originalImageDetails) {
    const isDeletedError = initialDataError?.includes("This image has been deleted and can no longer be edited.");
    const isMissingCacheError = initialDataError?.includes("Please select an image to edit from your image history.") || initialDataError?.includes("Cache for this edit session was not found.");
    const isNotFoundAccessDeniedError = initialDataError?.includes("Image not found or access denied");
    
    if (isDeletedError) {
      // Clean error page for deleted predictions
      return (
        <div className="flex flex-col h-screen bg-background">
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
            <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">This Artwork Has Vanished!</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Looks like this image has been archived to the digital beyond. But don&apos;t worry, there are plenty more masterpieces to create or discover!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
              <Button onClick={() => router.push('/create')} className="flex-1 max-w-xs">
                Explore Other Creations
              </Button>
            </div>
          </main>
        </div>
      );
    }
    
    if (isMissingCacheError) {
      // Clean error page for missing cache data
      return (
        <div className="flex flex-col h-screen bg-background">
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
            <AlertCircle className="w-16 h-16 text-blue-400 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Edit Session Not Found</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              {initialDataError} {/* To use Magic Edit, please select an image from your image history first. This ensures the best editing experience. */}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => router.push('/create')} className="flex-1">
                Go to Image History
              </Button>
              <Button variant="outline" onClick={() => router.back()} className="flex-1">
                Go Back
              </Button>
            </div>
          </main>
        </div>
      );
    }

    if (isNotFoundAccessDeniedError) {
      // Clean error page for "not found or access denied"
      return (
        <div className="flex flex-col h-screen bg-background">
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
            <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Image Not Found</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              {initialDataError}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => router.push('/create')} className="flex-1">
                Go to Image History
              </Button>
              <Button variant="outline" onClick={() => router.back()} className="flex-1">
                Go Back
              </Button>
            </div>
          </main>
        </div>
      );
    }
    
    // Fallback general error with header (catches other initialDataError types)
    return (
       <div className="flex flex-col h-screen">
         <header className="flex items-center justify-between p-4 lg:p-6 border-b border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="lg:hidden rounded-lg"> <X className="w-5 h-5" /> </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg lg:text-xl font-semibold text-foreground">Magic Edit</h1>
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">BETA</Badge>
              </div>
              <p className="text-xs lg:text-sm text-red-500">Error loading image</p>
            </div>
          </div>
           <Button variant="ghost" size="icon" onClick={() => router.back()} className="hidden lg:flex rounded-lg"> <X className="w-5 h-5" /> </Button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-red-600 mb-2">Could not load image</h2>
          <p className="text-muted-foreground mb-6">{initialDataError || "Original image data is unavailable."}</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </main>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="flex items-center justify-between p-4 lg:p-6 border-b border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-lg lg:hidden"><X className="w-5 h-5 text-muted-foreground" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg lg:text-xl font-semibold text-foreground">Magic Edit</h1>
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">BETA</Badge>
            </div>
            <p className="text-xs lg:text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
              Reimagine every pixel with AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeGenerationState.status === 'completed' && activeGenerationState.resultImageUrl && currentDisplay && !currentDisplay.isOriginal && currentDisplay.url === activeGenerationState.resultImageUrl && (
            <>
              <Button variant="ghost" size="sm" className="hidden sm:flex items-center"><Share2 className="w-4 h-4 mr-2" />Share</Button>
              <Button variant="ghost" size="sm" className="items-center" onClick={async () => {
                  if(activeGenerationState.resultImageUrl && activeGenerationState.dbPredictionId && supabase) {
                    try {
                      const path = extractStoragePathFromUrl(activeGenerationState.resultImageUrl)
                      const filename = getFilenameFromPath(path, 'edited')

                      const { data: blob, error } = await supabase.storage
                        .from('images')
                        .download(path);

                      if (error) throw error;
                      if (!blob) throw new Error("Image blob not found.");

                      await downloadImageMobileNative({
                        blob,
                        filename,
                        showToasts: false // Don't show toasts since this is in a header
                      })
                    } catch (err) {
                      console.error("Error downloading image:", err);
                    }
                  }
              }}><Download className="w-4 h-4 mr-2" />Download</Button>
            </>
          )}
           <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-lg hidden lg:flex"><X className="w-5 h-5 text-muted-foreground" /></Button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1">
        <main className="flex-1 flex flex-col items-center justify-center p-4 py-8 lg:p-8 bg-muted/50 min-h-0 overflow-hidden">
          <animated.div
            {...bind()}
            style={{
              scale,
              x,
              y,
              touchAction: 'none',
              cursor: scale.get() > 1 ? 'grab' : 'default'
            }}
            className="w-full max-w-3xl mx-auto"
          >
            <div className="relative mx-auto rounded-xl overflow-hidden shadow-xl bg-card border" style={{ width: containerDimensions.width, height: containerDimensions.height }}>
              <div className="w-full h-full" style={{ width: containerDimensions.width, height: containerDimensions.height }}>
                {/* Display logic based on currentDisplay and activeGenerationState */}
                {(!currentDisplay || (activeGenerationState.status === 'idle' && currentDisplay?.isOriginal)) && originalImageDetails && (
                  // IDLE state showing ORIGINAL image
                  <div className="w-full h-full flex items-center justify-center bg-muted relative">
                    {(!mainImageDisplayLoaded && !mainImageDisplayError) && <Skeleton className="absolute inset-0 w-full h-full rounded-xl" />}
                    {mainImageDisplayError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-4">
                        <AlertCircle className="w-12 h-12 mb-3 text-destructive" />
                        <p className="font-semibold text-lg">Error Loading Image</p>
                        <p className="text-sm text-center">Could not load this image for display.</p>
                      </div>
                    )}
                    {originalImageDetails.url && !mainImageDisplayError && (
                       <Image
                          key={originalImageDetails.url}
                          src={originalImageDetails.url}
                          alt="Original image to edit"
                          fill
                          className={`object-cover ${mainImageDisplayLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 rounded-xl`}
                          sizes={isMobile ? "85vw" : "500px"}
                          unoptimized
                          priority
                          onLoad={handleMainImageLoad}
                          onError={() => {
                            console.error("Failed to load original image for display:", originalImageDetails.url);
                            setMainImageDisplayError(true);
                            setMainImageDisplayLoaded(false);
                          }}
                        />
                    )}
                  </div>
                )}

                {currentDisplay && !currentDisplay.isOriginal && activeGenerationState.status !== 'processing' && (activeGenerationState.status === 'completed' || activeGenerationState.status === 'failed' || activeGenerationState.status === 'idle') && (
                  // Displaying a COMPLETED or FAILED edit, or an IDLE view of a previous edit
                   <Image
                      key={currentDisplay.id}
                      src={currentDisplay.url} // This should be the result URL for completed, or original for failed if no result
                      alt={currentDisplay.status === 'succeeded' ? "Edited result" : "Previously edited image"}
                      fill
                      className={`object-cover ${mainImageDisplayLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 rounded-xl ${activeGenerationState.status === 'failed' && currentDisplay.id === activeGenerationState.dbPredictionId ? 'filter grayscale opacity-60' : ''}`}
                      sizes={isMobile ? "85vw" : "500px"}
                      unoptimized
                      priority={currentDisplay.status === 'succeeded'}
                      onLoad={handleMainImageLoad}
                      onError={() => {
                        console.error("Failed to load displayed edit image:", currentDisplay.url);
                        setMainImageDisplayError(true);
                        setMainImageDisplayLoaded(false);
                      }}
                    />
                )}
                
                {activeGenerationState.status === 'processing' && (
                  // PROCESSING a new edit
                  <div className="w-full h-full relative">
                     <Image
                        src={sourceImageForCurrentEdit?.url || "/placeholder-image.jpg"} // Show source image blurred
                        alt="Processing edit"
                        fill
                        className="object-cover filter blur-sm scale-105 rounded-xl"
                        sizes={isMobile ? "85vw" : "500px"}
                        unoptimized
                      />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                       <Loader2 className="w-10 h-10 animate-spin text-white/90 mb-12" />
                       <p className="absolute bottom-6 text-white/90 text-sm font-medium">Creating your masterpiece...</p>
                    </div>
                  </div>
                )}
                {activeGenerationState.status === 'completed' && activeGenerationState.resultImageUrl && currentDisplay && currentDisplay.id === activeGenerationState.dbPredictionId && (
                  // Specific view for the JUST COMPLETED image (might be redundant if above handles it)
                  <Image
                    src={activeGenerationState.resultImageUrl}
                    alt="Newly Edited result"
                    fill
                    className="object-cover animate-in fade-in duration-500 rounded-xl"
                    sizes={isMobile ? "85vw" : "500px"}
                    unoptimized
                    priority
                  />
                )}
                {activeGenerationState.status === 'failed' && currentDisplay && currentDisplay.id === activeGenerationState.dbPredictionId && (
                  // Specific view for the JUST FAILED image
                  <div className="w-full h-full flex items-center justify-center bg-destructive/10 relative rounded-xl">
                     <Image
                        src={sourceImageForCurrentEdit?.url || "/placeholder-image.jpg"} // Show source image as base for failed
                        alt="Edit failed - original image"
                        fill
                        className="object-cover filter grayscale opacity-50 rounded-xl"
                        sizes={isMobile ? "85vw" : "500px"}
                        unoptimized
                      />
                    <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center flex-col p-4 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-background rounded-full flex items-center justify-center shadow-lg border-2 border-destructive/30"><AlertCircle className="w-8 h-8 text-destructive" /></div>
                      <p className="text-lg font-medium text-destructive mb-1">Edit Failed</p>
                      <p className="text-sm text-destructive max-w-xs">{activeGenerationState.error || "An unexpected error occurred."}</p>
                    </div>
                  </div>
                )}
                {/* Error display for currentDisplay if it's an edit that failed to load its own image */}
                {mainImageDisplayError && currentDisplay && !currentDisplay.isOriginal && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-4 bg-destructive/10">
                        <AlertCircle className="w-12 h-12 mb-3 text-destructive" />
                        <p className="font-semibold text-lg">Error Loading Edited Image</p>
                        <p className="text-sm text-center">Could not load the selected edited image.</p>
                    </div>
                )}
              </div>
            </div>
          </animated.div>
        </main>
        <aside className="w-full lg:w-[380px] bg-card border-t lg:border-t-0 lg:border-l border flex flex-col shadow-lg lg:shadow-none">
          {/* Combined Thumbnail strip for original and previous edits */}
          {(originalImageDetails || previousEdits.length > 0) && (
            <div className="p-5 lg:p-6 border-b border">
              <p className="text-sm font-semibold text-card-foreground mb-3">
                {previousEdits.length > 0 ? "Image Edit Timeline" : "Original Image"}
              </p>
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-muted-foreground scrollbar-track-muted justify-start"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  }}
                >
                  {allDisplayableItems.map((item, index) => (
                    <button
                      key={item.id} // Use item.id which is unique (original or edit prediction id)
                      ref={el => { thumbnailRefs.current[index] = el; }} // Assign ref to the button
                      onClick={() => handleThumbnailClick(item)}
                      className={`group relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all duration-300 transform ${
                        currentDisplay && currentDisplay.id === item.id 
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110 shadow-lg' 
                          : 'ring-1 ring-border/50 hover:ring-2 hover:ring-primary/50 hover:scale-105 opacity-70 hover:opacity-100'
                      }`}
                      title={item.isOriginal ? `Original: ${item.prompt}` : `Edit: ${item.prompt}`}
                      aria-label={`View ${item.isOriginal ? 'original' : 'edit'} ${allDisplayableItems.indexOf(item) + 1}`}
                    >
                      <Image
                        src={item.url || (originalImageDetails?.url || '/placeholder-image.jpg')}
                        alt={item.isOriginal ? `Original: ${item.prompt.substring(0,30)}...` : `Edit: ${item.prompt.substring(0,30)}...`}
                        fill
                        className={`object-cover transition-transform duration-300 group-hover:scale-110 ${item.status === 'failed' ? 'filter grayscale' : ''}`}
                        sizes="80px"
                        unoptimized
                      />
                      
                      {/* Gradient overlay */}
                      <div className={`absolute inset-0 bg-gradient-to-t from-black/20 to-transparent transition-opacity duration-300 ${
                        currentDisplay && currentDisplay.id === item.id ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                      }`} />
                      
                      {/* Overlay for processing or failed status (only for edits) */}
                      {!item.isOriginal && (item.status === 'processing' || item.status === 'starting' || item.status === 'queued') && (
                        null // No loader here anymore
                      )}
                      {!item.isOriginal && item.status === 'failed' && (
                         <div className="absolute inset-0 bg-red-700/60 dark:bg-red-800/60 flex items-center justify-center">
                          <AlertCircle className="w-6 h-6 text-white/90"/>
                        </div>
                      )}
                      
                      {/* Label for Original Image Thumbnail */}
                      {item.isOriginal && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5">
                          Original
                        </div>
                      )}

                      {/* Focus indicator */}
                      {currentDisplay && currentDisplay.id === item.id && (
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-xl blur-sm" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Fade edges for overflow indication */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none" />
              </div>
            </div>
          )}

          <div className="flex-1 p-5 lg:p-6 flex flex-col">
            <div className="flex-1">
              {/* Target Image Preview - Now always shows originalImageDetails */}
              {originalImageDetails && (
                <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Editing From Original</p>
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 ring-2 ring-primary/20">
                      <Image
                        src={originalImageDetails.url}
                        alt="Original image for editing"
                        fill
                        className="object-cover"
                        sizes="48px"
                        unoptimized
                      />
                      {/* Loader overlay for the target image when processing */}
                      {activeGenerationState.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
                          <Loader2 className="w-5 h-5 animate-spin text-white/80" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        Original Image
                      </p>
                      <p className="text-xs text-muted-foreground truncate" title={originalImageDetails.prompt}>
                        {originalImageDetails.prompt}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <label htmlFor="editInstructions" className="block text-sm font-semibold text-card-foreground mb-2">
                {activeGenerationState.status === 'completed' || activeGenerationState.status === 'failed' ? 'Start a New Edit' : 'Describe Your Edit'}
              </label>
              <TextareaAutosize
                id="editInstructions" ref={textareaRef} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="e.g., 'Make the sky look like a vibrant sunset', 'Add a futuristic city in the background', 'Change hair to curly and red'"
                className="w-full p-3.5 border border-input rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm leading-relaxed transition-all duration-200 shadow-sm hover:border-ring focus:shadow-md"
                minRows={3} maxRows={6} 
                disabled={isGenerating || activeGenerationState.status === 'processing'}
              />
              {activeGenerationState.promptUsed && (
                <div className="text-sm text-muted-foreground mt-2">
                  {activeGenerationState.status === 'processing' && "Attempting Edit: "}
                  {activeGenerationState.status === 'failed' && "Last Edit Attempt: "}
                  {activeGenerationState.promptUsed}
                </div>
              )}
            </div>
            <div className="mt-6 space-y-3">
              { (activeGenerationState.status === 'idle' || activeGenerationState.status === 'completed' || activeGenerationState.status === 'failed') && (
                <Button
                  onClick={activeGenerationState.status === 'idle' ? handleGenerateNewEdit : handleStartNewEditSession}
                  disabled={ (activeGenerationState.status === 'idle') && (!editPrompt.trim() || isGenerating || !hasCredits || (!mainImageDisplayLoaded && mainImageDisplayError)) }
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl focus:ring-4 focus:ring-primary/40 text-base flex items-center justify-center gap-2"
                ><Sparkles className="w-5 h-5" />
                  {isGenerating ? "Creating..." : 
                   activeGenerationState.status === 'completed' ? "Create Another Magic Edit" : 
                   activeGenerationState.status === 'failed' ? "Try Magic Edit Again" : 
                   !hasCredits ? "No Credits Available" : 
                   // Simplified button text as all edits target original now
                     "Generate Magic Edit" }
                </Button>
              )}
              {activeGenerationState.status === 'processing' && (
                <Button disabled variant="secondary" className="w-full h-12 cursor-not-allowed rounded-xl flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />Processing Magic Edit...
                </Button>
              )}
              {!hasCredits && (activeGenerationState.status === 'idle' || activeGenerationState.status === 'failed') && (
                <div className="text-center p-4 bg-amber-100 dark:bg-amber-900/30 rounded-xl border border-amber-300 dark:border-amber-800/50">
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-2 font-medium">You&apos;re out of edit credits!</p>
                  <Button 
                    onClick={() => router.push("/plans")} 
                    variant="outline" 
                    size="sm" 
                    className="border-amber-400 text-amber-800 hover:bg-amber-100 hover:border-amber-500 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-800/40 dark:hover:border-amber-500 font-semibold"
                  >
                    Get More Credits
                  </Button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}