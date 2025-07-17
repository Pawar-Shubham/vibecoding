import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

interface SpotifyWebPlaybackProps {
  token: string;
  onReady?: (deviceId: string) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: any) => void;
}

let scriptLoaded = false;
let scriptLoading = false;

export default function SpotifyWebPlayback({ token, onReady, onError, onStateChange }: SpotifyWebPlaybackProps) {
  const [player, setPlayer] = useState<any>(null);
  const [initializationAttempts, setInitializationAttempts] = useState(0);

  useEffect(() => {
    let isMounted = true;

    // Reset player when token changes
    if (player) {
      console.log('Disconnecting existing player...');
      player.disconnect();
      setPlayer(null);
    }

    if (!token) {
      console.error('No token provided to SpotifyWebPlayback');
      onError?.(new Error('No token provided'));
      return;
    }

    const loadScript = async (): Promise<void> => {
      console.log('Starting script load process...');
      
      if (scriptLoaded) {
        console.log('Script already loaded');
        return;
      }
      
      if (scriptLoading) {
        console.log('Script is currently loading, waiting...');
        await new Promise<void>((resolve) => {
          const checkLoaded = setInterval(() => {
            if (scriptLoaded) {
              clearInterval(checkLoaded);
              resolve();
            }
          }, 100);
        });
        return;
      }

        scriptLoading = true;
      return new Promise((resolve, reject) => {
        console.log('Loading Spotify SDK script...');
            const script = document.createElement('script');
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            script.async = true;

        script.onload = () => {
          console.log('Script loaded, waiting for SDK ready event...');
          window.onSpotifyWebPlaybackSDKReady = () => {
            console.log('SDK is ready');
          scriptLoaded = true;
          scriptLoading = false;
            resolve();
          };
        };

        script.onerror = (error) => {
          console.error('Failed to load Spotify SDK script:', error);
          scriptLoading = false;
          reject(new Error('Failed to load Spotify SDK'));
        };

        document.body.appendChild(script);
      });
    };

    const waitForSpotifySDK = async (): Promise<void> => {
      console.log('Checking for Spotify SDK...');
      if (!window.Spotify) {
        console.log('Spotify SDK not found, waiting...');
        await new Promise<void>((resolve) => {
          const checkSDK = setInterval(() => {
            if (window.Spotify) {
              console.log('Spotify SDK found');
              clearInterval(checkSDK);
              resolve();
            }
          }, 100);
        });
      } else {
        console.log('Spotify SDK already available');
      }
    };

    const initializePlayer = async () => {
      try {
        console.log('Starting player initialization...');
        
        // First, ensure script is loaded
        await loadScript();
        console.log('Script loading complete');
        
        // Then wait for SDK to be ready
        await waitForSpotifySDK();
        console.log('SDK is ready, creating player...');

        // Create and initialize player
      const newPlayer = new window.Spotify.Player({
        name: 'VibeCoded Web Player',
        getOAuthToken: (cb: (token: string) => void) => cb(token),
        volume: 0.5
      });

        // Add event listeners
      newPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
          console.log('Player ready with Device ID:', device_id);
          if (isMounted) {
        onReady?.(device_id);
          }
      });

      newPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          console.log('Device ID has gone offline:', device_id);
          // Try to reconnect
          if (player && isMounted) {
            console.log('Attempting to reconnect...');
            player.connect();
          }
      });

      newPlayer.addListener('player_state_changed', (state: any) => {
          console.log('Player state changed:', state ? 'State received' : 'No state');
          if (state && isMounted) {
        onStateChange?.(state);
          }
      });

      newPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
          const error = new Error(`Initialization error: ${message}`);
          console.error('Player initialization error:', error);
          if (isMounted) {
            onError?.(error);
            setPlayer(null);
          }
      });

      newPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
          const error = new Error(`Authentication error: ${message}`);
          console.error('Player authentication error:', error);
          if (isMounted) {
            onError?.(error);
            setPlayer(null);
          }
      });

      newPlayer.addListener('account_error', ({ message }: { message: string }) => {
          const error = new Error(`Account error: ${message}`);
          console.error('Player account error:', error);
          if (isMounted) {
            onError?.(error);
            setPlayer(null);
          }
      });

        // Connect to Spotify
        console.log('Connecting to Spotify...');
        const connected = await newPlayer.connect();
        
        if (connected) {
          console.log('Successfully connected to Spotify');
          if (isMounted) {
          setPlayer(newPlayer);
          }
        } else {
          throw new Error('Failed to connect to Spotify');
        }
      } catch (error) {
        console.error('Player initialization error:', error);
        if (isMounted) {
          onError?.(error instanceof Error ? error : new Error('Failed to initialize Spotify player'));
          setPlayer(null);

          // Retry initialization if we haven't exceeded max attempts
          if (initializationAttempts < 2) {
            console.log(`Retrying initialization (attempt ${initializationAttempts + 1}/3)...`);
            setTimeout(() => {
              if (isMounted) {
                setInitializationAttempts(prev => prev + 1);
              }
            }, 2000);
          }
        }
      }
    };

    initializePlayer();

    return () => {
      isMounted = false;
      if (player) {
        console.log('Cleaning up player...');
        player.disconnect();
      }
    };
  }, [token, initializationAttempts]);

  return null;
} 