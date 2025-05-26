"use client";

import { useState, useCallback, ChangeEvent, DragEvent, useRef, useEffect } from 'react';
import NextImage from 'next/image';
import { X, FolderUp } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  onImageChange: (imageDataUrl: string | null) => void;
  currentImageUrl: string | null;
  className?: string;
  externalFileName?: string | null;
}

export function ImageUpload({ onImageChange, currentImageUrl, className, externalFileName }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset internal state when currentImageUrl becomes null
  useEffect(() => {
    if (currentImageUrl === null) {
      setUploadedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [currentImageUrl]);

  // Function to get the display filename (prioritize external, then uploaded)
  const getDisplayFileName = () => {
    return externalFileName || uploadedFileName;
  };

  // Simple, reliable image processing using canvas
  const processImageFile = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Create image element
      const img = new Image();
      
      img.onload = () => {
        try {
          // Create canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Calculate dimensions (max 1920px, maintain aspect ratio)
          const maxDimension = 1920;
          let { width, height } = img;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to standardized data URL (always JPEG for consistency)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          
          // Clean and validate the data URL format
          const cleanDataUrl = dataUrl.trim().replace(/\s/g, '');
          
          // Validate the data URL format is exactly what we expect
          if (!cleanDataUrl || !cleanDataUrl.startsWith('data:image/jpeg;base64,')) {
            reject(new Error('Failed to create valid data URL'));
            return;
          }

          // Additional validation: ensure base64 part is valid
          const base64Part = cleanDataUrl.split(',')[1];
          if (!base64Part || base64Part.length === 0) {
            reject(new Error('Invalid base64 data in data URL'));
            return;
          }

          console.log('✅ Created clean data URL, length:', cleanDataUrl.length);
          resolve(cleanDataUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      // Create object URL and clean up afterwards
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      
      // Clean up object URL after image loads
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          const maxDimension = 1920;
          let { width, height } = img;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          
          if (!dataUrl || !dataUrl.startsWith('data:image/jpeg;base64,')) {
            reject(new Error('Failed to create valid data URL'));
            return;
          }

          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };
    });
  }, []);

  const processFile = useCallback(async (file: File | null) => {
    if (!file) {
      onImageChange(null);
      setUploadedFileName(null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('Invalid file type:', file.type);
      return;
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      console.error('File too large:', file.size);
      return;
    }

    setIsProcessing(true);

    try {
      const dataUrl = await processImageFile(file);
      onImageChange(dataUrl);
      setUploadedFileName(file.name);
    } catch (error) {
      console.error('Error processing image:', error);
      onImageChange(null);
      setUploadedFileName(null);
    } finally {
      setIsProcessing(false);
    }
  }, [onImageChange, processImageFile]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleRemoveImage = useCallback((e?: React.MouseEvent<HTMLDivElement | HTMLButtonElement> | React.KeyboardEvent<HTMLDivElement>) => {
    e?.stopPropagation();
    onImageChange(null);
    setUploadedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onImageChange]);

  const handleDrop = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragEvent = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const truncateFileName = (name: string | null, maxLength = 20) => {
    if (!name) return '';
    if (name.length <= maxLength) return name;
    
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex === -1) return name.substring(0, maxLength) + '...';
    
    const extension = name.substring(lastDotIndex);
    const baseName = name.substring(0, lastDotIndex);
    const truncatedBase = baseName.substring(0, maxLength - extension.length - 3);
    
    return `${truncatedBase}...${extension}`;
  };

  return (
    <div className={cn("w-full", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={isProcessing}
      />
      <Button
        variant="outline"
        className={cn(
          "w-full h-9 flex items-center justify-between", 
          "font-normal", 
          dragActive && "ring-2 ring-primary border-primary bg-primary/5 text-primary",
          isProcessing && "opacity-50 cursor-wait"
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEvent}
        onDragLeave={handleDragEvent}
        onDragOver={handleDragEvent}
        onDrop={handleDrop}
        type="button"
        disabled={isProcessing}
      >
        {isProcessing ? (
          <span className="text-muted-foreground">Processing image...</span>
        ) : currentImageUrl ? (
          <>
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-6 h-6 rounded bg-muted/30 shrink-0 overflow-hidden">
                <NextImage
                  src={currentImageUrl}
                  alt="Uploaded thumbnail"
                  width={24} 
                  height={24}
                  className="w-full h-full object-cover" 
                />
              </div>
              <span className="truncate text-sm text-foreground">
                {truncateFileName(getDisplayFileName())}
              </span>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={handleRemoveImage}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); 
                  handleRemoveImage(e);
                }
              }}
              className="p-0.5 bg-transparent hover:bg-muted rounded-full text-muted-foreground hover:text-destructive shrink-0 ml-2"
              aria-label="Remove image"
            >
              <X size={16} />
            </div>
          </>
        ) : (
          <>
            <span>{dragActive ? "Drop image here" : "Choose or drag an image"}</span>
            <FolderUp className="ml-2 flex-shrink-0 opacity-70" size={18} />
          </>
        )}
      </Button>
    </div>
  );
} 