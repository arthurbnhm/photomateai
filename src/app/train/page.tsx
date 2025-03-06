"use client";

import { useState, useEffect } from "react";
import { ModelListTable } from "@/components/ModelListTable";
import { TrainForm, TrainingStatus } from "@/components/TrainForm";

export default function TrainPage() {
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);

  // Called when the ModelListTable detects that newTraining is now in the models list
  const clearTrainingStatus = () => {
    setTrainingStatus(null);
  };

  // Handle page-level drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Add global event listeners for drag and drop
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    
    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault();
    };
    
    const handleGlobalDragEnd = () => {
      // Just prevent default behavior
    };
    
    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('dragleave', handleGlobalDragLeave);
    document.addEventListener('dragend', handleGlobalDragEnd);
    
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('dragleave', handleGlobalDragLeave);
      document.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);

  // Use the div as a container to catch drag/drop events
  return (
    <div 
      className="flex flex-col min-h-screen p-8 pb-28 sm:pb-20 gap-8 sm:p-20 bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
    >
      <header className="w-full max-w-4xl mx-auto text-center mt-8 sm:mt-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Train Your Custom Model</h1>
        <p className="text-muted-foreground">Upload your images to create a personalized AI model</p>
      </header>
      
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-8 z-10 mt-4">
        <TrainForm 
          onTrainingStatusChange={setTrainingStatus}
          trainingStatus={trainingStatus}
        />

        {/* Model List Table */}
        <div className="mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Your Models</h2>
          </div>
          <ModelListTable 
            newTraining={trainingStatus} 
            onClearNewTraining={clearTrainingStatus}
          />
        </div>
      </main>
      
      <footer className="w-full max-w-4xl mx-auto text-center text-sm text-muted-foreground pt-4">
        
      </footer>
    </div>
  );
} 