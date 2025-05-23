import { json, redirect, type LoaderFunction } from '@remix-run/cloudflare';
import { supabase } from '~/lib/supabase';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
  if (code) {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth callback error:', error);
        return json({ error: error.message }, { status: 400 });
      }
      
      // Successful authentication, redirect to the home page
      return redirect('/');
    } catch (error) {
      console.error('Auth callback unexpected error:', error);
      return json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
  }
  
  return redirect('/');
}; 