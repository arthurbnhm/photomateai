"use client";

import { useState, useCallback, ChangeEvent, useEffect, DragEvent } from 'react';
import NextImage from 'next/image';
import { X, FolderUp } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Utility function to validate base64 data
const isValidBase64 = (str: string): boolean => {
  try {
    // Check if string is valid base64
    const decoded = atob(str);
    // Re-encode and compare to check for padding issues
    return btoa(decoded) === str;
  } catch {
    return false;
  }
};

interface ImageUploadProps {
  onImageChange: (imageDataUrl: string | null) => void;
  currentImageUrl: string | null;
  className?: string;
}

export function ImageUpload({ onImageChange, currentImageUrl, className }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!currentImageUrl) {
      const input = document.getElementById('imageUploadInput') as HTMLInputElement;
      if (input) {
        input.value = '';
      }
      setUploadedFileName(null);
    }
  }, [currentImageUrl]);

  const processFile = useCallback(async (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };
      try {
        const compressedFile = await imageCompression(file, options);

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          
          // Validate data URL format
          if (!result || typeof result !== 'string') {
            console.error('Invalid FileReader result');
            onImageChange(null);
            setUploadedFileName(null);
            return;
          }
          
          // Check if it's a valid data URL format
          const dataUrlRegex = /^data:image\/[a-zA-Z]*;base64,([A-Za-z0-9+/]+=*)?$/;
          if (!dataUrlRegex.test(result)) {
            console.error('Invalid data URL format:', result.substring(0, 100) + '...');
            onImageChange(null);
            setUploadedFileName(null);
            return;
          }
          
          // Validate base64 portion
          try {
            const base64Data = result.split(',')[1];
            if (!base64Data) {
              throw new Error('No base64 data found');
            }
            
            // Test if base64 is valid using our utility function
            if (!isValidBase64(base64Data)) {
              throw new Error('Invalid base64 encoding');
            }
            
            // If we get here, the data URL is valid
            onImageChange(result);
            setUploadedFileName(file.name);
          } catch (error) {
            console.error('Invalid base64 data in data URL:', error);
            onImageChange(null);
            setUploadedFileName(null);
          }
        };
        
        reader.onerror = () => {
          console.error('FileReader error');
          onImageChange(null);
          setUploadedFileName(null);
        };
        
        reader.readAsDataURL(compressedFile);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) { 
        console.log("Image compression fallback, error variable _error is present."); // Ensure _error is seen as used
        onImageChange(null);
        setUploadedFileName(null);
      }
    } else if (file) {
      console.warn("Attempted to upload non-image file:", file.name);
      onImageChange(null);
      setUploadedFileName(null);
    } else {
      onImageChange(null);
      setUploadedFileName(null);
    }
  }, [onImageChange]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0] || null);
  }, [processFile]);

  const handleRemoveImage = useCallback((e?: React.MouseEvent<HTMLDivElement | HTMLButtonElement> | React.KeyboardEvent<HTMLDivElement>) => {
    e?.stopPropagation(); 
    onImageChange(null);
  }, [onImageChange]);

  const handleDrop = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      processFile(event.dataTransfer.files[0]);
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
    const extension = name.substring(name.lastIndexOf('.'));
    const baseName = name.substring(0, name.lastIndexOf('.'));
    return `${baseName.substring(0, maxLength - 3 - extension.length)}...${extension}`;
  };

  return (
    <div className={cn("w-full", className)}>
      <input
        id="imageUploadInput"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        variant="outline"
        className={cn(
          "w-full h-9 flex items-center justify-between", 
          "font-normal", 
          dragActive
            ? "ring-2 ring-primary border-primary bg-primary/5 text-primary" 
            : "text-muted-foreground" 
        )}
        onClick={() => document.getElementById('imageUploadInput')?.click()}
        onDragEnter={handleDragEvent}
        onDragLeave={handleDragEvent}
        onDragOver={handleDragEvent}
        onDrop={handleDrop}
        type="button"
      >
        {currentImageUrl ? (
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