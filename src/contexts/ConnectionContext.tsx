'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface ConnectionContextType {
  isOnline: boolean;
  isConnected: boolean;
  checkConnection: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isConnected, setIsConnected] = useState(true);

  const checkConnection = async () => {
    try {
      // Check if browser reports online
      if (!navigator.onLine) {
        setIsOnline(false);
        setIsConnected(false);
        return;
      }

      // Try to reach a reliable endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const connected = response.ok;
      setIsOnline(true);
      setIsConnected(connected);
    } catch {
      setIsOnline(navigator.onLine);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    // Initial check
    checkConnection();

    // Listen to online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      checkConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    // Check when page becomes visible (user returns from sleep/background)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkConnection();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  return (
    <ConnectionContext.Provider value={{ isOnline, isConnected, checkConnection }}>
      {children}
    </ConnectionContext.Provider>
  );
} 