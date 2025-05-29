'use client';

import { useConnection } from '@/contexts/ConnectionContext';
import { useCallback } from 'react';

export function useConnectionAwareFetch() {
  const { isConnected } = useConnection();

  const fetchWithConnectionCheck = useCallback(async (
    url: string, 
    options?: RequestInit
  ) => {
    // Check connection before making the request
    if (!isConnected) {
      throw new Error('No internet connection available');
    }

    try {
      const response = await fetch(url, {
        ...options,
        // Add a timeout to prevent hanging requests
        signal: AbortSignal.timeout(10000),
      });

      return response;
    } catch (error) {
      // If fetch fails, it might be a connection issue
      throw error;
    }
  }, [isConnected]);

  return {
    fetch: fetchWithConnectionCheck,
    isConnected,
  };
} 