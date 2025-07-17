import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { useAuth } from '~/lib/hooks/useAuth';
import SpotifyWebPlayback from './SpotifyWebPlayback';
import type { 
  SpotifyTrack, 
  SpotifyPlaybackState, 
  SimplifiedPlaylist,
  MiniPlayerState 
} from '~/types/spotify';

interface SpotifyMiniPlayerProps {
  className?: string;
}

export default function SpotifyMiniPlayer({ className }: SpotifyMiniPlayerProps) {
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
  
  const [playlists, setPlaylists] = useState<SimplifiedPlaylist[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
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
      }, 5000); // Update every 5 seconds

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
          ...params,
        }),
      });

      if (response.ok) {
        // Update state optimistically for better UX
        setTimeout(() => updatePlaybackState(), 500);
      } else {
        toast.error(`Failed to ${action}`);
      }
    } catch (error) {
      console.error(`Error ${action}:`, error);
      toast.error(`Failed to ${action}`);
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

  const playPlaylist = async (playlist: SimplifiedPlaylist) => {
    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);

      if (!isPlayerReady || !deviceId) {
        toast.info('Web player is initializing, please try again in a moment...');
        return;
      }

      const response = await fetch('/api/spotify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'play-playlist',
          userId: user?.id,
          playlistUri: playlist.uri,
          deviceId, // Use our web player device ID
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || 'Failed to play playlist');
      }

      // Close the expanded view and update state
      setPlayerState(prev => ({ ...prev, isExpanded: false, expandedView: null }));
      
      // Update playback state after a short delay
      setTimeout(() => updatePlaybackState(), 1000);
      
      toast.success(`Playing ${playlist.name}`);
    } catch (error) {
      console.error('Error playing playlist:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to play playlist');
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

  // Get token for web player
  const getToken = () => {
    const savedConnection = localStorage.getItem('spotify_connection');
    if (!savedConnection) return null;
    try {
      const { token } = JSON.parse(savedConnection);
      return token;
    } catch (error) {
      return null;
    }
  };

  // Handle web player ready
  const handlePlayerReady = async (deviceId: string) => {
    console.log('Web player ready with device ID:', deviceId);
    
    try {
      // Get token from localStorage
      const savedConnection = localStorage.getItem('spotify_connection');
      if (!savedConnection) {
        throw new Error('No Spotify connection found');
      }

      const { token } = JSON.parse(savedConnection);

      // Transfer playback to our web player
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: false,
        }),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to transfer playback');
      }

      // Set device ID and player ready state
      setDeviceId(deviceId);
      setIsPlayerReady(true);
      toast.success('Web player ready');

      // Load playlists immediately
      loadPlaylists();
    } catch (error) {
      console.error('Error setting up web player:', error);
      setIsPlayerReady(false);
      setDeviceId(null);
      toast.error('Failed to initialize web player. Please try refreshing the page.');
    }
  };

  // Handle web player errors
  const handlePlayerError = (error: Error) => {
    console.error('Web player error:', error);
    setIsPlayerReady(false);
    setDeviceId(null);
    
    // Check if it's a premium account error
    if (error.message.toLowerCase().includes('premium')) {
      toast.error('Spotify Premium is required for playback. Please upgrade your account.');
    } else if (error.message.includes('initialization')) {
      toast.error('Failed to initialize player. Please refresh the page.');
    } else if (error.message.includes('authentication')) {
      toast.error('Authentication failed. Please reconnect to Spotify.');
    } else {
      toast.error(error.message);
    }
  };

  // Handle web player state changes
  const handlePlayerStateChange = (state: any) => {
    if (!state) return;

    const track = state.track_window.current_track;
    if (!track) {
      setPlayerState(prev => ({
        ...prev,
        isPlaying: !state.paused,
        currentTrack: null,
        progress: state.position,
        duration: state.duration,
      }));
      return;
    }

    // Convert track to SpotifyTrack format
    const spotifyTrack: SpotifyTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist: any) => ({
        id: artist.id,
        name: artist.name,
        type: 'artist',
        uri: artist.uri,
        external_urls: { spotify: '' },
        href: '',
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        images: track.album.images.map((image: any) => ({
          url: image.url,
          height: image.height || null,
          width: image.width || null,
        })),
        type: 'album',
        uri: track.album.uri,
        album_type: 'album',
        artists: [],
        available_markets: [],
        external_urls: { spotify: '' },
        href: '',
        release_date: '',
        release_date_precision: 'day',
        total_tracks: 0,
      },
      available_markets: [],
      disc_number: 1,
      duration_ms: state.duration,
      explicit: false,
      external_ids: {},
      external_urls: { spotify: '' },
      href: '',
      is_local: false,
      is_playable: true,
      popularity: 0,
      preview_url: null,
      track_number: 1,
      type: 'track',
      uri: track.uri,
    };

    setPlayerState(prev => ({
      ...prev,
      isPlaying: !state.paused,
      currentTrack: spotifyTrack,
      progress: state.position,
      duration: state.duration,
    }));
  };

  return (
    <>
      {/* Web Playback SDK Component */}
      {isConnected && (
        <SpotifyWebPlayback
          token={getToken() || ''}
          onReady={handlePlayerReady}
          onError={handlePlayerError}
          onStateChange={handlePlayerStateChange}
        />
      )}
      <motion.div
        className={classNames(
          'fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50',
          'bg-gradient-to-r from-gray-900 to-black',
          'border border-gray-700 rounded-full shadow-2xl',
          'backdrop-blur-md',
          className
        )}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <AnimatePresence mode="wait">
          {!playerState.isExpanded ? (
            // Collapsed mini-player (pill shape)
            <motion.div
              key="collapsed"
              className="flex items-center gap-3 px-4 py-3 min-w-80"
              initial={{ height: 'auto' }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
            >
              {playerState.currentTrack ? (
                <>
                  {/* Album Art */}
                  <div className="w-10 h-10 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                    {playerState.currentTrack.album?.images?.[0] && (
                      <img
                        src={playerState.currentTrack.album.images[0].url}
                        alt={playerState.currentTrack.album.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">
                      {playerState.currentTrack.name}
                    </div>
                    <div className="text-gray-400 text-xs truncate">
                      {playerState.currentTrack.artists?.map(artist => artist.name).join(', ')}
                    </div>
                  </div>

                  {/* Play/Pause Button */}
                  <button
                    onClick={togglePlay}
                    className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform"
                  >
                    <div className={classNames(
                      'w-4 h-4',
                      playerState.isPlaying ? 'i-ph:pause-fill' : 'i-ph:play-fill'
                    )} />
                  </button>
                </>
              ) : (
                <>
                  {/* No track playing */}
                  <div className="w-10 h-10 bg-[#1DB954] rounded-lg flex items-center justify-center">
                    <div className="i-ph:music-note w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">
                      {isConnected ? 'No music playing' : 'Connect Spotify'}
                    </div>
                    <div className="text-gray-400 text-xs">
                      {isConnected ? 'Start playing music' : 'Access your music library'}
                    </div>
                  </div>
                  <button
                    onClick={() => isConnected ? handleExpand('playlists') : handleAuthPrompt()}
                    className="w-8 h-8 bg-[#1DB954] rounded-full flex items-center justify-center text-white hover:scale-105 transition-transform"
                  >
                    <div className="i-ph:play-fill w-4 h-4" />
                  </button>
                </>
              )}

              {/* Expand buttons */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handleExpand('playlists')}
                  className="w-6 h-6 text-gray-400 hover:text-white transition-colors"
                  title="View Playlists"
                >
                  <div className="i-ph:playlist w-4 h-4" />
                </button>
                <button
                  onClick={() => handleExpand('controls')}
                  className="w-6 h-6 text-gray-400 hover:text-white transition-colors"
                  title="Show Controls"
                >
                  <div className="i-ph:sliders w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ) : (
            // Expanded player
            <motion.div
              key="expanded"
              className="w-96 max-h-96 overflow-hidden"
              initial={{ height: 60, width: 320 }}
              animate={{ height: 'auto', width: 384 }}
              exit={{ height: 60, width: 320 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h3 className="text-white font-medium">
                  {playerState.expandedView === 'playlists' ? 'Your Playlists' : 'Playback Controls'}
                </h3>
                <button
                  onClick={() => setPlayerState(prev => ({ ...prev, isExpanded: false, expandedView: null }))}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <div className="i-ph:x w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 max-h-80 overflow-y-auto">
                {playerState.expandedView === 'playlists' ? (
                  <div className="space-y-2">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="i-ph:spinner-gap w-6 h-6 animate-spin text-white" />
                      </div>
                    ) : playlists.length > 0 ? (
                      playlists.map((playlist) => (
                        <button
                          key={playlist.id}
                          onClick={() => playPlaylist(playlist)}
                          className="flex items-center gap-3 p-3 w-full text-left hover:bg-gray-800 rounded-lg transition-colors"
                        >
                          <div className="w-12 h-12 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                            {playlist.images?.[0] && (
                              <img
                                src={playlist.images[0].url}
                                alt={playlist.name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium truncate">
                              {playlist.name}
                            </div>
                            <div className="text-gray-400 text-xs truncate">
                              {playlist.tracks.total} tracks • {playlist.owner.display_name}
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <div className="text-gray-400 text-sm">No playlists found</div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Playback controls
                  <div className="space-y-6">
                    {/* Current track info */}
                    {playerState.currentTrack && (
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 bg-gray-800 rounded-lg overflow-hidden">
                          {playerState.currentTrack.album?.images?.[0] && (
                            <img
                              src={playerState.currentTrack.album.images[0].url}
                              alt={playerState.currentTrack.album.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">
                            {playerState.currentTrack.name}
                          </div>
                          <div className="text-gray-400 text-sm truncate">
                            {playerState.currentTrack.artists?.map(artist => artist.name).join(', ')}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Playback controls */}
                    <div className="flex items-center justify-center gap-4">
                      <button
                        onClick={toggleShuffle}
                        className={classNames(
                          'w-8 h-8 flex items-center justify-center transition-colors',
                          playerState.isShuffleOn ? 'text-[#1DB954]' : 'text-gray-400 hover:text-white'
                        )}
                      >
                        <div className="i-ph:shuffle w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={skipPrevious}
                        className="w-8 h-8 text-white hover:scale-105 transition-transform"
                      >
                        <div className="i-ph:skip-back-fill w-6 h-6" />
                      </button>
                      
                      <button
                        onClick={togglePlay}
                        className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform"
                      >
                        <div className={classNames(
                          'w-6 h-6',
                          playerState.isPlaying ? 'i-ph:pause-fill' : 'i-ph:play-fill'
                        )} />
                      </button>
                      
                      <button
                        onClick={skipNext}
                        className="w-8 h-8 text-white hover:scale-105 transition-transform"
                      >
                        <div className="i-ph:skip-forward-fill w-6 h-6" />
                      </button>
                      
                      <button
                        onClick={toggleRepeat}
                        className={classNames(
                          'w-8 h-8 flex items-center justify-center transition-colors',
                          playerState.repeatMode !== 'off' ? 'text-[#1DB954]' : 'text-gray-400 hover:text-white'
                        )}
                      >
                        <div className={classNames(
                          'w-4 h-4',
                          playerState.repeatMode === 'track' ? 'i-ph:repeat-once' : 'i-ph:repeat'
                        )} />
                      </button>
                    </div>

                    {/* Progress bar */}
                    {playerState.currentTrack && (
                      <div className="space-y-2">
                        <input
                          type="range"
                          min={0}
                          max={playerState.duration}
                          value={playerState.progress}
                          onChange={(e) => seek(parseInt(e.target.value))}
                          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #1DB954 0%, #1DB954 ${(playerState.progress / playerState.duration) * 100}%, #374151 ${(playerState.progress / playerState.duration) * 100}%, #374151 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{formatTime(playerState.progress)}</span>
                          <span>{formatTime(playerState.duration)}</span>
                        </div>
                      </div>
                    )}

                    {/* Volume control */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="i-ph:speaker-simple-low w-4 h-4 text-gray-400" />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={playerState.volume}
                          onChange={(e) => setVolume(parseInt(e.target.value))}
                          className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #1DB954 0%, #1DB954 ${playerState.volume}%, #374151 ${playerState.volume}%, #374151 100%)`
                          }}
                        />
                        <div className="i-ph:speaker-simple-high w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Auth prompt modal */}
      <AnimatePresence>
        {showAuthPrompt && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAuthPrompt(false)}
          >
            <motion.div
              className="bg-white dark:bg-gray-900 p-6 rounded-lg max-w-md mx-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-[#1DB954] rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="i-ph:music-note w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Connect Spotify
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {isAuthenticated 
                    ? 'Connect your Spotify account in settings to control music playback.'
                    : 'Sign in to your account first, then connect Spotify to enable music controls.'
                  }
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAuthPrompt(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAuthPrompt}
                    className="flex-1 px-4 py-2 bg-[#1DB954] text-white rounded-lg hover:bg-[#1ed760] transition-colors"
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