"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

// Type for Supabase Realtime payload
interface RealtimeTrainingPayload {
  new: {
    id: string;
    status: string;
    training_id: string;
    error?: string;
    completed_at?: string | null;
    [key: string]: unknown;
  };
  old: {
    id: string;
    status: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

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

export function TrainForm({ onTrainingStatusChange, trainingStatus }: TrainFormProps) {
  const [displayModelName, setDisplayModelName] = useState("");
  const [actualModelName, setActualModelName] = useState("");
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);
  // Add a ref to track subscription status without triggering re-renders
  const subscriptionActiveRef = useRef(false);
  const { resolvedTheme } = useTheme();

  // Initialize Supabase client
  const supabase = createBrowserSupabaseClient();

  // Force theme application and check HTML element
  useEffect(() => {
    if (typeof window !== 'undefined' && resolvedTheme) {
      // Log if the HTML element has the dark class
      const hasDarkClass = document.documentElement.classList.contains('dark');
      console.log('HTML has dark class:', hasDarkClass);
      console.log('resolvedTheme:', resolvedTheme);
      
      // Force theme application for debugging
      if (resolvedTheme === 'dark' && !hasDarkClass) {
        document.documentElement.classList.add('dark');
      } else if (resolvedTheme === 'light' && hasDarkClass) {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [resolvedTheme]);

  // Initialize the bucket when the component mounts
  useEffect(() => {
    const initBucket = async () => {
      try {
        // Get the authenticated user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('No authenticated user found');
          return;
        }
        
        // Get the session for the access token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('No active session found');
          return;
        }

        await fetch('/api/model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            action: 'initBucket'
          }),
        });
      } catch (error) {
        console.error('Error initializing bucket:', error);
      }
    };

    initBucket();
  }, [supabase]);

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

  // Set up realtime subscription to track training status
  useEffect(() => {
    // Use the ref to check if already subscribed, but still keep realtimeSubscribed in deps
    if (!trainingStatus || subscriptionActiveRef.current) return;
    
    // Define a type-safe handler for the Supabase realtime event
    function handleTrainingUpdate(payload: RealtimeTrainingPayload) {
      if (payload.new && trainingStatus) {
        // Only update if the status has changed
        if (payload.new.status !== trainingStatus.status) {
          // Update the training status
          onTrainingStatusChange({
            ...(trainingStatus as TrainingStatus),
            status: payload.new.status
          });
          
          // If training is completed or failed, show a message
          if (payload.new.status === 'succeeded') {
            toast.success('Model training completed successfully!');
          } else if (payload.new.status === 'failed') {
            toast.error(`Training failed: ${payload.new.error || 'Unknown error'}`);
          } else if (payload.new.status === 'canceled') {
            toast.info('Training was canceled');
          }
        }
      }
    }
    
    // Subscribe to changes on the trainings table for this training
    const channel = supabase.channel(`training-${trainingStatus.id}`);
    // Use type assertion to work around TypeScript limitations with Supabase Realtime
    // This is necessary because the TypeScript definitions for Supabase Realtime are incomplete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trainingSubscription = (channel as any).on(
      'postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'trainings',
        filter: `training_id=eq.${trainingStatus.id}`
      }, 
      handleTrainingUpdate
    )
    .subscribe();
    
    // Update both the state and the ref
    setRealtimeSubscribed(true);
    subscriptionActiveRef.current = true;
    
    // Cleanup function
    return () => {
      trainingSubscription.unsubscribe();
      setRealtimeSubscribed(false);
      subscriptionActiveRef.current = false;
    };
  }, [trainingStatus?.id, realtimeSubscribed, supabase, onTrainingStatusChange, trainingStatus]);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to train a model");
        setIsProcessing(false);
        return;
      }
      
      // Get the session for the access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Unable to get authentication token");
        setIsProcessing(false);
        return;
      }

      // Step 1: Create the model in Replicate
      toast.info("Creating model...");
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
          visibility: 'private',
          hardware: 'gpu-t4',
          displayName: displayModelName,
          userId: session.user.id
        }),
      });

      const modelData = await createModelResponse.json();
      
      if (!modelData.success) {
        throw new Error(modelData.error || 'Failed to create model');
      }

      toast.success("Model created successfully");
      setUploadProgress(30);
      
      // Step 2: Upload images directly to Supabase storage
      toast.info("Uploading images...");
      
      const zipPath = `${modelData.model.owner}/${modelData.model.name}/images.zip`;
      
      // Create and upload zip
      const zip = new JSZip();
      for (let i = 0; i < uploadedImages.length; i++) {
        const file = uploadedImages[i];
        zip.file(`${i}${file.name.substring(file.name.lastIndexOf('.'))}`, await file.arrayBuffer());
      }
      
      const zipData = await zip.generateAsync({ 
        type: 'arraybuffer',
        compression: 'DEFLATE' 
      });
      
      // Upload directly to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('training-files')
        .upload(zipPath, zipData, {
          contentType: 'application/zip',
          upsert: true
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload images');
      }

      // Get the URL for the uploaded file
      const { data: urlData } = await supabase.storage
        .from('training-files')
        .createSignedUrl(zipPath, 60 * 60);

      if (!urlData?.signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      toast.success("Images uploaded successfully");
      setUploadProgress(70);
      
      // Step 3: Start model training with the zip URL
      toast.info("Starting model training...");
      
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
          zipUrl: urlData.signedUrl,
          userId: session.user.id
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
      toast.success("Model training started successfully! This may take a while to complete.", {
        duration: 5000
      });

      // Reset the form fields but keep the training status for the ModelListTable
      setDisplayModelName("");
      setUploadedImages([]);
      
    } catch (error) {
      console.error("Error processing model:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Something went wrong'}`);
      setUploadProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file drop for the dropzone component
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = [...uploadedImages];
    
    // Check if the total size of existing and new files would exceed 100MB
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB in bytes
    const currentTotalSize = uploadedImages.reduce((total, file) => total + file.size, 0);
    let newFilesTotalSize = 0;
    const validFiles: File[] = [];
    
    // Process files in order until we hit the size limit
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      if (currentTotalSize + newFilesTotalSize + file.size <= MAX_TOTAL_SIZE) {
        validFiles.push(file);
        newFilesTotalSize += file.size;
      } else {
        // We've hit the size limit
        break;
      }
    }
    
    // Check if we had to reject any files due to size limits
    const rejectedCount = acceptedFiles.length - validFiles.length;
    if (rejectedCount > 0) {
      const totalAttemptedSize = formatSizeInMB(currentTotalSize + acceptedFiles.reduce((total, file) => total + file.size, 0));
      toast.error(`${rejectedCount} file(s) were rejected because total size would be ${totalAttemptedSize} (max 100MB)`);
    }
    
    // If we have no valid files after size check, return early
    if (validFiles.length === 0) {
      return;
    }
    
    // Check if adding these files would exceed or not meet the 10 image requirement
    if (newImages.length + validFiles.length > 10) {
      const excessCount = newImages.length + validFiles.length - 10;
      toast.error(`You can only upload exactly 10 images. Please remove ${excessCount} image(s).`);
      return;
    } else if (newImages.length + validFiles.length < 10) {
      const neededCount = 10 - (newImages.length + validFiles.length);
      toast.error(`You need to upload exactly 10 images. Please add ${neededCount} more image(s).`);
      // Still add the valid files so they can continue adding more
      setUploadedImages([...newImages, ...validFiles]);
      return;
    }
    
    // If we get here, we have exactly 10 images
    setUploadedImages([...newImages, ...validFiles]);
  }, [uploadedImages]);

  // Setup dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    maxFiles: 10,
    validator: (file) => {
      // Check current total size plus this file
      const currentTotalSize = uploadedImages.reduce((total, f) => total + f.size, 0);
      const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
      
      if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
        const wouldBeTotalSize = formatSizeInMB(currentTotalSize + file.size);
        return {
          code: 'file-too-large',
          message: `Total size would be ${wouldBeTotalSize} (max 100MB)`
        };
      }
      
      return null;
    },
    onDropRejected: (rejectedFiles) => {
      const typeRejected = rejectedFiles.filter(item => 
        item.errors.some(err => err.code === 'file-invalid-type')
      );
      const sizeRejected = rejectedFiles.filter(item => 
        item.errors.some(err => err.code === 'file-too-large')
      );
      const tooManyFiles = rejectedFiles.some(item => 
        item.errors.some(err => err.code === 'too-many-files')
      );
      
      if (typeRejected.length > 0) {
        toast.error(`${typeRejected.length} file(s) have an invalid file type. Only JPG, PNG, and WebP formats are accepted.`);
      }
      
      if (sizeRejected.length > 0) {
        const totalSize = formatSizeInMB(uploadedImages.reduce((total, file) => total + file.size, 0) + 
          sizeRejected.reduce((total, item) => total + item.file.size, 0));
        toast.error(`${sizeRejected.length} file(s) would make total size ${totalSize} (max 100MB)`);
      }

      if (tooManyFiles) {
        const remainingSlots = 10 - uploadedImages.length;
        if (remainingSlots > 0) {
          toast.error(`You need exactly ${remainingSlots} more image(s) to reach 10 images.`);
        } else {
          toast.error('You already have 10 images. Please remove some before adding more.');
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
    const remainingNeeded = 10 - newImages.length;
    toast.info(`You need to add ${remainingNeeded} more image(s) to reach 10 images.`);
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
    
    // Check if files would exceed total size limit before processing
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB in bytes
    const currentTotalSize = uploadedImages.reduce((total, file) => total + file.size, 0);
    
    // Create an array from the FileList and filter only image files
    const fileArray = Array.from(e.dataTransfer.files);
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast.error('Only image files are accepted');
      return;
    }

    // Check if this would exceed or not meet the 10 image requirement
    if (uploadedImages.length + imageFiles.length > 10) {
      toast.error(`You can only upload exactly 10 images. Please select ${10 - uploadedImages.length} image(s).`);
      return;
    }
    
    // Check total size before processing
    let newFilesTotalSize = 0;
    const validFiles: File[] = [];
    
    for (const file of imageFiles) {
      if (currentTotalSize + newFilesTotalSize + file.size <= MAX_TOTAL_SIZE) {
        validFiles.push(file);
        newFilesTotalSize += file.size;
      } else {
        // We've hit the size limit
        break;
      }
    }
    
    const rejectedCount = imageFiles.length - validFiles.length;
    if (rejectedCount > 0) {
      const totalAttemptedSize = formatSizeInMB(currentTotalSize + imageFiles.reduce((total, file) => total + file.size, 0));
      toast.error(`${rejectedCount} file(s) would make total size ${totalAttemptedSize} (max 100MB)`);
    }
    
    if (validFiles.length === 0) {
      return;
    }

    // Let onDrop handle the validation and addition of files
    onDrop(validFiles);
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

  // Add cleanup for object URLs when component unmounts
  useEffect(() => {
    // Cleanup function to revoke object URLs when component unmounts
    return () => {
      uploadedImages.forEach(file => {
        URL.revokeObjectURL(URL.createObjectURL(file));
      });
    };
  }, []);

  return (
    <div className="w-full">
      {/* Overlay that appears when dragging image files over the page */}
      {dragActive && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: resolvedTheme === 'dark' ? 'rgba(30, 58, 138, 0.9)' : 'rgba(219, 234, 254, 0.9)', // more opacity
            backdropFilter: 'blur(4px)' // add blur effect
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
          <div className="text-center max-w-xs bg-background p-6 rounded-lg shadow-lg border-2 border-primary"> {/* more visible container */}
            <div className="mb-4 mx-auto">
              <UploadIcon 
                size={48} 
                className="mx-auto" 
                style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}
              />
            </div>
            <h3 
              className="text-xl font-semibold mb-1"
              style={{ color: resolvedTheme === 'dark' ? '#bfdbfe' : '#1e40af' }}
            >
              Drop Images Here
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              JPG, PNG, WebP - exactly 10 images required, max 100MB total
            </p>
          </div>
        </div>
      )}
      
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
                {actualModelName && !nameError && (
                  <p className="text-xs text-green-600 mt-1">
                    Model will be created as: <span className="font-mono">{actualModelName}</span>
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Upload Images (exactly 10 required)</Label>
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
                      JPG, PNG, WebP - exactly 10 images required, max 100MB total
                    </p>
                  </div>
                </div>
              </div>
              
              {uploadedImages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>
                      {uploadedImages.length} of 10 images uploaded {uploadedImages.length < 10 && `(${10 - uploadedImages.length} more needed)`}
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      Total size: {formatSizeInMB(uploadedImages.reduce((total, file) => total + file.size, 0))} / 100MB
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-2">
                    {uploadedImages.map((file, index) => (
                      <Card key={index} className="overflow-hidden relative group">
                        <CardContent className="p-0">
                          <div className="relative aspect-square">
                            <Image
                              src={URL.createObjectURL(file)}
                              alt={`Uploaded image ${index + 1}`}
                              fill
                              className="object-cover"
                            />
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
              disabled={!displayModelName || nameError !== null || uploadedImages.length === 0 || isProcessing}
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
  );
} 