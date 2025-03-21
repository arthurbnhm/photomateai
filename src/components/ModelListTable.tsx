import { useState, useEffect, useRef } from "react";
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
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useModels } from "@/hooks/useModels";

// Initialize Supabase client
const supabase = createBrowserSupabaseClient();

interface Training {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  training_id: string;
  is_cancelled?: boolean;
  model_id?: string;
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
  training_status?: string;
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
  const [modelToDelete, setModelToDelete] = useState<Model | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [trainingToCancel, setTrainingToCancel] = useState<{id: string, modelId: string} | null>(null);
  
  // Refs for buttons that triggered the dialogs
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Use our custom hook for models
  const {
    models,
    loading,
    error,
    page,
    totalPages,
    handlePageChange,
    fetchModels,
    isNewTrainingInModels,
    removeModelFromState
  } = useModels(newTraining);
  
  // Clear new training if it's found in models
  useEffect(() => {
    if (newTraining && onClearNewTraining && isNewTrainingInModels()) {
      onClearNewTraining();
    }
  }, [newTraining, onClearNewTraining, isNewTrainingInModels, models]);

  // Focus management for dialogs
  useEffect(() => {
    // Track previous focus state when dialog opens
    if (modelToDelete) {
      // Dialog is opening, save current focused element
      deleteButtonRef.current = document.activeElement as HTMLButtonElement;
    } else if (deleteButtonRef.current) {
      // Focus the button that opened the dialog if it exists
      setTimeout(() => {
        if (deleteButtonRef.current) {
          deleteButtonRef.current.focus();
          deleteButtonRef.current = null;
        }
      }, 0);
    }
  }, [modelToDelete]);

  useEffect(() => {
    if (trainingToCancel) {
      // Dialog is opening, save current focused element
      cancelButtonRef.current = document.activeElement as HTMLButtonElement;
    } else if (cancelButtonRef.current) {
      // Focus the button that opened the dialog if it exists
      setTimeout(() => {
        if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
          cancelButtonRef.current = null;
        }
      }, 0);
    }
  }, [trainingToCancel]);

  // Get the effective status for a model
  const getEffectiveStatus = (model: Model) => {
    // Check if model is valid
    if (!model || Object.keys(model).length === 0) {
      return "";
    }

    // Return the training status if available
    return model.training_status || "";
  };

  // Check if a model has an active training
  const hasActiveTraining = (model: Model) => {
    const status = getEffectiveStatus(model);
    return status === "training" || 
           status === "starting" || 
           status === "queued" || 
           status === "processing";
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
      case "queued":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
      case "succeeded":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            Trained
          </Badge>
        );
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "canceled":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status || "New"}</Badge>;
    }
  };

  // Handle cancelling a training
  const handleCancelTraining = async () => {
    if (!trainingToCancel) return;
    
    setIsCancelling(true);
    try {
      // Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to cancel a training");
        setIsCancelling(false);
        return;
      }
      
      // Get the session for the access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Unable to get authentication token");
        setIsCancelling(false);
        return;
      }
      
      // Make API request to cancel training
      const response = await fetch(`/api/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'cancelTraining',
          trainingId: typeof trainingToCancel === 'string' ? trainingToCancel : trainingToCancel.id,
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
      
      // Remove the model from the list
      removeModelFromState(trainingToCancel.modelId);
      
      toast.success("Training cancelled successfully");
      
      // Force a refresh of the models 
      fetchModels(page, true);
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
      const response = await fetch('/api/model/list', {
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
      
      // Remove the model from the state
      removeModelFromState(modelToDelete.id);
      
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
        onClick={async () => {
          // Check if newTraining exists and has an ID
          if (!newTraining) {
            toast.error("Invalid training data");
            return;
          }
          
          if (newTraining.id) {
            // Get the authenticated user
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                toast.error("You must be logged in to cancel a training");
                return;
              }
              
              // Get the session for the access token
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                toast.error("Unable to get authentication token");
                return;
              }
              
              // Make API request to cancel training
              const response = await fetch(`/api/cancel`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                  action: 'cancelTraining',
                  trainingId: newTraining.id,
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
              
              // Remove the model from the list
              if (newTraining.modelId) {
                removeModelFromState(newTraining.modelId);
              }
              
              toast.success("Training cancelled successfully");
              
              // Force a refresh of the models
              fetchModels(page, true);
            } catch (error) {
              toast.error(`Error: ${error instanceof Error ? error.message : 'Failed to cancel training'}`);
            }
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
      <AlertDialog 
        open={!!trainingToCancel} 
        onOpenChange={(open) => {
          if (!open) {
            // Use setTimeout to ensure we're not updating state during render
            setTimeout(() => setTrainingToCancel(null), 0);
          }
        }}
      >
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
      <AlertDialog 
        open={!!modelToDelete} 
        onOpenChange={(open) => {
          if (!open) {
            // Use setTimeout to ensure we're not updating state during render
            setTimeout(() => setModelToDelete(null), 0);
          }
        }}
      >
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