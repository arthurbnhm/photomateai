"use client";

import { useState, useCallback, ChangeEvent, DragEvent, useRef } from 'react';
import NextImage from 'next/image';
import { X, FolderUp } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  onImageChange: (imageDataUrl: string | null) => void;
  currentImageUrl: string | null;
  className?: string;
  maxSizeMB?: number; // Optional size limit
  maxDimension?: number; // Optional dimension limit
}

export function ImageUpload({ 
  onImageChange, 
  currentImageUrl, 
  className,
  maxSizeMB = 5, // Default 5MB limit
  maxDimension = 2048 // Default 2048px max dimension
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Native image resizing using canvas
  const resizeImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
          
          // Create canvas and resize
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to data URL with quality adjustment for size
          let quality = 0.9;
          let dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality);
          
          // Reduce quality if still too large
          while (dataUrl.length > maxSizeMB * 1024 * 1024 * 1.37 && quality > 0.1) { // 1.37 for base64 overhead
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          
          resolve(dataUrl);
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, [maxDimension, maxSizeMB]);

  const processFile = useCallback(async (file: File | null) => {
    if (!file) {
      onImageChange(null);
      setUploadedFileName(null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('Invalid file type:', file.type);
      onImageChange(null);
      setUploadedFileName(null);
      return;
    }

    setIsProcessing(true);

    try {
      // Check if file needs resizing
      const needsResize = file.size > maxSizeMB * 1024 * 1024;
      
      if (needsResize) {
        // Resize image using canvas
        const dataUrl = await resizeImage(file);
        
        // Validate the data URL format
        if (dataUrl && /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(dataUrl)) {
          onImageChange(dataUrl);
          setUploadedFileName(file.name);
        } else {
          throw new Error('Invalid data URL format');
        }
      } else {
        // For small files, just read directly
        const reader = new FileReader();
        
        reader.onload = (e) => {
          const result = e.target?.result;
          if (typeof result === 'string' && /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(result)) {
            onImageChange(result);
            setUploadedFileName(file.name);
          } else {
            console.error('Invalid data URL format');
            onImageChange(null);
            setUploadedFileName(null);
          }
        };
        
        reader.onerror = () => {
          console.error('Failed to read file');
          onImageChange(null);
          setUploadedFileName(null);
        };
        
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('Error processing image:', error);
      onImageChange(null);
      setUploadedFileName(null);
    } finally {
      setIsProcessing(false);
    }
  }, [onImageChange, maxSizeMB, resizeImage]);

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
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
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
              <NextImage
                src={currentImageUrl}
                alt="Uploaded thumbnail"
                width={24} 
                height={24}
                className="object-contain rounded bg-muted/30 shrink-0" 
              />
              <span className="truncate text-sm text-foreground">
                {truncateFileName(uploadedFileName)}
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