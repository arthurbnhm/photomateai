'use client'

import React, { useState, useContext, useMemo, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { X, Download, Loader2, Copy, Repeat, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import { Image as ImageIcon } from 'lucide-react'
import { motion } from "framer-motion"
import { GeneratedImageBatch } from '@/components/types'
import { cn } from "@/lib/utils"

interface ImageData {
  file: File;
  url: string;
}

interface ImageGalleryProps {
  generatedImages: GeneratedImageBatch[];
  getModelNameById: (id: string) => string;
  onRerun: (batch: GeneratedImageBatch) => void;
  onDelete: (generationId: string) => void;
  onCancel: (generationId: string) => void;
}

interface ImageWrapperProps {
  imageUrl: string;
  index: number;
  batch: GeneratedImageBatch;
  onClick: () => void;
}

const ImageWrapper = React.memo(({ imageUrl, index, batch, onClick }: ImageWrapperProps) => {
  const [error, setError] = useState(false);

  const { downloadImage } = useContext(ImageGalleryContext);

  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center"
      >
        <ImageIcon className="h-8 w-8 text-gray-400" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        delay: index * 0.1,
      }}
      whileHover={{ scale: 1.02 }}
      className="relative aspect-square group cursor-pointer border border-white rounded-lg overflow-hidden"
      onClick={onClick}
    >
      <motion.img
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: index * 0.1 + 0.2 }}
        src={imageUrl}
        alt={`Generated image ${index + 1}`}
        className="w-full h-full object-cover"
        onError={() => setError(true)}
      />
      <motion.div 
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-2 right-2"
      >
        <Button
          variant="outline"
          size="icon"
          className="rounded-full bg-white/90 hover:bg-white"
          onClick={(e) => {
            e.stopPropagation();
            downloadImage(imageUrl);
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
});

const ImageGalleryContext = React.createContext<{
  downloadImage: (imageUrl: string) => Promise<void>;
}>({
  downloadImage: async () => {},
});

export function ImageGallery({ 
  generatedImages, 
  getModelNameById, 
  onRerun, 
  onDelete,
  onCancel 
}: ImageGalleryProps) {
  console.log('ImageGallery render - props:', {
    generatedImages,
    hasImages: generatedImages?.length > 0,
    firstBatch: generatedImages?.[0]
  });

  const [selectedBatch, setSelectedBatch] = useState<GeneratedImageBatch | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);

  useEffect(() => {
    console.log('ImageGallery mounted/updated:', {
      generatedImages,
      selectedBatch,
      currentImageIndex
    });
  }, [generatedImages, selectedBatch, currentImageIndex]);

  const downloadImage = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `generated_image_${currentImageIndex + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error("Failed to download image");
    }
  };

  const contextValue = useMemo(() => ({
    downloadImage,
  }), []);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (!selectedBatch) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          setCurrentImageIndex((prev) =>
            prev === 0 ? selectedBatch.images.length - 1 : prev - 1
          );
          break;
        case 'ArrowRight':
          event.preventDefault();
          setCurrentImageIndex((prev) =>
            prev === selectedBatch.images.length - 1 ? 0 : prev + 1
          );
          break;
        case 'Escape':
          event.preventDefault();
          setSelectedBatch(null);
          setCurrentImageIndex(0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedBatch]);

  // Use a ref to track initial mount of generations
  const mountedGenerations = React.useRef(new Set<string>());

  // Check if this is the first time we're seeing this generation
  const isFirstMount = (generationId: string) => {
    if (mountedGenerations.current.has(generationId)) {
      return false;
    }
    mountedGenerations.current.add(generationId);
    return true;
  };

  return (
    <ImageGalleryContext.Provider value={contextValue}>
      <div className="space-y-8">
        {generatedImages.map((batch, batchIndex) => (
          <motion.div
            key={batch.generationId}
            initial={isFirstMount(batch.generationId) ? { opacity: 0, y: 20 } : false}
            animate={isFirstMount(batch.generationId) ? { opacity: 1, y: 0 } : false}
            transition={{ duration: 0.3, delay: batchIndex * 0.1 }}
            className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden"
          >
            <div className="p-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <p className="font-medium text-gray-900">{batch.prompt}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "bg-purple-100/50 text-purple-900 hover:bg-purple-100/75 border-purple-200",
                      )}
                    >
                      {batch.aspectRatio}
                    </Badge>
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "bg-blue-100/50 text-blue-900 hover:bg-blue-100/75 border-blue-200",
                      )}
                    >
                      {getModelNameById(batch.modelId)}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  {/* Cancel button - during processing */}
                  {(batch.status === 'processing' || batch.status === 'canceling') && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-red-200 hover:border-red-300 hover:bg-red-50 text-red-600 hover:text-red-700"
                            onClick={() => onCancel(batch.generationId)}
                            disabled={batch.status === 'canceling'}
                          >
                            {batch.status === 'canceling' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Cancel generation</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Copy prompt button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(batch.prompt);
                            toast.success("Prompt copied to clipboard");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copy prompt to clipboard</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Rerun button */}
                  {!['processing'].includes(batch.status) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => onRerun(batch)}
                          >
                            <Repeat className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Rerun generation with same parameters</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Delete button */}
                  {!['processing'].includes(batch.status) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => onDelete(batch.generationId)}
                            disabled={batch.status === 'deleting'}
                          >
                            {batch.status === 'deleting' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete generation</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {batch.images?.length > 0 ? (
                  batch.images.map((image, index) => (
                    <ImageWrapper 
                      key={index}
                      imageUrl={image}
                      index={index}
                      batch={batch}
                      onClick={() => {
                        setSelectedBatch(batch);
                        setCurrentImageIndex(index);
                      }}
                    />
                  ))
                ) : (
                  [...Array(4)].map((_, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                        delay: index * 0.1,
                      }}
                      className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center"
                    >
                      <motion.div
                        animate={{ 
                          opacity: [0.5, 1, 0.5],
                          scale: [0.95, 1, 0.95],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                      </motion.div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Image Viewer Dialog */}
      {selectedBatch && (
        <Dialog
          open={!!selectedBatch}
          onOpenChange={() => {
            setSelectedBatch(null);
            setCurrentImageIndex(0);
          }}
        >
          <DialogContent 
            className={cn(
              "!max-w-7xl !w-[95vw] !h-[90vh] !p-6 !border-0",
              "bg-white/95 backdrop-blur-sm shadow-lg rounded-[24px]",
              "data-[state=open]:!duration-300"
            )}
            hideCloseButton
          >
            <DialogTitle className="sr-only">
              Generated Image Viewer
            </DialogTitle>
            
            {/* Top bar with information */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-sm border-b flex items-center justify-between rounded-t-[24px]">
              <div className="flex-1">
                <p className="font-medium text-gray-900 line-clamp-1">{selectedBatch.prompt}</p>
                <div className="flex gap-2 mt-1.5">
                  <Badge 
                    variant="secondary"
                    className={cn(
                      "bg-purple-100/50 text-purple-900 hover:bg-purple-100/75 border-purple-200",
                    )}
                  >
                    {selectedBatch.aspectRatio}
                  </Badge>
                  <Badge 
                    variant="secondary"
                    className={cn(
                      "bg-blue-100/50 text-blue-900 hover:bg-blue-100/75 border-blue-200",
                    )}
                  >
                    {getModelNameById(selectedBatch.modelId)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => downloadImage(selectedBatch.images[currentImageIndex])}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => {
                    setSelectedBatch(null);
                    setCurrentImageIndex(0);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Main image container */}
            <div className="h-full w-full flex items-center justify-center pt-20 pb-28">
              <div className="relative group">
                <img
                  src={selectedBatch.images[currentImageIndex]}
                  alt={`Generated image ${currentImageIndex + 1}`}
                  className="max-w-full max-h-[calc(90vh-16rem)] object-contain rounded-lg"
                />
                
                {/* Navigation buttons - only show on hover */}
                <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 -ml-6 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm"
                    onClick={() =>
                      setCurrentImageIndex((prev) =>
                        prev === 0 ? selectedBatch.images.length - 1 : prev - 1
                      )
                    }
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 -mr-6 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm"
                    onClick={() =>
                      setCurrentImageIndex((prev) =>
                        prev === selectedBatch.images.length - 1 ? 0 : prev + 1
                      )
                    }
                  >
                    <ArrowRight className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Bottom thumbnail navigation */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-sm border-t h-24 rounded-b-[24px]">
              <div className="flex justify-center gap-2">
                {selectedBatch.images.map((image, index) => (
                  <button
                    key={index}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentImageIndex
                        ? 'border-blue-500 opacity-100'
                        : 'border-transparent opacity-50 hover:opacity-100'
                    }`}
                    onClick={() => setCurrentImageIndex(index)}
                  >
                    <img
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ImageGalleryContext.Provider>
  );
} 