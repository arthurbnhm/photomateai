import { useState, useEffect, useRef, useCallback } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Trash2, XCircle, User, Sparkles, Clock } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// Initialize Supabase client
const supabase = createSupabaseBrowserClient();

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
  gender?: string;
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

interface ConfirmationState {
  type: 'delete' | 'cancel';
  model?: Model;
  trainingToCancel?: {id: string, modelId: string};
}

export function ModelListTable({ newTraining, onClearNewTraining }: ModelListTableProps = {}) {
  const { user } = useAuth();
  
  // Model data state
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Refs for buttons that triggered the dialogs
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Ref to track if we've done the initial fetch
  const hasInitialFetched = useRef(false);
  const lastNewTrainingId = useRef<string | null>(null);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Data fetching logic
  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = user?.id;
      
      const params = new URLSearchParams();
      if (userId) {
        params.append('user_id', userId);
      }
      
      const url = `/api/model/list?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      
      const data: ModelListResponse = await response.json();
      
      if (data.success) {
        setModels(data.models);
      } else {
        setError(data.error || "Failed to fetch models");
        setModels([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const isNewTrainingInModels = useCallback(() => {
    if (!newTraining || !models.length) return false;
    
    return models.some(model => {
      if (newTraining.modelId && model.id === newTraining.modelId) return true;
      
      if (newTraining.modelName && newTraining.modelOwner) {
        return model.model_id === newTraining.modelName && 
               model.model_owner === newTraining.modelOwner;
      }
      
      return model.trainings.some(training => 
        training.id === newTraining.id || 
        training.training_id === newTraining.id
      );
    });
  }, [newTraining, models]);

  const removeModelFromState = useCallback((modelId: string) => {
    setModels(prevModels => prevModels.filter(model => model.id !== modelId));
  }, []);

  // Effects for data management
  useEffect(() => {
    // Initial fetch on mount
    if (!hasInitialFetched.current) {
      fetchModels();
      hasInitialFetched.current = true;
      if (newTraining) {
        lastNewTrainingId.current = newTraining.id;
      }
      return;
    }
    
    // Fetch only if newTraining changed (different ID or went from null to non-null)
    if (newTraining && newTraining.id !== lastNewTrainingId.current) {
      fetchModels();
      lastNewTrainingId.current = newTraining.id;
    } else if (!newTraining && lastNewTrainingId.current !== null) {
      // newTraining was cleared
      lastNewTrainingId.current = null;
      // Don't refetch in this case as clearing training doesn't require new data
    }
  }, [fetchModels, newTraining]);

  // Clear new training if it's found in models
  useEffect(() => {
    if (newTraining && onClearNewTraining && isNewTrainingInModels()) {
      onClearNewTraining();
    }
  }, [newTraining, onClearNewTraining, isNewTrainingInModels, models]);

  // Focus management for dialogs
  useEffect(() => {
    if (confirmation?.type === 'delete') {
      deleteButtonRef.current = document.activeElement as HTMLButtonElement;
    } else if (deleteButtonRef.current && !confirmation) {
      setTimeout(() => {
        if (deleteButtonRef.current) {
          deleteButtonRef.current.focus();
          deleteButtonRef.current = null;
        }
      }, 0);
    }
  }, [confirmation]);

  useEffect(() => {
    if (confirmation?.type === 'cancel') {
      cancelButtonRef.current = document.activeElement as HTMLButtonElement;
    } else if (cancelButtonRef.current && !confirmation) {
      setTimeout(() => {
        if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
          cancelButtonRef.current = null;
        }
      }, 0);
    }
  }, [confirmation]);

  // Get the effective status for a model
  const getEffectiveStatus = (model: Model) => {
    if (!model || Object.keys(model).length === 0) {
      return "";
    }
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

  // Get the training ID to use for cancellation
  const getTrainingIdForCancellation = (model: Model): string | null => {
    if (!model.trainings || model.trainings.length === 0) {
      return null;
    }
    
    const activeTraining = model.trainings.find(t => 
      t.status === "training" || 
      t.status === "starting" || 
      t.status === "queued"
    );
    
    if (activeTraining?.training_id) {
      return activeTraining.training_id;
    }
    
    if (model.trainings.length === 1) {
      const training = model.trainings[0];
      if (training?.training_id) {
        return training.training_id;
      }
    }
    
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
    
    return null;
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "training":
      case "processing":
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-800">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2"></div>
            Training
          </Badge>
        );
      case "starting":
      case "queued":
        return (
          <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800">
            <Clock className="w-3 h-3 mr-1" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
      case "succeeded":
        return (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800">
            <Sparkles className="w-3 h-3 mr-1" />
            Ready
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-800">
            Failed
          </Badge>
        );
      case "canceled":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-950/20 dark:text-gray-400 dark:border-gray-800">
            Canceled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-800">
            New
          </Badge>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Handle cancelling a training
  const handleCancelTraining = async () => {
    if (!confirmation?.trainingToCancel) return;
    
    setIsCancelling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to cancel a training");
        setIsCancelling(false);
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Unable to get authentication token");
        setIsCancelling(false);
        return;
      }
      
      const response = await fetch(`/api/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'cancelTraining',
          trainingId: confirmation.trainingToCancel.id,
        }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (_parseError) {
        void _parseError;
        throw new Error(`Invalid response from server: ${await response.text()}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel training');
      }
      
      removeModelFromState(confirmation.trainingToCancel.modelId);
      toast.success("Training cancelled successfully");
      fetchModels();
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : 'Failed to cancel training'}`);
    } finally {
      setIsCancelling(false);
      setConfirmation(null);
    }
  };

  const handleDeleteModel = async () => {
    if (!confirmation?.model) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch('/api/model/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'markAsDeleted',
          modelId: confirmation.model.id,
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete model');
      }
      
      removeModelFromState(confirmation.model.id);
      toast.success("Model deleted successfully");
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : 'Failed to delete model'}`);
    } finally {
      setIsDeleting(false);
      setConfirmation(null);
    }
  };

  const handleNewTrainingCancel = async () => {
    if (!newTraining) {
      toast.error("Invalid training data");
      return;
    }
    
    if (newTraining.id) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("You must be logged in to cancel a training");
          return;
        }
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error("Unable to get authentication token");
          return;
        }
        
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
        
        let data;
        try {
          data = await response.json();
        } catch (_parseError) {
          void _parseError;
          throw new Error(`Invalid response from server: ${await response.text()}`);
        }
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to cancel training');
        }
        
        if (newTraining.modelId) {
          removeModelFromState(newTraining.modelId);
        }
        
        toast.success("Training cancelled successfully");
        fetchModels();
      } catch (error) {
        toast.error(`Error: ${error instanceof Error ? error.message : 'Failed to cancel training'}`);
      }
    } else {
      toast.error("Could not find a valid training ID");
    }
  };

  // Loading state
  if (loading && models.length === 0 && !newTraining) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-white dark:bg-gray-950 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50 dark:bg-gray-900/50">
                <TableHead className="font-semibold">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24"></div>
                </TableHead>
                <TableHead className="font-semibold">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16"></div>
                </TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16"></div>
                </TableHead>
                <TableHead className="text-right font-semibold">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16 ml-auto"></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20"></div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 hidden sm:table-cell">
                    <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !newTraining) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20">
        <div className="p-6 text-center">
          <div className="text-red-600 font-medium dark:text-red-400">Error loading models</div>
          <div className="text-red-500 text-sm mt-1 dark:text-red-400">{error}</div>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-3"
            onClick={fetchModels}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const showNewTraining = newTraining && !isNewTrainingInModels();

  return (
    <div className="space-y-4">
      {/* Consistent Table Design for All Devices */}
      <div className="rounded-lg border bg-white dark:bg-gray-950 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50 dark:bg-gray-900/50">
              <TableHead className="font-semibold">Model Name</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">Created</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showNewTraining && (
              <TableRow className="animate-pulse bg-gradient-to-r from-blue-50/30 to-purple-50/30 border-l-4 border-l-blue-400">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="truncate">{newTraining.displayName}</span>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge("training")}</TableCell>
                <TableCell className="text-sm text-gray-500 hidden sm:table-cell">
                  Just now
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                    onClick={handleNewTrainingCancel}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
            
            {models.length === 0 && !showNewTraining ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3 text-gray-500">
                    <Sparkles className="w-8 h-8" />
                    <div>No models found</div>
                    <div className="text-sm">Create your first model above!</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              models.map((model) => {
                const effectiveStatus = getEffectiveStatus(model);
                const showCancel = hasActiveTraining(model);
                
                return (
                  <TableRow key={model.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="truncate">{model.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(effectiveStatus)}</TableCell>
                    <TableCell className="text-sm text-gray-500 hidden sm:table-cell">
                      {formatDate(model.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {showCancel ? (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => {
                            const trainingId = getTrainingIdForCancellation(model);
                            if (trainingId) {
                              setConfirmation({
                                type: 'cancel',
                                trainingToCancel: { id: trainingId, modelId: model.id }
                              });
                            } else {
                              toast.error("Could not find a training ID to cancel");
                            }
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setConfirmation({ type: 'delete', model })}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* iOS-Style Mobile Bottom Sheet */}
      <Sheet open={isMobile && !!confirmation} onOpenChange={(open) => {
        if (!open) setConfirmation(null);
      }}>
        <SheetContent 
          side="bottom" 
          className={cn(
            "rounded-t-[20px] border-t-0 p-0 max-h-[90vh]",
            "bg-white dark:bg-gray-950",
            "shadow-2xl"
          )}
        >
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-6"></div>
          
          <SheetHeader className="text-center pb-6 px-6">
            <SheetTitle className="text-xl font-semibold">
              {confirmation?.type === 'delete' ? 'Delete Model' : 'Cancel Training'}
            </SheetTitle>
            <SheetDescription className="text-base text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
              {confirmation?.type === 'delete' 
                ? "This action will permanently remove the model from your account. This cannot be undone."
                : "This action will stop the training process immediately. This cannot be undone."
              }
            </SheetDescription>
          </SheetHeader>

          <div className="flex justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
              {confirmation?.type === 'delete' ? (
                <Trash2 className="w-8 h-8 text-red-500" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500" />
              )}
            </div>
          </div>

          <SheetFooter className="flex-col gap-3 p-6 pt-0">
            <Button
              onClick={confirmation?.type === 'delete' ? handleDeleteModel : handleCancelTraining}
              disabled={isDeleting || isCancelling}
              variant="destructive"
              className="w-full h-12 text-base font-medium rounded-xl"
            >
              {confirmation?.type === 'delete' 
                ? (isDeleting ? "Deleting..." : "Delete Model")
                : (isCancelling ? "Cancelling..." : "Cancel Training")
              }
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 text-base font-medium rounded-xl border-gray-200 dark:border-gray-700"
              onClick={() => setConfirmation(null)}
              disabled={isDeleting || isCancelling}
            >
              Keep Model
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Desktop Alert Dialogs (unchanged) */}
      <AlertDialog 
        open={!isMobile && confirmation?.type === 'cancel'} 
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Training</AlertDialogTitle>
            <AlertDialogDescription>
              This action will stop the training process. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleCancelTraining} 
              disabled={isCancelling}
              variant="destructive"
            >
              {isCancelling ? "Cancelling..." : "Cancel Training"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog 
        open={!isMobile && confirmation?.type === 'delete'} 
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              This action will mark the model as deleted. It won&apos;t be visible in your model list anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleDeleteModel} 
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting ? "Deleting..." : "Delete Model"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}