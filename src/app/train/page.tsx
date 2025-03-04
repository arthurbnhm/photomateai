"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDropzone } from "react-dropzone";
import Image from "next/image";
import { v4 as uuidv4 } from 'uuid';
import { toast } from "sonner";

export default function TrainPage() {
  const [displayModelName, setDisplayModelName] = useState("");
  const [actualModelName, setActualModelName] = useState("");
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<{ id: string; status: string; url: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);

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
        console.log('Bucket initialization requested');
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
          hardware: 'gpu-t4'
        }),
      });

      const modelData = await createModelResponse.json();
      
      if (!modelData.success) {
        throw new Error(modelData.error || 'Failed to create model');
      }

      console.log(`Model created: ${modelData.model.name}`);
      console.log(`Model URL: ${modelData.model.url}`);
      
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
      
      console.log('Model training started');
      console.log(`Training ID: ${trainingData.training.id}`);
      
      // Set the training status
      setTrainingStatus({
        id: trainingData.training.id,
        status: trainingData.training.status,
        url: trainingData.training.url
      });
      
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
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(
        file => file.type.startsWith('image/')
      );
      
      // Limit to 10 images total
      const newImages = [...uploadedImages];
      const remainingSlots = 10 - newImages.length;
      
      if (remainingSlots > 0) {
        const filesToAdd = files.slice(0, remainingSlots);
        setUploadedImages([...newImages, ...filesToAdd]);
      }
    }
  };

  // Add global event listeners for drag events outside the component
  // This ensures we reset the state when the user stops dragging anywhere
  useEffect(() => {
    const handleGlobalDragLeave = (e: DragEvent) => {
      // Check if the drag is leaving the window
      if (e.clientX <= 0 || e.clientY <= 0 || 
          e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        setIsDraggingImages(false);
      }
    };

    const handleGlobalDragEnd = () => {
      setIsDraggingImages(false);
    };

    // Add event listeners when component mounts
    window.addEventListener('dragleave', handleGlobalDragLeave);
    window.addEventListener('dragend', handleGlobalDragEnd);

    // Clean up event listeners when component unmounts
    return () => {
      window.removeEventListener('dragleave', handleGlobalDragLeave);
      window.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);

  return (
    <div 
      className="flex flex-col min-h-screen p-8 pb-28 sm:pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
    >
      {/* Overlay that appears when dragging image files over the page */}
      {isDraggingImages && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center p-8 rounded-lg max-w-xl">
            <div className="mb-6 bg-primary/10 p-6 rounded-full inline-flex">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="48" 
                height="48" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="text-primary"
              >
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                <path d="M12 12v9"></path>
                <path d="m16 16-4-4-4 4"></path>
              </svg>
            </div>
            <h2 className="text-3xl font-bold mb-2">Drop Your Images Here</h2>
            <p className="text-muted-foreground text-lg">
              Release to upload up to 10 images for your AI model
            </p>
          </div>
        </div>
      )}

      <header className="w-full max-w-4xl mx-auto text-center mt-8 sm:mt-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Train Your AI Model</h1>
        <p className="text-muted-foreground">Create and train your AI model with your own images</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-8 z-10 mt-4">
        {trainingStatus ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Training Started!</h2>
            <p className="mb-4">Your model is now training. This may take a while to complete.</p>
            <div className="bg-white dark:bg-gray-800 rounded-md p-4 mb-4 text-left">
              <p><span className="font-medium">Training ID:</span> {trainingStatus.id}</p>
              <p><span className="font-medium">Status:</span> {trainingStatus.status}</p>
            </div>
            <div className="flex justify-center">
              <a 
                href={trainingStatus.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md"
              >
                View Training on Replicate
              </a>
            </div>
            <button
              onClick={() => {
                setTrainingStatus(null);
                setDisplayModelName("");
                setUploadedImages([]);
              }}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground"
            >
              Train Another Model
            </button>
          </div>
        ) : (
          <form className="space-y-8">
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
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Model will be created as: <span className="font-mono">{actualModelName}</span>
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Upload Images (10 max)</Label>
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50'
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
                              className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
              
              {isProcessing && (
                <div className="mt-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Processing...</span>
                    <span className="text-sm font-medium">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div 
                      className="bg-primary h-2.5 rounded-full transition-all duration-300" 
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
                  <svg 
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                  >
                    <circle 
                      className="opacity-25" 
                      cx="12" 
                      cy="12" 
                      r="10" 
                      stroke="currentColor" 
                      strokeWidth="4"
                    ></circle>
                    <path 
                      className="opacity-75" 
                      fill="currentColor" 
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </span>
              ) : 'Create & Train Model'}
            </Button>
          </form>
        )}
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
} 