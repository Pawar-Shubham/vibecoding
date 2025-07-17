import { json, redirect, type LoaderFunction } from '@remix-run/cloudflare';

const SPOTIFY_CLIENT_ID = 'e6e652fada5f4318bf94a5b8cfea67aa';

const SPOTIFY_SCOPES = [
  'streaming',                // Required for Web Playback SDK
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'app-remote-control',      // Required for playback control
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-top-read',
  'user-read-recently-played',
  'user-follow-read',
].join(' ');

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const origin = url.origin;
  
  // Generate a random state parameter for security
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  // Determine the correct redirect URI based on environment
  let redirectUri;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    redirectUri = `${origin}/api/spotify/callback`;
  } else {
    redirectUri = 'https://vibecoded.com/api/spotify/callback';
  }
  
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set('scope', SPOTIFY_SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('show_dialog', 'true'); // Force re-authorization for better UX
  
  console.log('Redirecting to Spotify OAuth:', authUrl.toString());
  console.log('Using redirect URI:', redirectUri);
  
  return redirect(authUrl.toString());
}; 