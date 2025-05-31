"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { X, Sparkles, Loader2, AlertCircle, Download, Share2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import TextareaAutosize from 'react-textarea-autosize'
import { useParams, useRouter } from "next/navigation"
import { useGesture } from "@use-gesture/react"
import { useSpring, animated, config } from "@react-spring/web"
import { Badge } from "@/components/ui/badge"
import { downloadImageMobileNative, extractStoragePathFromUrl, getFilenameFromPath } from "@/lib/downloadUtils"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

interface ActiveGenerationState {
  status: 'idle' | 'processing' | 'completed' | 'failed'
  replicateId?: string
  dbPredictionId?: string
  resultImageUrl?: string
  error?: string
  promptUsed?: string
}

interface PredictionInput {
  prompt: string;
  model: string;
  go_fast: boolean;
  lora_scale: number;
  megapixels: string;
  num_outputs: number;
  aspect_ratio?: string;
  output_format: string;
  guidance_scale: number;
  output_quality: number;
  prompt_strength: number;
  extra_lora_scale: number;
  num_inference_steps: number;
  disable_safety_checker: boolean;
  image?: unknown;
  [key: string]: unknown;
}

interface ImageGeneration {
  id: string
  replicate_id: string
  prompt: string
  timestamp: string
  images: ImageWithStatus[]
  aspectRatio: string
  format?: string
  modelDisplayName?: string
  is_edit?: boolean
  is_deleted?: boolean
  input?: PredictionInput
  edits?: EditData[]
}

interface ImageWithStatus {
  url: string
  isExpired: boolean
  isLiked?: boolean
  generationId?: string
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued'
}

interface DisplayedImage {
  id: string
  url: string
  prompt: string
  isOriginal: boolean
  replicateId?: string
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued'
}

interface EditData {
  id: string
  replicate_id: string
  prompt: string
  storage_urls: string[] | null
  status: string
  created_at: string
  source_image_url: string
  source_prediction_id?: string
  error?: string | null
}

interface CachedSessionData {
  originalPrediction: ImageGeneration
  selectedImageUrl: string
  selectedImageIndex: number
}

interface StoredEdit extends EditData {
  source_prediction_id: string
}

interface ImageDimensions {
  width: number
  height: number
  aspectRatio: number
}

export default function EditImagePage() {
  const router = useRouter()
  const params = useParams()
  const originalPredictionDbId = params.id as string

  const { user, credits, refreshCredits } = useAuth()
  const supabase = createSupabaseBrowserClient()

  const [editPrompt, setEditPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeGenerationState, setActiveGenerationState] = useState<ActiveGenerationState>({ status: 'idle' })
  
  const [originalImageDetails, setOriginalImageDetails] = useState<ImageGeneration | null>(null)
  const [previousEdits, setPreviousEdits] = useState<StoredEdit[]>([])
  const [currentDisplay, setCurrentDisplay] = useState<DisplayedImage | null>(null)

  const [initialDataLoading, setInitialDataLoading] = useState(true)
  const [initialDataError, setInitialDataError] = useState<string | null>(null)

  const [mainImageDisplayLoaded, setMainImageDisplayLoaded] = useState(false)
  const [mainImageDisplayError, setMainImageDisplayError] = useState(false)
  
  const [sourceImageForCurrentEdit, setSourceImageForCurrentEdit] = useState<{ id: string; url: string; prompt: string } | null>(null)
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([])

  const hasCredits = credits?.has_credits || false
  const [isMobile, setIsMobile] = useState(false)

  const [{ scale, x, y }, api] = useSpring(() => ({ scale: 1, x: 0, y: 0, config: config.gentle }))
  const resetZoom = useCallback(() => { api.start({ scale: 1, x: 0, y: 0 }); }, [api])

  useEffect(() => {
    const originalMeta = document.querySelector('meta[name="viewport"]')
    const originalContent = originalMeta?.getAttribute('content') || ''
    
    originalMeta?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    
    document.body.style.touchAction = 'pan-y'
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=')) {
        e.preventDefault()
      }
    }
    
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }
    
    let lastTouchEnd = 0
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }
    
    document.addEventListener('keydown', preventKeyboardZoom, { capture: true })
    document.addEventListener('wheel', preventWheelZoom, { passive: false, capture: true })
    document.addEventListener('touchstart', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchmove', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false, capture: true })
    
    const style = document.createElement('style')
    style.id = 'edit-page-zoom-prevention'
    style.textContent = `
      body.edit-page-open {
        touch-action: pan-y !important;
        overscroll-behavior: none !important;
      }
      body.edit-page-open input,
      body.edit-page-open textarea,
      body.edit-page-open select {
        font-size: 16px !important;
        touch-action: manipulation !important;
      }
    `
    document.head.appendChild(style)
    document.body.classList.add('edit-page-open')
    
    return () => {
      if (originalMeta) {
        originalMeta.setAttribute('content', originalContent)
      }
      
      document.body.style.touchAction = ''
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      document.body.classList.remove('edit-page-open')
      
      document.removeEventListener('keydown', preventKeyboardZoom, { capture: true })
      document.removeEventListener('wheel', preventWheelZoom, { capture: true })
      document.removeEventListener('touchstart', preventTouchZoom, { capture: true })
      document.removeEventListener('touchmove', preventTouchZoom, { capture: true })
      document.removeEventListener('touchend', preventDoubleTapZoom, { capture: true })
      
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

  const cleanupPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (currentDisplay?.isOriginal && activeGenerationState.status === 'idle' && !initialDataLoading) {
       const timer = setTimeout(() => textareaRef.current?.focus(), 150)
       return () => clearTimeout(timer)
    }
  }, [currentDisplay, activeGenerationState.status, initialDataLoading])

  useEffect(() => {
    if (!originalPredictionDbId || !user?.id) {
      setInitialDataLoading(false)
      setInitialDataError((!user?.id) ? "User not authenticated." : "Missing prediction ID.")
      setMainImageDisplayError(true)
      return
    }

      const fetchInitialData = async () => {
        setInitialDataLoading(true)
        setMainImageDisplayLoaded(false)
        setMainImageDisplayError(false)
        setInitialDataError(null)
      setPreviousEdits([])
      setActiveGenerationState({ status: 'idle' })

      try {
        const sessionStorageKey = `edit_session_data_${originalPredictionDbId}`
        const cachedDataString = sessionStorage.getItem(sessionStorageKey)
        let sessionData: CachedSessionData | null = null

        if (cachedDataString) {
          try {
            sessionData = JSON.parse(cachedDataString) as CachedSessionData
            console.log("Using cached edit session data from sessionStorage")
          } catch (e) {
            console.warn("Failed to parse session data, fetching fresh:", e)
            sessionStorage.removeItem(sessionStorageKey)
          }
        }

        if (sessionData && sessionData.originalPrediction) {
          if (sessionData.originalPrediction.is_deleted) {
            throw new Error("This image has been deleted and can no longer be edited.")
          }
          if (sessionData.originalPrediction.id !== originalPredictionDbId) {
             console.warn("Cached data ID mismatch. Fetching fresh data.")
             sessionData = null
          }
        }
        
        let dataToUse: CachedSessionData

        if (sessionData) {
          dataToUse = sessionData
        } else {
          console.log(`No valid session data for ${originalPredictionDbId}, fetching from API...`)
          const response = await fetch(`/api/predictions/single/${originalPredictionDbId}?include_edits=true`)
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error("Image not found. It may have been deleted or never existed.")
            }
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `Failed to fetch image data from API: ${response.status}`)
          }

          const apiResult = await response.json()
          if (!apiResult.success || !apiResult.prediction) {
            throw new Error(apiResult.error || "Failed to parse image data from API.")
          }

          const fetchedPrediction = apiResult.prediction as ImageGeneration

          if (fetchedPrediction.is_deleted) {
            throw new Error("This image has been deleted and can no longer be edited.")
          }

          dataToUse = {
            originalPrediction: fetchedPrediction,
            selectedImageUrl: fetchedPrediction.images?.[0]?.url || '',
            selectedImageIndex: 0,
          }

          if (!dataToUse.selectedImageUrl) {
            throw new Error("Fetched image data is incomplete (missing image URL).")
          }
          sessionStorage.setItem(sessionStorageKey, JSON.stringify(dataToUse))
          console.log("Fetched data from API and cached in sessionStorage")
        }

        // --- Fetch pending edits from API and merge with sessionStorage ---
        let pendingEdits: StoredEdit[] = []
        try {
          const pendingRes = await fetch('/api/predictions/pending')
          if (pendingRes.ok) {
            const pendingJson: { success: boolean; predictions: Record<string, unknown>[] } = await pendingRes.json()
            if (pendingJson.success && Array.isArray(pendingJson.predictions)) {
              pendingEdits = pendingJson.predictions
                .filter((edit) => (edit as { is_edit?: boolean, source_prediction_id?: string }).is_edit && (edit as { source_prediction_id?: string }).source_prediction_id === originalPredictionDbId)
                .map((edit) => ({
                  id: (edit as { id: string }).id,
                  replicate_id: (edit as { replicate_id: string }).replicate_id,
                  prompt: (edit as { prompt: string }).prompt,
                  storage_urls: (edit as { storage_urls: string[] | null }).storage_urls,
                  status: (edit as { status: string }).status,
                  created_at: (edit as { created_at: string }).created_at,
                  source_image_url: (edit as { source_image_url: string }).source_image_url,
                  source_prediction_id: (edit as { source_prediction_id: string }).source_prediction_id,
                  error: (edit as { error?: string | null }).error,
                }))
            }
          }
        } catch (e) {
          console.warn('Failed to fetch pending edits from API:', e)
        }

        const { originalPrediction, selectedImageUrl } = dataToUse
        // Merge edits from sessionStorage and pendingEdits from API, deduping by replicate_id
        const allSessionEdits = (originalPrediction.edits || []).map(edit => ({
              ...edit,
              status: edit.status as 'starting' | 'processing' | 'succeeded' | 'failed' | 'queued',
          source_prediction_id: originalPrediction.id
        }))
        const allEditsMap = new Map<string, StoredEdit>()
        for (const edit of [...pendingEdits, ...allSessionEdits]) {
          if (edit.replicate_id) {
            allEditsMap.set(edit.replicate_id, edit)
          } else {
            // fallback to id if replicate_id is missing
            allEditsMap.set(edit.id, edit)
          }
        }
        const mergedEdits = Array.from(allEditsMap.values())
          .filter(edit => edit.source_image_url === selectedImageUrl || edit.source_prediction_id === originalPrediction.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setOriginalImageDetails(originalPrediction)
        setSourceImageForCurrentEdit({ id: originalPrediction.id, url: selectedImageUrl, prompt: originalPrediction.prompt })
        setCurrentDisplay({ id: originalPrediction.id, url: selectedImageUrl, prompt: originalPrediction.prompt, isOriginal: true, status: 'succeeded' })
        setEditPrompt("")
        setPreviousEdits(mergedEdits)
        console.log("Loaded edits from merged session + pending API:", mergedEdits)

        // If any pending edit exists, set as processing and resume polling
        const stillProcessingEdit = mergedEdits.find(edit =>
              (edit.status === 'starting' || edit.status === 'processing' || edit.status === 'queued') && edit.replicate_id
        )
            if (stillProcessingEdit) {
              setActiveGenerationState({
                status: 'processing',
                replicateId: stillProcessingEdit.replicate_id,
                dbPredictionId: stillProcessingEdit.id,
                promptUsed: stillProcessingEdit.prompt,
          })
        }

        // Update sessionStorage with merged edits
        try {
          const currentSessionDataString = sessionStorage.getItem(sessionStorageKey)
          if (currentSessionDataString) {
            const currentSessionData: CachedSessionData = JSON.parse(currentSessionDataString)
            const updatedOriginalPrediction = {
              ...currentSessionData.originalPrediction,
              edits: mergedEdits,
            }
            const updatedCachedData: CachedSessionData = {
              ...currentSessionData,
              originalPrediction: updatedOriginalPrediction,
            }
            sessionStorage.setItem(sessionStorageKey, JSON.stringify(updatedCachedData))
          }
        } catch (e) {
          console.error("[EditImagePage] Error updating sessionStorage with merged edits:", e)
        }
        } catch (err) {
          console.error("Failed to fetch initial page data:", err)
          const errorMessage = err instanceof Error ? err.message : "Failed to load image data."
          setInitialDataError(errorMessage)
        setMainImageDisplayError(true)
          setOriginalImageDetails(null)
          setCurrentDisplay(null)
        } finally {
          setInitialDataLoading(false)
        }
      }

      fetchInitialData()
  }, [originalPredictionDbId, user?.id])

  const handleGenerateNewEdit = useCallback(async () => {
    if (!editPrompt.trim() || isGenerating || !hasCredits || !user || !originalImageDetails || !sourceImageForCurrentEdit) {
      if (!sourceImageForCurrentEdit) {
        console.error("Source image for current edit is not set.")
        setActiveGenerationState(prev => ({ ...prev, status: 'failed', error: "Cannot start edit: source image missing." }))
      }
      return
    }
    
    setIsGenerating(true)
    if (sourceImageForCurrentEdit) {
      setCurrentDisplay({ 
        ...sourceImageForCurrentEdit, 
        isOriginal: sourceImageForCurrentEdit.id === originalImageDetails?.id, 
        status: 'processing' 
      })
    }
    setMainImageDisplayLoaded(false)

    setActiveGenerationState({ status: 'processing', promptUsed: editPrompt.trim() })

    try {
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prompt: editPrompt.trim(), 
            imageUrl: sourceImageForCurrentEdit!.url, 
            originalPredictionId: originalImageDetails.id,
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
      }))

      const newPendingEdit: StoredEdit = {
        id: result.id,
        replicate_id: result.replicate_id,
        prompt: editPrompt.trim(),
        storage_urls: null,
        status: result.status || 'starting', 
        created_at: new Date().toISOString(),
        source_prediction_id: originalImageDetails.id,
        source_image_url: sourceImageForCurrentEdit!.url,
      }
      setPreviousEdits(prevEdits => [newPendingEdit, ...prevEdits].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      
      if(refreshCredits) refreshCredits()

    } catch (error) {
      console.error('New Edit error:', error)
      const message = error instanceof Error ? error.message : "Failed to create new edit"
      setActiveGenerationState(prev => ({ ...prev, status: 'failed', error: message }))
      if (sourceImageForCurrentEdit) {
        setCurrentDisplay({ 
          ...sourceImageForCurrentEdit, 
          isOriginal: sourceImageForCurrentEdit.id === originalImageDetails?.id 
        })
      }
      setMainImageDisplayLoaded(true)
    } finally {
      setIsGenerating(false)
    }
  }, [editPrompt, isGenerating, hasCredits, user, originalImageDetails, refreshCredits, sourceImageForCurrentEdit])

  useEffect(() => { api.start({ scale: 1, x: 0, y: 0 }) }, [currentDisplay, api])

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
          const maxX = (s - 1) * 300
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
      const response = await fetch(`/api/predictions/status?replicate_id=${activeGenerationState.replicateId}`)
      if (!response.ok) {
        if (response.status === 404 && attempt < 5) { 
            console.warn(`[EditPage Polling] Prediction ${activeGenerationState.replicateId} not found yet (attempt ${attempt + 1}). Retrying...`);
            const nextDelay = 1000 * (attempt + 1); 
            pollTimeoutRef.current = setTimeout(() => pollWithFallback(attempt + 1), nextDelay);
            return;
        }
        throw new Error(`Failed to fetch prediction status: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const currentEditPrediction = data.success ? data.prediction : null;
      
      console.log('[EditPage Polling] Received data from /api/predictions/status:', data);

      if (currentEditPrediction && currentEditPrediction.replicate_id === activeGenerationState.replicateId) {
        const updatedEdit: StoredEdit = {
          id: currentEditPrediction.id,
          replicate_id: currentEditPrediction.replicate_id,
          prompt: currentEditPrediction.prompt || activeGenerationState.promptUsed || "",
                storage_urls: currentEditPrediction.storage_urls, 
          status: currentEditPrediction.status,
          created_at: currentEditPrediction.created_at || new Date().toISOString(),
          source_image_url: currentEditPrediction.input?.image || sourceImageForCurrentEdit?.url || "",
          source_prediction_id: originalImageDetails!.id,
                error: currentEditPrediction.error 
        };

        setPreviousEdits(prevEdits => 
          prevEdits.map(edit => 
            edit.replicate_id === updatedEdit.replicate_id 
            ? updatedEdit
            : edit
          ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        )
        
        if (currentEditPrediction.status === 'succeeded' && currentEditPrediction.storage_urls?.[0]) {
          console.log('[EditPage Polling] SUCCESS! Image generated.');
          
          setActiveGenerationState({
            ...activeGenerationState,
            status: 'completed' as const,
            resultImageUrl: currentEditPrediction.storage_urls![0],
            dbPredictionId: currentEditPrediction.id 
          });

          setCurrentDisplay({
            id: currentEditPrediction.id,
            url: currentEditPrediction.storage_urls![0],
            prompt: currentEditPrediction.prompt || activeGenerationState.promptUsed || "",
            isOriginal: false,
            status: 'succeeded' as const,
            replicateId: currentEditPrediction.replicate_id
          });
          
          if (originalImageDetails) {
            localStorage.setItem('photomate_updated_edits_for_prediction_id', originalImageDetails.id);
          }

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
          if (sourceImageForCurrentEdit) {
             setCurrentDisplay({ ...sourceImageForCurrentEdit, isOriginal: originalImageDetails?.id === sourceImageForCurrentEdit.id, status: 'succeeded' });
          }
          cleanupPolling()
          return
        }
      }

      if (currentEditPrediction && (currentEditPrediction.status === 'starting' || currentEditPrediction.status === 'processing' || currentEditPrediction.status === 'queued')) {
        const nextDelay = attempt < 3 ? 2000 : 5000 
        pollTimeoutRef.current = setTimeout(() => pollWithFallback(attempt + 1), nextDelay)
      } else if (!currentEditPrediction) {
        console.error(`[EditPage Polling] Could not retrieve prediction ${activeGenerationState.replicateId}.`);
        setActiveGenerationState(prev => ({ ...prev, status: 'failed', error: data.error || 'Failed to retrieve status.'}));
        cleanupPolling();
      }

    } catch (error) {
      console.error(`Polling error (attempt ${attempt + 1}):`, error)
      if (attempt < 5) { 
        const errorDelay = Math.min(2000 + attempt * 1000, 10000) 
        pollTimeoutRef.current = setTimeout(() => pollWithFallback(attempt + 1), errorDelay)
      } else {
        setActiveGenerationState(prev => ({ ...prev, status: 'failed', error: error instanceof Error ? error.message : 'Max retries.'}));
        cleanupPolling();
      }
    }
  }, [activeGenerationState.replicateId, activeGenerationState.status, activeGenerationState.promptUsed, activeGenerationState.dbPredictionId, refreshCredits, cleanupPolling, sourceImageForCurrentEdit, originalImageDetails])

  useEffect(() => {
    if (activeGenerationState.status === 'processing' && activeGenerationState.replicateId) {
      cleanupPolling()
      console.log(`Starting polling for active edit: ${activeGenerationState.replicateId}`)
      
      setPreviousEdits(prev => {
        const exists = prev.some(e => e.replicate_id === activeGenerationState.replicateId)
        if (!exists && activeGenerationState.dbPredictionId && sourceImageForCurrentEdit && activeGenerationState.replicateId && originalImageDetails) {
          const newProcessingEntry: StoredEdit = {
            id: activeGenerationState.dbPredictionId,
            replicate_id: activeGenerationState.replicateId!,
            prompt: activeGenerationState.promptUsed || editPrompt,
            storage_urls: null,
            status: 'processing',
            created_at: new Date().toISOString(),
            source_prediction_id: originalImageDetails.id,
            source_image_url: sourceImageForCurrentEdit.url,
            error: null,
          }
          return [newProcessingEntry, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }
        return prev.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      })
      
      pollWithFallback(0)
    }
    
    return () => {
      if (activeGenerationState.status !== 'processing' || !activeGenerationState.replicateId) {
        cleanupPolling()
      }
    }
  }, [activeGenerationState.status, activeGenerationState.replicateId, activeGenerationState.dbPredictionId, activeGenerationState.promptUsed, editPrompt, sourceImageForCurrentEdit, pollWithFallback, cleanupPolling, originalImageDetails])

  const handleMainImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight, aspectRatio: img.naturalWidth / img.naturalHeight })
    setMainImageDisplayLoaded(true)
    setMainImageDisplayError(false)
  }, [])

  useEffect(() => {
    if (!initialDataLoading && originalImageDetails && previousEdits) {
      const sessionStorageKey = `edit_session_data_${originalImageDetails.id}`;
      try {
        const currentSessionDataString = sessionStorage.getItem(sessionStorageKey);
        if (currentSessionDataString) {
          const currentSessionData: CachedSessionData = JSON.parse(currentSessionDataString);

          const editsForSessionCache: EditData[] = previousEdits.map(pe => ({
            id: pe.id,
            replicate_id: pe.replicate_id,
            prompt: pe.prompt,
            storage_urls: pe.storage_urls,
            status: pe.status,
            created_at: pe.created_at,
            source_image_url: pe.source_image_url,
            source_prediction_id: pe.source_prediction_id,
            error: pe.error,
          })); 

          if (JSON.stringify(currentSessionData.originalPrediction.edits || []) !== JSON.stringify(editsForSessionCache)) {
            const updatedOriginalPrediction = {
              ...currentSessionData.originalPrediction,
              edits: editsForSessionCache,
            };
            const updatedCachedData: CachedSessionData = {
              ...currentSessionData,
              originalPrediction: updatedOriginalPrediction,
            };
            sessionStorage.setItem(sessionStorageKey, JSON.stringify(updatedCachedData));
            console.log(`[EditImagePage] Updated sessionStorage for ${originalImageDetails.id} with new edits array.`);
          }
          }
        } catch (e) {
        console.error("[EditImagePage] Error updating sessionStorage with current edits:", e);
        }
      }
  }, [previousEdits, originalImageDetails, initialDataLoading]);

  const allDisplayableItems: DisplayedImage[] = useMemo(() => {
    if (!originalImageDetails) return [];
    
    const initiallySelectedUrl = sessionStorage.getItem(`edit_session_data_${originalImageDetails.id}`) ? 
                                JSON.parse(sessionStorage.getItem(`edit_session_data_${originalImageDetails.id}`)!).selectedImageUrl 
                                : originalImageDetails.images[0].url;

    const items: DisplayedImage[] = [{
       id: originalImageDetails.id,
       url: initiallySelectedUrl,
       prompt: originalImageDetails.prompt,
       isOriginal: true,
       status: 'succeeded'
    }];
    
    previousEdits.forEach(edit => {
      let displayUrl = initiallySelectedUrl;
      if (edit.status === 'succeeded' && edit.storage_urls?.[0]) {
        displayUrl = edit.storage_urls[0];
      } else if (activeGenerationState.dbPredictionId === edit.id && activeGenerationState.status === 'processing'){
        displayUrl = initiallySelectedUrl; 
      }

      items.push({
        id: edit.id,
        url: displayUrl, 
        prompt: edit.prompt,
        isOriginal: false,
        replicateId: edit.replicate_id,
        status: edit.status as DisplayedImage['status']
      });
    });
    return items;
  }, [originalImageDetails, previousEdits, activeGenerationState.dbPredictionId, activeGenerationState.status]);

  const handleThumbnailClick = useCallback((item: DisplayedImage) => {
    if (activeGenerationState.status === 'processing' && activeGenerationState.replicateId !== item.replicateId) {
        cleanupPolling(); 
    }

    setCurrentDisplay(item);
    setMainImageDisplayLoaded(false); 
    setMainImageDisplayError(false);
    
    setEditPrompt(""); 

    // Always ensure sourceImageForCurrentEdit points to the original image
    if (originalImageDetails) {
      const initiallySelectedUrl = sessionStorage.getItem(`edit_session_data_${originalImageDetails.id}`) ? 
                                  JSON.parse(sessionStorage.getItem(`edit_session_data_${originalImageDetails.id}`)!).selectedImageUrl 
                                  : originalImageDetails.images[0].url;
      
      setSourceImageForCurrentEdit({
        id: originalImageDetails.id, 
        url: initiallySelectedUrl, 
        prompt: originalImageDetails.prompt
      });
    }

    const itemIndex = allDisplayableItems.findIndex(dItem => dItem.id === item.id);
    if (itemIndex !== -1 && thumbnailRefs.current[itemIndex]) {
      thumbnailRefs.current[itemIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
  }, [allDisplayableItems, previousEdits, activeGenerationState.status, activeGenerationState.replicateId, activeGenerationState.dbPredictionId, cleanupPolling, originalImageDetails]);

  const containerDimensions = useMemo(() => {
    if (!imageDimensions) return { width: isMobile ? 'min(85vw, 400px)' : '400px', height: isMobile ? 'min(50vh, 400px)' : '400px' };
    const maxWidth = isMobile ? Math.min(window.innerWidth * 0.85, 500) : 500;
    const maxHeight = isMobile ? Math.min(window.innerHeight * 0.55, 500) : 500;
    let width = maxWidth;
    let height = width / imageDimensions.aspectRatio;
    if (height > maxHeight) { height = maxHeight; width = height * imageDimensions.aspectRatio; }
    width = Math.max(width, isMobile ? 250 : 350);
    height = Math.max(height, isMobile ? 250 : 350);
    return { width: `${width}px`, height: `${height}px` };
  }, [imageDimensions, isMobile])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); router.back(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && 
          activeGenerationState.status === 'idle' && editPrompt.trim() && 
          originalImageDetails && (mainImageDisplayLoaded || !mainImageDisplayError)) {
        e.preventDefault(); handleGenerateNewEdit();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!allDisplayableItems || allDisplayableItems.length === 0) return;
        e.preventDefault();
        const currentIndex = currentDisplay ? allDisplayableItems.findIndex(item => item.id === currentDisplay.id) : -1;
        const nextIndex = currentIndex === -1 ? (e.key === 'ArrowRight' ? 0 : allDisplayableItems.length - 1) :
                        (e.key === 'ArrowRight' ? (currentIndex + 1) % allDisplayableItems.length :
                                                 (currentIndex - 1 + allDisplayableItems.length) % allDisplayableItems.length);
        if (allDisplayableItems[nextIndex]) handleThumbnailClick(allDisplayableItems[nextIndex]);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, activeGenerationState.status, editPrompt, originalImageDetails, mainImageDisplayLoaded, mainImageDisplayError, handleGenerateNewEdit, allDisplayableItems, currentDisplay, handleThumbnailClick]);

  if (initialDataLoading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex items-center justify-between p-4 lg:p-6 border-b border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg lg:text-xl font-semibold text-foreground">Magic Edit</h1>
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">BETA</Badge>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground">Loading image details...</p>
            </div>
          </div>
           <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-lg"> <X className="w-5 h-5" /> </Button>
        </header>
        <main className="flex-1 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-primary" /></main>
      </div>
    )
  }

  if (initialDataError || !originalImageDetails) {
    const isDeletedError = initialDataError?.includes("This image has been deleted")
    const isMissingCacheError = initialDataError?.includes("session data was not found") || initialDataError?.includes("Failed to fetch image data from API")
    const isNotFoundAccessDeniedError = initialDataError?.includes("Image not found")
    
    if (isDeletedError) {
      return (
        <div className="flex flex-col h-screen bg-background">
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
            <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">This Artwork Has Vanished!</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">{initialDataError}</p>
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center"><Button onClick={() => router.push('/create')} className="flex-1 max-w-xs">Explore Other Creations</Button></div>
          </main>
        </div>
      );
    }
    if (isMissingCacheError || isNotFoundAccessDeniedError) {
      return (
        <div className="flex flex-col h-screen bg-background">
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
            <AlertCircle className="w-16 h-16 text-blue-400 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Edit Session Problem</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">{initialDataError}</p>
            <div className="flex flex-col sm:flex-row gap-3"><Button onClick={() => router.push('/create')} className="flex-1">Go to Image History</Button><Button variant="outline" onClick={() => router.back()} className="flex-1">Go Back</Button></div>
          </main>
        </div>
      );
    }
    return (
       <div className="flex flex-col h-screen">
         <header className="flex items-center justify-between p-4 lg:p-6 border-b border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg lg:text-xl font-semibold text-foreground">Magic Edit</h1>
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">BETA</Badge>
              </div>
              <p className="text-xs lg:text-sm text-red-500">Error loading image</p>
            </div>
          </div>
           <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-lg"> <X className="w-5 h-5" /> </Button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <AlertCircle className="w-16 h-16 text-red-400 mb-4" /><h2 className="text-xl font-semibold text-red-600 mb-2">Could not load image</h2>
          <p className="text-muted-foreground mb-6">{initialDataError || "Original image data is unavailable."}</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </main>
      </div>
    )
  }
  
  let mainImageSrc = "/placeholder-image.jpg";
  let mainImageAlt = "Image to edit";
  let mainImageKey = "placeholder";
  let mainImagePriority = false;
  let showSkeleton = !mainImageDisplayLoaded && !mainImageDisplayError;
  let imageClassName = `object-cover ${mainImageDisplayLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 rounded-xl`;

  if (mainImageDisplayError && currentDisplay) {
  } else if (activeGenerationState.status === 'processing') {
    mainImageSrc = sourceImageForCurrentEdit?.url || "/placeholder-image.jpg";
    mainImageAlt = "Processing edit";
    mainImageKey = sourceImageForCurrentEdit?.id || "processing";
    imageClassName = "object-cover filter blur-sm scale-105 rounded-xl";
    showSkeleton = false;
  } else if (activeGenerationState.status === 'failed' && currentDisplay && currentDisplay.id === activeGenerationState.dbPredictionId) {
    mainImageSrc = sourceImageForCurrentEdit?.url || "/placeholder-image.jpg";
    mainImageAlt = "Edit failed - original image";
    mainImageKey = sourceImageForCurrentEdit?.id + "-failed" || "failed-base";
    imageClassName = "object-cover filter grayscale opacity-50 rounded-xl";
    showSkeleton = false;
  } else if (currentDisplay) {
    mainImageSrc = currentDisplay.url;
    mainImageAlt = currentDisplay.isOriginal ? originalImageDetails?.prompt || "Original Image" : currentDisplay.prompt || "Edited Image";
    mainImageKey = currentDisplay.id + (currentDisplay.isOriginal ? "-original" : "-edit");
    mainImagePriority = currentDisplay.status === 'succeeded';
    if(currentDisplay.status === 'failed') imageClassName += ' filter grayscale opacity-70';
  } else if (originalImageDetails && sourceImageForCurrentEdit) {
    mainImageSrc = sourceImageForCurrentEdit.url;
    mainImageAlt = sourceImageForCurrentEdit.prompt;
    mainImageKey = sourceImageForCurrentEdit.id + "-source-fallback";
    mainImagePriority = true;
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="flex items-center justify-between p-4 lg:p-6 border-b border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg lg:text-xl font-semibold text-foreground">Magic Edit</h1>
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">BETA</Badge>
            </div>
            <p className="text-xs lg:text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">Reimagine every pixel with AI</p>
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
                      const { data: blob, error } = await supabase.storage.from('images').download(path);
                      if (error) throw error; if (!blob) throw new Error("Image blob not found.");
                      await downloadImageMobileNative({ blob, filename, showToasts: false })
                    } catch (err) { console.error("Error downloading image:", err); }
                  }
              }}><Download className="w-4 h-4 mr-2" />Download</Button>
            </>
          )}
           <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-lg"><X className="w-5 h-5 text-muted-foreground" /></Button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1">
        <main className="flex-1 flex flex-col items-center justify-center p-4 py-8 lg:p-8 bg-muted/50 min-h-0 overflow-hidden">
          <animated.div {...bind()} style={{ scale, x, y, touchAction: 'none', cursor: scale.get() > 1 ? 'grab' : 'default' }} className="w-full max-w-3xl mx-auto">
            <div className="relative mx-auto rounded-xl overflow-hidden shadow-xl bg-card border" style={{ width: containerDimensions.width, height: containerDimensions.height }}>
              <div className="w-full h-full" style={{ width: containerDimensions.width, height: containerDimensions.height }}>
                  {showSkeleton && <Skeleton className="absolute inset-0 w-full h-full rounded-xl" />}
                  {mainImageDisplayError && currentDisplay && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-4 bg-destructive/5">
                          <AlertCircle className="w-12 h-12 mb-3 text-destructive/80" />
                        <p className="font-semibold text-lg">Error Loading Image</p>
                          <p className="text-sm text-center">Could not load: {currentDisplay.url.substring(0,100)}...</p>
                      </div>
                    )}
                  {!mainImageDisplayError && (
                       <Image
                        key={mainImageKey}
                        src={mainImageSrc}
                        alt={mainImageAlt}
                          fill
                        className={imageClassName}
                          sizes={isMobile ? "85vw" : "500px"}
                          unoptimized
                        priority={mainImagePriority}
                          onLoad={handleMainImageLoad}
                          onError={() => {
                          console.error("Failed to load main display image:", mainImageSrc);
                        setMainImageDisplayError(true);
                        setMainImageDisplayLoaded(false);
                      }}
                    />
                )}
                
                {activeGenerationState.status === 'processing' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                       <Loader2 className="w-10 h-10 animate-spin text-white/90 mb-12" />
                       <p className="absolute bottom-6 text-white/90 text-sm font-medium">Creating your masterpiece...</p>
                  </div>
                )}
                {activeGenerationState.status === 'failed' && currentDisplay && currentDisplay.id === activeGenerationState.dbPredictionId && (
                    <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center flex-col p-4 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-background rounded-full flex items-center justify-center shadow-lg border-2 border-destructive/30"><AlertCircle className="w-8 h-8 text-destructive" /></div>
                      <p className="text-lg font-medium text-destructive mb-1">Edit Failed</p>
                      <p className="text-sm text-destructive max-w-xs">{activeGenerationState.error || "An unexpected error occurred."}</p>
                  </div>
                )}
              </div>
            </div>
          </animated.div>
        </main>
        <aside className="w-full lg:w-[380px] bg-card border-t lg:border-t-0 lg:border-l border flex flex-col shadow-lg lg:shadow-none">
          {(originalImageDetails || previousEdits.length > 0) && (
            <div className="p-5 lg:p-6 border-b border">
              <p className="text-sm font-semibold text-card-foreground mb-3">{previousEdits.length > 0 ? "Image Edit Timeline" : "Original Image"}</p>
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-muted-foreground scrollbar-track-muted justify-start" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {allDisplayableItems.map((item, index) => (
                    <button
                      key={item.id + item.isOriginal.toString()}
                      ref={el => { thumbnailRefs.current[index] = el; }}
                      onClick={() => handleThumbnailClick(item)}
                      className={`group relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all duration-300 transform ${currentDisplay && currentDisplay.id === item.id && currentDisplay.isOriginal === item.isOriginal ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110 shadow-lg' : 'ring-1 ring-border/50 hover:ring-2 hover:ring-primary/50 hover:scale-105 opacity-70 hover:opacity-100'}`}
                      title={item.isOriginal ? `Original: ${item.prompt}` : `Edit: ${item.prompt}`}
                      aria-label={`View ${item.isOriginal ? 'original' : 'edit'} ${allDisplayableItems.indexOf(item) + 1}`}>
                      <Image
                        src={item.url || (originalImageDetails?.images[0]?.url || '/placeholder-image.jpg')}
                        alt={item.isOriginal ? `Original: ${item.prompt.substring(0,30)}...` : `Edit: ${item.prompt.substring(0,30)}...`}
                        fill className={`object-cover transition-transform duration-300 group-hover:scale-110 ${item.status === 'failed' ? 'filter grayscale' : ''}`}
                        sizes="80px" unoptimized />
                      <div className={`absolute inset-0 bg-gradient-to-t from-black/20 to-transparent transition-opacity duration-300 ${currentDisplay && currentDisplay.id === item.id && currentDisplay.isOriginal === item.isOriginal ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`} />
                      {!item.isOriginal && (item.status === 'processing' || item.status === 'starting' || item.status === 'queued') && ( null )}
                      {!item.isOriginal && item.status === 'failed' && ( <div className="absolute inset-0 bg-red-700/60 dark:bg-red-800/60 flex items-center justify-center"><AlertCircle className="w-6 h-6 text-white/90"/></div> )}
                      {item.isOriginal && ( <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5">Original</div> )}
                      {currentDisplay && currentDisplay.id === item.id && currentDisplay.isOriginal === item.isOriginal && ( <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-xl blur-sm" /> )}
                    </button>
                  ))}
                </div>
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none" />
              </div>
            </div>
          )}
          <div className="flex-1 p-5 lg:p-6 flex flex-col">
            <div className="flex-1">
              {originalImageDetails && sourceImageForCurrentEdit && (
                <div className="mb-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-border/50">
                      <Image src={sourceImageForCurrentEdit.url} alt="Original image variant for editing" fill className="object-cover" sizes="64px" unoptimized />
                      {activeGenerationState.status === 'processing' && ( 
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
                          <Loader2 className="w-6 h-6 animate-spin text-white" />
                        </div> 
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="text-sm font-medium text-foreground mb-1">Original Source Image</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">All new edits will modify this version.</p>
                    </div>
                  </div>
                  <TextareaAutosize 
                    id="editInstructions" 
                    ref={textareaRef} 
                    value={editPrompt} 
                    onChange={(e) => setEditPrompt(e.target.value)} 
                    placeholder="Describe your edit (e.g., 'make the sky a vibrant sunset')" 
                    className="w-full p-4 border border-input/60 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring/50 text-sm leading-relaxed transition-all duration-200 bg-background/50 hover:border-input placeholder:text-muted-foreground/70" 
                    minRows={3} 
                    maxRows={6} 
                    disabled={isGenerating || activeGenerationState.status === 'processing'} 
                  />
                </div>
              )}
            </div>
            <div className="mt-8 space-y-4">
              { (activeGenerationState.status === 'idle' || activeGenerationState.status === 'completed' || activeGenerationState.status === 'failed') && (
                <Button
                  onClick={handleGenerateNewEdit}
                  disabled={!editPrompt.trim() || isGenerating || !hasCredits || (!mainImageDisplayLoaded && mainImageDisplayError)}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl focus:ring-4 focus:ring-primary/40 text-base flex items-center justify-center gap-2"><Sparkles className="w-5 h-5" />{isGenerating ? "Creating..." : activeGenerationState.status === 'failed' ? "Try Magic Edit Again" : !hasCredits ? "No Credits Available" : "Generate Magic Edit" }</Button>
              )}
              {activeGenerationState.status === 'processing' && ( <Button disabled variant="secondary" className="w-full h-12 cursor-not-allowed rounded-xl flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Processing Magic Edit...</Button> )}
              {!hasCredits && (activeGenerationState.status === 'idle' || activeGenerationState.status === 'failed') && (
                <div className="text-center p-4 bg-amber-100 dark:bg-amber-900/30 rounded-xl border border-amber-300 dark:border-amber-800/50"><p className="text-sm text-amber-700 dark:text-amber-300 mb-2 font-medium">You&apos;re out of edit credits!</p><Button onClick={() => router.push("/plans")} variant="outline" size="sm" className="border-amber-400 text-amber-800 hover:bg-amber-100 hover:border-amber-500 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-800/40 dark:hover:border-amber-500 font-semibold">Get More Credits</Button></div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}