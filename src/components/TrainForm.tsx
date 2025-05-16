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
import { createBrowserSupabaseClient } from "@/lib/supabase";
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

export function TrainForm({ onTrainingStatusChange, trainingStatus }: TrainFormProps) {
  // Initialize Supabase client
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const getSupabase = useCallback(() => supabaseRef.current, []);
  
  // State variables
  const [displayModelName, setDisplayModelName] = useState("");
  const [actualModelName, setActualModelName] = useState("");
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const { resolvedTheme } = useTheme();
  // State for the models dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // const { invalidateCache } = useModels(); // This was removed as caching is gone

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

  // Handle form submission - now combines model creation and training
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
          displayName: displayModelName
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
        
        // invalidateCache(); // This was removed as caching is gone
        
        onTrainingStatusChange(newTrainingStatus);
        
        // Complete progress
        setUploadProgress(100);
        
        // Show success message to the user
        toast.success("Training started! You'll be notified when it's complete.", {
          duration: 5000
        });

        // Reset the form fields but keep the training status for the ModelListTable
        setDisplayModelName("");
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

  // Définir les nouvelles constantes pour le nombre d'images
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
        toast.error(`File \"${file.name}\" (${formatSizeInMB(file.size)}) exceeds the individual file limit of 10MB`);
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
      toast.error(`Vous pouvez uploader au maximum ${MAX_IMAGES} images. Veuillez en retirer ${excessCount}.`);
      return;
    }
    // Vérifier si on n'atteint pas le minimum
    if (newImages.length + validFiles.length < MIN_IMAGES) {
      const neededCount = MIN_IMAGES - (newImages.length + validFiles.length);
      toast.info(`Ajoutez encore ${neededCount} image(s) pour atteindre le minimum de ${MIN_IMAGES}.`);
      // On ajoute quand même les fichiers pour permettre d'en ajouter d'autres ensuite
      setUploadedImages([...newImages, ...validFiles]);
      return;
    }
    // Si on est dans la plage autorisée
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
          message: `File \"${file.name}\" (${formatSizeInMB(file.size)}) exceeds the individual file limit of 10MB`
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
        toast.error(`File \"${item.file.name}\" (${formatSizeInMB(item.file.size)}) exceeds the individual file limit of 10MB`);
      });
      
      totalSizeRejected.forEach(item => {
        const currentTotalSize = uploadedImages.reduce((total, file) => total + file.size, 0);
        const wouldBeTotalSize = formatSizeInMB(currentTotalSize + item.file.size);
        toast.error(`Adding \"${item.file.name}\" would make total size ${wouldBeTotalSize} (max 200MB)`);
      });

      if (tooManyFiles) {
        const remainingSlots = MAX_IMAGES - uploadedImages.length;
        if (remainingSlots > 0) {
          toast.error(`Vous pouvez ajouter encore ${remainingSlots} image(s) maximum.`);
        } else {
          toast.error(`Vous avez déjà ${MAX_IMAGES} images. Veuillez en retirer avant d'en ajouter d'autres.`);
        }
      }
    }
  });

  // Remove an image from the uploaded images
  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    newImages.splice(index, 1);
    setUploadedImages(newImages);
    // Show message about how many more images are needed
    const remainingNeeded = Math.max(MIN_IMAGES - newImages.length, 0);
    if (newImages.length < MIN_IMAGES) {
      toast.info(`Ajoutez encore ${remainingNeeded} image(s) pour atteindre le minimum de ${MIN_IMAGES}.`);
    } else {
      toast.info(`${newImages.length} image(s) sélectionnées.`);
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

  // Update effect for handling dragActive changes
  useEffect(() => {
    // Dispatch event to hide/show ActionButtons when drag overlay state changes
    const event = new CustomEvent('imageDropOverlayStateChange', { 
      detail: { isOpen: dragActive } 
    });
    window.dispatchEvent(event);

    // Log the current theme for debugging
    console.log('Current theme:', resolvedTheme);
  }, [dragActive, resolvedTheme]);

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

  // Clean up Supabase resources when component unmounts - remove since no realtime
  useEffect(() => {
    // No cleanup needed anymore
  }, []);

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
              backgroundColor: resolvedTheme === 'dark' ? 'rgb(30, 58, 138)' : 'rgb(219, 234, 254)',
              gap: '1rem'
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
            <UploadIcon 
              size={48} 
              style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}
            />
            <h3 
              className="text-xl font-semibold"
              style={{ color: resolvedTheme === 'dark' ? '#bfdbfe' : '#1e40af' }}
            >
              Drop Images Here
            </h3>
            <p className="text-sm text-muted-foreground">
              JPG, PNG, WebP - entre {MIN_IMAGES} et {MAX_IMAGES} images requises, max 200MB au total
            </p>
          </div>
        )}
        
        <div className="flex justify-between items-center mb-4">
          <div></div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">View Your Models</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Your Models</DialogTitle>
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
        
        <div 
          className="w-full bg-card border border-border rounded-xl overflow-hidden shadow-lg"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnd={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <div className="p-5">
            <form className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="model-name">Model Name</Label>
                  <Input
                    id="model-name" 
                    placeholder="Enter a name for your model"
                    value={displayModelName}
                    onChange={(e) => setDisplayModelName(e.target.value)}
                    className={`mt-1 ${nameError ? 'border-red-500' : ''}`}
                  />
                  {nameError ? (
                    <p className="text-xs text-red-500 mt-1">{nameError}</p>
                  ) : null}
                </div>
                
                <div className="space-y-2">
                  <Label>Upload Images (entre {MIN_IMAGES} et {MAX_IMAGES} requises)</Label>
                  <div 
                    {...getRootProps()} 
                    className={`bg-muted/50 border ${
                      isDragActive || dragActive ? 'border-2 border-primary' : 'border-border'
                    } rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/50`}
                  >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UploadIcon 
                        size={24} 
                        className="mx-auto" 
                        style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}
                      />
                      <p className="text-muted-foreground">
                        Drag and drop images here, or click to select files
                      </p>
                      <p className="text-xs text-muted-foreground/80 mt-1">
                        JPG, PNG, WebP - entre {MIN_IMAGES} et {MAX_IMAGES} images requises, max 200MB au total
                      </p>
                    </div>
                  </div>
                </div>
                
                {uploadedImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>
                        {uploadedImages.length} image(s) sélectionnées (min {MIN_IMAGES}, max {MAX_IMAGES})
                        {uploadedImages.length < MIN_IMAGES && ` (${MIN_IMAGES - uploadedImages.length} de plus requises)`}
                        {uploadedImages.length > MAX_IMAGES && ` (${uploadedImages.length - MAX_IMAGES} de trop)`}
                      </Label>
                      <span className="text-sm text-muted-foreground">
                        Total size: {formatSizeInMB(uploadedImages.reduce((total, file) => total + file.size, 0))} / 200MB
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-2">
                      {uploadedImages.map((file, index) => (
                        <Card key={index} className="overflow-hidden relative group">
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
                                <div className="flex items-center justify-center h-full bg-muted/30">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="absolute top-1 right-1 bg-background/80 dark:bg-foreground/20 text-foreground dark:text-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="Remove image"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg" 
                                  width="16" 
                                  height="16" 
                                  viewBox="0 0 24 24" 
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2" 
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
                  <div className="mt-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Processing...</span>
                      <span className="text-sm font-medium">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div
                        className="bg-primary h-2.5 rounded-full" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={!displayModelName || nameError !== null || uploadedImages.length < MIN_IMAGES || uploadedImages.length > MAX_IMAGES || isProcessing}
                onClick={handleSubmit}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </span>
                ) : 'Train My Model'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
} 