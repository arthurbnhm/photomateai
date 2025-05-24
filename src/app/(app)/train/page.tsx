"use client"

import { useState, useEffect, Suspense } from "react";
import { TrainForm, TrainingStatus } from "@/components/TrainForm";
import { TrainingInProgressOverlay } from "@/components/TrainingInProgressOverlay";
import { AnimatedTrainingImages } from "@/components/AnimatedTrainingImages";
import { toast } from "sonner";

const ACTIVE_TRAINING_DETAILS_KEY = 'photomate_activeTrainingDetails';

// --- Debug Configuration ---
// DEBUG_SHOW_DEFAULT_OVERLAY, MOCK_DEBUG_TRAINING_STATUS_ID, and MOCK_DEBUG_TRAINING_STATUS removed
// --- End Debug Configuration ---

function TrainPageContent() {
  const [activeTraining, setActiveTraining] = useState<TrainingStatus | null>(null); // Initialized to null
  const [isLoadingPersistentTraining, setIsLoadingPersistentTraining] = useState(true);
  const [internalTrainingStatus, setInternalTrainingStatus] = useState<TrainingStatus | null>(null); // Initialized to null
  const [hasModelsRemaining, setHasModelsRemaining] = useState<boolean>(true); // Track if user has models remaining

  useEffect(() => {
    const storedDetailsStr = localStorage.getItem(ACTIVE_TRAINING_DETAILS_KEY);
    if (storedDetailsStr) {
      try {
        const storedDetails: TrainingStatus = JSON.parse(storedDetailsStr);
        const isActive = ["training", "processing", "starting", "queued"].includes(storedDetails.status.toLowerCase());
        if (isActive) {
          setActiveTraining(storedDetails);
          setInternalTrainingStatus(storedDetails);
        } else {
          localStorage.removeItem(ACTIVE_TRAINING_DETAILS_KEY);
          // Ensure states are null if stored training is not active
          setActiveTraining(null);
          setInternalTrainingStatus(null);
        }
      } catch (e) {
        console.error("Failed to parse active training details from localStorage", e);
        localStorage.removeItem(ACTIVE_TRAINING_DETAILS_KEY);
        setActiveTraining(null);
        setInternalTrainingStatus(null);
      }
    } else {
      // Ensure states are null if nothing in localStorage
      setActiveTraining(null);
      setInternalTrainingStatus(null);
    }
    setIsLoadingPersistentTraining(false);
  }, []); // Empty dependency array, runs once on mount

  const handleTrainingFormStatusChange = (newStatus: TrainingStatus | null) => {
    setActiveTraining(newStatus);
    setInternalTrainingStatus(newStatus); // Keep internal status in sync

    if (newStatus) {
      localStorage.setItem(ACTIVE_TRAINING_DETAILS_KEY, JSON.stringify(newStatus));
    } else {
      // If newStatus is null, it means training concluded or was cleared.
      // Polling logic or event listener should have already handled removing from localStorage
      // for real trainings. This 'else' can be a safeguard or for explicit clears.
      // However, to prevent premature removal if ModelListTable clears it,
      // we rely on polling to remove for terminal states.
      // If newStatus is null because TrainForm itself initiated a "clear" (e.g. debug cancel),
      // then it's okay, but real trainings should be handled by polling.
      // For now, let's assume null means we should reflect that, and polling handles storage for active ones.
    }
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const pollStatus = async () => {
      if (activeTraining && activeTraining.id && ["training", "processing", "starting", "queued"].includes(activeTraining.status.toLowerCase())) {
        try {
          const response = await fetch(`/api/training/status?id=${activeTraining.id}`);
          if (!response.ok) {
            if (response.status === 404) {
              toast.info(`Training for "${activeTraining.displayName || activeTraining.modelName}" concluded or not found.`);
              setActiveTraining(null);
              setInternalTrainingStatus(null);
              localStorage.removeItem(ACTIVE_TRAINING_DETAILS_KEY);
              if (intervalId) clearInterval(intervalId);
            }
            return;
          }
          const statusData = await response.json(); 

          if (statusData.id === activeTraining.id) { // Check if the status update is for the current active training
            if (activeTraining.status !== statusData.status) { // Only update if status has changed
                const updatedActiveTraining = { ...activeTraining, status: statusData.status };
                setActiveTraining(updatedActiveTraining);
                setInternalTrainingStatus(updatedActiveTraining); 
                localStorage.setItem(ACTIVE_TRAINING_DETAILS_KEY, JSON.stringify(updatedActiveTraining));
            }

            const isTerminal = ["succeeded", "failed", "canceled"].includes(statusData.status.toLowerCase());
            if (isTerminal) {
              toast.success(`Training for "${activeTraining.displayName || activeTraining.modelName}" ${statusData.status}.`);
              setActiveTraining(null);
              setInternalTrainingStatus(null); 
              localStorage.removeItem(ACTIVE_TRAINING_DETAILS_KEY);
              if (intervalId) clearInterval(intervalId);
            }
          }
        } catch (error) {
          console.error("Error polling training status:", error);
          // Optionally, you might want to stop polling on repeated errors
        }
      }
    };

    if (activeTraining && ["training", "processing", "starting", "queued"].includes(activeTraining.status.toLowerCase())) {
      pollStatus(); 
      intervalId = setInterval(pollStatus, 7000); 
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeTraining]);

  useEffect(() => {
    const handleGenericTrainingStatusUpdate = (event: CustomEvent<TrainingStatus>) => {
        const detail = event.detail;
        // No longer need to check for MOCK_DEBUG_TRAINING_STATUS

        if (detail && (detail.id !== internalTrainingStatus?.id || detail.status !== internalTrainingStatus?.status)) {
            setInternalTrainingStatus(detail);
        }

        if (activeTraining && detail && detail.id === activeTraining.id) {
            if (activeTraining.status !== detail.status) {
                const updatedStatus = { ...activeTraining, status: detail.status };
                setActiveTraining(updatedStatus);
                localStorage.setItem(ACTIVE_TRAINING_DETAILS_KEY, JSON.stringify(updatedStatus));
            }

            const isTerminal = ["succeeded", "failed", "canceled"].includes(detail.status.toLowerCase());
            if (isTerminal) {
                setActiveTraining(null); // Clear active training
                localStorage.removeItem(ACTIVE_TRAINING_DETAILS_KEY);
            }
        } else if (!activeTraining && detail && ["succeeded", "failed", "canceled"].includes(detail.status.toLowerCase())) {
            // If there's no activeTraining (e.g. page reloaded after completion)
            // but we get a terminal update for a model that might have been active,
            // ensure internalTrainingStatus reflects this for ModelListTable.
            setInternalTrainingStatus(detail);
        }
    };
    
    window.addEventListener('training-status-update', handleGenericTrainingStatusUpdate as EventListener);
    return () => {
      window.removeEventListener('training-status-update', handleGenericTrainingStatusUpdate as EventListener);
    };
  }, [activeTraining, internalTrainingStatus]); // Added internalTrainingStatus dependency

  if (isLoadingPersistentTraining) {
    return <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading training status...</div>;
  }

  // Use local variable for clarity in JSX, `activeTraining` state is the source of truth
  const currentDisplayTraining = activeTraining;

  const showOverlay =
    currentDisplayTraining &&
    ["training", "processing", "starting", "queued"].includes(
      currentDisplayTraining.status.toLowerCase()
    );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 relative min-h-[60vh]">
      {showOverlay && <TrainingInProgressOverlay />}
      
      {!showOverlay && hasModelsRemaining && (
        <div className="mb-8"> {/* Wrapper for the animated images when form is visible */}
          <AnimatedTrainingImages />
        </div>
      )}

      <div style={{ visibility: showOverlay ? 'hidden' : 'visible', height: showOverlay ? '0px' : 'auto', overflow: showOverlay ? 'hidden': 'visible' }}>
        <TrainForm
          onTrainingStatusChange={handleTrainingFormStatusChange}
          trainingStatus={internalTrainingStatus}
          onModelsRemainingChange={setHasModelsRemaining}
        />
      </div>
    </div>
  );
}

export default function TrainPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4 sm:p-8 md:p-12 text-center">Loading...</div>}>      <TrainPageContent />
    </Suspense>
  );
} 