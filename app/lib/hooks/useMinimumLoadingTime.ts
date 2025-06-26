import { useState, useEffect } from 'react';

/**
 * Hook to ensure a loading state is shown for a minimum amount of time
 * This prevents loading screens from flashing too quickly
 */
export function useMinimumLoadingTime(isLoading: boolean, minimumMs: number = 1500) {
  const [showLoading, setShowLoading] = useState(isLoading);
  const [startTime, setStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading && !startTime) {
      // Start loading - record the start time
      setStartTime(Date.now());
      setShowLoading(true);
    } else if (!isLoading && startTime) {
      // Loading finished - check if minimum time has passed
      const elapsed = Date.now() - startTime;
      const remaining = minimumMs - elapsed;

      if (remaining > 0) {
        // Need to wait longer
        const timeout = setTimeout(() => {
          setShowLoading(false);
          setStartTime(null);
        }, remaining);

        return () => clearTimeout(timeout);
      } else {
        // Minimum time already passed
        setShowLoading(false);
        setStartTime(null);
      }
    } else if (!isLoading && !startTime) {
      // Not loading and no start time
      setShowLoading(false);
    }
  }, [isLoading, startTime, minimumMs]);

  return showLoading;
} 