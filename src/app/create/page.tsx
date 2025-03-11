"use client"

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PromptForm } from "@/components/PromptForm";
import { ImageHistory } from "@/components/ImageHistory";
import { TrainForm, TrainingStatus } from "@/components/TrainForm";
import { ModelListTable } from "@/components/ModelListTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Define the PendingGeneration type
type PendingGeneration = {
  id: string
  replicate_id?: string
  prompt: string
  aspectRatio: string
  startTime?: string
  potentiallyStalled?: boolean
}

// Create a client component that uses useSearchParams
function CreatePageContent() {
  const searchParams = useSearchParams();
  
  // Shared state for pending generations
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([]);
  // State for training status
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);
  // Track the active tab
  const [activeTab, setActiveTab] = useState(() => {
    // Initialize tab from URL query parameter if available
    const tabParam = searchParams.get("tab");
    return tabParam === "train" ? "train" : "generate";
  });

  // Listen for training status updates from ModelListTable
  useEffect(() => {
    const handleTrainingStatusUpdate = (event: CustomEvent) => {
      setTrainingStatus(event.detail);
    };
    
    window.addEventListener('training-status-update', handleTrainingStatusUpdate as EventListener);
    return () => {
      window.removeEventListener('training-status-update', handleTrainingStatusUpdate as EventListener);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12">
      <header className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Photomate AI</h1>
        <p className="text-muted-foreground">Create stunning images with AI using simple text prompts or train your own custom model</p>
      </header>
      
      <Tabs defaultValue="generate" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-fit mx-auto mb-6">
          <TabsTrigger value="generate" className="px-4">Generate Images</TabsTrigger>
          <TabsTrigger value="train" className="px-4">Train New Model</TabsTrigger>
        </TabsList>
        
        <TabsContent value="generate" className="space-y-4">
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
        </TabsContent>
        
        <TabsContent value="train" className="space-y-8">
          <TrainForm 
            onTrainingStatusChange={setTrainingStatus}
            trainingStatus={trainingStatus}
          />
          <div className="mt-8 pt-8">
            <ModelListTable 
              newTraining={trainingStatus} 
              onClearNewTraining={() => setTrainingStatus(null)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading...</div>}>
      <div className="pt-16 md:pt-20">
        <CreatePageContent />
      </div>
    </Suspense>
  );
} 