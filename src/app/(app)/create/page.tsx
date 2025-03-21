"use client"

import { useState, Suspense } from "react";
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