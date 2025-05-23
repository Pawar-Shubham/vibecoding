import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { authStore, initAuth, setupAuthListener, isAuthenticated } from '~/lib/stores/auth';

export function useAuth() {
  const auth = useStore(authStore);

  useEffect(() => {
    console.log('useAuth effect running:', {
      initialized: auth.initialized,
      loading: auth.loading,
      hasUser: !!auth.user,
      userId: auth.user?.id
    });

    // Initialize auth from existing session
    if (!auth.initialized) {
      console.log('Initializing auth...');
      initAuth();
      
      // Set up auth state change listener
      setupAuthListener();
    }
  }, [auth.initialized]);

  return {
    user: auth.user,
    session: auth.session,
    loading: auth.loading,
    initialized: auth.initialized,
    isAuthenticated: isAuthenticated(),
  };
} 