'use client';

import { useConnection } from '@/contexts/ConnectionContext';
import { WifiOff, RefreshCw, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface ConnectionGuardProps {
  children: React.ReactNode;
}

export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const { isOnline, isConnected, checkConnection } = useConnection();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleRefresh = async () => {
    if (!navigator.onLine) {
      return; // Don't refresh if clearly offline
    }

    setIsRefreshing(true);
    await checkConnection();
    
    // Add a small delay for better UX
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  // Listen for connection restoration to show reconnecting state
  useEffect(() => {
    const handleConnectionRestored = () => {
      setIsReconnecting(true);
      // Show reconnecting state for a brief moment
      setTimeout(() => {
        setIsReconnecting(false);
      }, 2000);
    };

    window.addEventListener('connection-restored', handleConnectionRestored);
    
    return () => {
      window.removeEventListener('connection-restored', handleConnectionRestored);
    };
  }, []);

  // Show reconnecting state briefly when connection is restored
  if (isReconnecting && isOnline && isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-6">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-green-100 dark:bg-green-900">
              <Wifi className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Reconnecting...
            </h1>
            <p className="text-muted-foreground">
              Connection restored. Refreshing your data...
            </p>
          </div>

          <div className="flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // Show offline page if not connected
  if (!isOnline || !isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-6">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <WifiOff className="w-12 h-12 text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Connection Lost
            </h1>
            <p className="text-muted-foreground">
              {!isOnline 
                ? "You appear to be offline. Please check your internet connection."
                : "We&apos;re having trouble connecting to our servers. Please try again."
              }
            </p>
          </div>

          <Button
            onClick={handleRefresh}
            disabled={!navigator.onLine || isRefreshing}
            size="lg"
            className="min-w-[140px]"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </>
            )}
          </Button>

          {!navigator.onLine && (
            <p className="text-sm text-muted-foreground">
              The refresh button will be enabled once you&apos;re back online.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
} 