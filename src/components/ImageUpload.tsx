"use client";

import { useState, useCallback, ChangeEvent, useEffect, DragEvent } from 'react';
import NextImage from 'next/image';
import { X, FolderUp } from 'lucide-react';
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
    }
  }, [currentImageUrl]);

  const processFile = useCallback((file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        onImageChange(result);
        setUploadedFileName(file.name);
      };
      reader.readAsDataURL(file);
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
    setUploadedFileName(null);
  }, [onImageChange]);

  const handleDrop = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    processFile(event.dataTransfer.files?.[0] || null);
  }, [processFile]);

  const handleDragEvent = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      if (event.dataTransfer.items && event.dataTransfer.items.length > 0 && event.dataTransfer.items[0].kind === 'file' && event.dataTransfer.items[0].type.startsWith('image/')) {
        setDragActive(true);
      }
    } else if (event.type === "dragleave") {
      const dropzone = event.currentTarget as HTMLButtonElement;
      if (!event.relatedTarget || (event.relatedTarget instanceof Node && !dropzone.contains(event.relatedTarget))) {
        setDragActive(false);
      }
    }
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
        <span>
          {currentImageUrl && uploadedFileName 
            ? (uploadedFileName.length > 25 ? uploadedFileName.substring(0, 22) + "..." : uploadedFileName)
            : "Choose or drag an image"}
        </span>
        
        <div className="ml-2 flex-shrink-0 flex items-center gap-1.5"> 
          {currentImageUrl ? (
            <>
              <NextImage
                src={currentImageUrl}
                alt="Uploaded thumbnail"
                width={24} 
                height={24}
                className="object-contain rounded bg-muted/30" 
              />
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
                className="p-0.5 bg-transparent hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="Remove image"
              >
                <X size={14} />
              </div>
            </>
          ) : (
            <FolderUp
              size={18}
              className={cn(dragActive ? "" : "opacity-70")} 
            />
          )}
        </div>
      </Button>
    </div>
  );
} 