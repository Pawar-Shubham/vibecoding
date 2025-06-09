import { json, redirect, type LoaderFunction } from '@remix-run/cloudflare';
import { supabase, getCurrentUser, getSession } from '~/lib/supabase';
import { authStore } from '~/lib/stores/auth';
import { logStore } from '~/lib/stores/logs';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';
  
  if (code) {
    try {
      // Exchange the code for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth callback error:', error);
        logStore.logAuth('oauth_callback', false, { error });
        return json({ error: error.message }, { status: 400 });
      }

      if (data.session && data.user) {
        // Update the auth store with the new session data
        authStore.set({
          user: data.user,
          session: data.session,
          loading: false,
          initialized: true,
          error: null
        });

        logStore.logAuth('oauth_callback', true, { userId: data.user.id });
        
        // Add a small delay to ensure the auth state is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Redirect to the next URL or home page
        return redirect(next);
      } else {
        logStore.logAuth('oauth_callback', false, { error: 'No session or user data' });
        return json({ error: 'Failed to get user session' }, { status: 400 });
      }
    } catch (error) {
      console.error('Auth callback unexpected error:', error);
      logStore.logAuth('oauth_callback', false, { error });
      return json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
  }
  
  // No code provided, redirect to home
  return redirect('/');
}; 