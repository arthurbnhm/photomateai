"use client";

import { useState, useCallback, ChangeEvent, useEffect } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { UploadCloud, X } from 'lucide-react';

interface ImageUploadProps {
  onImageChange: (imageDataUrl: string | null) => void;
  currentImageUrl: string | null;
  className?: string;
}

export function ImageUpload({ onImageChange, currentImageUrl, className }: ImageUploadProps) {
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!currentImageUrl) {
      setFileName(null);
      const input = document.getElementById('imageUploadInput') as HTMLInputElement;
      if (input) {
        input.value = '';
      }
    }
  }, [currentImageUrl]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        onImageChange(result);
      };
      reader.readAsDataURL(file);
    } else {
      setFileName(null);
      onImageChange(null);
    }
  }, [onImageChange]);

  const handleRemoveImage = useCallback(() => {
    setFileName(null);
    onImageChange(null);
    const input = document.getElementById('imageUploadInput') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  }, [onImageChange]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div
        className={`
          w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 
          flex flex-col items-center justify-center text-center
          transition-colors hover:border-primary/50 cursor-pointer
          ${currentImageUrl ? 'bg-muted/20' : 'bg-transparent'}
        `}
        onClick={() => document.getElementById('imageUploadInput')?.click()}
      >
        <input
          id="imageUploadInput"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {currentImageUrl ? (
          <div className="relative group w-full max-w-xs mx-auto flex justify-center items-center h-48">
            <Image
              src={currentImageUrl}
              alt={fileName || "Uploaded image"}
              width={192}
              height={192}
              objectFit="contain"
              className="rounded-md shadow-md"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveImage();
              }}
              aria-label="Remove image"
            >
              <X size={16} />
            </Button>
            {fileName && <p className="text-xs text-muted-foreground mt-2 truncate">{fileName}</p>}
          </div>
        ) : (
          <>
            <UploadCloud size={32} className="text-muted-foreground/70 mb-2" />
            <p className="text-sm text-muted-foreground">
              Click to upload an image
            </p>
            <p className="text-xs text-muted-foreground/80">
              (Optional, for image-to-image generation)
            </p>
          </>
        )}
      </div>
    </div>
  );
} 