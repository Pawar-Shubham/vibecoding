import { useState, useCallback } from 'react';
import type { Track } from '~/lib/stores/music';

interface UseYouTubeSearchReturn {
  searchResults: Track[];
  isSearching: boolean;
  error: string | null;
  searchYouTube: (query: string) => Promise<void>;
  clearResults: () => void;
}

export function useYouTubeSearch(): UseYouTubeSearchReturn {
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchYouTube = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setSearchResults(data.results || []);
    } catch (err) {
      console.error('YouTube search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setSearchResults([]);
    setError(null);
  }, []);

  return {
    searchResults,
    isSearching,
    error,
    searchYouTube,
    clearResults,
  };
} 