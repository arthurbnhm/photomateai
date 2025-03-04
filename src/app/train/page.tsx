"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDropzone } from "react-dropzone";
import Image from "next/image";
import { v4 as uuidv4 } from 'uuid';

export default function TrainPage() {
  const [displayModelName, setDisplayModelName] = useState("");
  const [actualModelName, setActualModelName] = useState("");
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Update actual model name whenever display name changes
  useEffect(() => {
    if (displayModelName) {
      setActualModelName(`${displayModelName}-${uuidv4()}`);
    } else {
      setActualModelName("");
    }
  }, [displayModelName]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!actualModelName || uploadedImages.length === 0) return;
    
    setIsCreating(true);
    
    try {
      // Step 1: Create the model in Replicate
      const createModelResponse = await fetch('/api/create-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelName: actualModelName,
        }),
      });

      const modelData = await createModelResponse.json();
      
      if (!modelData.success) {
        throw new Error(modelData.error || 'Failed to create model');
      }

      console.log(`Model created: ${modelData.model.name}`);
      console.log(`Model URL: ${modelData.model.url}`);
      
      // Step 2: Upload images to the model
      const formData = new FormData();
      uploadedImages.forEach((file, index) => {
        formData.append(`image_${index}`, file);
      });
      formData.append('modelName', modelData.model.name);
      formData.append('owner', modelData.model.owner);
      
      const uploadResponse = await fetch('/api/upload-training-images', {
        method: 'POST',
        body: formData,
      });
      
      const uploadData = await uploadResponse.json();
      
      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Failed to upload training images');
      }
      
      console.log('Images uploaded successfully');
      
      // Step 3: Start training the model
      const trainingResponse = await fetch('/api/train-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelName: modelData.model.name,
          owner: modelData.model.owner,
        }),
      });
      
      const trainingData = await trainingResponse.json();
      
      if (!trainingData.success) {
        throw new Error(trainingData.error || 'Failed to start model training');
      }
      
      console.log('Model training started');
      console.log(`Training ID: ${trainingData.training.id}`);
      
      // Show success message to the user
      alert('Model training started successfully! This may take a while to complete.');
      
    } catch (error) {
      console.error("Error creating model:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Something went wrong'}`);
    } finally {
      setIsCreating(false);
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
    }
  }, [uploadedImages]);

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 10,
    noClick: isDraggingImages, // Disable click when the page overlay is active
  });

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

  // Handle image removal
  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    newImages.splice(index, 1);
    setUploadedImages(newImages);
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
        <p className="text-muted-foreground">Customize your AI model with your own images and style</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-8 z-10 mt-4">
        <form className="space-y-8">
          <div className="space-y-4">
            <div>
              <Label htmlFor="model-name">Model Name</Label>
              <Input 
                id="model-name" 
                placeholder="Enter a name for your model" 
                value={displayModelName}
                onChange={(e) => setDisplayModelName(e.target.value)}
                className="mt-1"
              />
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
          </div>
          
          <Button 
            type="submit" 
            className="w-full"
            disabled={!displayModelName || uploadedImages.length === 0 || isCreating}
            onClick={handleSubmit}
          >
            {isCreating ? 'Creating Model...' : 'Train Model'}
          </Button>
        </form>
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
} 