'use client';

import { useConnection } from '@/contexts/ConnectionContext';
import { useCallback } from 'react';

export function useConnectionAwareFetch() {
  const { isConnected, checkConnection } = useConnection();

  const fetchWithConnectionCheck = useCallback(async (
    url: string, 
    options?: RequestInit
  ) => {
    // Check connection before making the request
    if (!isConnected) {
      await checkConnection();
      
      // If still not connected after check, throw an error
      if (!isConnected) {
        throw new Error('No internet connection available');
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        // Add a timeout to prevent hanging requests
        signal: AbortSignal.timeout(10000),
      });

      // If we get a response, connection is good
      return response;
    } catch (error) {
      // If fetch fails, check connection again
      await checkConnection();
      throw error;
    }
  }, [isConnected, checkConnection]);

  return {
    fetch: fetchWithConnectionCheck,
    isConnected,
  };
} 