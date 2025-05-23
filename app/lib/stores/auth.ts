import { atom } from 'nanostores';
import { supabase, getCurrentUser, getSession } from '~/lib/supabase';

export interface AuthState {
  user: any | null;
  session: any | null;
  loading: boolean;
  initialized: boolean;
}

// Initialize auth state
export const authStore = atom<AuthState>({
  user: null,
  session: null,
  loading: true,
  initialized: false,
});

// Initialize auth from existing session
export const initAuth = async () => {
  authStore.set({ ...authStore.get(), loading: true });
  
  try {
    const session = await getSession();
    
    if (session) {
      const user = await getCurrentUser();
      authStore.set({ user, session, loading: false, initialized: true });
    } else {
      authStore.set({ user: null, session: null, loading: false, initialized: true });
    }
  } catch (error) {
    console.error('Error initializing auth:', error);
    authStore.set({ user: null, session: null, loading: false, initialized: true });
  }
};

// Set up auth state change listener
export const setupAuthListener = () => {
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event, session);
    
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      const user = await getCurrentUser();
      authStore.set({ user, session, loading: false, initialized: true });
    } else if (event === 'SIGNED_OUT') {
      authStore.set({ user: null, session: null, loading: false, initialized: true });
    }
  });
};

// Check if user is authenticated
export const isAuthenticated = () => {
  const { user, session } = authStore.get();
  return !!user && !!session;
}; 