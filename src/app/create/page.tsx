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

// Separate debug component to avoid nesting components
function DebugInfo() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState('');
  
  useEffect(() => {
    setUrl(window.location.href);
  }, []);
  
  // Only show in development
  if (process.env.NODE_ENV !== 'development') return null;
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/80 text-white p-2 text-xs z-50">
      <div>Current URL: {url}</div>
      <div>Environment: {process.env.NODE_ENV}</div>
      <div>Search Params: {JSON.stringify(Object.fromEntries([...searchParams.entries()]))}</div>
    </div>
  );
}

// Create a client component that uses useSearchParams
function CreatePageContent() {
  // Shared state for pending generations
  const [pendingGenerations, setPendingGenerations] = useState<PendingGeneration[]>([]);
  // State for training status
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);
  // Track the active tab
  const [activeTab, setActiveTab] = useState("generate"); // Always default to generate tab

  // Handle tab change
  const handleTabChange = (tab: string) => {
    console.log("Tab changed to:", tab);
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
        <Tabs 
          value={activeTab} 
          onValueChange={handleTabChange} 
          className="w-full"
          defaultValue="generate" // This is a fallback and should be consistent with the state
        >
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
    <>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
        <CreatePageContent />
      </Suspense>
      <Suspense fallback={null}>
        <DebugInfo />
      </Suspense>
    </>
  );
} 