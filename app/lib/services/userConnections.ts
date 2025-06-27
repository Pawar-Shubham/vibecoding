import { supabase } from '~/lib/supabase';
import { logStore } from '~/lib/stores/logs';

export type ConnectionProvider = 'github' | 'netlify' | 'vercel' | 'supabase';

export interface UserConnection {
  id: string;
  user_id: string;
  provider: ConnectionProvider;
  token?: string;
  token_type?: string;
  user_data: any;
  stats: any;
  is_active: boolean;
  updated_at: string;
  created_at: string;
}

export interface ConnectionData {
  provider: ConnectionProvider;
  token: string;
  token_type?: string;
  user_data?: any;
  stats?: any;
}

// Simple encryption functions (in production, use a proper encryption library)
const encryptToken = (token: string): string => {
  // For demo purposes, we'll use base64 encoding
  // In production, use proper encryption like AES-256
  return btoa(token);
};

const decryptToken = (encryptedToken: string): string => {
  try {
    return atob(encryptedToken);
  } catch {
    return encryptedToken; // Return as-is if decryption fails
  }
};

/**
 * Save a user connection to the database
 */
export const saveUserConnection = async (
  userId: string,
  connectionData: ConnectionData
): Promise<{ success: boolean; error?: string; data?: UserConnection }> => {
  try {
    const encryptedToken = connectionData.token ? encryptToken(connectionData.token) : null;
    
    const { data, error } = await supabase
      .from('user_connections')
      .upsert({
        user_id: userId,
        provider: connectionData.provider,
        token: encryptedToken,
        token_type: connectionData.token_type,
        user_data: connectionData.user_data || {},
        stats: connectionData.stats || {},
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      })
      .select()
      .single();

    if (error) {
      logStore.logError(`Failed to save ${connectionData.provider} connection`, { error, userId });
      return { success: false, error: error.message };
    }

    logStore.logSystem(`Saved ${connectionData.provider} connection for user`, { userId });
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStore.logError(`Error saving ${connectionData.provider} connection`, { error, userId });
    return { success: false, error: errorMessage };
  }
};

/**
 * Get a user connection from the database
 */
export const getUserConnection = async (
  userId: string,
  provider: ConnectionProvider
): Promise<{ success: boolean; error?: string; data?: UserConnection }> => {
  try {
    const { data, error } = await supabase
      .from('user_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return { success: true, data: undefined };
      }
      logStore.logError(`Failed to get ${provider} connection`, { error, userId });
      return { success: false, error: error.message };
    }

    // Decrypt the token before returning
    if (data.token) {
      data.token = decryptToken(data.token);
    }

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStore.logError(`Error getting ${provider} connection`, { error, userId });
    return { success: false, error: errorMessage };
  }
};

/**
 * Get all user connections from the database
 */
export const getAllUserConnections = async (
  userId: string
): Promise<{ success: boolean; error?: string; data?: UserConnection[] }> => {
  try {
    const { data, error } = await supabase
      .from('user_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logStore.logError('Failed to get user connections', { error, userId });
      return { success: false, error: error.message };
    }

    // Decrypt tokens before returning
    const decryptedData = data?.map(connection => ({
      ...connection,
      token: connection.token ? decryptToken(connection.token) : undefined
    }));

    return { success: true, data: decryptedData };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStore.logError('Error getting user connections', { error, userId });
    return { success: false, error: errorMessage };
  }
};

/**
 * Update user connection stats
 */
export const updateConnectionStats = async (
  userId: string,
  provider: ConnectionProvider,
  stats: any
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('user_connections')
      .update({ 
        stats,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      logStore.logError(`Failed to update ${provider} connection stats`, { error, userId });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStore.logError(`Error updating ${provider} connection stats`, { error, userId });
    return { success: false, error: errorMessage };
  }
};

/**
 * Remove a user connection (soft delete)
 */
export const removeUserConnection = async (
  userId: string,
  provider: ConnectionProvider
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('user_connections')
      .update({ 
        is_active: false,
        token: null, // Clear the token for security
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      logStore.logError(`Failed to remove ${provider} connection`, { error, userId });
      return { success: false, error: error.message };
    }

    logStore.logSystem(`Removed ${provider} connection for user`, { userId });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStore.logError(`Error removing ${provider} connection`, { error, userId });
    return { success: false, error: errorMessage };
  }
};

/**
 * Hard delete a user connection (completely remove from database)
 */
export const deleteUserConnection = async (
  userId: string,
  provider: ConnectionProvider
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('user_connections')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      logStore.logError(`Failed to delete ${provider} connection`, { error, userId });
      return { success: false, error: error.message };
    }

    logStore.logSystem(`Deleted ${provider} connection for user`, { userId });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logStore.logError(`Error deleting ${provider} connection`, { error, userId });
    return { success: false, error: errorMessage };
  }
};

/**
 * Check if user has a specific connection
 */
export const hasUserConnection = async (
  userId: string,
  provider: ConnectionProvider
): Promise<{ success: boolean; hasConnection: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('user_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return { success: true, hasConnection: false };
      }
      return { success: false, hasConnection: false, error: error.message };
    }

    return { success: true, hasConnection: !!data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, hasConnection: false, error: errorMessage };
  }
}; 