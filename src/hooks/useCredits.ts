import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface CreditStatus {
  has_credits: boolean;
  credits_remaining: number;
  models_remaining: number;
  plan: string;
  subscription_active: boolean;
  expired?: boolean;
  loading: boolean;
  error: string | null;
}

export function useCredits() {
  const { user } = useAuth();
  const [creditStatus, setCreditStatus] = useState<CreditStatus>({
    has_credits: false,
    credits_remaining: 0,
    models_remaining: 0,
    plan: 'none',
    subscription_active: false,
    loading: true,
    error: null
  });

  const checkCredits = useCallback(async () => {
    if (!user) {
      setCreditStatus(prev => ({
        ...prev,
        loading: false,
        error: 'Not authenticated'
      }));
      return;
    }

    try {
      setCreditStatus(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await fetch('/api/credits/check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setCreditStatus({
        ...data,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Error checking credits:', error);
      setCreditStatus(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check credits'
      }));
    }
  }, [user]);

  // Check credits when user changes or component mounts
  useEffect(() => {
    checkCredits();
  }, [checkCredits]);

  // Refresh credits (useful after a generation)
  const refreshCredits = useCallback(() => {
    checkCredits();
  }, [checkCredits]);

  return {
    ...creditStatus,
    refreshCredits
  };
} 