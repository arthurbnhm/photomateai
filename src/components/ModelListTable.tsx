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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Trash2, XCircle, User, Sparkles, Clock, Edit3, Plus, X, Tag, ChevronDown } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

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
  attributes?: string[];
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
  // Removed unused user destructuring since we're relying on RLS policies
  
  // Model data state
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Attributes editing state
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [isAttributesDialogOpen, setIsAttributesDialogOpen] = useState(false);
  const [newAttribute, setNewAttribute] = useState("");
  const [editingAttributes, setEditingAttributes] = useState<string[]>([]);
  const [isSavingAttributes, setIsSavingAttributes] = useState(false);
  
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
      const response = await fetch('/api/model/list');
      
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
  }, []);

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

  // Attributes management functions
  const handleEditAttributes = (model: Model) => {
    setEditingModel(model);
    setEditingAttributes(model.attributes || []);
    setIsAttributesDialogOpen(true);
    setNewAttribute("");
  };

  const handleAddAttribute = () => {
    const trimmedAttribute = newAttribute.trim();
    if (trimmedAttribute && !editingAttributes.includes(trimmedAttribute)) {
      setEditingAttributes(prev => [...prev, trimmedAttribute]);
      setNewAttribute("");
    }
  };

  const handleRemoveAttribute = (attributeToRemove: string) => {
    setEditingAttributes(prev => prev.filter(attr => attr !== attributeToRemove));
  };

  const handleSaveAttributes = async () => {
    if (!editingModel) return;
    
    setIsSavingAttributes(true);
    try {
      const response = await fetch('/api/model/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'updateAttributes',
          modelId: editingModel.id,
          attributes: editingAttributes,
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to update attributes');
      }
      
      // Update the model in the local state
      setModels(prevModels => 
        prevModels.map(model => 
          model.id === editingModel.id 
            ? { ...model, attributes: editingAttributes }
            : model
        )
      );
      
      toast.success("Model attributes updated successfully");
      setIsAttributesDialogOpen(false);
      setEditingModel(null);
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : 'Failed to update attributes'}`);
    } finally {
      setIsSavingAttributes(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "training":
      case "processing":
        return (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2"></div>
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
          <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
            Failed
          </Badge>
        );
      case "canceled":
        return (
          <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted">
            Canceled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
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
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">
                  <div className="h-4 bg-muted rounded animate-pulse w-24"></div>
                </TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">
                  <div className="h-4 bg-muted rounded animate-pulse w-20"></div>
                </TableHead>
                <TableHead className="font-semibold">
                  <div className="h-4 bg-muted rounded animate-pulse w-16"></div>
                </TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">
                  <div className="h-4 bg-muted rounded animate-pulse w-16"></div>
                </TableHead>
                <TableHead className="text-right font-semibold">
                  <div className="h-4 bg-muted rounded animate-pulse w-16 ml-auto"></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-4 bg-muted rounded animate-pulse w-20"></div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex gap-1">
                      <div className="h-5 w-12 bg-muted rounded animate-pulse"></div>
                      <div className="h-5 w-16 bg-muted rounded animate-pulse"></div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="h-6 w-16 bg-muted rounded-full animate-pulse"></div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                    <div className="h-3 w-12 bg-muted rounded animate-pulse"></div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                      <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
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
      <div className="rounded-lg border border-destructive/20 bg-destructive/5">
        <div className="p-6 text-center">
          <div className="text-destructive font-medium">Error loading models</div>
          <div className="text-destructive/80 text-sm mt-1">{error}</div>
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
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Model Name</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">
                <div className="flex items-center gap-2">
                  Attributes
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">
                    BETA
                  </Badge>
                </div>
              </TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">Created</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showNewTraining && (
              <TableRow className="animate-pulse bg-gradient-to-r from-primary/5 to-primary/10 border-l-4 border-l-primary">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{newTraining.displayName}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="text-xs text-muted-foreground">No attributes yet</div>
                </TableCell>
                <TableCell>{getStatusBadge("training")}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                  Just now
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleNewTrainingCancel}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
            
            {models.length === 0 && !showNewTraining ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
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
                const canEditAttributes = effectiveStatus === "succeeded";
                
                return (
                  <TableRow key={model.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{model.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {model.attributes && model.attributes.length > 0 ? (
                          <>
                            {model.attributes.slice(0, 2).map((attr, index) => (
                              <Badge 
                                key={index} 
                                variant="outline" 
                                className="text-xs bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                              >
                                {attr}
                              </Badge>
                            ))}
                            {model.attributes.length > 2 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs bg-muted/50 text-muted-foreground"
                                title={`All attributes: ${model.attributes.join(', ')}`}
                              >
                                +{model.attributes.length - 2} more
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(effectiveStatus)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                      {formatDate(model.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canEditAttributes && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10"
                            onClick={() => handleEditAttributes(model)}
                            title="Edit attributes"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}
                        {showCancel ? (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Attributes Editing Dialog */}
      <Dialog open={!isMobile && isAttributesDialogOpen} onOpenChange={setIsAttributesDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              Model Attributes
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">
                BETA
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Add details that help your model remember what makes your subject unique.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5">
            {/* Compact Explanation */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-between p-3 h-auto bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg"
                >
                  <div className="flex items-center gap-2 text-left">
                    <span className="text-primary">💡</span>
                    <div>
                      <div className="text-sm font-medium text-primary">
                        What works best for attributes?
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Click to see some helpful tips
                      </div>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-primary" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <div className="text-xs text-foreground space-y-1.5">
                    <p><strong>✨ Great for:</strong> Things that were actually in your training photos</p>
                    <p className="ml-4 text-muted-foreground">• Unique tattoos or markings</p>
                    <p className="ml-4 text-muted-foreground">• Eye color, hair color, distinctive features</p>
                    <p><strong>💭 Keep in mind:</strong> New things not in your photos might be less consistent</p>
                    <p><strong>💡 Pro tip:</strong> For completely new elements, try adding them to your prompts instead!</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            {/* Current Attributes */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Attributes for {editingModel?.display_name}:</label>
              <div className="flex flex-wrap gap-2 min-h-[3rem] p-3 border rounded-lg bg-muted/20">
                {editingAttributes.length > 0 ? (
                  editingAttributes.map((attr, index) => (
                    <Badge 
                      key={index} 
                      variant="outline" 
                      className="bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 group cursor-pointer"
                      onClick={() => handleRemoveAttribute(attr)}
                    >
                      {attr}
                      <X className="w-3 h-3 ml-1 opacity-60 group-hover:opacity-100" />
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No attributes added yet</span>
                )}
              </div>
            </div>
            
            {/* Add New Attribute */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newAttribute}
                  onChange={(e) => setNewAttribute(e.target.value)}
                  placeholder="e.g., brown eyes, unique tattoo, beard, glasses..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAttribute();
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  onClick={handleAddAttribute}
                  disabled={!newAttribute.trim() || editingAttributes.includes(newAttribute.trim())}
                  size="icon"
                  variant="outline"
                  type="button"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Quick Examples */}
              <div className="flex flex-wrap gap-1">
                {['brown eyes', 'blonde hair', 'arm tattoo', 'beard', 'glasses'].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      if (!editingAttributes.includes(example)) {
                        setEditingAttributes(prev => [...prev, example]);
                      }
                    }}
                    disabled={editingAttributes.includes(example)}
                    className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAttributesDialogOpen(false)}
              disabled={isSavingAttributes}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAttributes}
              disabled={isSavingAttributes}
            >
              {isSavingAttributes ? "Saving..." : "Save Attributes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Attributes Editing Bottom Sheet */}
      <Sheet open={isMobile && isAttributesDialogOpen} onOpenChange={setIsAttributesDialogOpen}>
        <SheetContent 
          side="bottom" 
          className={cn(
            "rounded-t-[20px] border-t-0 p-0 max-h-[90vh]",
            "bg-card",
            "shadow-2xl"
          )}
        >
          <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mt-3 mb-6"></div>
          
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <SheetHeader className="text-center pb-6">
              <SheetTitle className="flex items-center justify-center gap-2 text-xl font-semibold">
                <Tag className="w-5 h-5 text-primary" />
                Model Attributes
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800">
                  BETA
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-base text-muted-foreground mt-2 leading-relaxed">
                Add details that help your model remember what makes your subject unique.
              </SheetDescription>
            </SheetHeader>
            
            <div className="space-y-6">
              {/* Compact Explanation */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-between p-3 h-auto bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <span className="text-primary">💡</span>
                      <div>
                        <div className="text-sm font-medium text-primary">
                          What works best for attributes?
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Click to see some helpful tips
                        </div>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-primary" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <div className="text-xs text-foreground space-y-1.5">
                      <p><strong>✨ Great for:</strong> Things that were actually in your training photos</p>
                      <p className="ml-4 text-muted-foreground">• Unique tattoos or markings</p>
                      <p className="ml-4 text-muted-foreground">• Eye color, hair color, distinctive features</p>
                      <p><strong>💭 Keep in mind:</strong> New things not in your photos might be less consistent</p>
                      <p><strong>💡 Pro tip:</strong> For completely new elements, try adding them to your prompts instead!</p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              
              {/* Current Attributes */}
              <div className="space-y-3">
                <label className="text-base font-medium">Attributes for {editingModel?.display_name}:</label>
                <div className="flex flex-wrap gap-2 min-h-[4rem] p-4 border rounded-lg bg-muted/20">
                  {editingAttributes.length > 0 ? (
                    editingAttributes.map((attr, index) => (
                      <Badge 
                        key={index} 
                        variant="outline" 
                        className="bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 group cursor-pointer py-2 px-3 text-sm"
                        onClick={() => handleRemoveAttribute(attr)}
                      >
                        {attr}
                        <X className="w-4 h-4 ml-2 opacity-60 group-hover:opacity-100" />
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground self-center">No attributes added yet</span>
                  )}
                </div>
              </div>
              
              {/* Add New Attribute */}
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newAttribute}
                    onChange={(e) => setNewAttribute(e.target.value)}
                    placeholder="e.g., brown eyes, unique tattoo, beard, glasses..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAttribute();
                      }
                    }}
                    className="flex-1 h-12 text-base"
                  />
                  <Button 
                    onClick={handleAddAttribute}
                    disabled={!newAttribute.trim() || editingAttributes.includes(newAttribute.trim())}
                    size="icon"
                    variant="outline"
                    type="button"
                    className="h-12 w-12"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                
                {/* Quick Examples */}
                <div className="flex flex-wrap gap-2">
                  {['brown eyes', 'blonde hair', 'arm tattoo', 'beard', 'glasses'].map((example) => (
                    <button
                      key={example}
                      onClick={() => {
                        if (!editingAttributes.includes(example)) {
                          setEditingAttributes(prev => [...prev, example]);
                        }
                      }}
                      disabled={editingAttributes.includes(example)}
                      className="text-sm px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <SheetFooter className="flex-col gap-3 p-6 pt-4 border-t bg-muted/50">
            <Button
              onClick={handleSaveAttributes}
              disabled={isSavingAttributes}
              className="w-full h-12 text-base font-medium rounded-xl"
            >
              {isSavingAttributes ? "Saving..." : "Save Attributes"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsAttributesDialogOpen(false)}
              disabled={isSavingAttributes}
              className="w-full h-12 text-base font-medium rounded-xl border-border"
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* iOS-Style Mobile Bottom Sheet */}
      <Sheet open={isMobile && !!confirmation} onOpenChange={(open) => {
        if (!open) setConfirmation(null);
      }}>
        <SheetContent 
          side="bottom" 
          className={cn(
            "rounded-t-[20px] border-t-0 p-0 max-h-[90vh]",
            "bg-card",
            "shadow-2xl"
          )}
        >
          <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mt-3 mb-6"></div>
          
          <SheetHeader className="text-center pb-6 px-6">
            <SheetTitle className="text-xl font-semibold">
              {confirmation?.type === 'delete' ? 'Delete Model' : 'Cancel Training'}
            </SheetTitle>
            <SheetDescription className="text-base text-muted-foreground mt-2 leading-relaxed">
              {confirmation?.type === 'delete' 
                ? "This action will permanently remove the model from your account. This cannot be undone."
                : "This action will stop the training process immediately. This cannot be undone."
              }
            </SheetDescription>
          </SheetHeader>

          <div className="flex justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              {confirmation?.type === 'delete' ? (
                <Trash2 className="w-8 h-8 text-destructive" />
              ) : (
                <XCircle className="w-8 h-8 text-destructive" />
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
              className="w-full h-12 text-base font-medium rounded-xl border-border"
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