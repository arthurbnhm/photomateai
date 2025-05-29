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
    // For most cases, navigator.onLine is sufficient
    const online = navigator.onLine;
    setIsOnline(online);
    setIsConnected(online);
  };

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);
    setIsConnected(navigator.onLine);

    // Listen to online/offline events
    const handleOnline = () => {
      const wasOffline = !isOnline || !isConnected;
      setIsOnline(true);
      setIsConnected(true);
      
      // Emit connection restored event if we were previously offline
      if (wasOffline) {
        // Small delay to ensure state is updated
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('connection-restored'));
        }, 100);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check when page becomes visible (user returns from sleep/background)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const online = navigator.onLine;
        const wasOffline = !isOnline || !isConnected;
        setIsOnline(online);
        setIsConnected(online);
        
        // Emit connection restored event if connection was restored
        if (online && wasOffline) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('connection-restored'));
          }, 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOnline, isConnected]);

  return (
    <ConnectionContext.Provider value={{ isOnline, isConnected, checkConnection }}>
      {children}
    </ConnectionContext.Provider>
  );
} 