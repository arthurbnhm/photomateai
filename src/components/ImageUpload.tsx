"use client";

import { useState, useCallback, ChangeEvent, useEffect, DragEvent } from 'react';
import NextImage from 'next/image';
import { X, FolderUp } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
        useWebWorker: false, // Disable web worker to avoid potential issues
        initialQuality: 0.8,
      };
      try {
        const compressedFile = await imageCompression(file, options);

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          
          // Simple validation - just check if we got a string that starts with data:
          if (typeof result === 'string' && result.startsWith('data:')) {
            onImageChange(result);
            setUploadedFileName(file.name);
          } else {
            console.error('Failed to read file as data URL');
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