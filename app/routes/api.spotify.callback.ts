import { json, redirect, type LoaderFunction } from '@remix-run/cloudflare';
import { supabase } from '~/lib/supabase';
import type { SpotifyTokenResponse, SpotifyUser } from '~/types/spotify';

const SPOTIFY_CLIENT_ID = 'e6e652fada5f4318bf94a5b8cfea67aa';
const SPOTIFY_CLIENT_SECRET = '19b143c463f444ed99985c57220ac7f4';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');

  // Handle authorization errors
  if (error) {
    console.error('Spotify OAuth error:', error);
    return redirect(`/?spotify_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    console.error('No authorization code received from Spotify');
    return redirect('/?spotify_error=no_code');
  }

  try {
    // Determine the correct redirect URI based on request origin
    const origin = url.origin;
    let redirectUri;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      redirectUri = `${origin}/api/spotify/callback`;
    } else {
      redirectUri = 'https://vibecoded.com/api/spotify/callback';
    }

    console.log('Exchanging code for tokens with redirect URI:', redirectUri);

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Spotify token exchange failed:', errorData);
      return redirect(`/?spotify_error=${encodeURIComponent('token_exchange_failed')}`);
    }

    const tokenData: SpotifyTokenResponse = await tokenResponse.json();
    console.log('Spotify token exchange successful');

    // Get user profile from Spotify
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch Spotify user profile');
      return redirect(`/?spotify_error=${encodeURIComponent('user_fetch_failed')}`);
    }

    const userData: SpotifyUser = await userResponse.json();
    console.log('Spotify user profile fetched:', userData.display_name);

    // Get current authenticated user from Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('User not authenticated, storing tokens in localStorage');
      // If user is not authenticated, we'll handle this client-side
      const connectionData = {
        user: userData,
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope,
      };

      // Redirect with success and let client-side handle localStorage
      const encodedData = encodeURIComponent(JSON.stringify(connectionData));
      return redirect(`/?spotify_success=true&spotify_data=${encodedData}`);
    }

    // User is authenticated, save to database
    try {
      const { error: dbError } = await supabase
        .from('user_connections')
        .upsert({
          user_id: user.id,
          provider: 'spotify',
          token: btoa(tokenData.access_token), // Base64 encode for basic security
          token_type: 'Bearer',
          user_data: userData,
          stats: {
            connected_at: new Date().toISOString(),
            scope: tokenData.scope,
            refresh_token: tokenData.refresh_token ? btoa(tokenData.refresh_token) : null,
            expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
          },
          is_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,provider'
        });

      if (dbError) {
        console.error('Failed to save Spotify connection to database:', dbError);
        return redirect(`/?spotify_error=${encodeURIComponent('db_save_failed')}`);
      }

      console.log('Spotify connection saved to database for user:', user.id);
      return redirect('/?spotify_success=true');

    } catch (dbError) {
      console.error('Database error:', dbError);
      return redirect(`/?spotify_error=${encodeURIComponent('db_error')}`);
    }

  } catch (error) {
    console.error('Spotify callback error:', error);
    return redirect(`/?spotify_error=${encodeURIComponent('unknown_error')}`);
  }
}; 