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

export function TrainForm({ onTrainingStatusChange, trainingStatus }: TrainFormProps) {
  const [displayModelName, setDisplayModelName] = useState("");
  const [actualModelName, setActualModelName] = useState("");
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
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
        // Get the session for authentication
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          console.error('No active session found');
          return;
        }

        await fetch('/api/model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`
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
      // Get the session for authentication
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("You must be logged in to train a model");
        setIsProcessing(false);
        return;
      }

      // Step 1: Create the model in Replicate
      toast.info("Creating model...");
      setUploadProgress(10);
      
      const createModelResponse = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          action: 'create',
          modelName: actualModelName,
          owner: 'arthurbnhm',
          visibility: 'private',
          hardware: 'gpu-t4',
          displayName: displayModelName,
          userId: sessionData.session.user.id
        }),
      });

      const modelData = await createModelResponse.json();
      
      if (!modelData.success) {
        throw new Error(modelData.error || 'Failed to create model');
      }

      toast.success("Model created successfully");
      setUploadProgress(30);
      
      // Step 2: Upload images to server which will create and upload a zip file
      toast.info("Uploading images...");
      
      const formData = new FormData();
      formData.append('modelOwner', modelData.model.owner);
      formData.append('modelName', modelData.model.name);
      
      // Add all files to the form data
      uploadedImages.forEach((file) => {
        formData.append('files', file);
      });
      
      // Upload files using the server-side API with authentication
      const uploadResponse = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.session.access_token}`
        },
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to upload images');
      }
      
      const uploadData = await uploadResponse.json();
      
      if (!uploadData.success || !uploadData.zipUrl) {
        throw new Error('Failed to get zip URL from server');
      }
      
      toast.success("Images uploaded successfully");
      setUploadProgress(70);
      
      // Step 3: Start model training with the zip URL
      toast.info("Starting model training...");
      
      const trainResponse = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          action: 'train',
          modelOwner: modelData.model.owner,
          modelName: modelData.model.name,
          zipUrl: uploadData.zipUrl,
          userId: sessionData.session.user.id
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
        duration: 5000,
        action: {
          label: "View Training",
          onClick: () => window.open(trainingData.training.url, '_blank')
        }
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
    // Limit to 10 images total
    const newImages = [...uploadedImages];
    const remainingSlots = 10 - newImages.length;
    
    if (remainingSlots > 0) {
      const filesToAdd = acceptedFiles.slice(0, remainingSlots);
      setUploadedImages([...newImages, ...filesToAdd]);
    } else {
      toast.warning("Maximum 10 images allowed");
    }
  }, [uploadedImages]);

  // Setup dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    maxFiles: 10
  });

  // Remove an image from the uploaded images
  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    newImages.splice(index, 1);
    setUploadedImages(newImages);
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
    
    // Only show overlay if dragging image files
    if (e.dataTransfer.items && containsImageFiles(e.dataTransfer.items)) {
      setIsDraggingImages(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    
    // Only set to false if we're leaving the main container
    // This prevents the state from toggling when moving between child elements
    if (e.currentTarget === e.target) {
      setIsDraggingImages(false);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImages(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImages(false);
    
    // If the dragged items are not files, do nothing
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
      return;
    }
    
    // Create an array from the FileList
    const fileArray = Array.from(e.dataTransfer.files);
    
    // Filter only image files
    const imageFiles = fileArray.filter(file => 
      file.type.startsWith('image/')
    );
    
    if (imageFiles.length > 0) {
      // Pass the image files to the dropzone's onDrop function
      onDrop(imageFiles);
    }
  };

  // Update effect for handling isDraggingImages changes
  useEffect(() => {
    // Dispatch event to hide/show ActionButtons when drag overlay state changes
    const event = new CustomEvent('imageDropOverlayStateChange', { 
      detail: { isOpen: isDraggingImages } 
    });
    window.dispatchEvent(event);

    // Log the current theme for debugging
    console.log('Current theme:', resolvedTheme);
  }, [isDraggingImages, resolvedTheme]);

  // Add global event listeners for drag and drop
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.items && containsImageFiles(e.dataTransfer.items)) {
        setIsDraggingImages(true);
      }
    };
    
    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // Only consider leaving if it's to the document.body or document.documentElement
      if (e.target === document.body || e.target === document.documentElement) {
        setIsDraggingImages(false);
      }
    };
    
    const handleGlobalDragEnd = () => {
      setIsDraggingImages(false);
    };

    const handleGlobalDrop = () => {
      setIsDraggingImages(false);
    };

    const handleGlobalMouseLeave = () => {
      setIsDraggingImages(false);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDraggingImages(false);
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

  return (
    <div className="w-full">
      {/* Overlay that appears when dragging image files over the page */}
      {isDraggingImages && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: resolvedTheme === 'dark' ? '#1e3a8a' : '#dbeafe' // dark:bg-blue-900 and bg-blue-100
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
        >
          <div className="text-center max-w-xs">
            <div className="mb-4 mx-auto">
              <UploadIcon 
                size={48} 
                className="mx-auto" 
                style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}
              />
            </div>
            <h3 
              className="text-xl font-semibold mb-1"
              style={{ color: resolvedTheme === 'dark' ? '#bfdbfe' : '#1e40af' }} // dark:text-blue-200 and text-blue-800
            >
              Drop Images Here
            </h3>
          </div>
        </div>
      )}
      
      <div 
        className="w-full bg-card border border-border rounded-xl overflow-hidden shadow-lg"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnd={handleDragEnd}
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
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Your model will be created as a private model with owner &quot;arthurbnhm&quot; using T4 GPU.
                  </p>
                )}
                {actualModelName && !nameError && (
                  <p className="text-xs text-green-600 mt-1">
                    Model will be created as: <span className="font-mono">{actualModelName}</span>
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Upload Images (10 max)</Label>
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive || isDraggingImages ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <UploadIcon 
                      size={24} 
                      className="mx-auto" 
                      style={{ color: resolvedTheme === 'dark' ? '#93c5fd' : '#2563eb' }}
                    />
                    <p className="text-sm font-medium">
                      Drag and drop images here, or click to select files
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, WebP up to 10 images
                    </p>
                  </div>
                </div>
              </div>
              
              {uploadedImages.length > 0 && (
                <div className="space-y-2">
                  <Label>{uploadedImages.length} of 10 images uploaded</Label>
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
              ) : 'Create & Train Model'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
} 