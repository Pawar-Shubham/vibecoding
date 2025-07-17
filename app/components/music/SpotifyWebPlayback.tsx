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

  useEffect(() => {
    // Reset player when token changes
    if (player) {
      player.disconnect();
      setPlayer(null);
    }

    if (!token) return;

    const loadPlayer = async () => {
      if (!scriptLoaded && !scriptLoading) {
        scriptLoading = true;
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
          });
          scriptLoaded = true;
          scriptLoading = false;
        } catch (error) {
          scriptLoading = false;
          onError?.(new Error('Failed to load Spotify SDK'));
          return;
        }
      }

      if (!window.Spotify) {
        onError?.(new Error('Spotify SDK not available'));
        return;
      }

      const newPlayer = new window.Spotify.Player({
        name: 'VibeCoded Web Player',
        getOAuthToken: (cb: (token: string) => void) => cb(token),
        volume: 0.5
      });

      newPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Ready with Device ID', device_id);
        onReady?.(device_id);
      });

      newPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Device ID has gone offline', device_id);
      });

      newPlayer.addListener('player_state_changed', (state: any) => {
        onStateChange?.(state);
      });

      newPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
        onError?.(new Error(`Initialization error: ${message}`));
      });

      newPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
        onError?.(new Error(`Authentication error: ${message}`));
      });

      newPlayer.addListener('account_error', ({ message }: { message: string }) => {
        onError?.(new Error(`Account error: ${message}`));
      });

      try {
        const connected = await newPlayer.connect();
        if (connected) {
          setPlayer(newPlayer);
        } else {
          onError?.(new Error('Failed to connect to Spotify'));
        }
      } catch (error) {
        onError?.(new Error('Failed to initialize Spotify player'));
      }
    };

    // If script is already loaded, initialize player immediately
    if (scriptLoaded && window.Spotify) {
      loadPlayer();
    } else {
      // Wait for SDK to be ready
      window.onSpotifyWebPlaybackSDKReady = () => {
        scriptLoaded = true;
        loadPlayer();
      };
    }

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, [token]);

  return null;
} 