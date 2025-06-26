import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  saveUserConnection,
  getUserConnection,
  getAllUserConnections,
  updateConnectionStats,
  removeUserConnection,
  hasUserConnection,
  type ConnectionProvider,
  type ConnectionData,
  type UserConnection
} from '~/lib/services/userConnections';
import { logStore } from '~/lib/stores/logs';
import { toast } from 'react-toastify';

export function useUserConnections() {
  const { user, isAuthenticated } = useAuth();
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all user connections on mount
  const loadConnections = useCallback(async () => {
    if (!user?.id || !isAuthenticated) {
      setConnections([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getAllUserConnections(user.id);
      
      if (result.success) {
        setConnections(result.data || []);
      } else {
        setError(result.error || 'Failed to load connections');
        logStore.logError('Failed to load user connections', { error: result.error, userId: user.id });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      logStore.logError('Error loading user connections', { error, userId: user.id });
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAuthenticated]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Save a connection
  const saveConnection = useCallback(async (connectionData: ConnectionData, showToast: boolean = true): Promise<boolean> => {
    if (!user?.id || !isAuthenticated) {
      if (showToast) {
        toast.error('Please sign in to save connections');
      }
      return false;
    }

    try {
      const result = await saveUserConnection(user.id, connectionData);
      
      if (result.success) {
        if (showToast) {
          toast.success(`${connectionData.provider} connection saved successfully`);
        }
        await loadConnections(); // Refresh the list
        return true;
      } else {
        if (showToast) {
          toast.error(result.error || `Failed to save ${connectionData.provider} connection`);
        }
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (showToast) {
        toast.error(`Error saving ${connectionData.provider} connection: ${errorMessage}`);
      }
      return false;
    }
  }, [user?.id, isAuthenticated, loadConnections]);

  // Get a specific connection
  const getConnection = useCallback(async (provider: ConnectionProvider): Promise<UserConnection | null> => {
    if (!user?.id || !isAuthenticated) {
      return null;
    }

    try {
      const result = await getUserConnection(user.id, provider);
      
      if (result.success) {
        return result.data || null;
      } else {
        logStore.logError(`Failed to get ${provider} connection`, { error: result.error, userId: user.id });
        return null;
      }
    } catch (error) {
      logStore.logError(`Error getting ${provider} connection`, { error, userId: user.id });
      return null;
    }
  }, [user?.id, isAuthenticated]);

  // Update connection stats
  const updateStats = useCallback(async (provider: ConnectionProvider, stats: any): Promise<boolean> => {
    if (!user?.id || !isAuthenticated) {
      return false;
    }

    try {
      const result = await updateConnectionStats(user.id, provider, stats);
      
      if (result.success) {
        await loadConnections(); // Refresh the list
        return true;
      } else {
        logStore.logError(`Failed to update ${provider} stats`, { error: result.error, userId: user.id });
        return false;
      }
    } catch (error) {
      logStore.logError(`Error updating ${provider} stats`, { error, userId: user.id });
      return false;
    }
  }, [user?.id, isAuthenticated, loadConnections]);

  // Remove a connection
  const removeConnection = useCallback(async (provider: ConnectionProvider): Promise<boolean> => {
    if (!user?.id || !isAuthenticated) {
      toast.error('Please sign in to remove connections');
      return false;
    }

    try {
      const result = await removeUserConnection(user.id, provider);
      
      if (result.success) {
        toast.success(`${provider} connection removed successfully`);
        await loadConnections(); // Refresh the list
        return true;
      } else {
        toast.error(result.error || `Failed to remove ${provider} connection`);
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Error removing ${provider} connection: ${errorMessage}`);
      return false;
    }
  }, [user?.id, isAuthenticated, loadConnections]);

  // Check if user has a specific connection
  const checkConnection = useCallback(async (provider: ConnectionProvider): Promise<boolean> => {
    if (!user?.id || !isAuthenticated) {
      return false;
    }

    try {
      const result = await hasUserConnection(user.id, provider);
      return result.hasConnection;
    } catch (error) {
      logStore.logError(`Error checking ${provider} connection`, { error, userId: user.id });
      return false;
    }
  }, [user?.id, isAuthenticated]);

  // Get connection by provider (helper function)
  const getConnectionByProvider = useCallback((provider: ConnectionProvider): UserConnection | undefined => {
    return connections.find(conn => conn.provider === provider && conn.is_active);
  }, [connections]);

  // Migrate from localStorage to database (helper function for transition)
  const migrateFromLocalStorage = useCallback(async () => {
    if (!user?.id || !isAuthenticated) {
      return;
    }

    try {
      let hasMigrated = false;

      // Check for GitHub connection in localStorage
      const githubConnection = localStorage.getItem('github_connection');
      if (githubConnection) {
        try {
          const parsed = JSON.parse(githubConnection);
          if (parsed.token && parsed.user) {
            await saveConnection({
              provider: 'github',
              token: parsed.token,
              token_type: parsed.tokenType || 'classic',
              user_data: parsed.user,
              stats: parsed.stats || {}
            }, false); // Don't show toast for migration
            localStorage.removeItem('github_connection');
            hasMigrated = true;
          }
        } catch (e) {
          console.error('Failed to migrate GitHub connection:', e);
        }
      }

      // Check for Netlify connection in localStorage
      const netlifyConnection = localStorage.getItem('netlify_connection');
      if (netlifyConnection) {
        try {
          const parsed = JSON.parse(netlifyConnection);
          if (parsed.token && parsed.user) {
            await saveConnection({
              provider: 'netlify',
              token: parsed.token,
              user_data: parsed.user,
              stats: parsed.stats || {}
            }, false); // Don't show toast for migration
            localStorage.removeItem('netlify_connection');
            hasMigrated = true;
          }
        } catch (e) {
          console.error('Failed to migrate Netlify connection:', e);
        }
      }



      // Only reload connections if we actually migrated something
      if (hasMigrated) {
        await loadConnections();
      }
    } catch (error) {
      logStore.logError('Error during localStorage migration', { error, userId: user.id });
    }
  }, [user?.id, isAuthenticated, saveConnection, loadConnections]);

  return {
    connections,
    loading,
    error,
    saveConnection,
    getConnection,
    updateStats,
    removeConnection,
    checkConnection,
    getConnectionByProvider,
    loadConnections,
    migrateFromLocalStorage,
    isAuthenticated
  };
} 