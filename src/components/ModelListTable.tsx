import { useState, useEffect, useCallback, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, XCircle } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Training {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  training_id: string;
  is_cancelled?: boolean;
}

interface Model {
  id: string;
  model_id: string;
  model_owner: string;
  display_name: string;
  status: string;
  created_at: string;
  trainings: Training[];
  training_id?: string;
  is_cancelled?: boolean;
}

interface ModelListResponse {
  success: boolean;
  models: Model[];
  error?: string;
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

interface NewTraining {
  id: string;
  status: string;
  url: string;
  modelId?: string;
  modelName?: string;
  modelOwner?: string;
  displayName?: string;
}

interface ModelListTableProps {
  newTraining?: NewTraining | null;
  onClearNewTraining?: () => void;
}

export function ModelListTable({ newTraining, onClearNewTraining }: ModelListTableProps = {}) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modelToDelete, setModelToDelete] = useState<Model | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [trainingToCancel, setTrainingToCancel] = useState<{id: string, modelId: string} | null>(null);
  const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check if newTraining is already in models list
  const isNewTrainingInModels = useCallback(() => {
    if (!newTraining || !models.length) return false;
    
    return models.some(model => {
      // Check for model ID match
      if (newTraining.modelId && model.id === newTraining.modelId) return true;
      
      // Check for name/owner match if modelId isn't available
      if (newTraining.modelName && newTraining.modelOwner) {
        return model.model_id === newTraining.modelName && 
               model.model_owner === newTraining.modelOwner;
      }
      
      // Check for training ID match in any model's trainings
      return model.trainings.some(training => 
        training.id === newTraining.id || 
        training.training_id === newTraining.id
      );
    });
  }, [newTraining, models]);

  // Memoize the fetch function to prevent it from changing on every render
  const fetchModels = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const startTime = Date.now();
      void startTime; // Explicitly indicate we're ignoring this variable
      const response = await fetch(`/api/model-list?page=${pageNum}&limit=5`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      
      const data: ModelListResponse = await response.json();
      
      if (data.success) {
        setModels(data.models);
        setTotalPages(data.pagination.pages);
      } else {
        setError(data.error || "Failed to fetch models");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  // Immediate fetch function without debouncing for critical updates
  const fetchModelsImmediate = useCallback((pageNum = 1) => {
    fetchModels(pageNum);
  }, [fetchModels]);

  // Debounced version with minimal delay for non-critical updates
  const debouncedFetchModels = useCallback((pageNum = 1) => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      fetchModels(pageNum);
    }, 100); // Reduced from 300ms to 100ms for faster updates
  }, [fetchModels]);

  // Initial fetch only once on mount
  useEffect(() => {
    fetchModels(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Handle page changes
  useEffect(() => {
    if (page > 1) {
      fetchModels(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Check if newTraining is in models and clear it if needed
  useEffect(() => {
    // Skip if no newTraining or no onClearNewTraining callback
    if (!newTraining || !onClearNewTraining) return;
    
    // Check if the training is in the models list
    const trainingInModels = isNewTrainingInModels();
    if (trainingInModels) {
      onClearNewTraining();
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, newTraining?.id]);
  
  // Setup Supabase realtime subscription for trainings - only once
  useEffect(() => {
    // Only setup the subscription once
    if (realtimeSubscribed) return;
    
    try {
      // Subscribe to changes in the trainings table - monitor ALL status changes
      const trainingSubscription = supabase
        .channel('trainings-changes')
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any, 
          { 
            event: '*', 
            schema: 'public', 
            table: 'trainings' 
          }, 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            // Process ALL status changes to ensure we catch everything
            if (payload?.new?.status) {
              const status = payload.new.status;
              const trainingId = payload.new.training_id;
              const modelId = payload.new.model_id;
              
              // Simple approach: directly update the models state for immediate UI refresh
              if (modelId) {
                // Use React 18's flushSync to ensure immediate update
                // This forces React to update the state immediately without batching
                setModels(prevModels => {
                  return prevModels.map(model => {
                    // Check if this is the model that needs updating
                    if (model.id === modelId) {
                      // Update the training in the model's trainings array
                      const updatedTrainings = model.trainings.map(training => {
                        if (training.training_id === trainingId) {
                          return {
                            ...training,
                            status: status,
                            completed_at: status === 'succeeded' ? new Date().toISOString() : training.completed_at
                          };
                        }
                        return training;
                      });
                      
                      // Simple status update logic:
                      // If training succeeded, model is trained
                      // If training is active, model is training
                      // Otherwise keep current status
                      let newModelStatus = model.status;
                      if (status === 'succeeded') {
                        newModelStatus = 'trained';
                      } else if (['training', 'processing', 'starting', 'queued'].includes(status)) {
                        newModelStatus = 'training';
                      }
                      
                      return {
                        ...model,
                        trainings: updatedTrainings,
                        status: newModelStatus
                      };
                    }
                    return model;
                  });
                });
                
                // For critical status changes, fetch immediately to ensure we have the latest data
                if (status === 'succeeded') {
                  // No timeout - fetch immediately
                  fetchModelsImmediate(page);
                }
              }
              
              // If this is a newTraining and it's completed, clear it immediately
              if (newTraining && onClearNewTraining && status === 'succeeded') {
                onClearNewTraining();
              }
            }
          }
        )
        .subscribe((_status) => {
          void _status; // Explicitly indicate we're ignoring this variable
        });
      
      // Also subscribe to changes in the models table
      const modelSubscription = supabase
        .channel('models-changes')
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any, 
          { 
            event: '*', 
            schema: 'public', 
            table: 'models' 
          }, 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            // Process model status changes
            if (payload?.new?.status) {
              const status = payload.new.status;
              const modelId = payload.new.id;
              
              // Directly update the model in state for immediate UI refresh
              if (modelId) {
                setModels(prevModels => {
                  return prevModels.map(model => 
                    model.id === modelId ? { ...model, ...payload.new } : model
                  );
                });
                
                // For trained status, fetch immediately
                if (status === 'trained') {
                  fetchModelsImmediate(page);
                }
              }
            }
          }
        )
        .subscribe((_status) => {
          void _status; // Explicitly indicate we're ignoring this variable
        });
      
      // Set up a periodic refresh to ensure data consistency, but with longer interval
      const refreshInterval = setInterval(() => {
        debouncedFetchModels(page);
      }, 60000); // Refresh every 60 seconds (reduced frequency)
      
      setRealtimeSubscribed(true);
      
      // Cleanup function
      return () => {
        trainingSubscription.unsubscribe();
        modelSubscription.unsubscribe();
        clearInterval(refreshInterval);
        setRealtimeSubscribed(false);
        
        // Clear any pending timeouts
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = null;
        }
      };
    } catch (_error) {
      void _error; // Explicitly indicate we're ignoring this variable
      // Fallback to periodic polling
      const intervalId = setInterval(() => {
        fetchModels(page);
      }, 5000);
      
      return () => {
        clearInterval(intervalId);
        setRealtimeSubscribed(false);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual refresh when newTraining changes (with debounce)
  useEffect(() => {
    if (!newTraining) return;
    
    const timer = setTimeout(() => {
      fetchModels(page);
    }, 2000);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTraining?.id, newTraining?.status]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  // Get the effective status for a model considering its trainings
  const getEffectiveStatus = (model: Model) => {
    // Check if model is valid
    if (!model || Object.keys(model).length === 0) {
      return "";
    }

    // Simple approach: if model status is "trained", show as trained
    if (model.status === "trained") {
      return "trained";
    }

    // If any training has succeeded, show as trained
    if (model.trainings && model.trainings.some(t => t.status === "succeeded")) {
      return "trained";
    }

    // If any training is active, show as training
    if (model.trainings && model.trainings.some(t => 
      t.status === "training" || 
      t.status === "starting" || 
      t.status === "queued" ||
      t.status === "processing"
    )) {
      return "training";
    }

    // Otherwise, use the model's own status
    return model.status;
  };

  // Check if a model has an active training
  const hasActiveTraining = (model: Model) => {
    return getEffectiveStatus(model) === "training";
  };

  // Determine if we should show the cancel button for a model
  const shouldShowCancelButton = (model: Model): boolean => {
    // Check if model is valid
    if (!model || Object.keys(model).length === 0) {
      return false;
    }
    return hasActiveTraining(model);
  };

  // Get the training ID to use for cancellation
  const getTrainingIdForCancellation = (model: Model): string | null => {
    // Look for trainings in the trainings array
    if (!model.trainings || model.trainings.length === 0) {
      return null;
    }
    
    // First try to find an active training
    const activeTraining = model.trainings.find(t => 
      t.status === "training" || 
      t.status === "starting" || 
      t.status === "queued"
    );
    
    if (activeTraining?.training_id) {
      return activeTraining.training_id;
    }
    
    // Otherwise use the most recent training - avoid expensive sort if possible
    if (model.trainings.length === 1) {
      const training = model.trainings[0];
      if (training?.training_id) {
        return training.training_id;
      }
    }
    
    // Find most recent training by created_at date
    let mostRecent = model.trainings[0];
    let mostRecentTime = new Date(mostRecent.created_at).getTime();
    
    for (let i = 1; i < model.trainings.length; i++) {
      const training = model.trainings[i];
      const time = new Date(training.created_at).getTime();
      if (time > mostRecentTime) {
        mostRecent = training;
        mostRecentTime = time;
      }
    }
    
    if (mostRecent?.training_id) {
      return mostRecent.training_id;
    }
    
    // No valid training ID found
    return null;
  };

  // Render the cancel button for a model
  const renderCancelButton = (model: Model) => {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
        onClick={() => {
          // Check if model is empty or invalid
          if (!model || !model.id || Object.keys(model).length === 0) {
            toast.error("Invalid model data");
            return;
          }
          
          const trainingId = getTrainingIdForCancellation(model);
          if (trainingId) {
            setTrainingToCancel({
              id: trainingId,
              modelId: model.id
            });
          } else {
            toast.error("Could not find a training ID to cancel");
          }
        }}
      >
        <XCircle className="h-4 w-4" />
        <span className="sr-only">Cancel</span>
      </Button>
    );
  };

  // Render the delete button for a model
  const renderDeleteButton = (model: Model) => {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setModelToDelete(model)}
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Delete</span>
      </Button>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "training":
      case "processing":
      case "starting":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
            Training
          </Badge>
        );
      case "trained":
      case "succeeded":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            Trained
          </Badge>
        );
      case "training_failed":
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "canceled":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Handle cancelling a training
  const handleCancelTraining = async () => {
    if (!trainingToCancel) return;
    
    setIsCancelling(true);
    try {
      const response = await fetch('/api/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cancel',
          trainingId: trainingToCancel.id,
        }),
      });
      
      // Try to parse as JSON
      let data;
      try {
        data = await response.json();
      } catch (_parseError) {
        void _parseError; // Explicitly indicate we're ignoring this variable
        throw new Error(`Invalid response from server: ${await response.text()}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel training');
      }
      
      // Instead of updating the model status, just remove the model from the list
      setModels(models.filter(model => model.id !== trainingToCancel.modelId));
      
      toast.success("Training cancelled successfully");
      
      // Force a refresh of the models after a short delay
      setTimeout(() => {
        fetchModels(page);
      }, 1000);
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : 'Failed to cancel training'}`);
    } finally {
      setIsCancelling(false);
      setTrainingToCancel(null);
    }
  };

  /**
   * Handles deleting a model
   */
  const handleDeleteModel = async () => {
    if (!modelToDelete) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch('/api/model-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'markAsDeleted',
          modelId: modelToDelete.id,
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete model');
      }
      
      // Remove the model from the local state
      setModels(models.filter(model => model.id !== modelToDelete.id));
      toast.success("Model marked as deleted successfully");
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : 'Failed to delete model'}`);
    } finally {
      setIsDeleting(false);
      setModelToDelete(null);
    }
  };

  // Render the cancel button for a new training
  const renderNewTrainingCancelButton = () => {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
        onClick={() => {
          // Check if newTraining exists and has an ID
          if (!newTraining) {
            toast.error("Invalid training data");
            return;
          }
          
          if (newTraining.id) {
            setTrainingToCancel({
              id: newTraining.id,
              modelId: newTraining.modelId || ''
            });
          } else {
            toast.error("Could not find a valid training ID");
          }
        }}
      >
        <XCircle className="h-4 w-4" />
        <span className="sr-only">Cancel</span>
      </Button>
    );
  };

  if (loading && models.length === 0 && !newTraining) {
    return <div className="text-center py-8">Loading models...</div>;
  }

  if (error && !newTraining) {
    return <div className="text-center py-8 text-red-500">Error: {error}</div>;
  }

  const showNewTraining = newTraining && !isNewTrainingInModels();

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Show the new training at the top if available and not a duplicate */}
          {showNewTraining && (
            <TableRow className="animate-pulse bg-muted/20">
              <TableCell className="font-medium">
                {newTraining.displayName}
              </TableCell>
              <TableCell>
                {getStatusBadge("training")}
              </TableCell>
              <TableCell className="text-right space-x-2">
                {renderNewTrainingCancelButton()}
              </TableCell>
            </TableRow>
          )}
          
          {models.length === 0 && !showNewTraining ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center">
                No models found. Create your first model above!
              </TableCell>
            </TableRow>
          ) : (
            models.map((model) => {
              const effectiveStatus = getEffectiveStatus(model);
              
              return (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">
                    {model.display_name}
                  </TableCell>
                  <TableCell>{getStatusBadge(effectiveStatus)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {shouldShowCancelButton(model) ? (
                      renderCancelButton(model)
                    ) : (
                      renderDeleteButton(model)
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="py-2 px-3">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {/* Alert dialog for cancelling training */}
      <AlertDialog open={!!trainingToCancel} onOpenChange={(open) => !open && setTrainingToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to cancel this training?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will stop the training process. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleCancelTraining} 
              disabled={isCancelling}
              variant="outline"
              className="border-red-200 bg-white text-red-500 hover:bg-red-50 hover:text-red-600 dark:border-red-800 dark:bg-background dark:hover:bg-red-950/20"
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel Training"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Alert dialog for deleting model */}
      <AlertDialog open={!!modelToDelete} onOpenChange={(open) => !open && setModelToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this model?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will mark the model as deleted. It won&apos;t be visible in your model list anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleDeleteModel} 
              disabled={isDeleting}
              variant="outline"
              className="border-red-200 bg-white text-red-500 hover:bg-red-50 hover:text-red-600 dark:border-red-800 dark:bg-background dark:hover:bg-red-950/20"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}