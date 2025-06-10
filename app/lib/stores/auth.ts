import { atom } from 'nanostores';
import { supabase, getCurrentUser, getSession } from '~/lib/supabase';
import { logStore } from './logs';
import type { SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js';

export interface AuthState {
  user: any | null;
  session: any | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
}

// Initialize auth state
export const authStore = atom<AuthState>({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  error: null
});

let isInitializing = false;
let authListener: { subscription: { unsubscribe: () => void } } | null = null;

// Initialize auth from existing session
export const initAuth = async () => {
  // Prevent multiple simultaneous initializations
  if (isInitializing) {
    return;
  }

  isInitializing = true;
  authStore.set({ ...authStore.get(), loading: true, error: null });
  
  try {
    // First try to get session from storage
    const session = await getSession();
    
    // If no session, try to restore from localStorage
    if (!session && typeof window !== 'undefined') {
      try {
        const storedSession = localStorage.getItem('supabase.auth.token');
        if (storedSession) {
          const parsedSession = JSON.parse(storedSession);
          if (parsedSession?.currentSession) {
            await supabase.auth.setSession(parsedSession.currentSession);
            const refreshedSession = await getSession();
            if (refreshedSession) {
              const user = await getCurrentUser();
              if (user) {
                logStore.logAuth('session_restored_from_storage', true, { userId: user.id });
                authStore.set({ 
                  user, 
                  session: refreshedSession, 
                  loading: false, 
                  initialized: true,
                  error: null 
                });
                return;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error restoring session from storage:', error);
      }
    }
    
    if (session) {
      const user = await getCurrentUser();
      if (user) {
        logStore.logAuth('session_restored', true, { userId: user.id });
        authStore.set({ 
          user, 
          session, 
          loading: false, 
          initialized: true,
          error: null 
        });
      } else {
        // Session exists but no user - clear the invalid session
        await supabase.auth.signOut();
        logStore.logAuth('session_invalid', false);
        authStore.set({ 
          user: null, 
          session: null, 
          loading: false, 
          initialized: true,
          error: 'Invalid session detected' 
        });
      }
    } else {
      authStore.set({ 
        user: null, 
        session: null, 
        loading: false, 
        initialized: true,
        error: null 
      });
    }
  } catch (error) {
    console.error('Error initializing auth:', error);
    logStore.logAuth('init_error', false, { error });
    authStore.set({ 
      user: null, 
      session: null, 
      loading: false, 
      initialized: true,
      error: 'Failed to initialize authentication' 
    });
  } finally {
    isInitializing = false;
  }
};

// Set up auth state change listener
export const setupAuthListener = () => {
  // Remove existing listener if any
  cleanupAuth();

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
    console.log('Auth state changed:', event, session);
    
    try {
      switch (event) {
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
          const user = await getCurrentUser();
          if (user) {
            logStore.logAuth(event.toLowerCase(), true, { userId: user.id });
            authStore.set({ 
              user, 
              session, 
              loading: false, 
              initialized: true,
              error: null 
            });
          } else {
            throw new Error('User not found after sign in');
          }
          break;

        case 'SIGNED_OUT':
          logStore.logAuth('signout', true);
          authStore.set({ 
            user: null, 
            session: null, 
            loading: false, 
            initialized: true,
            error: null 
          });
          // Clear any auth-related cookies or local storage
          localStorage.removeItem('supabase.auth.token');
          sessionStorage.removeItem('supabase.auth.token');
          break;

        case 'USER_DELETED':
          logStore.logAuth('user_deleted', true);
          await supabase.auth.signOut();
          authStore.set({ 
            user: null, 
            session: null, 
            loading: false, 
            initialized: true,
            error: null 
          });
          break;

        case 'USER_UPDATED':
          const updatedUser = await getCurrentUser();
          if (updatedUser) {
            logStore.logAuth('user_updated', true, { userId: updatedUser.id });
            authStore.set({ 
              user: updatedUser, 
              session, 
              loading: false, 
              initialized: true,
              error: null 
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error in auth state change:', error);
      logStore.logAuth('state_change_error', false, { error, event });
      authStore.set({ 
        ...authStore.get(), 
        error: 'Authentication state change failed',
        loading: false 
      });
    }
  });

  // Store the subscription
  authListener = { subscription };
};

// Check if user is authenticated
export const isAuthenticated = () => {
  const { user, session, error } = authStore.get();
  return !!user && !!session && !error;
};

// Clean up auth listener
export const cleanupAuth = () => {
  if (authListener?.subscription) {
    try {
      authListener.subscription.unsubscribe();
    } catch (error) {
      console.error('Error unsubscribing from auth listener:', error);
    }
    authListener = null;
  }
}; 