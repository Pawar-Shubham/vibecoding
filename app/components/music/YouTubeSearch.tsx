import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { musicStore, musicActions, type Track } from '~/lib/stores/music';
import { classNames } from '~/utils/classNames';
import { IconButton } from '~/components/ui/IconButton';
import { useYouTubeSearch } from '~/lib/hooks/useYouTubeSearch';

interface YouTubeSearchProps {
  onTrackSelect: (track: Track) => void;
  searchQuery?: string;
}

export const YouTubeSearch: React.FC<YouTubeSearchProps> = ({ 
  onTrackSelect, 
  searchQuery = '' 
}) => {
  const music = useStore(musicStore);
  const [internalQuery, setInternalQuery] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const { searchResults, isSearching, error, searchYouTube, clearResults } = useYouTubeSearch();
  
  // Use external searchQuery if provided, otherwise use internal state
  const query = searchQuery || internalQuery;

  const handleSearch = useCallback((searchQuery: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      clearResults();
      musicActions.setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchYouTube(searchQuery);
    }, 500);
  }, [searchYouTube, clearResults]);

  // Update music store when search results change
  useEffect(() => {
    musicActions.setSearchResults(searchResults);
    musicActions.setSearching(isSearching);
  }, [searchResults, isSearching]);

  useEffect(() => {
    handleSearch(query);
  }, [query, handleSearch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // If searchQuery is provided externally, don't render the input
  if (searchQuery !== undefined) {
    return null; // The parent is handling the search input
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={internalQuery}
          onChange={(e) => setInternalQuery(e.target.value)}
          placeholder="Search for songs, podcasts, or any audio..."
          className="w-full px-4 py-3 pr-12 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
        />
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          {music.isSearching ? (
            <span className="i-ph:spinner w-5 h-5 animate-spin text-gray-400" />
          ) : (
            <span className="i-ph:magnifying-glass w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Search Results */}
      {music.searchResults.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto modern-scrollbar">
          {music.searchResults.map((track) => (
            <div
              key={track.id}
              onClick={() => onTrackSelect(track)}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
            >
              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 dark:text-white truncate">
                  {track.title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {track.artist}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{formatDuration(track.duration)}</span>
                <IconButton 
                  onClick={(e) => {
                    e.stopPropagation();
                    musicActions.addToPlaylist(track);
                  }}
                  className="w-8 h-8"
                >
                  <span className="i-ph:plus w-4 h-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {internalQuery && !music.isSearching && music.searchResults.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <span className="i-ph:magnifying-glass w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No results found for "{internalQuery}"</p>
          {error && (
            <p className="text-red-500 text-sm mt-2">Error: {error}</p>
          )}
        </div>
      )}

      {/* Search Tips */}
      {!internalQuery && (
        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
          <p><strong>Search tips:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Try song title + artist name</li>
            <li>Search for podcast names</li>
            <li>Use specific keywords</li>
          </ul>
          <p className="text-xs mt-2 opacity-75">
            Note: This is a demo version. Real YouTube integration would require API setup.
          </p>
        </div>
      )}
    </div>
  );
}; 