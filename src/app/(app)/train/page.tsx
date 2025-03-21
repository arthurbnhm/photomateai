"use client"

import { useState, useEffect, Suspense } from "react";
import { TrainForm, TrainingStatus } from "@/components/TrainForm";

// Create a client component for the Train page content
function TrainPageContent() {
  // State for training status
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);

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
      <TrainForm
        onTrainingStatusChange={setTrainingStatus}
        trainingStatus={trainingStatus}
      />
    </div>
  );
}

export default function TrainPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading...</div>}>
      <TrainPageContent />
    </Suspense>
  );
} 