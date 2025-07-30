import { json, type ActionFunction, type LoaderFunction } from '@remix-run/cloudflare';
import { supabase } from '~/lib/supabase';
import type { 
  SpotifyUser, 
  SpotifyPlaylist, 
  SpotifyCurrentlyPlaying, 
  SpotifyPlaybackState,
  SpotifyDevice,
  SpotifyPaginatedResponse,
  SimplifiedPlaylist
} from '~/types/spotify';

// Helper function to get Spotify connection for user
async function getSpotifyConnection(userId: string, request: Request) {
  // Try to get token from Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return {
      token: authHeader.slice(7),
      refreshToken: null,
      expiresAt: null,
    };
  }

  // If no auth header, try database
  const { data, error } = await supabase
    .from('user_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  // Decrypt token
  const token = data.token ? atob(data.token) : null;
  const refreshToken = data.stats?.refresh_token ? atob(data.stats.refresh_token) : null;

  return {
    ...data,
    token,
    refreshToken,
    expiresAt: data.stats?.expires_at ? new Date(data.stats.expires_at).getTime() : null,
  };
}

// Helper function to refresh Spotify token
async function refreshSpotifyToken(userId: string, refreshToken: string) {
  const SPOTIFY_CLIENT_ID = 'e6e652fada5f4318bf94a5b8cfea67aa';
  const SPOTIFY_CLIENT_SECRET = '19b143c463f444ed99985c57220ac7f4';

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const tokenData: { access_token: string; expires_in: number } = await response.json();

    // Update the connection in database
    await supabase
      .from('user_connections')
      .update({
        token: btoa(tokenData.access_token),
        stats: {
          expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
          refresh_token: refreshToken ? btoa(refreshToken) : null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'spotify');

    return tokenData.access_token;
  } catch (error) {
    console.error('Error refreshing Spotify token:', error);
    return null;
  }
}

// Helper function to make authenticated Spotify API requests
async function spotifyApiRequest(userId: string, endpoint: string, request: Request, options: RequestInit = {}) {
  const connection = await getSpotifyConnection(userId, request);
  
  if (!connection) {
    throw new Error('No Spotify connection found');
  }

  let { token, refreshToken, expiresAt } = connection;

  // Check if token needs refresh
  if (expiresAt && Date.now() >= expiresAt - 60000) { // Refresh 1 minute before expiry
    if (refreshToken) {
      const newToken = await refreshSpotifyToken(userId, refreshToken);
      if (newToken) {
        token = newToken;
      }
    }
  }

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error: ${response.status} - ${errorText}`);
  }

  return response;
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return json({ error: 'User ID required' }, { status: 400 });
  }

  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'No authorization token provided' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  try {
    // Make request directly to Spotify API
    const makeSpotifyRequest = async (endpoint: string, options: RequestInit = {}) => {
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok && response.status !== 204) {
        const errorText = await response.text();
        throw new Error(`Spotify API error: ${response.status} - ${errorText}`);
      }

      return response;
    };

    switch (action) {
      case 'user': {
        const response = await makeSpotifyRequest('/me');
        const user: SpotifyUser = await response.json();
        return json({ user });
      }

      case 'playlists': {
        const response = await makeSpotifyRequest('/me/playlists?limit=50');
        const playlists: SpotifyPaginatedResponse<SpotifyPlaylist> = await response.json();
        
        // Simplify playlist data for mini-player
        const simplifiedPlaylists: SimplifiedPlaylist[] = playlists.items.map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          images: playlist.images,
          tracks: playlist.tracks,
          owner: {
            display_name: playlist.owner.display_name,
          },
          uri: playlist.uri,
        }));
        
        return json({ playlists: simplifiedPlaylists });
      }

      case 'current-playing': {
        const response = await makeSpotifyRequest('/me/player/currently-playing');
        
        if (response.status === 204) {
          return json({ currentTrack: null });
        }
        
        const currentlyPlaying: SpotifyCurrentlyPlaying = await response.json();
        return json({ currentlyPlaying });
      }

      case 'playback-state': {
        const response = await makeSpotifyRequest('/me/player');
        
        if (response.status === 204) {
          return json({ playbackState: null });
        }
        
        const playbackState: SpotifyPlaybackState = await response.json();
        return json({ playbackState });
      }

      case 'devices': {
        const response = await makeSpotifyRequest('/me/player/devices');
        const devices: { devices: SpotifyDevice[] } = await response.json();
        return json({ devices: devices.devices });
      }

      case 'playlist-tracks': {
        const playlistId = url.searchParams.get('playlistId');
        if (!playlistId) {
          return json({ error: 'Playlist ID required' }, { status: 400 });
        }
        
        const response = await makeSpotifyRequest(`/playlists/${playlistId}/tracks?limit=100`);
        const tracks: { items: any[] } = await response.json();
        return json({ tracks: tracks.items });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Spotify API error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
};

export const action: ActionFunction = async ({ request }) => {
  const requestBody = await request.json() as { action: string; userId: string; [key: string]: any };
  const { action, userId, ...params } = requestBody;

  if (!userId) {
    return json({ error: 'User ID required' }, { status: 400 });
  }

  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'No authorization token provided' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  try {
    // Make request directly to Spotify API
    const makeSpotifyRequest = async (endpoint: string, options: RequestInit = {}) => {
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok && response.status !== 204) {
        const errorText = await response.text();
        throw new Error(`Spotify API error: ${response.status} - ${errorText}`);
      }

      return response;
    };

    switch (action) {
      case 'play': {
        const { uri, deviceId } = params;
        const endpoint = deviceId ? `/me/player/play?device_id=${deviceId}` : '/me/player/play';
        const body = uri ? { uris: [uri] } : undefined;
        
        await makeSpotifyRequest(endpoint, {
          method: 'PUT',
          body: body ? JSON.stringify(body) : undefined,
        });
        
        return json({ success: true });
      }

      case 'pause': {
        const { deviceId } = params;
        const endpoint = deviceId ? `/me/player/pause?device_id=${deviceId}` : '/me/player/pause';
        
        await makeSpotifyRequest(endpoint, {
          method: 'PUT',
        });
        
        return json({ success: true });
      }

      case 'next': {
        const { deviceId } = params;
        const endpoint = deviceId ? `/me/player/next?device_id=${deviceId}` : '/me/player/next';
        
        await makeSpotifyRequest(endpoint, {
          method: 'POST',
        });
        
        return json({ success: true });
      }

      case 'previous': {
        const { deviceId } = params;
        const endpoint = deviceId ? `/me/player/previous?device_id=${deviceId}` : '/me/player/previous';
        
        await makeSpotifyRequest(endpoint, {
          method: 'POST',
        });
        
        return json({ success: true });
      }

      case 'seek': {
        const { positionMs, deviceId } = params;
        const endpoint = deviceId 
          ? `/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`
          : `/me/player/seek?position_ms=${positionMs}`;
        
        await makeSpotifyRequest(endpoint, {
          method: 'PUT',
        });
        
        return json({ success: true });
      }

      case 'volume': {
        const { volumePercent, deviceId } = params;
        const endpoint = deviceId 
          ? `/me/player/volume?volume_percent=${volumePercent}&device_id=${deviceId}`
          : `/me/player/volume?volume_percent=${volumePercent}`;
        
        await makeSpotifyRequest(endpoint, {
          method: 'PUT',
        });
        
        return json({ success: true });
      }

      case 'shuffle': {
        const { state, deviceId } = params;
        const endpoint = deviceId 
          ? `/me/player/shuffle?state=${state}&device_id=${deviceId}`
          : `/me/player/shuffle?state=${state}`;
        
        await makeSpotifyRequest(endpoint, {
          method: 'PUT',
        });
        
        return json({ success: true });
      }

      case 'repeat': {
        const { state, deviceId } = params;
        const endpoint = deviceId 
          ? `/me/player/repeat?state=${state}&device_id=${deviceId}`
          : `/me/player/repeat?state=${state}`;
        
        await makeSpotifyRequest(endpoint, {
          method: 'PUT',
        });
        
        return json({ success: true });
      }

      case 'play-playlist': {
        const { playlistUri, deviceId } = params;
        
        try {
          // First get available devices
          const devicesResponse = await makeSpotifyRequest('/me/player/devices');
          const devicesData = await devicesResponse.json() as { devices: SpotifyDevice[] };
          
          // If no deviceId provided, use the first active device
          let targetDeviceId = deviceId;
          if (!targetDeviceId && devicesData.devices.length > 0) {
            const activeDevice = devicesData.devices.find(d => d.is_active) || devicesData.devices[0];
            targetDeviceId = activeDevice.id || null;
          }

          // Construct the endpoint
          const endpoint = targetDeviceId 
            ? `/me/player/play?device_id=${targetDeviceId}` 
            : '/me/player/play';
          
          // Make the play request
          await makeSpotifyRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify({
              context_uri: playlistUri,
            }),
          });
          
          return json({ success: true });
        } catch (error) {
          console.error('Error playing playlist:', error);
          // If no active device found, return a specific error
          if (error instanceof Error && error.message.includes('No active device found')) {
            return json({ error: 'No active device found. Please open Spotify on a device first.' }, { status: 404 });
          }
          throw error; // Re-throw other errors to be caught by the outer catch block
        }
      }

      case 'play-track': {
        const { trackUri, deviceId } = params;
        
        try {
          // First get available devices
          const devicesResponse = await makeSpotifyRequest('/me/player/devices');
          const devicesData = await devicesResponse.json() as { devices: SpotifyDevice[] };
          
          // If no deviceId provided, use the first active device
          let targetDeviceId = deviceId;
          if (!targetDeviceId && devicesData.devices.length > 0) {
            const activeDevice = devicesData.devices.find(d => d.is_active) || devicesData.devices[0];
            targetDeviceId = activeDevice.id || null;
          }

          // Construct the endpoint
          const endpoint = targetDeviceId 
            ? `/me/player/play?device_id=${targetDeviceId}` 
            : '/me/player/play';
          
          // Make the play request
          await makeSpotifyRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify({
              uris: [trackUri],
            }),
          });
          
          return json({ success: true });
        } catch (error) {
          console.error('Error playing track:', error);
          // If no active device found, return a specific error
          if (error instanceof Error && error.message.includes('No active device found')) {
            return json({ error: 'No active device found. Please open Spotify on a device first.' }, { status: 404 });
          }
          throw error; // Re-throw other errors to be caught by the outer catch block
        }
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Spotify action error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}; 