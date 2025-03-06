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
import { createClient } from "@supabase/supabase-js";

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

  // Supabase client for realtime updates
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Initialize the bucket when the component mounts
  useEffect(() => {
    const initBucket = async () => {
      try {
        await fetch('/api/model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
  }, []);

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
  }, [trainingStatus?.id, realtimeSubscribed, supabase, onTrainingStatusChange]);

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
      // Step 1: Create the model in Replicate
      toast.info("Creating model...");
      setUploadProgress(10);
      
      const createModelResponse = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          modelName: actualModelName,
          owner: 'arthurbnhm',
          visibility: 'private',
          hardware: 'gpu-t4',
          displayName: displayModelName
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
      
      // Upload files using the server-side API
      const uploadResponse = await fetch('/api/model', {
        method: 'POST',
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
      
      // Step 3: Start training the model with the zip URL
      toast.info("Starting model training...");
      
      const trainingResponse = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'train',
          modelOwner: modelData.model.owner,
          modelName: modelData.model.name,
          zipUrl: uploadData.zipUrl,
        }),
      });
      
      const trainingData = await trainingResponse.json();
      
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
    
    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('dragleave', handleGlobalDragLeave);
    document.addEventListener('dragend', handleGlobalDragEnd);
    
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('dragleave', handleGlobalDragLeave);
      document.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);

  return (
    <div className="w-full">
      {/* Overlay that appears when dragging image files over the page */}
      {isDraggingImages && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
        >
          <div className="bg-card p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
            <div className="mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
                <line x1="16" x2="22" y1="5" y2="5"></line>
                <line x1="19" x2="19" y1="2" y2="8"></line>
                <circle cx="9" cy="9" r="2"></circle>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Drop Images Here</h3>
            <p className="text-muted-foreground">
              Drop your images to add them to your training set
            </p>
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
                    <svg
                      xmlns="http://www.w3.org/2000/svg" 
                      width="24" 
                      height="24" 
                      viewBox="0 0 24 24" 
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2" 
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                      <path d="M12 12v9"></path>
                      <path d="m16 16-4-4-4 4"></path>
                    </svg>
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