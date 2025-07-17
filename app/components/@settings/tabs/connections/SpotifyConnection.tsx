import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { Button } from '~/components/ui/Button';
import { useAuth } from '~/lib/hooks/useAuth';
import { supabase } from '~/lib/supabase';
import type { SpotifyConnection as SpotifyConnectionType, SpotifyUser, SpotifyStats, SimplifiedPlaylist } from '~/types/spotify';

// Loading spinner component
const LoadingSpinner = () => (
  <div className="p-4 bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor">
    <div className="flex items-center justify-center gap-2 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
      <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
      <span>Loading Spotify connection...</span>
    </div>
  </div>
);

// Spotify logo component
const SpotifyLogo = () => (
  <div className="flex items-center justify-center w-8 h-8 bg-[#1DB954] rounded-lg">
    <div className="i-ph:music-note w-4 h-4 text-white" />
  </div>
);

// Hook for managing user connections
const useUserConnections = () => {
  const { user, isAuthenticated } = useAuth();

  const getConnectionByProvider = async (provider: string) => {
    if (!user?.id || !isAuthenticated) {
      return undefined;
    }

    try {
      const { data, error } = await supabase
        .from('user_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return undefined;
      }

      // Decrypt token if present
      if (data.token) {
        try {
          data.token = atob(data.token);
        } catch {
          // Token is already decrypted or invalid
        }
      }

      return data;
    } catch (error) {
      console.error('Error getting connection:', error);
      return undefined;
    }
  };

  const saveConnection = async (connectionData: any) => {
    if (!user?.id || !isAuthenticated) {
      return false;
    }

    try {
      const encryptedToken = connectionData.token ? btoa(connectionData.token) : null;
      
      const { error } = await supabase
        .from('user_connections')
        .upsert({
          user_id: user.id,
          provider: connectionData.provider,
          token: encryptedToken,
          token_type: connectionData.token_type,
          user_data: connectionData.user_data || {},
          stats: connectionData.stats || {},
          is_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,provider'
        });

      return !error;
    } catch (error) {
      console.error('Error saving connection:', error);
      return false;
    }
  };

  const removeConnection = async (provider: string) => {
    if (!user?.id || !isAuthenticated) {
      return false;
    }

    try {
      const { error } = await supabase
        .from('user_connections')
        .update({ 
          is_active: false,
          token: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('provider', provider);

      return !error;
    } catch (error) {
      console.error('Error removing connection:', error);
      return false;
    }
  };

  return {
    saveConnection,
    getConnectionByProvider,
    removeConnection,
    migrateFromLocalStorage: async () => {},
    connections: [],
    loading: false
  };
};

export default function SpotifyConnection() {
  const { user, isAuthenticated } = useAuth();
  const { 
    saveConnection, 
    getConnectionByProvider, 
    removeConnection,
    loading: connectionsLoading
  } = useUserConnections();
  
  const [connection, setConnection] = useState<SpotifyConnectionType>({
    user: null,
    token: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [stats, setStats] = useState<SpotifyStats | null>(null);

  // Load saved connection on mount
  useEffect(() => {
    const loadSavedConnection = async () => {
      if (connectionsLoading) {
        return;
      }

      setIsLoading(true);

      try {
        // First check localStorage for immediate state
        const savedConnection = localStorage.getItem('spotify_connection');
        if (savedConnection) {
          try {
            const parsed = JSON.parse(savedConnection) as SpotifyConnectionType;
            setConnection(parsed);

            // If authenticated, save to database
            if (isAuthenticated && user?.id) {
              await saveConnection({
                provider: 'spotify',
                token: parsed.token,
                token_type: 'Bearer',
                user_data: parsed.user,
                stats: parsed.stats || {}
              });
            }

            // Fetch fresh stats
            if (parsed.token && user?.id) {
              await fetchSpotifyStats(parsed.token);
            }
          } catch (error) {
            console.error('Error parsing saved Spotify connection:', error);
            localStorage.removeItem('spotify_connection');
          }
        }

        // Then check database if authenticated
        if (isAuthenticated && user?.id) {
          const dbConnection = await getConnectionByProvider('spotify');
          if (dbConnection) {
            const parsed = {
              user: dbConnection.user_data,
              token: dbConnection.token || '',
              stats: dbConnection.stats,
            };

            setConnection(parsed);
            
            // Fetch fresh stats if needed
            if (parsed.user && parsed.token && (!parsed.stats || !parsed.stats.totalPlaylists)) {
              console.log('Fetching missing Spotify stats for saved connection');
              await fetchSpotifyStats(parsed.token);
            }
          }
        }
      } catch (error) {
        console.error('Error loading Spotify connection:', error);
      }
      setIsLoading(false);
    };

    loadSavedConnection();
  }, [isAuthenticated, user?.id, connectionsLoading]);

  // Fetch Spotify stats
  const fetchSpotifyStats = async (token: string) => {
    if (!user?.id) return;

    setIsFetchingStats(true);
    try {
      const response = await fetch(`/api/spotify?action=playlists&userId=${user.id}`);
      if (response.ok) {
        const data = await response.json() as { playlists: SimplifiedPlaylist[] };
        const playlists = data.playlists || [];
        
        const statsData: SpotifyStats = {
          totalPlaylists: playlists.length,
          totalTracks: playlists.reduce((total: number, playlist: any) => total + (playlist.tracks?.total || 0), 0),
          totalFollowers: connection.user?.followers?.total || 0,
          topGenres: [],
          recentlyPlayed: [],
          topTracks: [],
          topArtists: [],
          likedSongs: 0,
        };

        setStats(statsData);
        
        // Update connection with stats
        const updatedConnection = { ...connection, stats: statsData };
        setConnection(updatedConnection);

        // Save to database if authenticated
        if (isAuthenticated) {
          await saveConnection({
            provider: 'spotify',
            token,
            user_data: connection.user,
            stats: statsData
          });
        } else {
          localStorage.setItem('spotify_connection', JSON.stringify(updatedConnection));
        }
      }
    } catch (error) {
      console.error('Error fetching Spotify stats:', error);
    } finally {
      setIsFetchingStats(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // Redirect to Spotify OAuth
      window.location.href = '/api/spotify/auth';
    } catch (error) {
      console.error('Failed to initiate Spotify connection:', error);
      toast.error('Failed to connect to Spotify');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    // Remove from database if authenticated
    if (isAuthenticated) {
      await removeConnection('spotify');
    } else {
      // Remove from localStorage for non-authenticated users
      localStorage.removeItem('spotify_connection');
    }

    // Reset connection state
    setConnection({ user: null, token: '' });
    setStats(null);
    toast.success('Disconnected from Spotify');
  };

  // Handle callback success (when user returns from OAuth)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const spotifySuccess = urlParams.get('spotify_success');
    const spotifyData = urlParams.get('spotify_data');
    const spotifyError = urlParams.get('spotify_error');

    if (spotifySuccess === 'true') {
      if (spotifyData) {
        try {
          const connectionData = JSON.parse(decodeURIComponent(spotifyData)) as SpotifyConnectionType & {
            refreshToken: string;
            expiresAt: number;
            scope: string;
          };
          setConnection(connectionData);

          // Save to database if authenticated
          if (isAuthenticated && user?.id) {
            saveConnection({
              provider: 'spotify',
              token: connectionData.token,
              token_type: 'Bearer',
              user_data: connectionData.user,
              stats: {
                connected_at: new Date().toISOString(),
                scope: connectionData.scope,
                refresh_token: connectionData.refreshToken,
                expires_at: new Date(connectionData.expiresAt).toISOString(),
              }
            });
          } else {
            // Save to localStorage for non-authenticated users
            localStorage.setItem('spotify_connection', JSON.stringify(connectionData));
          }

          toast.success('Connected to Spotify successfully!');
          
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Fetch stats
          if (connectionData.token && user?.id) {
            fetchSpotifyStats(connectionData.token);
          }
        } catch (error) {
          console.error('Error parsing Spotify connection data:', error);
        }
      } else {
        toast.success('Connected to Spotify successfully!');
        // Reload the connection data
        window.location.reload();
      }
    }

    if (spotifyError) {
      toast.error(`Spotify connection failed: ${spotifyError}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isAuthenticated, user?.id]);

  if (isLoading || isConnecting || connectionsLoading) {
    return <LoadingSpinner />;
  }

  const renderStats = () => {
    if (!stats && !connection.stats) return null;

    const displayStats = stats || connection.stats;
    if (!displayStats) return null;

    return (
      <Collapsible open={isStatsExpanded} onOpenChange={setIsStatsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-colors">
            <div className={classNames('i-ph:caret-right w-4 h-4 transition-transform', { 'rotate-90': isStatsExpanded })} />
            <span className="text-sm">View Statistics</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 p-3 rounded-lg">
                <div className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  {displayStats.totalPlaylists || 0}
                </div>
                <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                  Playlists
                </div>
              </div>
              <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 p-3 rounded-lg">
                <div className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  {displayStats.totalTracks || 0}
                </div>
                <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                  Total Tracks
                </div>
              </div>
            </div>
            <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 p-3 rounded-lg">
              <div className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                {displayStats.totalFollowers || 0}
              </div>
              <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                Followers
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <motion.div
      className="bg-bolt-elements-background dark:bg-bolt-elements-background border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SpotifyLogo />
            <h3 className="text-base font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
              Spotify Connection
            </h3>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="text-xs text-bolt-elements-textSecondary bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 p-3 rounded-lg mb-4">
            <p className="flex items-center gap-1 mb-1">
              <span className="i-ph:warning w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
              <span className="font-medium">Sign in required:</span> Please sign in to save your Spotify connection securely to your account.
            </p>
            <p>Without signing in, connections will only be stored locally and may be lost.</p>
          </div>
        )}

        {!connection.user ? (
          <div className="space-y-4">
            <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
              Connect your Spotify account to enable music playback controls throughout the application.
            </p>
            
            <div className="bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary mb-2">
                What you can do with Spotify integration:
              </h4>
              <ul className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary space-y-1">
                <li>• Control music playback with a mini-player</li>
                <li>• Browse and play your playlists</li>
                <li>• Adjust volume and seek through tracks</li>
                <li>• Skip tracks and toggle shuffle/repeat</li>
              </ul>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-[#1DB954] text-white',
                  'hover:bg-[#1ed760] hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {isConnecting ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <div className="i-ph:music-note w-4 h-4" />
                    Connect to Spotify
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col w-full gap-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {connection.user.images && connection.user.images.length > 0 && (
                  <img
                    src={connection.user.images[0].url}
                    alt={connection.user.display_name}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div>
                  <div className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                    {connection.user.display_name}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                    {connection.user.email}
                  </div>
                </div>
              </div>
              <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                Connected to Spotify
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDisconnect}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-red-500 text-white',
                  'hover:bg-red-600',
                )}
              >
                <div className="i-ph:plug w-4 h-4" />
                Disconnect
              </button>

              {connection.token && user?.id && (
                <button
                  onClick={() => fetchSpotifyStats(connection.token)}
                  disabled={isFetchingStats}
                  className={classNames(
                    'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                    'bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2',
                    'text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary',
                    'hover:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-3',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isFetchingStats ? (
                    <>
                      <div className="i-ph:spinner-gap animate-spin w-4 h-4" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <div className="i-ph:arrow-clockwise w-4 h-4" />
                      Refresh Stats
                    </>
                  )}
                </button>
              )}
            </div>

            {renderStats()}
          </div>
        )}
      </div>
    </motion.div>
  );
} 