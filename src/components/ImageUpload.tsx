"use client";

import { useState, useCallback, ChangeEvent, useEffect, DragEvent } from 'react';
import Image from 'next/image';
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

  // Reset input when currentImageUrl is cleared externally
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
      };
      reader.readAsDataURL(file);
    } else if (file) {
      // Handle non-image file type if needed, e.g., show an error
      console.warn("Attempted to upload non-image file:", file.name);
      onImageChange(null); // Clear any existing image
    } else {
      onImageChange(null);
    }
  }, [onImageChange]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0] || null);
  }, [processFile]);

  const handleRemoveImage = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.stopPropagation(); // Prevent click from triggering file input if 'x' is over dropzone
    onImageChange(null);
    // Input value is cleared by the useEffect hook when currentImageUrl becomes null
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


  if (currentImageUrl) {
    return (
      <div className={cn("relative group w-full max-w-md mx-auto aspect-square", className)}>
        <Image
          src={currentImageUrl}
          alt="Uploaded image"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-contain rounded-lg shadow-md"
        />
        <button
          type="button"
          onClick={handleRemoveImage}
          className="absolute top-2 right-2 bg-background/70 hover:bg-background/90 text-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
          aria-label="Remove image"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

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
          "w-full h-10 flex items-center justify-between text-muted-foreground font-normal",
          dragActive ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-muted-foreground/70"
        )}
        onClick={() => document.getElementById('imageUploadInput')?.click()}
        onDragEnter={handleDragEvent}
        onDragLeave={handleDragEvent}
        onDragOver={handleDragEvent}
        onDrop={handleDrop}
        type="button"
      >
        <span className={cn(dragActive ? "text-primary" : "")}>
          Drag image or click to upload
        </span>
        <FolderUp size={18} className={cn("ml-2 flex-shrink-0", dragActive ? "text-primary" : "text-muted-foreground/70")} />
      </Button>
    </div>
  );
} 