import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { useAuth } from '~/lib/hooks/useAuth';
import type { 
  SpotifyTrack, 
  SpotifyPlaybackState, 
  SimplifiedPlaylist,
  MiniPlayerState 
} from '~/types/spotify';

interface SpotifyMiniPlayerProps {
  className?: string;
}

function SpotifyMiniPlayer({ className }: SpotifyMiniPlayerProps) {
  const { user, isAuthenticated } = useAuth();
  const [playerState, setPlayerState] = useState<MiniPlayerState>({
    isExpanded: false,
    isPlaying: false,
    currentTrack: null,
    progress: 0,
    duration: 0,
    volume: 50,
    isShuffleOn: false,
    repeatMode: 'off',
    expandedView: null,
  });
  
  const [selectedPlaylist, setSelectedPlaylist] = useState<SimplifiedPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<any[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  
  const [playlists, setPlaylists] = useState<SimplifiedPlaylist[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // Check for Spotify connection on mount and handle URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const spotifySuccess = urlParams.get('spotify_success');
    const spotifyData = urlParams.get('spotify_data');

    if (spotifySuccess === 'true' && spotifyData) {
      try {
        const connectionData = JSON.parse(decodeURIComponent(spotifyData));
        // Save to localStorage for non-authenticated users
        localStorage.setItem('spotify_connection', JSON.stringify(connectionData));
        setIsConnected(true);
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Load playlists immediately
        if (user?.id) {
          loadPlaylists();
        }
      } catch (error) {
        console.error('Error parsing Spotify connection data:', error);
      }
    } else {
      checkSpotifyConnection();
    }
  }, [user?.id, isAuthenticated]);

  // Update playback state periodically
  useEffect(() => {
    if (isConnected && user?.id) {
      const interval = setInterval(() => {
        updatePlaybackState();
      }, 3000); // Update every 3 seconds

      return () => clearInterval(interval);
    }
  }, [isConnected, user?.id]);

  // Progress tracking
  useEffect(() => {
    if (playerState.isPlaying && playerState.currentTrack) {
      progressInterval.current = setInterval(() => {
        setPlayerState(prev => ({
          ...prev,
          progress: Math.min(prev.progress + 1000, prev.duration)
        }));
      }, 1000);
    } else if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [playerState.isPlaying, playerState.currentTrack]);

  const checkSpotifyConnection = async () => {
    try {
      // First check localStorage for immediate state
      const savedConnection = localStorage.getItem('spotify_connection');
      if (savedConnection) {
        const parsed = JSON.parse(savedConnection);
        setIsConnected(true);
        setPlayerState(prev => ({
          ...prev,
          volume: 50, // Default volume
        }));
        
        // Load playlists if we have them
        if (user?.id) {
          loadPlaylists();
        }
        return;
      }

      // Then check database if authenticated
      if (isAuthenticated && user?.id) {
        const response = await fetch(`/api/spotify?action=user&userId=${user.id}`);
        const isConnected = response.ok;
        setIsConnected(isConnected);
        
        if (isConnected) {
          setPlayerState(prev => ({
            ...prev,
            volume: 50, // Default volume
          }));
          loadPlaylists();
        }
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Error checking Spotify connection:', error);
      setIsConnected(false);
    }
  };

  const updatePlaybackState = async () => {
    if (!user?.id) return;

    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);
      const response = await fetch(`/api/spotify?action=playback-state&userId=${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 204) {
          // No active playback
          setPlayerState(prev => ({
            ...prev,
            isPlaying: false,
            currentTrack: null,
            progress: 0,
            duration: 0,
          }));
          return;
        }
        throw new Error(`Failed to update playback state: ${response.status}`);
      }

      const data = await response.json() as { playbackState: SpotifyPlaybackState };
      const playbackState = data.playbackState;
      
      if (playbackState) {
        setPlayerState(prev => ({
          ...prev,
          isPlaying: playbackState.is_playing,
          currentTrack: playbackState.item,
          progress: playbackState.progress_ms || 0,
          duration: playbackState.item?.duration_ms || 0,
          volume: playbackState.device.volume_percent || 50,
          isShuffleOn: playbackState.shuffle_state,
          repeatMode: playbackState.repeat_state,
        }));
        
        // Update active device ID
        if (playbackState.device?.id) {
          setActiveDeviceId(playbackState.device.id);
        }
      }
    } catch (error) {
      console.error('Error updating playback state:', error);
    }
  };

  const loadPlaylists = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);
      const response = await fetch(`/api/spotify?action=playlists&userId=${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load playlists: ${response.status}`);
      }

      const data = await response.json() as { playlists: SimplifiedPlaylist[] };
      console.log('Loaded playlists:', data.playlists);
      setPlaylists(data.playlists || []);
    } catch (error) {
      console.error('Error loading playlists:', error);
      toast.error('Failed to load playlists');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerAction = async (action: string, params: any = {}) => {
    if (!isConnected) {
      setShowAuthPrompt(true);
      return;
    }

    if (!user?.id) {
      toast.error('Please sign in to control playback');
      return;
    }

    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);
      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          userId: user.id,
          deviceId: activeDeviceId, // Use active device ID
          ...params,
        }),
      });

      if (response.ok) {
        // Update state optimistically for better UX
        setTimeout(() => updatePlaybackState(), 500);
      } else {
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error || `Failed to ${action}`);
      }
    } catch (error) {
      console.error(`Error ${action}:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${action}`);
    }
  };

  const togglePlay = () => {
    handlePlayerAction(playerState.isPlaying ? 'pause' : 'play');
  };

  const skipNext = () => {
    handlePlayerAction('next');
  };

  const skipPrevious = () => {
    handlePlayerAction('previous');
  };

  const toggleShuffle = () => {
    handlePlayerAction('shuffle', { state: !playerState.isShuffleOn });
  };

  const toggleRepeat = () => {
    const nextMode = playerState.repeatMode === 'off' ? 'context' : 
                    playerState.repeatMode === 'context' ? 'track' : 'off';
    handlePlayerAction('repeat', { state: nextMode });
  };

  const setVolume = (volume: number) => {
    handlePlayerAction('volume', { volumePercent: volume });
    setPlayerState(prev => ({ ...prev, volume }));
  };

  const seek = (positionMs: number) => {
    handlePlayerAction('seek', { positionMs });
    setPlayerState(prev => ({ ...prev, progress: positionMs }));
  };

  const loadPlaylistTracks = async (playlist: SimplifiedPlaylist) => {
    if (!user?.id) return;

    setIsLoadingTracks(true);
    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);
      const response = await fetch(`/api/spotify?action=playlist-tracks&userId=${user.id}&playlistId=${playlist.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load playlist tracks: ${response.status}`);
      }

      const data = await response.json() as { tracks: any[] };
      setPlaylistTracks(data.tracks || []);
      setSelectedPlaylist(playlist);
      setPlayerState(prev => ({ ...prev, expandedView: 'tracks' }));
    } catch (error) {
      console.error('Error loading playlist tracks:', error);
      toast.error('Failed to load playlist tracks');
    } finally {
      setIsLoadingTracks(false);
    }
  };

  const playTrack = async (trackUri: string) => {
    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);

      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'play-track',
          userId: user?.id,
          trackUri: trackUri,
          deviceId: activeDeviceId,
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || 'Failed to play track');
      }

      // Close the expanded view and update state
      setPlayerState(prev => ({ ...prev, isExpanded: false, expandedView: null }));
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      
      // Update playback state after a short delay
      setTimeout(() => updatePlaybackState(), 1000);
      
      toast.success('Track started playing');
    } catch (error) {
      console.error('Error playing track:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to play track');
    }
  };

  const handleExpand = (view: 'playlists' | 'controls' | null) => {
    if (!isConnected) {
      setShowAuthPrompt(true);
      return;
    }

    if (view === 'playlists' && playlists.length === 0) {
      loadPlaylists();
    }

    setPlayerState(prev => ({
      ...prev,
      isExpanded: view !== null,
      expandedView: view,
    }));
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleAuthPrompt = () => {
    if (isAuthenticated) {
      // User is authenticated but not connected to Spotify
      // Navigate to settings to connect
      window.location.href = '/settings?tab=connections';
    } else {
      // User is not authenticated, prompt to sign in first
      toast.info('Please sign in to your account, then connect Spotify in settings');
    }
    setShowAuthPrompt(false);
  };

  return (
    <>
      <motion.div
        className={classNames(
          'bg-white/5 dark:bg-black/10 backdrop-blur-2xl',
          'border border-white/20 dark:border-gray-700/30 rounded-2xl shadow-2xl',
          'w-[500px]',
          className
        )}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: 'calc(50% - 250px)',
          zIndex: 50
        }}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <AnimatePresence mode="wait">
          {!playerState.isExpanded ? (
            // Collapsed mini-player (modern pill shape)
            <motion.div
              key="collapsed"
              className="flex items-center gap-4 px-6 py-4 cursor-pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleExpand('controls')}
            >
              {playerState.currentTrack ? (
                <>
                  {/* Album Art with glow effect */}
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                    {playerState.currentTrack.album?.images?.[0] ? (
                      <img
                        src={playerState.currentTrack.album.images[0].url}
                        alt={playerState.currentTrack.album.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#1DB954] to-[#1ed760] flex items-center justify-center">
                        <div className="i-ph:music-note w-5 h-5 text-white" />
                      </div>
                    )}
                    {/* Subtle glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  </div>

                  {/* Track Info with better typography */}
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 dark:text-white text-sm font-semibold truncate">
                      {playerState.currentTrack.name}
                    </div>
                    <div className="text-gray-600 dark:text-gray-300 text-xs truncate">
                      {playerState.currentTrack.artists?.map(artist => artist.name).join(', ')}
                    </div>
                  </div>

                  {/* Playback Controls */}
                  <div className="flex items-center gap-2">
                                        {/* Previous Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipPrevious();
                      }}
                      className="w-7 h-7 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/15 transition-all duration-200 hover:scale-105 border border-white/15"
                    >
                      <div className="i-ph:skip-back-fill w-3 h-3" />
                    </button>

                  {/* Play/Pause Button */}
                  <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                      className="w-8 h-8 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/25 transition-all duration-200 hover:scale-105 border border-white/25"
                  >
                    <div className={classNames(
                      'w-4 h-4',
                      playerState.isPlaying ? 'i-ph:pause-fill' : 'i-ph:play-fill'
                    )} />
                  </button>

                    {/* Next Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipNext();
                      }}
                      className="w-7 h-7 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/15 transition-all duration-200 hover:scale-105 border border-white/15"
                    >
                      <div className="i-ph:skip-forward-fill w-3 h-3" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* No track playing - modern design */}
                  <div className="w-10 h-10 bg-gradient-to-br from-[#1DB954] to-[#1ed760] rounded-lg flex items-center justify-center shadow-lg">
                    <div className="i-ph:music-note w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-900 dark:text-white text-sm font-semibold">
                      {isConnected ? 'No music playing' : 'Connect Spotify'}
                    </div>
                    <div className="text-gray-600 dark:text-gray-300 text-xs">
                      {isConnected ? 'Start playing music' : 'Access your music library'}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      isConnected ? handleExpand('playlists') : handleAuthPrompt();
                    }}
                    className="w-8 h-8 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/25 transition-all duration-200 hover:scale-105 border border-white/25"
                  >
                    <div className="i-ph:play-fill w-4 h-4" />
                  </button>
                </>
              )}

              {/* Playlist button */}
                <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExpand('playlists');
                }}
                className="w-8 h-8 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/15 transition-all duration-200 hover:scale-105 border border-white/15"
                  title="View Playlists"
                >
                  <div className="i-ph:playlist w-4 h-4" />
                </button>
            </motion.div>
          ) : (
            // Expanded player with modern glassmorphism
            <motion.div
              key="expanded"
              className="max-h-[400px] overflow-hidden bg-white/5 dark:bg-black/10 backdrop-blur-2xl border border-white/20 dark:border-gray-700/30 rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
                            {/* Content with glass effect */}
              <div className="p-6 bg-transparent">
                {/* Header integrated into content */}
                {playerState.expandedView !== 'tracks' && (
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-gray-900 dark:text-white font-semibold text-base">
                      {playerState.expandedView === 'playlists' ? 'Your Playlists' : 'Now Playing'}
                </h3>
                    <div className="flex items-center gap-2">
                      {playerState.expandedView === 'controls' && (
                                            <button
                      onClick={() => handleExpand('playlists')}
                      className="w-6 h-6 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/15 transition-all duration-200"
                      title="View Playlists"
                    >
                      <div className="i-ph:playlist w-3 h-3" />
                    </button>
                      )}
                      {playerState.expandedView === 'playlists' && (
                        <button
                          onClick={() => handleExpand('controls')}
                          className="w-6 h-6 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/15 transition-all duration-200"
                          title="Now Playing"
                        >
                          <div className="i-ph:play-fill w-3 h-3" />
                        </button>
                      )}
                <button
                  onClick={() => setPlayerState(prev => ({ ...prev, isExpanded: false, expandedView: null }))}
                      className="w-6 h-6 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/15 transition-all duration-200"
                >
                      <div className="i-ph:x w-3 h-3" />
                </button>
              </div>
                  </div>
                )}
                {playerState.expandedView === 'playlists' ? (
                  <div className="max-h-[320px] overflow-y-auto space-y-2 modern-scrollbar-dark-grey">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="i-ph:spinner-gap w-6 h-6 animate-spin text-[#1DB954]" />
                      </div>
                    ) : playlists.length > 0 ? (
                      playlists.map((playlist) => (
                        <button
                          key={playlist.id}
                          onClick={() => loadPlaylistTracks(playlist)}
                          className="flex items-center gap-4 p-4 w-full text-left hover:bg-white/15 rounded-lg transition-all duration-200 group bg-white/8 backdrop-blur-sm border border-white/15"
                        >
                          <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                            {playlist.images?.[0] ? (
                              <img
                                src={playlist.images[0].url}
                                alt={playlist.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                                <div className="i-ph:playlist w-5 h-5 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 dark:text-white text-sm font-semibold truncate group-hover:text-[#1DB954] transition-colors">
                              {playlist.name}
                            </div>
                            <div className="text-gray-600 dark:text-gray-400 text-xs truncate">
                              {playlist.tracks.total} tracks • {playlist.owner.display_name}
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-12">
                        <div className="i-ph:playlist w-8 h-8 text-gray-500 mx-auto mb-3" />
                        <div className="text-gray-400 text-sm">No playlists found</div>
                      </div>
                    )}
                  </div>
                ) : playerState.expandedView === 'tracks' ? (
                  // Tracks view
                  <div className="space-y-4">
                    {/* Header for tracks view */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setPlayerState(prev => ({ ...prev, expandedView: 'playlists' }));
                            setSelectedPlaylist(null);
                            setPlaylistTracks([]);
                          }}
                          className="w-6 h-6 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/15 transition-all duration-200"
                          title="Back to Playlists"
                        >
                          <div className="i-ph:arrow-left w-3 h-3" />
                        </button>
                        <div>
                          <div className="text-gray-900 dark:text-white text-sm font-semibold truncate">
                            {selectedPlaylist?.name}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 text-xs">
                            {playlistTracks.length} tracks
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tracks list */}
                    <div className="max-h-[320px] overflow-y-auto space-y-2 modern-scrollbar-dark-grey pb-2">
                      {isLoadingTracks ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="i-ph:spinner-gap w-6 h-6 animate-spin text-[#1DB954]" />
                        </div>
                      ) : playlistTracks.length > 0 ? (
                        playlistTracks.map((trackItem, index) => {
                          const track = trackItem.track;
                          if (!track) return null;
                          
                          return (
                                                         <button
                               key={track.id}
                               onClick={() => playTrack(track.uri)}
                               className="flex items-center gap-4 p-4 w-full text-left hover:bg-white/15 rounded-lg transition-all duration-200 group bg-white/8 backdrop-blur-sm border border-white/15"
                             >
                               <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
                                {track.album?.images?.[0] ? (
                                  <img
                                    src={track.album.images[0].url}
                                    alt={track.album.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                                    <div className="i-ph:music-note w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                                                <div className="text-gray-900 dark:text-white text-sm font-semibold truncate group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                  {track.name}
                                </div>
                                <div className="text-gray-600 dark:text-gray-400 text-xs truncate">
                                  {track.artists?.map((artist: any) => artist.name).join(', ')}
                                </div>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="i-ph:play-fill w-4 h-4 text-gray-900 dark:text-white" />
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-center py-8">
                          <div className="i-ph:music-note w-8 h-8 text-gray-500 mx-auto mb-3" />
                          <div className="text-gray-600 dark:text-gray-400 text-sm">No tracks found</div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Playback controls with modern design
                  <div className="space-y-3">
                    {/* Current track info with large album art */}
                    {playerState.currentTrack && (
                      <div className="text-center">
                        <div className="w-24 h-24 mx-auto mb-2 rounded-xl overflow-hidden shadow-lg">
                          {playerState.currentTrack.album?.images?.[0] ? (
                            <img
                              src={playerState.currentTrack.album.images[0].url}
                              alt={playerState.currentTrack.album.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                              <div className="i-ph:music-note w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="text-gray-900 dark:text-white text-base font-bold truncate">
                            {playerState.currentTrack.name}
                          </div>
                          <div className="text-gray-600 dark:text-gray-300 text-sm truncate">
                            {playerState.currentTrack.artists?.map(artist => artist.name).join(', ')}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Progress bar with elegant white styling */}
                    {playerState.currentTrack && (
                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type="range"
                            min={0}
                            max={playerState.duration}
                            value={playerState.progress}
                            onChange={(e) => seek(parseInt(e.target.value))}
                            className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-0"
                            style={{
                              background: `linear-gradient(to right, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'} 0%, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'} ${(playerState.progress / playerState.duration) * 100}%, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} ${(playerState.progress / playerState.duration) * 100}%, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} 100%)`,
                              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                            }}
                          />
                          {/* Custom thumb styling */}
                          <style>{`
                            input[type="range"]::-webkit-slider-thumb {
                              appearance: none;
                              width: 16px;
                              height: 16px;
                              background: ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)'};
                              border-radius: 50%;
                              cursor: pointer;
                              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                              border: 2px solid ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
                              transition: all 0.2s ease;
                            }
                            input[type="range"]::-webkit-slider-thumb:hover {
                              transform: scale(1.2);
                              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                            }
                            input[type="range"]::-moz-range-thumb {
                              width: 16px;
                              height: 16px;
                              background: ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)'};
                              border-radius: 50%;
                              cursor: pointer;
                              border: 2px solid ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
                              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                            }
                          `}</style>
                        </div>
                        <div className="flex justify-between text-xs text-gray-700 dark:text-white/70 font-medium">
                          <span>{formatTime(playerState.progress)}</span>
                          <span>{formatTime(playerState.duration)}</span>
                        </div>
                      </div>
                    )}

                    {/* Playback controls with modern buttons */}
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={toggleShuffle}
                        className={classNames(
                          'w-10 h-10 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 border border-white/20',
                          playerState.isShuffleOn ? 'text-[#1DB954] bg-[#1DB954]/15' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/15'
                        )}
                      >
                        <div className="i-ph:shuffle w-5 h-5" />
                      </button>
                      <button
                        onClick={skipPrevious}
                        className="w-10 h-10 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/15 hover:scale-110 transition-all duration-200 border border-white/20"
                      >
                        <div className="i-ph:skip-back-fill w-6 h-6" />
                      </button>
                      <button
                        onClick={togglePlay}
                        className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/25 hover:scale-110 transition-all duration-200 border border-white/25 shadow-lg"
                      >
                        <div className={classNames(
                          'w-6 h-6',
                          playerState.isPlaying ? 'i-ph:pause-fill' : 'i-ph:play-fill'
                        )} />
                      </button>
                      <button
                        onClick={skipNext}
                        className="w-10 h-10 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white hover:bg-white/15 hover:scale-110 transition-all duration-200 border border-white/20"
                      >
                        <div className="i-ph:skip-forward-fill w-6 h-6" />
                      </button>
                      <button
                        onClick={toggleRepeat}
                        className={classNames(
                          'w-10 h-10 bg-white/8 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 border border-white/20',
                          playerState.repeatMode !== 'off' ? 'text-[#1DB954] bg-[#1DB954]/15' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/15'
                        )}
                      >
                        <div className={classNames(
                          'w-5 h-5',
                          playerState.repeatMode === 'track' ? 'i-ph:repeat-once' : 'i-ph:repeat'
                        )} />
                      </button>
                    </div>

                    {/* Volume control with elegant white styling */}
                      <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="i-ph:speaker-simple-low w-4 h-4 text-gray-600 dark:text-white/60" />
                        <div className="flex-1 relative">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={playerState.volume}
                          onChange={(e) => setVolume(parseInt(e.target.value))}
                            className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-0"
                          style={{
                              background: `linear-gradient(to right, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'} 0%, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'} ${playerState.volume}%, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} ${playerState.volume}%, ${document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} 100%)`,
                              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                          }}
                        />
                        </div>
                        <div className="i-ph:speaker-simple-high w-4 h-4 text-gray-600 dark:text-white/60" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Auth prompt modal with glassmorphism */}
      <AnimatePresence>
        {showAuthPrompt && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowAuthPrompt(false)}
          >
            <motion.div
              className="bg-white/10 dark:bg-gray-900/80 backdrop-blur-xl p-6 rounded-2xl max-w-sm mx-4 border border-white/20 dark:border-gray-700/50"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#1DB954] to-[#1ed760] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <div className="i-ph:music-note w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Connect Spotify
                </h3>
                <p className="text-gray-300 mb-6 leading-relaxed text-sm">
                  {isAuthenticated 
                    ? 'Connect your Spotify account in settings to control music playback.'
                    : 'Sign in to your account first, then connect Spotify to enable music controls.'
                  }
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAuthPrompt(false)}
                    className="flex-1 px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAuthPrompt}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#1DB954] to-[#1ed760] text-white rounded-lg hover:scale-105 transition-all duration-200 shadow-lg"
                  >
                    {isAuthenticated ? 'Go to Settings' : 'Sign In'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
} 

export default SpotifyMiniPlayer; 