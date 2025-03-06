"use client"

import { useState } from "react";
import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";

// Define the PendingGeneration type
type PendingGeneration = {
  id: string
  replicate_id?: string
  prompt: string
  aspectRatio: string
  startTime?: string
  potentiallyStalled?: boolean
}

export default function CreatePage() {
  // Shared state for pending generations
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([]);

  return (
    <div className="flex flex-col min-h-screen p-8 pb-28 sm:pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] relative bg-background">
      <header className="w-full max-w-4xl mx-auto text-center mt-8 sm:mt-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Photomate AI</h1>
        <p className="text-muted-foreground">Create stunning images with AI using simple text prompts</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-12 z-10 mt-4">
        <PromptForm 
          pendingGenerations={pendingGenerations}
          setPendingGenerations={setPendingGenerations}
        />
        <div className="w-full border-t pt-8">
          <ImageHistory 
            pendingGenerations={pendingGenerations}
            setPendingGenerations={setPendingGenerations}
          />
        </div>
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
} 