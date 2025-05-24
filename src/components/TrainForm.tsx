"use client";

import { useState, useCallback, useEffect, useRef, Component, ErrorInfo, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDropzone } from "react-dropzone";
import Image from "next/image";
import { v4 as uuidv4 } from 'uuid';
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useTheme } from "next-themes";
import JSZip from 'jszip';
import { ModelListTable } from "@/components/ModelListTable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Reusable upload icon component
const UploadIcon = ({ 
  size = 24, 
  color = "currentColor", 
  className = "",
  style = {}
}: { 
  size?: number, 
  color?: string, 
  className?: string,
  style?: React.CSSProperties
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none"
    stroke={color}
    strokeWidth="2" 
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
    <polyline points="16 6 12 2 8 6"></polyline>
    <line x1="12" y1="2" x2="12" y2="15"></line>
  </svg>
);

export interface TrainingStatus {
  id: string; 
  status: string; 
  url: string; 
  modelId?: string;
  modelName?: string;
  modelOwner?: string;
  displayName?: string;
}

interface TrainFormProps {
  onTrainingStatusChange: (status: TrainingStatus | null) => void;
  trainingStatus: TrainingStatus | null;
  onModelsRemainingChange?: (hasModelsRemaining: boolean) => void;
}

// Add helper function to format bytes to MB with 2 decimal places
const formatSizeInMB = (bytes: number): string => {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
};

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
          <h3 className="font-semibold mb-2">Something went wrong</h3>
          <p className="text-sm mb-4">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Add a helper function to resize images before preview
const createThumbnail = async (file: File, maxWidth = 500, maxHeight = 500): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    // Create a FileReader to read the image
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      if (!event.target || !event.target.result) {
        reject(new Error('Failed to read image data'));
        return;
      }
      
      // Create an image element to load the file data
      const img = document.createElement('img');
      img.onload = () => {
        // Create a canvas to resize the image
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate the new dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * (maxHeight / height));
            height = maxHeight;
          }
        }
        
        // Set canvas dimensions and draw the resized image
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Draw the image with smoothing for better quality
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert the canvas to a data URL and resolve with higher quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Increased quality from 0.7 to 0.85
        resolve(dataUrl);
        
        // Clean up to free memory
        canvas.width = 0;
        canvas.height = 0;
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      // Set the image source to the file data
      img.src = event.target.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    // Read the file as a data URL
    reader.readAsDataURL(file);
  });
};

export function TrainForm({ onTrainingStatusChange, trainingStatus, onModelsRemainingChange }: TrainFormProps) {
  // Initialize Supabase client
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const getSupabase = useCallback(() => supabaseRef.current, []);
  
  // State variables
  const [currentStep, setCurrentStep] = useState(1);
  const [displayModelName, setDisplayModelName] = useState("");
  const [actualModelName, setActualModelName] = useState("");
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const { resolvedTheme } = useTheme();
  // State for the models dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Subscription state
  const [subscription, setSubscription] = useState<{models_remaining: number} | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  
  // Format model name to meet Replicate's requirements
  const formatModelName = (name: string): string => {
    // Convert to lowercase
    let formatted = name.toLowerCase();
    
    // Replace spaces and invalid characters with dashes
    formatted = formatted.replace(/[^a-z0-9_.-]/g, '-');
    
    // Remove consecutive dashes
    formatted = formatted.replace(/-+/g, '-');
    
    // Remove dashes, underscores, or periods from start and end
    formatted = formatted.replace(/^[_.-]+|[_.-]+$/g, '');
    
    // Add a random suffix to ensure uniqueness
    const uniqueSuffix = uuidv4().substring(0, 8);
    formatted = `${formatted}-${uniqueSuffix}`;
    
    return formatted;
  };

  // Validate model name
  const validateModelName = (name: string): boolean => {
    // Check if name is empty
    if (!name) {
      setNameError('Model name is required');
      return false;
    }
    
    // Check if name follows Replicate's pattern
    const validPattern = /^[a-z0-9][a-z0-9_.-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!validPattern.test(name)) {
      setNameError('Model name can only contain lowercase letters, numbers, dashes, underscores, or periods, and cannot start or end with a dash, underscore, or period');
      return false;
    }
    
    setNameError(null);
    return true;
  };

  // Define new constants for the number of images
  const MIN_IMAGES = 12;
  const MAX_IMAGES = 20;

  // Handle file drop for the dropzone component
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // If already processing, don't accept more files
    if (isGeneratingPreviews || isProcessing) {
      toast.error("Please wait for current processing to complete");
      return;
    }

    const newImages = [...uploadedImages];
    
    // Check if the total size of existing and new files would exceed 200MB
    const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB in bytes
    const MAX_INDIVIDUAL_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
    const currentTotalSize = uploadedImages.reduce((total, file) => total + file.size, 0);
    let newFilesTotalSize = 0;
    const validFiles: File[] = [];
    const oversizedFiles: File[] = [];
    
    // Sort files by size in ascending order to prioritize smaller files
    const sortedFiles = [...acceptedFiles].sort((a, b) => a.size - b.size);
    
    // Process files in order until we hit the size limit
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      
      // Check individual file size first
      if (file.size > MAX_INDIVIDUAL_FILE_SIZE) {
        oversizedFiles.push(file);
        continue;
      }
      
      // Then check if adding this file would exceed total size limit
      if (currentTotalSize + newFilesTotalSize + file.size <= MAX_TOTAL_SIZE) {
        validFiles.push(file);
        newFilesTotalSize += file.size;
      } else {
        // We've hit the total size limit
        break;
      }
    }
    
    // Show appropriate error messages
    if (oversizedFiles.length > 0) {
      oversizedFiles.forEach(file => {
        toast.error(`File "${file.name}" (${formatSizeInMB(file.size)}) exceeds the individual file limit of 10MB`);
      });
    }
    
    // Check if any files were rejected due to total size limit
    const totalSizeRejected = sortedFiles.length - validFiles.length - oversizedFiles.length;
    if (totalSizeRejected > 0) {
      const wouldBeTotalSize = formatSizeInMB(currentTotalSize + sortedFiles.reduce((total, file) => total + file.size, 0));
      toast.error(`${totalSizeRejected} file(s) were rejected because total size would be ${wouldBeTotalSize} (max 200MB)`);
    }
    
    // Si aucun fichier valide, on arrête
    if (validFiles.length === 0 && acceptedFiles.length > 0 && oversizedFiles.length < acceptedFiles.length) { // Check if validFiles is empty due to size, not because no files were accepted
      // This case implies files were accepted by dropzone but then rejected by size logic here.
      // Errors for oversized files or total size rejected already shown.
      // If all accepted files were oversized or hit total size limit, validFiles would be empty.
      return;
    }
    if (validFiles.length === 0 && acceptedFiles.length === 0) { // No files accepted by dropzone initially
        return;
    }
    
    // Vérifier si le total d'images dépasse la limite
    if (newImages.length + validFiles.length > MAX_IMAGES) {
      const excessCount = newImages.length + validFiles.length - MAX_IMAGES;
      toast.error(`You can upload a maximum of ${MAX_IMAGES} images. Please remove ${excessCount}.`);
      return;
    }
    // Vérifier si on n'atteint pas le minimum
    if (newImages.length + validFiles.length < MIN_IMAGES) {
      const neededCount = MIN_IMAGES - (newImages.length + validFiles.length);
      toast.info(`Add ${neededCount} more image(s) to reach the minimum of ${MIN_IMAGES}.`);
      // Add the files anyway to allow adding more later
      setUploadedImages([...newImages, ...validFiles]);
      return;
    }
    // If within the allowed range
    setUploadedImages([...newImages, ...validFiles]);
  }, [uploadedImages, isGeneratingPreviews, isProcessing, MIN_IMAGES, MAX_IMAGES]);

  // Setup dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    maxFiles: MAX_IMAGES,
    validator: (file) => {
      // Check individual file size first
      const MAX_INDIVIDUAL_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_INDIVIDUAL_FILE_SIZE) {
        return {
          code: 'file-too-large',
          message: `File "${file.name}" (${formatSizeInMB(file.size)}) exceeds the individual file limit of 10MB`
        };
      }
      
      // Then check total size
      const currentTotalSize = uploadedImages.reduce((total, f) => total + f.size, 0);
      const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
      
      if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
        const wouldBeTotalSize = formatSizeInMB(currentTotalSize + file.size);
        return {
          code: 'total-size-too-large',
          message: `Adding this file would make total size ${wouldBeTotalSize} (max 200MB)`
        };
      }
      
      return null;
    },
    onDropRejected: (rejectedFiles) => {
      const typeRejected = rejectedFiles.filter(item => 
        item.errors.some(err => err.code === 'file-invalid-type')
      );
      
      const individualSizeRejected = rejectedFiles.filter(item => 
        item.errors.some(err => err.code === 'file-too-large')
      );
      
      const totalSizeRejected = rejectedFiles.filter(item => 
        item.errors.some(err => err.code === 'total-size-too-large')
      );
      
      const tooManyFiles = rejectedFiles.some(item => 
        item.errors.some(err => err.code === 'too-many-files')
      );
      
      if (typeRejected.length > 0) {
        toast.error(`${typeRejected.length} file(s) have an invalid file type. Only JPG, PNG, and WebP formats are accepted.`);
      }
      
      individualSizeRejected.forEach(item => {
        toast.error(`File "${item.file.name}" (${formatSizeInMB(item.file.size)}) exceeds the individual file limit of 10MB`);
      });
      
      totalSizeRejected.forEach(item => {
        const currentTotalSize = uploadedImages.reduce((total, file) => total + file.size, 0);
        const wouldBeTotalSize = formatSizeInMB(currentTotalSize + item.file.size);
        toast.error(`Adding "${item.file.name}" would make total size ${wouldBeTotalSize} (max 200MB)`);
      });

      if (tooManyFiles) {
        const remainingSlots = MAX_IMAGES - uploadedImages.length;
        if (remainingSlots > 0) {
          toast.error(`You can add a maximum of ${remainingSlots} more image(s).`);
        } else {
          toast.error(`You already have ${MAX_IMAGES} images. Please remove some before adding more.`);
        }
      }
    }
  });

  // Fetch user's subscription to check models_remaining
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        setIsLoadingSubscription(true);
        setSubscriptionError(null);
        
        const { data: { user } } = await getSupabase().auth.getUser();
        if (!user) {
          setSubscriptionError("You must be logged in to train models");
          setIsLoadingSubscription(false);
          return;
        }
        
        const { data: subscriptionData, error: subscriptionError } = await getSupabase()
          .from('subscriptions')
          .select('models_remaining')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single();
        
        if (subscriptionError || !subscriptionData) {
          setSubscriptionError("No active subscription found");
          setIsLoadingSubscription(false);
          return;
        }
        
        setSubscription(subscriptionData);
        setIsLoadingSubscription(false);
      } catch (error) {
        console.error('Error fetching subscription:', error);
        setSubscriptionError("Failed to load subscription information");
        setIsLoadingSubscription(false);
      }
    };
    
    fetchSubscription();
  }, [getSupabase]);

  // Notify parent component about models remaining status
  useEffect(() => {
    if (onModelsRemainingChange && !isLoadingSubscription && !subscriptionError) {
      const hasModelsRemaining = subscription ? subscription.models_remaining > 0 : false;
      onModelsRemainingChange(hasModelsRemaining);
    }
  }, [subscription, isLoadingSubscription, subscriptionError, onModelsRemainingChange]);

  // Update actual model name whenever display name changes
  useEffect(() => {
    if (displayModelName) {
      const formattedName = formatModelName(displayModelName);
      setActualModelName(formattedName);
      validateModelName(formattedName);
    } else {
      setActualModelName("");
      setNameError(null);
    }
  }, [displayModelName]);

  // Replace the effect for Object URLs with thumbnail generation
  useEffect(() => {
    const generateThumbnails = async () => {
      if (uploadedImages.length === 0) {
        setThumbnails([]);
        return;
      }
      
      // Set loading state
      setIsGeneratingPreviews(true);
      
      try {
        // Process images in small batches to avoid memory pressure
        // Note: These thumbnails are only for UI preview - the original full-resolution images
        // will be used for actual model training
        const newThumbnails: string[] = [];
        const batchSize = 2;
        const numBatches = Math.ceil(uploadedImages.length / batchSize);
        
        for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
          const start = batchIndex * batchSize;
          const end = Math.min(start + batchSize, uploadedImages.length);
          const batch = uploadedImages.slice(start, end);
          
          // Process each image in the batch
          const batchThumbnails = await Promise.all(
            batch.map(file => createThumbnail(file))
          );
          
          newThumbnails.push(...batchThumbnails);
          
          // Small delay to prevent UI freezing
          if (batchIndex < numBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        setThumbnails(newThumbnails);
      } catch (error) {
        console.error("Error generating thumbnails:", error);
        toast.error("Failed to generate image previews");
      } finally {
        setIsGeneratingPreviews(false);
      }
    };
    
    generateThumbnails();
    
    // No need for cleanup as we're using data URLs, not object URLs
  }, [uploadedImages]);

  // Update effect for handling dragActive changes
  useEffect(() => {
    // Dispatch event to hide/show ActionButtons when drag overlay state changes
    const event = new CustomEvent('imageDropOverlayStateChange', { 
      detail: { isOpen: dragActive } 
    });
    window.dispatchEvent(event);
  }, [dragActive]);

  // Add global event listeners for drag and drop
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.items && containsImageFiles(e.dataTransfer.items)) {
        setDragActive(true);
      }
    };
    
    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // Only consider leaving if it's to the document.body or document.documentElement
      if (e.target === document.body || e.target === document.documentElement) {
        setDragActive(false);
      }
    };
    
    const handleGlobalDragEnd = () => {
      setDragActive(false);
    };

    const handleGlobalDrop = () => {
      setDragActive(false);
    };

    const handleGlobalMouseLeave = () => {
      setDragActive(false);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragActive(false);
      }
    };
    
    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('dragleave', handleGlobalDragLeave);
    document.addEventListener('dragend', handleGlobalDragEnd);
    document.addEventListener('drop', handleGlobalDrop);
    document.addEventListener('mouseleave', handleGlobalMouseLeave);
    document.addEventListener('keydown', handleGlobalKeyDown);
    
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('dragleave', handleGlobalDragLeave);
      document.removeEventListener('dragend', handleGlobalDragEnd);
      document.removeEventListener('drop', handleGlobalDrop);
      document.removeEventListener('mouseleave', handleGlobalMouseLeave);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Clean up Supabase resources when component unmounts - remove since no realtime
  useEffect(() => {
    // No cleanup needed anymore
  }, []);

  // Remove an image from the uploaded images
  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    newImages.splice(index, 1);
    setUploadedImages(newImages);
    // Show message about how many more images are needed
    const remainingNeeded = Math.max(MIN_IMAGES - newImages.length, 0);
    if (newImages.length < MIN_IMAGES) {
      toast.info(`Add ${remainingNeeded} more image(s) to reach the minimum of ${MIN_IMAGES}.`);
    } else {
      toast.info(`${newImages.length} image(s) selected.`);
    }
  };

  // Check if the dragged items contain image files
  const containsImageFiles = (items: DataTransferItemList): boolean => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        return true;
      }
    }
    return false;
  };

  // Handle page-level drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only show overlay if dragging image files
    if (e.dataTransfer.items && containsImageFiles(e.dataTransfer.items)) {
      setDragActive(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.items && containsImageFiles(e.dataTransfer.items)) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set to false if we're leaving the main container
    if (e.currentTarget === e.target) {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    // If the dragged items are not files, do nothing
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
      return;
    }
    
    // Create an array from the FileList and filter only image files
    const fileArray = Array.from(e.dataTransfer.files);
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast.error('Only image files are accepted (JPG, PNG, WebP).');
      return;
    }

    const potentialTotalImages = uploadedImages.length + imageFiles.length;

    // Check only if the drop would exceed the absolute maximum.
    // The main onDrop handler (from useDropzone) will manage messages related to MIN_IMAGES.
    if (potentialTotalImages > MAX_IMAGES) {
      toast.error(
        `Cannot add ${imageFiles.length} image(s). Maximum is ${MAX_IMAGES} images. ` +
        `(Current: ${uploadedImages.length}, adding these would make ${potentialTotalImages} total).`
      );
      return;
    }
    
    // Delegate to the main onDrop handler from useDropzone.
    // This handler will process files, check sizes, and manage MIN_IMAGES/MAX_IMAGES logic consistently.
    onDrop(imageFiles);
  };

  // Handle gender selection
  const handleGenderSelect = (genderValue: string) => {
    if (selectedGender === genderValue) {
      setSelectedGender(null);
      setGenderError("Please select the gender of the subject for better model results");
    } else {
      setSelectedGender(genderValue);
      setGenderError(null);
    }
  };

  // Handle form submission - now combines model creation and training
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate gender selection
    if (!selectedGender) {
      setGenderError("Please select the gender of the subject for better model results");
      toast.error("Please select the gender of the subject");
      return;
    }
    
    if (!actualModelName || !validateModelName(actualModelName) || uploadedImages.length === 0) {
      if (uploadedImages.length === 0) {
        toast.error("Please upload at least one image for training");
      }
      return;
    }
    
    setIsProcessing(true);
    setUploadProgress(0);
    
    try {
      // Get the authenticated user
      const { data: { user } } = await getSupabase().auth.getUser();
      if (!user) {
        toast.error("You must be logged in to train a model");
        setIsProcessing(false);
        return;
      }
      
      // Get the session for the access token
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) {
        toast.error("Unable to get authentication token");
        setIsProcessing(false);
        return;
      }

      // Step 1: Create the model in Replicate
      setUploadProgress(10);
      
      // Create a custom fetch function that includes the duplex option
      const customFetch = (url: string, options: RequestInit & { body?: string | FormData | URLSearchParams }) => {
        // Add the duplex option for requests with a body
        const fetchOptions = {
          ...options,
        };
        
        // @ts-expect-error - Add the duplex option which is required but not in TypeScript definitions yet
        if (options.body) fetchOptions.duplex = 'half';
        
        return fetch(url, fetchOptions);
      };
      
      const createModelResponse = await customFetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'create',
          modelName: actualModelName,
          owner: 'arthurbnhm',
          displayName: displayModelName,
          gender: selectedGender
        }),
      });

      const modelData = await createModelResponse.json();
      
      if (!modelData.success) {
        throw new Error(modelData.error || 'Failed to create model');
      }

      setUploadProgress(30);
      
      // Step 2: Upload images with chunked processing
      const zipPath = `${modelData.model.owner}/${modelData.model.name}/images.zip`;
      
      // Initialize JSZip with a lower memory footprint
      const zip = new JSZip();
      
      // Process images in chunks to avoid memory issues
      const CHUNK_SIZE = 1; // Process 1 image at a time for maximum stability
      const totalChunks = Math.ceil(uploadedImages.length / CHUNK_SIZE);
      
      try {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, uploadedImages.length);
          const chunk = uploadedImages.slice(start, end);
          
          // Update progress for processing
          const processingProgress = 30 + Math.round((chunkIndex / totalChunks) * 20);
          setUploadProgress(processingProgress);
          
          // Process each image in the chunk
          for (let i = 0; i < chunk.length; i++) {
            const file = chunk[i];
            const index = start + i;
            
            try {
              // Convert file to ArrayBuffer in a memory-efficient way
              const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as ArrayBuffer);
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
              });
              
              // Add to zip with compression
              zip.file(`${index}${file.name.substring(file.name.lastIndexOf('.'))}`, arrayBuffer, {
                compression: 'DEFLATE',
                compressionOptions: {
                  level: 5 // Use a slightly lower compression level for better performance
                }
              });
              
              // Clean up to prevent memory leaks
              arrayBuffer.slice(0, 0); // Trick to help with garbage collection
            } catch (error) {
              console.error(`Error processing file ${file.name}:`, error);
              throw new Error(`Failed to process image ${file.name}`);
            }
          }
          
          // Small delay to prevent UI freezing and give GC a chance to run
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Generate zip in chunks
        setUploadProgress(50);
        
        const zipData = await zip.generateAsync({ 
          type: 'arraybuffer',
          compression: 'DEFLATE',
          streamFiles: true, // Enable streaming for better memory usage
        }, (metadata) => {
          // Update progress during zip generation
          const generationProgress = 50 + Math.round(metadata.percent * 0.2);
          setUploadProgress(generationProgress);
        });
        
        // Upload the zip file
        setUploadProgress(70);

        // Upload with progress tracking
        const { error: uploadError } = await getSupabase().storage
          .from('training-files')
          .upload(zipPath, zipData, {
            contentType: 'application/zip',
            upsert: true
          });

        if (uploadError) {
          throw new Error(uploadError.message || 'Failed to upload images');
        }

        // Get the URL for the uploaded file
        const { data: urlData } = await getSupabase().storage
          .from('training-files')
          .createSignedUrl(zipPath, 60 * 60);

        if (!urlData?.signedUrl) {
          throw new Error('Failed to generate signed URL');
        }

        setUploadProgress(85);
        
        // Step 3: Start model training with the zip URL
        const trainResponse = await customFetch('/api/model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            action: 'train',
            modelOwner: modelData.model.owner,
            modelName: modelData.model.name,
            zipUrl: urlData.signedUrl
          }),
        });
        
        const trainingData = await trainResponse.json();
        
        if (!trainingData.success) {
          throw new Error(trainingData.error || 'Failed to start model training');
        }
        
        // Set the training status
        const newTrainingStatus = {
          id: trainingData.training.id,
          status: trainingData.training.status,
          url: trainingData.training.url,
          modelId: modelData.model.id,
          modelName: modelData.model.name,
          modelOwner: modelData.model.owner,
          displayName: displayModelName
        };
        
        onTrainingStatusChange(newTrainingStatus);
        
        // Complete progress
        setUploadProgress(100);
        
        // Show success message to the user
        toast.success("Training started! You'll be notified when it's complete.", {
          duration: 5000
        });

        // Reset the form fields but keep the training status for the ModelListTable
        setDisplayModelName("");
        setSelectedGender(null);
        setGenderError(null);
        setUploadedImages([]);
        setIsProcessing(false);
        
      } catch (error) {
        console.error("Error processing model:", error);
        toast.error(`Error: ${error instanceof Error ? error.message : 'Something went wrong'}`);
        setUploadProgress(0);
        setIsProcessing(false);
        return;
      }
    } catch (error) {
      console.error("Error processing model:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Something went wrong'}`);
      setUploadProgress(0);
      setIsProcessing(false);
    }
  };

  // Show loading state while checking subscription
  if (isLoadingSubscription) {
    return (
      <ErrorBoundary>
        <div className="w-full bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="p-6 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">Loading subscription information...</p>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }
  
  // Show error state if subscription check failed
  if (subscriptionError) {
    return (
      <ErrorBoundary>
        <div className="w-full bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="p-6">
            <div className="text-center space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
                <h3 className="font-semibold mb-2">Subscription Error</h3>
                <p className="text-sm">{subscriptionError}</p>
              </div>
              <Button
                onClick={() => window.location.href = '/plans'}
                className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
              >
                View Plans
              </Button>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }
  
  // Show upgrade message if no models remaining
  if (subscription && subscription.models_remaining <= 0) {
    return (
      <ErrorBoundary>
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
            <div className="p-6">
              <div className="text-center space-y-5">
                <div className="space-y-3">
                  <div className="mx-auto w-14 h-14 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/50 dark:to-blue-800/50 rounded-full flex items-center justify-center">
                    <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Need More Models?</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      You&apos;ve successfully used all your model trainings this month! To continue creating amazing AI models, consider upgrading your plan.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Button
                    onClick={() => window.location.href = '/plans'}
                    size="sm"
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-md hover:shadow-lg font-medium"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Explore Plans
                  </Button>
                  
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline"
                        size="sm"
                        className="w-full bg-background/50 backdrop-blur-sm border-border/60 hover:border-border hover:bg-background/80 transition-all duration-200"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        My Models
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>My Models</DialogTitle>
                        <DialogDescription>
                          Manage your trained models and ongoing trainings.
                        </DialogDescription>
                      </DialogHeader>
                      <ModelListTable 
                        newTraining={trainingStatus} 
                        onClearNewTraining={() => onTrainingStatusChange(null)}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
                
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Meanwhile, you can still use your existing models for generating images ✨
                </p>
              </div>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (currentStep === 1) {
    return (
      <ErrorBoundary>
        <div className="w-full bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="p-6 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Quick Tips for Great Training Images!</h2> 
              <p className="text-sm text-muted-foreground leading-relaxed">
                Good photos help create an amazing AI model of your subject. Here&rsquo;s what to aim for:
              </p>
            </div>

            <div className="bg-gradient-to-br from-muted/30 via-muted/20 to-background/80 border border-border/40 rounded-xl p-6 space-y-4 backdrop-blur-sm">
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-green-200/20 dark:border-green-800/20">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                  </div>
                  <span className="text-foreground"><strong className="font-semibold">Variety is Key:</strong> <span className="text-muted-foreground">Use different poses, backgrounds, and expressions.</span></span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-green-200/20 dark:border-green-800/20">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                  </div>
                  <span className="text-foreground"><strong className="font-semibold">Clear Subject:</strong> <span className="text-muted-foreground">Ensure the face is well-lit, visible, and the only person in the shot.</span></span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-green-200/20 dark:border-green-800/20">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                  </div>
                  <span className="text-foreground"><strong className="font-semibold">Good Quality:</strong> <span className="text-muted-foreground">Use sharp, clear photos. Avoid very blurry or pixelated images.</span></span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-red-200/20 dark:border-red-800/20">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mt-0.5">
                    <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                  </div>
                  <span className="text-foreground"><strong className="font-semibold">Avoid Face Obstructions:</strong> <span className="text-muted-foreground">No sunglasses or heavy face-altering accessories/filters.</span></span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => setCurrentStep(2)}
              className="w-full py-3 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl font-medium"
            >
              Got it, Let&rsquo;s Upload Photos!
            </Button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // Existing form content for Step 2
  return (
    <ErrorBoundary>
      <div className="w-full">
        {/* Overlay that appears when dragging image files over the page */}
        {dragActive && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: resolvedTheme === 'dark' ? 'rgba(30, 58, 138, 0.95)' : 'rgba(219, 234, 254, 0.95)',
              backdropFilter: 'blur(8px)',
              gap: '1.5rem'
            }}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
          >
            <div className="p-6 rounded-2xl bg-background/90 border border-border/60 shadow-2xl backdrop-blur-sm">
              <UploadIcon 
                size={56} 
                style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}
                className="mx-auto"
              />
            </div>
            <div className="text-center space-y-2">
              <h3 
                className="text-2xl font-bold"
                style={{ color: resolvedTheme === 'dark' ? '#bfdbfe' : '#1e40af' }}
              >
                Drop Images Here
              </h3>
              <div className="space-y-1">
                <p className="text-base font-medium" style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}>
                  JPG, PNG, WebP formats supported
                </p>
                <p className="text-sm opacity-80" style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}>
                  {MIN_IMAGES}-{MAX_IMAGES} images • Max 200MB total • Max 10MB per file
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div 
          className="w-full bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnd={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          {/* Header section with navigation buttons */}
          <div className="px-6 pt-6 pb-4 border-b border-border/20 bg-gradient-to-r from-muted/10 via-background/50 to-muted/10">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep(1)} 
                className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border hover:bg-background/80 transition-all duration-200 order-1 sm:order-1"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Guidelines
              </Button>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline"
                    className="bg-background/50 backdrop-blur-sm border-border/60 hover:border-border hover:bg-background/80 transition-all duration-200 order-2 sm:order-2"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    My Models
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>My Models</DialogTitle>
                    <DialogDescription>
                      Manage your trained models and ongoing trainings.
                    </DialogDescription>
                  </DialogHeader>
                  <ModelListTable 
                    newTraining={trainingStatus} 
                    onClearNewTraining={() => onTrainingStatusChange(null)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <div className="p-6">
            <form className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="model-name" className="text-base font-semibold text-foreground">Model Name</Label>
                  <Input
                    id="model-name" 
                    placeholder="Enter a name for your model"
                    value={displayModelName}
                    onChange={(e) => setDisplayModelName(e.target.value)}
                    className={cn(
                      "bg-background/50 backdrop-blur-sm border-border/60 hover:border-border transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary/30",
                      nameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''
                    )}
                  />
                  {nameError ? (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {nameError}
                    </p>
                  ) : null}
                </div>
                
                <div className="space-y-3">
                  <Label className="text-base font-semibold text-foreground">Subject Gender</Label>
                  <p className="text-sm text-muted-foreground">
                    Help us understand your subject better for improved model results and more accurate generation.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
                    <div
                      className={cn(
                        "group relative flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl cursor-pointer border-2 transition-all duration-300 hover:scale-105 backdrop-blur-sm",
                        selectedGender === "male" 
                          ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                          : genderError 
                            ? "border-red-300 hover:border-red-400 bg-background/50 hover:bg-background/80 shadow-sm" 
                            : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                      )}
                      onClick={() => handleGenderSelect("male")}
                      title="Male"
                    >
                      <div className="text-lg sm:text-2xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">👨</div>
                      <div className="text-xs font-medium text-center leading-tight px-1 break-words hyphens-auto">Male</div>
                    </div>
                    <div
                      className={cn(
                        "group relative flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl cursor-pointer border-2 transition-all duration-300 hover:scale-105 backdrop-blur-sm",
                        selectedGender === "female" 
                          ? "border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/50 shadow-lg" 
                          : genderError 
                            ? "border-red-300 hover:border-red-400 bg-background/50 hover:bg-background/80 shadow-sm" 
                            : "border-border/40 hover:border-slate-300 dark:hover:border-slate-600 bg-background/50 hover:bg-background/80 shadow-sm"
                      )}
                      onClick={() => handleGenderSelect("female")}
                      title="Female"
                    >
                      <div className="text-lg sm:text-2xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform duration-200">👩</div>
                      <div className="text-xs font-medium text-center leading-tight px-1 break-words hyphens-auto">Female</div>
                    </div>
                  </div>
                  {genderError ? (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {genderError}
                    </p>
                  ) : null}
                </div>
                
                <div className="space-y-3">
                  <Label className="text-base font-semibold text-foreground">Upload Images (between {MIN_IMAGES} and {MAX_IMAGES} required)</Label>
                  <div 
                    {...getRootProps()} 
                    className={cn(
                      "bg-gradient-to-br from-muted/30 via-muted/20 to-background/80 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 backdrop-blur-sm hover:border-primary/50",
                      isDragActive || dragActive ? 'border-primary bg-primary/5 shadow-lg' : 'border-border/40 hover:bg-muted/10'
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
                        <UploadIcon 
                          size={32} 
                          className="text-primary" 
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-foreground font-medium">
                          Drag and drop images here, or click to select files
                        </p>
                        <p className="text-sm text-muted-foreground">
                          JPG, PNG, WebP • {MIN_IMAGES}-{MAX_IMAGES} images • Max 200MB total • Max 10MB per file
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {uploadedImages.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-muted/30 via-muted/20 to-background/80 border border-border/40 rounded-xl backdrop-blur-sm">
                      <div className="space-y-1">
                        <Label className="text-base font-semibold text-foreground">
                          {uploadedImages.length} image(s) selected
                        </Label>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Range: {MIN_IMAGES}-{MAX_IMAGES} images</span>
                          {uploadedImages.length < MIN_IMAGES && (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              • {MIN_IMAGES - uploadedImages.length} more required
                            </span>
                          )}
                          {uploadedImages.length > MAX_IMAGES && (
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              • {uploadedImages.length - MAX_IMAGES} too many
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          Total size: {formatSizeInMB(uploadedImages.reduce((total, file) => total + file.size, 0))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Limit: 200MB
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                      {uploadedImages.map((file, index) => (
                        <Card key={index} className="overflow-hidden relative group bg-gradient-to-br from-card/50 to-card border-border/60 hover:border-border transition-all duration-200 shadow-md hover:shadow-lg">
                          <CardContent className="p-0">
                            <div className="relative aspect-square">
                              {thumbnails[index] ? (
                                <Image
                                  src={thumbnails[index]}
                                  alt={`Uploaded image ${index + 1}`}
                                  fill
                                  className="object-cover"
                                  loading="lazy"
                                  onLoad={() => {
                                    // Hint to the browser to clean up memory
                                    if (window.requestIdleCallback) {
                                      window.requestIdleCallback(() => null);
                                    }
                                  }}
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full bg-gradient-to-br from-muted/20 to-muted/10">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="absolute top-2 right-2 bg-background/90 hover:bg-background text-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110"
                                aria-label="Remove image"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg" 
                                  width="14" 
                                  height="14" 
                                  viewBox="0 0 24 24" 
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5" 
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M18 6 6 18"></path>
                                  <path d="m6 6 12 12"></path>
                                </svg>
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                
                {isProcessing && uploadProgress > 0 && (
                  <div className="p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-xl backdrop-blur-sm space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-primary">Processing your model...</span>
                      <span className="text-sm font-bold text-primary">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary to-primary/80 h-full rounded-full transition-all duration-500 ease-out shadow-sm" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      This may take a few moments. Please don&rsquo;t close this page.
                    </p>
                  </div>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl font-semibold text-base"
                disabled={!displayModelName || !selectedGender || nameError !== null || uploadedImages.length < MIN_IMAGES || uploadedImages.length > MAX_IMAGES || isProcessing}
                onClick={handleSubmit}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Train My Model
                  </span>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
} 