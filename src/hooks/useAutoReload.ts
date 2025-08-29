/**
 * Custom hook for auto-reload functionality
 * Automatically refreshes data every specified interval
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseAutoReloadOptions {
  interval: number; // milliseconds
  enabled?: boolean;
  onReload: () => void | Promise<void>;
  onError?: (error: Error) => void;
}

export function useAutoReload({
  interval,
  enabled = true,
  onReload,
  onError
}: UseAutoReloadOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isReloadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (isReloadingRef.current) {
      console.log('Auto-reload: Skipping reload - already in progress');
      return;
    }

    try {
      isReloadingRef.current = true;
      console.log('Auto-reload: Starting data refresh...');
      await onReload();
      console.log('Auto-reload: Data refresh completed');
    } catch (error) {
      console.error('Auto-reload: Error during refresh:', error);
      onError?.(error as Error);
    } finally {
      isReloadingRef.current = false;
    }
  }, [onReload, onError]);

  useEffect(() => {
    if (!enabled || interval <= 0) {
      return;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(reload, interval);
    console.log(`Auto-reload: Started with ${interval}ms interval`);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        console.log('Auto-reload: Stopped');
      }
    };
  }, [interval, enabled, reload]);

  // Manual reload function
  const manualReload = useCallback(() => {
    reload();
  }, [reload]);

  return {
    manualReload,
    isReloading: isReloadingRef.current
  };
}
