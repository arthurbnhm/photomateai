"use client"

import { useState, Suspense } from "react";
import Image from "next/image";
import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";

// Define the PendingGeneration type
type PendingGeneration = {
  id: string
  replicate_id?: string
  prompt: string
  aspectRatio: string
  startTime?: string
}

// Create a client component for the Create page content
function CreatePageContent() {
  // Shared state for pending generations
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
      <div className="mb-8 hidden sm:flex items-center justify-center space-x-4">
        {/* Static three-image visual with enhanced individual hover effects */}
        <div className="flex items-center cursor-default">
          <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-background transform -rotate-6 mr-[-10px] transition-all duration-300 ease-out hover:rotate-[-10deg] hover:scale-110 hover:-translate-y-1 hover:z-20">
            <Image src="/landing/01.webp" alt="Sample 1" fill className="object-cover" sizes="32px" />
          </div>
          <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-background z-10 transform scale-110 transition-all duration-300 ease-out hover:scale-125 hover:-translate-y-1 hover:z-20">
            <Image src="/landing/02.webp" alt="Sample 2" fill className="object-cover" sizes="32px" />
          </div>
          <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm border-2 border-background transform rotate-6 ml-[-10px] transition-all duration-300 ease-out hover:rotate-[10deg] hover:scale-110 hover:-translate-y-1 hover:z-20">
            <Image src="/landing/03.webp" alt="Sample 3" fill className="object-cover" sizes="32px" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold">Create images of yourself</h1>
      </div>
      <PromptForm 
        pendingGenerations={pendingGenerations}
        setPendingGenerations={setPendingGenerations}
      />
      <div className="w-full pt-8">
        <ImageHistory 
          pendingGenerations={pendingGenerations}
          setPendingGenerations={setPendingGenerations}
        />
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading...</div>}>
      <CreatePageContent />
    </Suspense>
  );
} 