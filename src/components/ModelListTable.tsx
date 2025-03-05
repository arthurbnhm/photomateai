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
import { formatDistanceToNow } from "date-fns";
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
import { Trash2, Loader2, XCircle } from "lucide-react";

interface Training {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  replicate_training_id: string;
  is_cancelled?: boolean;
}

interface Model {
  id: string;
  replicate_name: string;
  replicate_owner: string;
  status: string;
  created_at: string;
  trainings: Training[];
  replicate_training_id?: string;
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
  const [pollingCount, setPollingCount] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check if newTraining is already in models list
  const isNewTrainingInModels = () => {
    if (!newTraining || !models.length) return false;
    
    return models.some(model => {
      // Check for model ID match
      if (newTraining.modelId && model.id === newTraining.modelId) return true;
      
      // Check for name/owner match if modelId isn't available
      if (newTraining.modelName && newTraining.modelOwner) {
        return model.replicate_name === newTraining.modelName && 
               model.replicate_owner === newTraining.modelOwner;
      }
      
      // Check for training ID match in any model's trainings
      return model.trainings.some(training => 
        training.id === newTraining.id || 
        training.replicate_training_id === newTraining.id
      );
    });
  };

  const fetchModels = async (pageNum = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/model-list?page=${pageNum}&limit=5`);
      if (!response.ok) {
        throw new Error("Failed to fetch models");
      }
      
      const data: ModelListResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch models");
      }
      
      setModels(data.models);
      setTotalPages(data.pagination.pages);
      setPage(data.pagination.page);
      
      // If newTraining is now in models list, clear it
      if (newTraining && data.models.some(model => {
        // Check if any model matches the newTraining
        if (newTraining.modelId && model.id === newTraining.modelId) return true;
        if (newTraining.modelName && model.replicate_name === newTraining.modelName && 
            newTraining.modelOwner && model.replicate_owner === newTraining.modelOwner) return true;
        return model.trainings.some(t => t.id === newTraining.id || t.replicate_training_id === newTraining.id);
      })) {
        onClearNewTraining?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching models:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchModels();
  }, []);
  
  // Setup polling for updates (especially for webhook updates)
  useEffect(() => {
    // Poll every minute regardless of state
    const pollInterval = 60000; // 1 minute
    
    // Clear existing timer
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
    
    // Set up new timer
    pollTimerRef.current = setTimeout(() => {
      fetchModels(page);
      setPollingCount(prev => prev + 1);
    }, pollInterval);
    
    // Cleanup
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [models, newTraining, pollingCount, page]);
  
  // When newTraining changes, reset polling count to ensure frequent updates
  useEffect(() => {
    if (newTraining) {
      setPollingCount(0);
    }
  }, [newTraining]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchModels(newPage);
    }
  };

  // Check if a model has an active training
  const hasActiveTraining = (model: Model) => {
    // First check if the model itself is in training status
    if (model.status === "training" || model.status === "created") return true;
    
    // Then check if any of its trainings are in an active state
    return model.trainings.some(t => 
      t.status === "training" || 
      t.status === "starting" || 
      t.status === "created" || 
      t.status === "queued"
    );
  };
  
  // Get the effective status for a model considering its trainings
  const getEffectiveStatus = (model: Model) => {
    // If model has active trainings, it should be shown as "training"
    if (hasActiveTraining(model)) {
      return "training";
    }
    
    // Otherwise, use the model's own status
    return model.status;
  };

  // Determine if we should show the cancel button for a model
  const shouldShowCancelButton = (model: Model): boolean => {
    return hasActiveTraining(model);
  };

  // Get the training ID to use for cancellation
  const getTrainingIdForCancellation = (model: Model): string | null => {
    // 1. Check if model has a direct replicate_training_id
    if (model.replicate_training_id) {
      return model.replicate_training_id;
    }
    
    // 2. Look for active trainings in the trainings array
    if (model.trainings && model.trainings.length > 0) {
      // First try to find an active training
      const activeTraining = model.trainings.find(t => 
        t.status === "training" || 
        t.status === "starting" || 
        t.status === "created" || 
        t.status === "queued"
      );
      
      if (activeTraining?.replicate_training_id) {
        return activeTraining.replicate_training_id;
      }
      
      // Otherwise use the most recent training
      const mostRecentTraining = [...model.trainings].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      
      if (mostRecentTraining?.replicate_training_id) {
        return mostRecentTraining.replicate_training_id;
      }
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
          const trainingId = getTrainingIdForCancellation(model);
          if (trainingId) {
            console.log('Using training ID for cancellation:', trainingId);
            setTrainingToCancel({
              id: trainingId,
              modelId: model.id
            });
          } else {
            console.error('Could not find any training ID to cancel for model:', model);
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
    switch (status) {
      case "created":
        // Treat 'created' status as 'training' for display purposes
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Training
        </Badge>;
      case "training":
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Training
        </Badge>;
      case "trained":
        return <Badge className="bg-green-500 hover:bg-green-600">Trained</Badge>;
      case "training_failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Handle cancelling a training
  const handleCancelTraining = async () => {
    if (!trainingToCancel) return;
    
    setIsCancelling(true);
    try {
      console.log('Attempting to cancel training with ID:', trainingToCancel.id);
      
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
      
      // Get the raw text first to help debug
      const responseText = await response.text();
      console.log('Raw API response:', responseText);
      
      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        throw new Error(`Invalid response from server: ${responseText}`);
      }
      
      console.log('Cancel training response:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel training');
      }
      
      // Update the local state to reflect the cancellation
      setModels(models.map(model => {
        if (model.id === trainingToCancel.modelId) {
          return {
            ...model,
            status: model.status === 'training' ? 'training_failed' : model.status,
            is_cancelled: true,
            trainings: model.trainings.map(t => {
              if (t.replicate_training_id === trainingToCancel.id) {
                return { ...t, status: 'canceled', is_cancelled: true };
              }
              return t;
            })
          };
        }
        return model;
      }));
      
      toast.success("Training cancelled successfully");
      
      // Force a refresh of the models after a short delay
      setTimeout(() => {
        fetchModels(page);
      }, 1000);
    } catch (err) {
      console.error("Error cancelling training:", err);
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
      console.error("Error deleting model:", err);
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
          if (newTraining?.id) {
            console.log('Using newTraining.id for cancellation:', newTraining.id);
            setTrainingToCancel({
              id: newTraining.id,
              modelId: newTraining.modelId || ''
            });
          } else {
            console.error('New training has no ID:', newTraining);
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
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Show the new training at the top if available and not a duplicate */}
          {showNewTraining && (
            <TableRow className="animate-pulse bg-muted/20">
              <TableCell className="font-medium">
                {newTraining.modelOwner || 'arthurbnhm'}/{newTraining.modelName || '...'}
              </TableCell>
              <TableCell>
                {getStatusBadge("training")}
              </TableCell>
              <TableCell>
                Just now
              </TableCell>
              <TableCell className="text-right space-x-2">
                {renderNewTrainingCancelButton()}
              </TableCell>
            </TableRow>
          )}
          
          {models.length === 0 && !showNewTraining ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center">
                No models found. Create your first model above!
              </TableCell>
            </TableRow>
          ) : (
            models.map((model) => {
              const effectiveStatus = getEffectiveStatus(model);
              
              return (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">
                    {model.replicate_owner}/{model.replicate_name}
                  </TableCell>
                  <TableCell>{getStatusBadge(effectiveStatus)}</TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(model.created_at), { addSuffix: true })}
                  </TableCell>
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