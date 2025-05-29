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

      // Handle authentication errors specifically
      if (response.status === 401) {
        // Emit an event that the auth context can listen to
        window.dispatchEvent(new CustomEvent('auth-error', { 
          detail: { 
            url, 
            status: response.status,
            statusText: response.statusText 
          } 
        }));
        
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      // If fetch fails, it might be a connection issue
      if (error instanceof Error) {
        // Check if it's a network error that might indicate connection issues
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new Error('Network error - please check your connection');
        }
        
        // Check if it's a timeout
        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          throw new Error('Request timeout - please check your connection');
        }
      }
      
      throw error;
    }
  }, [isConnected]);

  return {
    fetch: fetchWithConnectionCheck,
    isConnected,
  };
} 