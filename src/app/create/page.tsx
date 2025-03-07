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

  // Handle tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  // Called when the ModelListTable detects that newTraining is now in the models list
  const clearTrainingStatus = () => {
    setTrainingStatus(null);
  };
  
  // Listen for training status updates from ModelListTable
  useEffect(() => {
    const handleTrainingStatusUpdate = (event: CustomEvent) => {
      setTrainingStatus(event.detail);
    };
    
    // Add event listener
    window.addEventListener('training-status-update', handleTrainingStatusUpdate as EventListener);
    
    // Cleanup
    return () => {
      window.removeEventListener('training-status-update', handleTrainingStatusUpdate as EventListener);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen p-8 pb-28 sm:pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] relative bg-background">
      <header className="w-full max-w-4xl mx-auto text-center mt-8 sm:mt-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Photomate AI</h1>
        <p className="text-muted-foreground">Create stunning images with AI using simple text prompts or train your own custom model</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-12 z-10 mt-4">
        <Tabs defaultValue="generate" value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-fit mx-auto mb-6">
            <TabsTrigger value="generate" className="px-4">Generate Images</TabsTrigger>
            <TabsTrigger value="train" className="px-4">Train New Model</TabsTrigger>
          </TabsList>
          
          <TabsContent value="generate" className="space-y-4">
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
          </TabsContent>
          
          <TabsContent value="train" className="space-y-8">
            <TrainForm 
              onTrainingStatusChange={setTrainingStatus}
              trainingStatus={trainingStatus}
            />
            <div className="mt-8 pt-8 border-t">
              <h2 className="text-xl font-semibold mb-4">Your Models</h2>
              <ModelListTable 
                newTraining={trainingStatus} 
                onClearNewTraining={clearTrainingStatus}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
}

// Main component that wraps the content in a Suspense boundary
export default function CreatePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <CreatePageContent />
    </Suspense>
  );
} 