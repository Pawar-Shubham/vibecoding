import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { authStore, initAuth, setupAuthListener, isAuthenticated, cleanupAuth } from '~/lib/stores/auth';
import { logStore } from '~/lib/stores/logs';

export function useAuth() {
  const auth = useStore(authStore);
  const listenerSetup = useRef(false);

  useEffect(() => {
    logStore.logSystem('Auth hook initialized', {
      initialized: auth.initialized,
      loading: auth.loading,
      hasUser: !!auth.user,
      userId: auth.user?.id,
      hasError: !!auth.error
    });

    // Initialize auth from existing session
    if (!auth.initialized && !listenerSetup.current) {
      logStore.logSystem('Initializing auth...');
      listenerSetup.current = true;
      initAuth();
      
      // Set up auth state change listener
      setupAuthListener();
    }

    // Cleanup function
    return () => {
      if (listenerSetup.current) {
        cleanupAuth();
        listenerSetup.current = false;
      }
    };
  }, [auth.initialized]);

  // Effect to handle auth errors
  useEffect(() => {
    if (auth.error) {
      logStore.logSystem('Auth error detected', { error: auth.error });
      // You could trigger a toast notification here if needed
    }
  }, [auth.error]);

  return {
    user: auth.user,
    session: auth.session,
    loading: auth.loading,
    initialized: auth.initialized,
    error: auth.error,
    isAuthenticated: isAuthenticated(),
  };
} 