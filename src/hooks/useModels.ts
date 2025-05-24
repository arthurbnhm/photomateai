import { useState, useEffect, useCallback } from 'react';
import { useAuth } from "@/contexts/AuthContext";

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

export function useModels(newTraining: NewTraining | null = null) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
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

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

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

  useEffect(() => {
    if (!newTraining) return;
    
    fetchModels();
  }, [newTraining, fetchModels]);

  const removeModelFromState = useCallback((modelId: string) => {
    setModels(prevModels => prevModels.filter(model => model.id !== modelId));
  }, []);

  return {
    models,
    loading,
    error,
    fetchModels,
    isNewTrainingInModels,
    removeModelFromState,
  };
} 