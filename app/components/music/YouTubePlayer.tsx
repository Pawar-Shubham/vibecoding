import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { musicStore, musicActions, audioManager, type Track } from '~/lib/stores/music';
import { YouTubeSearch } from './YouTubeSearch';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';
import { useYouTubeAudio } from '~/lib/hooks/useYouTubeAudio';
import { useAuth } from '~/lib/hooks/useAuth';
import { AuthModal } from '../auth/AuthModal';

interface YouTubePlayerProps {
  className?: string;
  compact?: boolean;
  sidebarMode?: boolean;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ 
  className,
  compact = false,
  sidebarMode = false
}) => {
  const music = useStore(musicStore);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [audioError, setAudioError] = useState<string | null>(null);
  const { extractAudio, isExtracting, extractionError } = useYouTubeAudio();
  const [isLoading, setIsLoading] = useState(false);
  const [loadedTrackId, setLoadedTrackId] = useState<string | null>(null);
  const componentId = useRef(`player-${Date.now()}-${Math.random()}`);
  const { isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Check authentication before allowing music interactions
  const checkAuthAndExecute = useCallback((action: () => void) => {
    if (!isAuthenticated) {
      // Store the current track as pending before showing auth modal
      if (music.currentTrack) {
        musicActions.setPendingTrack(music.currentTrack);
      }
      setShowAuthModal(true);
      return;
    }
    action();
  }, [isAuthenticated, music.currentTrack]);

  // Handle successful authentication
  const handleAuthSuccess = useCallback(() => {
    setShowAuthModal(false);
    // If there's a pending track, play it
    if (music.pendingTrack) {
      musicActions.setCurrentTrack(music.pendingTrack);
      musicActions.addToPlaylist(music.pendingTrack);
      musicActions.setPendingTrack(null);
      musicActions.setPlaying(true);
      handleCloseSearch();
      
      // Make this component the active controller
      audioManager.setActiveComponent(componentId.current);
    }
  }, [music.pendingTrack, componentId]);

  // Register with audio manager and get shared audio element
  useEffect(() => {
    audioRef.current = audioManager.registerComponent(componentId.current);
    
    // Set up component-specific error handling
    const handleAudioError = (e: Event) => {
      console.error('Audio error in component:', componentId.current, e);
      const audio = audioRef.current;
      if (audio && audio.error) {
        const errorMsg = audio.error.code 
          ? `Audio error (${audio.error.code}): ${getAudioErrorMessage(audio.error.code)}`
          : 'Failed to load audio - the extracted URL may have expired or be inaccessible';
        setAudioError(errorMsg);
      }
    };

    if (audioRef.current) {
      audioRef.current.addEventListener('error', handleAudioError);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('error', handleAudioError);
      }
      audioManager.unregisterComponent(componentId.current);
    };
  }, []);

  // Handle volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = music.volume;
    }
  }, [music.volume]);

  // Only extract audio when the current track changes AND we don't have audio loaded
  useEffect(() => {
    if (!music.currentTrack?.youtubeId || isLoading || isExtracting) return;

    // Check if we already have this track loaded
    if (loadedTrackId === music.currentTrack.youtubeId) {
      console.log('Audio already loaded for this track:', music.currentTrack.youtubeId);
      return;
    }

    // Prevent multiple simultaneous loads
    const videoId = music.currentTrack.youtubeId;
    console.log('Track changed, need to load audio for:', videoId);
    setAudioError(null);
    loadAudio(videoId).catch(error => {
      console.error('Failed to load audio:', error);
      setAudioError(error instanceof Error ? error.message : 'Failed to load audio');
      setLoadedTrackId(null);
      setIsLoading(false);
    });
  }, [music.currentTrack?.youtubeId, loadedTrackId, isLoading, isExtracting]);

  // Handle play/pause changes
  useEffect(() => {
    if (audioRef.current && !audioError && !isLoading && loadedTrackId) {
      if (music.isPlaying) {
        audioRef.current.play().catch(error => {
          console.error('Playback failed:', error);
          setAudioError('Playback failed. Please try again.');
          musicActions.setPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [music.isPlaying, audioError, isLoading, loadedTrackId]);

  const handlePlayPause = async () => {
    if (!music.currentTrack) return;

    // Check authentication first
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    // Make this component the active controller
    audioManager.setActiveComponent(componentId.current);

    if (music.isPlaying) {
      audioRef.current?.pause();
      musicActions.setPlaying(false);
    } else {
      // Check if audio is loaded for current track
      if (loadedTrackId === music.currentTrack.youtubeId && audioRef.current?.src) {
        // Audio is already loaded, just play
        try {
          await audioRef.current.play();
          musicActions.setPlaying(true);
        } catch (error) {
          console.error('Play error:', error);
          setAudioError('Failed to play audio. Please try a different track.');
        }
      } else {
        // Need to extract and load audio first
        console.log('Need to load audio first for:', music.currentTrack.youtubeId);
        musicActions.setPlaying(true); // Set to playing so it starts after loading
        if (music.currentTrack.youtubeId) {
          await loadAudio(music.currentTrack.youtubeId);
        }
      }
    }
  };

  const loadAudio = async (videoId: string) => {
    if (!audioRef.current || isLoading || isExtracting) {
      throw new Error('Audio loading already in progress');
    }

    setIsLoading(true);
    setAudioError(null);
    setLoadedTrackId(null);

    try {
      console.log('Loading audio for video:', videoId);
      
      const result = await extractAudio(videoId);
      
      if (!result.success || !result.audioUrl) {
        throw new Error(result.error || 'Failed to extract audio URL');
      }

      console.log('Audio extraction successful, using URL:', result.audioUrl);
      
      // Create a promise to handle audio loading
      const audioLoadPromise = new Promise<void>((resolve, reject) => {
        const audio = audioRef.current!;
        let resolved = false;
        
        const cleanup = () => {
          audio.removeEventListener('canplaythrough', handleCanPlay);
          audio.removeEventListener('error', handleError);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('progress', handleProgress);
          if (!resolved) {
            resolved = true;
            reject(new Error('Audio loading cancelled'));
          }
        };
        
        const handleCanPlay = () => {
          if (resolved) return;
          resolved = true;
          console.log('Audio loaded and ready to play');
          cleanup();
          resolve();
        };
        
        const handleLoadedMetadata = () => {
          console.log('Audio metadata loaded, duration:', audio.duration);
          if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
            handleCanPlay();
          }
        };

        const handleProgress = () => {
          if (audio.buffered.length > 0) {
            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            if (bufferedEnd > 0) {
              console.log('Audio buffered:', bufferedEnd, 'seconds');
              if (audio.readyState >= 3) { // HAVE_FUTURE_DATA
                handleCanPlay();
              }
            }
          }
        };
        
        const handleError = (e: Event) => {
          if (resolved) return;
          cleanup();
          
          console.error('Audio loading error:', e, audio.error);
          const errorCode = audio.error?.code;
          let errorMsg = 'Failed to load audio';
          
          switch (errorCode) {
            case 1: // MEDIA_ERR_ABORTED
              errorMsg = 'Audio loading was aborted';
              break;
            case 2: // MEDIA_ERR_NETWORK
              errorMsg = 'Network error while loading audio';
              break;
            case 3: // MEDIA_ERR_DECODE
              errorMsg = 'Audio format not supported by your browser';
              break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
              errorMsg = 'Audio format or source not supported';
              break;
          }
          
          if (audio.error?.message) {
            errorMsg += `: ${audio.error.message}`;
          }
                
          reject(new Error(errorMsg));
        };
        
        audio.addEventListener('canplaythrough', handleCanPlay);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('error', handleError);
        audio.addEventListener('progress', handleProgress);
        
        // Set timeout for loading
        const timeoutId = setTimeout(() => {
          cleanup();
        }, 15000);
        
        // Start loading
        console.log('Setting audio source to:', result.audioUrl);
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.src = result.audioUrl || ''; // Handle undefined case
        audio.load();

        // Cleanup on component unmount
        return () => {
          clearTimeout(timeoutId);
          cleanup();
        };
      });
      
      await audioLoadPromise;
      
      setLoadedTrackId(videoId);
      setAudioError(null);
      
      // Update duration if available
      if (result.duration) {
        musicActions.setDuration(result.duration); // Use musicActions instead of music store directly
      }
      
    } catch (error) {
      console.error('Load audio error:', error);
      setAudioError(error instanceof Error ? error.message : 'Unknown error occurred');
      setLoadedTrackId(null);
      throw error; // Re-throw to be caught by the effect
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function for audio error messages
  const getAudioErrorMessage = (errorCode: number): string => {
    switch (errorCode) {
      case 1: return 'Loading aborted';
      case 2: return 'Network error';
      case 3: return 'Decoding error';
      case 4: return 'Format not supported';
      default: return 'Unknown error';
    }
  };

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    // Check authentication first
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    const seekTime = parseFloat(event.target.value);
    const audio = audioRef.current;
    
    if (!audio) {
      console.log('No audio element available');
      return;
    }

    if (audioError) {
      console.log('Cannot seek: audio has error');
      return;
    }

    if (!loadedTrackId) {
      console.log('Cannot seek: no track loaded');
      return;
    }

    if (!audio.duration || isNaN(audio.duration) || audio.duration === 0) {
      console.log('Cannot seek: invalid duration', audio.duration);
      return;
    }

    // Make this component the active controller
    audioManager.setActiveComponent(componentId.current);
    
    // Use the global seek function to prevent conflicts
    musicActions.seek(seekTime);
  }, [audioError, loadedTrackId, isAuthenticated]);

  // Handle mouse down/up for better seeking UX
  const handleSeekStart = useCallback(() => {
    audioManager.setSeeking(true);
    audioManager.setActiveComponent(componentId.current);
  }, []);

  const handleSeekEnd = useCallback(() => {
    // Let the audio manager handle clearing the seeking state
    setTimeout(() => {
      audioManager.setSeeking(false);
    }, 200);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTrackSelect = useCallback((track: Track) => {
    if (!isAuthenticated) {
      // Store the track as pending before showing auth modal
      musicActions.setPendingTrack(track);
      setShowAuthModal(true);
      return;
    }

    // If authenticated, play the track directly
    musicActions.setCurrentTrack(track);
    musicActions.addToPlaylist(track);
    musicActions.setPlaying(true);
    handleCloseSearch();
    
    // Make this component the active controller when selecting a track
    audioManager.setActiveComponent(componentId.current);
  }, [isAuthenticated, componentId]);

  const handleSearchFocus = () => {
    setShowSearch(true);
  };

  const handleSearchBlur = () => {
    // Don't close immediately to allow clicking on results
    setTimeout(() => {
      if (!document.activeElement?.closest('.search-dropup')) {
        setShowSearch(false);
      }
    }, 200);
  };

  const handlePlayerClick = () => {
    // Prevent expansion in sidebar mode
    if (music.currentTrack && !music.isExpanded && !sidebarMode) {
      musicActions.setExpanded(true);
    }
  };

  const handleCloseSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
  };

  const performSearch = useCallback((query: string) => {
    setSearchQuery(query);
    // The YouTubeSearch component will handle the actual search
  }, []);

  if (!music.isVisible) return null;

  // Default state - no track selected, show search bar
  if (!music.currentTrack) {
    return (
      <>
        <div className={classNames(
          'relative',
          className
        )}>
          {/* Search Results - Different positioning for sidebar mode */}
          {showSearch && music.searchResults.length > 0 && (
            <div className={classNames(
              'search-results music-player rounded-2xl p-4 overflow-y-auto',
              sidebarMode 
                ? 'mb-2 max-h-40 modern-scrollbar-dark-grey' // In sidebar: normal flow with consistent scrollbar
                : 'absolute bottom-full left-0 right-0 mb-2 max-h-80' // Normal: absolute positioning
            )}>
              <div className="space-y-2">
                {music.searchResults.map((track) => (
                  <button
                    key={track.id}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur
                    onClick={() => handleTrackSelect(track)}
                    className="search-result-item w-full flex items-center gap-3 p-3 rounded-xl text-left"
                  >
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white/90 truncate text-sm leading-tight">{track.title}</h4>
                      <p className="text-sm text-white/50 truncate mt-1">{track.artist}</p>
                    </div>
                    <div className="text-white/30 text-xs">
                      <span className="i-ph:play w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="music-player rounded-2xl p-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <span className="i-ph:magnifying-glass w-5 h-5 text-white/40">🔍</span>
              </div>
              <input
                type="text"
                placeholder="Search YouTube"
                value={searchQuery}
                onChange={(e) => performSearch(e.target.value)}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                className="search-input w-full pl-12 pr-4 py-3 rounded-xl bg-transparent border-0 text-white/90 placeholder-white/40 focus:outline-none"
              />
            </div>
            
            {/* Hidden YouTubeSearch component to handle the search logic */}
            {showSearch && (
              <div className="hidden">
                <YouTubeSearch 
                  onTrackSelect={handleTrackSelect}
                  searchQuery={searchQuery}
                />
              </div>
            )}
          </div>
        </div>
        
        {/* AuthModal */}
        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  // Mini Player State - Show Search Interface or Mini Player
  if (!music.isExpanded || sidebarMode) { // Force mini mode in sidebar
    // Show search interface instead of mini player
    if (showSearch) {
      return (
        <>
          <div className={classNames(
            'relative',
            className
          )}>
            {/* Search Results - Different positioning for sidebar mode */}
            {music.searchResults.length > 0 && (
              <div className={classNames(
                'search-results music-player rounded-2xl p-4 overflow-y-auto search-dropup',
                sidebarMode 
                  ? 'mb-2 max-h-40 modern-scrollbar-dark-grey' // In sidebar: normal flow with consistent scrollbar
                  : 'absolute bottom-full left-0 right-0 mb-2 max-h-80' // Normal: absolute positioning
              )}>
                <div className="space-y-2">
                  {music.searchResults.map((track) => (
                    <button
                      key={track.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleTrackSelect(track)}
                      className="search-result-item w-full flex items-center gap-3 p-3 rounded-xl text-left"
                    >
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white/90 truncate text-sm">{track.title}</h4>
                        <p className="text-xs text-white/50 truncate">{track.artist}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search Interface - Replaces Mini Player - Homepage Style */}
            <div className="music-player rounded-2xl p-4">
              <div className="flex items-center gap-3">
                {/* Close Button */}
                <button
                  onClick={handleCloseSearch}
                  className="close-button w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                >
                  <span className="i-ph:x w-4 h-4" />
                </button>

                {/* Search Input - Same as Homepage */}
                <div className="flex-1 relative">
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <span className="i-ph:magnifying-glass w-5 h-5 text-white/40">🔍</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Search YouTube"
                    value={searchQuery}
                    onChange={(e) => performSearch(e.target.value)}
                    autoFocus
                    className="search-input w-full pl-12 pr-4 py-3 rounded-xl bg-transparent border-0 text-white/90 placeholder-white/40 focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="hidden">
                <YouTubeSearch 
                  onTrackSelect={handleTrackSelect}
                  searchQuery={searchQuery}
                />
              </div>
            </div>
          </div>
          
          {/* AuthModal */}
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={handleAuthSuccess}
          />
        </>
      );
    }

    // Show regular mini player
    return (
      <div className={classNames(
        'music-player-mini rounded-3xl',
        sidebarMode ? 'cursor-default' : 'cursor-pointer', // Remove click cursor in sidebar mode
        compact ? 'p-3' : 'p-4',
        className
      )}>
        <div className="flex items-center gap-4" onClick={sidebarMode ? undefined : handlePlayerClick}>
          {/* Cover Image */}
          <div className="relative flex-shrink-0">
            <img
              src={music.currentTrack.thumbnail}
              alt={music.currentTrack.title}
              className="w-12 h-12 rounded-xl object-cover shadow-md"
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <span className="i-ph:spinner w-4 h-4 text-white/80 loading-spinner" />
              </div>
            )}
          </div>
          
          {/* Track Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-white/90 truncate text-sm leading-tight">
              {music.currentTrack.title}
            </h3>
            <p className="text-white/50 truncate text-xs mt-0.5 leading-relaxed">
              {music.currentTrack.artist}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlayPause();
              }}
              disabled={music.isLoading || isExtracting}
              className="play-button w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50"
            >
              {music.isLoading || isExtracting ? (
                <span className="i-ph:spinner w-4 h-4 loading-spinner" />
              ) : music.isPlaying ? (
                <span className="i-ph:pause w-4 h-4" />
              ) : (
                <span className="i-ph:play w-4 h-4 ml-0.5" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                checkAuthAndExecute(() => musicActions.playNext());
              }}
              disabled={music.playlist.length <= 1}
              className="control-button w-8 h-8 flex items-center justify-center disabled:opacity-30"
            >
              <span className="i-ph:skip-forward w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isAuthenticated) {
                  setShowAuthModal(true);
                  return;
                }
                setShowSearch(true);
                setSearchQuery('');
              }}
              className="control-button w-8 h-8 flex items-center justify-center"
            >
              <span className="i-ph:magnifying-glass w-4 h-4">🔍</span>
            </button>
          </div>
        </div>

        {/* Sidebar Mode: Add seekers below main controls */}
        {sidebarMode && (
          <div className="mt-4 space-y-3">
            {/* Progress Bar */}
            <div className="px-1">
              <input
                type="range"
                min="0"
                max={music.duration || 0}
                value={music.currentTime || 0}
                onChange={handleSeek}
                onMouseDown={handleSeekStart}
                onMouseUp={handleSeekEnd}
                onTouchStart={handleSeekStart}
                onTouchEnd={handleSeekEnd}
                disabled={audioError !== null || !loadedTrackId || !music.duration}
                className="slider w-full rounded-full"
                style={{
                  '--progress': `${music.duration ? (music.currentTime / music.duration) * 100 : 0}%`
                } as React.CSSProperties}
              />
              <div className="flex justify-between text-xs text-white/40 mt-1 px-1">
                <span className="font-mono">{formatTime(music.currentTime)}</span>
                <span className="font-mono">{formatTime(music.duration)}</span>
              </div>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-3 px-1">
              <span className="i-ph:speaker-low w-3 h-3 text-white/40" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={music.volume}
                onChange={(e) => {
                  if (!isAuthenticated) {
                    setShowAuthModal(true);
                    return;
                  }
                  musicActions.setVolume(parseFloat(e.target.value));
                }}
                className="volume-slider flex-1 rounded-full"
                style={{
                  '--progress': `${music.volume * 100}%`
                } as React.CSSProperties}
              />
              <span className="i-ph:speaker-high w-3 h-3 text-white/40" />
            </div>
          </div>
        )}

        {/* Error Display for Mini Player */}
        {audioError && (
          <div className="mt-4 p-3 error-message rounded-xl">
            <p className="text-xs text-red-200">⚠️ {audioError}</p>
          </div>
        )}
        
        {/* AuthModal */}
        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      </div>
    );
  }

  // Expanded Player State - Only show if NOT in sidebar mode
  if (!sidebarMode && showSearch) {
    return (
      <>
        <div className={classNames(
          'relative',
          className
        )}>
          {/* Search Results Dropup for Expanded Search */}
          {music.searchResults.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 search-results music-player rounded-2xl p-4 max-h-80 overflow-y-auto search-dropup">
              <div className="space-y-2">
                {music.searchResults.map((track) => (
                  <button
                    key={track.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleTrackSelect(track)}
                    className="search-result-item w-full flex items-center gap-3 p-3 rounded-xl text-left"
                  >
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white/90 truncate text-sm">{track.title}</h4>
                      <p className="text-xs text-white/50 truncate">{track.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Interface - Replaces Expanded Player - Homepage Style */}
          <div className="music-player rounded-2xl p-4 max-w-md mx-auto">
            <div className="flex items-center gap-3">
              {/* Close Button */}
              <button
                onClick={handleCloseSearch}
                className="close-button w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              >
                <span className="i-ph:x w-4 h-4" />
              </button>

              {/* Search Input - Same as Homepage */}
              <div className="flex-1 relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <span className="i-ph:magnifying-glass w-5 h-5 text-white/40">🔍</span>
                </div>
                <input
                  type="text"
                  placeholder="Search YouTube"
                  value={searchQuery}
                  onChange={(e) => performSearch(e.target.value)}
                  autoFocus
                  className="search-input w-full pl-12 pr-4 py-3 rounded-xl bg-transparent border-0 text-white/90 placeholder-white/40 focus:outline-none"
                />
              </div>
            </div>
            
            <div className="hidden">
              <YouTubeSearch 
                onTrackSelect={handleTrackSelect}
                searchQuery={searchQuery}
              />
            </div>
          </div>
        </div>
        
        {/* AuthModal */}
        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  // Expanded Player State - Only render if NOT in sidebar mode
  if (!sidebarMode) {
    return (
      <>
        <div className={classNames(
        'music-player-expanded rounded-3xl max-w-md mx-auto',
        'p-4',
        className
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => musicActions.setExpanded(false)}
            className="control-button w-9 h-9 flex items-center justify-center rounded-xl"
          >
            <span className="i-ph:caret-down w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setShowSearch(true);
              setSearchQuery('');
            }}
            className="control-button w-9 h-9 flex items-center justify-center rounded-xl"
          >
            <span className="i-ph:magnifying-glass w-4 h-4">🔍</span>
          </button>
        </div>

        {/* Main Content - Horizontal Layout */}
        <div className="flex items-center gap-5 mb-4">
          {/* Cover Image - Smaller */}
          <div className="relative flex-shrink-0">
            <img
              src={music.currentTrack.thumbnail}
              alt={music.currentTrack.title}
              className="cover-image w-28 h-28 rounded-2xl object-cover"
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <span className="i-ph:spinner w-6 h-6 text-white/80 loading-spinner" />
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="flex-1 track-info">
            <h2 className="text-lg font-semibold text-white mb-1 leading-tight">
              {music.currentTrack.title}
            </h2>
            <p className="text-white/60 text-sm tracking-wide mb-1.5">
              {music.currentTrack.artist}
            </p>
            {music.currentTrack.description && (
              <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">
                {music.currentTrack.description}
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4 px-2">
          <input
            type="range"
            min="0"
            max={music.duration || 0}
            value={music.currentTime || 0}
            onChange={handleSeek}
            onMouseDown={handleSeekStart}
            onMouseUp={handleSeekEnd}
            onTouchStart={handleSeekStart}
            onTouchEnd={handleSeekEnd}
            disabled={audioError !== null || !loadedTrackId || !music.duration}
            className="slider w-full rounded-full"
            style={{
              '--progress': `${music.duration ? (music.currentTime / music.duration) * 100 : 0}%`
            } as React.CSSProperties}
          />
          <div className="flex justify-between text-xs text-white/40 mt-1.5 px-1">
            <span className="font-mono">{formatTime(music.currentTime)}</span>
            <span className="font-mono">{formatTime(music.duration)}</span>
          </div>
        </div>

        {/* Main Controls - Compact */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            onClick={() => checkAuthAndExecute(() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15);
              }
            })}
            className="control-button w-9 h-9 flex items-center justify-center rounded-xl"
          >
            <span className="i-ph:rewind w-4 h-4" />
          </button>

          <button
            onClick={() => checkAuthAndExecute(() => musicActions.playPrevious())}
            disabled={music.playlist.length <= 1}
            className="control-button w-9 h-9 flex items-center justify-center rounded-xl disabled:opacity-30"
          >
            <span className="i-ph:skip-back w-4 h-4" />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={music.isLoading || isExtracting}
            className="play-button w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-50"
          >
            {music.isLoading || isExtracting ? (
              <span className="i-ph:spinner w-5 h-5 loading-spinner" />
            ) : music.isPlaying ? (
              <span className="i-ph:pause w-5 h-5" />
            ) : (
              <span className="i-ph:play w-5 h-5 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => checkAuthAndExecute(() => musicActions.playNext())}
            disabled={music.playlist.length <= 1}
            className="control-button w-9 h-9 flex items-center justify-center rounded-xl disabled:opacity-30"
          >
            <span className="i-ph:skip-forward w-4 h-4" />
          </button>

          <button
            onClick={() => checkAuthAndExecute(() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 15);
              }
            })}
            className="control-button w-9 h-9 flex items-center justify-center rounded-xl"
          >
            <span className="i-ph:fast-forward w-4 h-4" />
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-3 px-2">
          <span className="i-ph:speaker-low w-4 h-4 text-white/40" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={music.volume}
            onChange={(e) => {
              if (!isAuthenticated) {
                setShowAuthModal(true);
                return;
              }
              musicActions.setVolume(parseFloat(e.target.value));
            }}
            className="volume-slider flex-1 rounded-full"
            style={{
              '--progress': `${music.volume * 100}%`
            } as React.CSSProperties}
          />
          <span className="i-ph:speaker-high w-4 h-4 text-white/40" />
        </div>

        {/* Error Display */}
        {audioError && (
          <div className="mt-3 p-3 error-message rounded-xl">
            <p className="text-sm text-red-200 mb-2">⚠️ {audioError}</p>
            <button 
              onClick={() => {
                if (music.currentTrack?.youtubeId) {
                  setAudioError(null);
                  loadAudio(music.currentTrack.youtubeId);
                }
              }}
              className="text-xs text-red-200/80 hover:text-red-200 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
        </div>
        
        {/* AuthModal */}
        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  // Fallback - should not reach here in sidebar mode
  return (
    <AuthModal 
      isOpen={showAuthModal}
      onClose={() => setShowAuthModal(false)}
      onSuccess={handleAuthSuccess}
    />
  );
}; 