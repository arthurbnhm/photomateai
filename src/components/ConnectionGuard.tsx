'use client';

import { useConnection } from '@/contexts/ConnectionContext';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface ConnectionGuardProps {
  children: React.ReactNode;
}

export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const { isOnline, isConnected, checkConnection } = useConnection();
  const [isRefreshing, setIsRefreshing] = useState(false);

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