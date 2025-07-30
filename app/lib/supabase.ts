import { createClient } from '@supabase/supabase-js';
import { logStore } from './stores/logs';

const supabaseUrl = `https://hwxqmtguaaarjneyfyad.supabase.co`;
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3eHFtdGd1YWFhcmpuZXlmeWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MDEwNDMsImV4cCI6MjA2MzQ3NzA0M30.Pvt-oOEqunDzCz3gm6VdN6N1JCCpSfjs540ic3WtxjE';

// Create a singleton Supabase client with session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bolt.auth.token',
    storage: {
      getItem: (key) => {
        try {
          // Check if we're in a browser environment
          if (typeof window !== 'undefined' && window.localStorage) {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
          }
          return null;
        } catch (error) {
          console.error('Error reading auth storage:', error);
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          // Check if we're in a browser environment
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(key, JSON.stringify(value));
          }
        } catch (error) {
          console.error('Error writing to auth storage:', error);
        }
      },
      removeItem: (key) => {
        try {
          // Check if we're in a browser environment
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(key);
          }
        } catch (error) {
          console.error('Error removing from auth storage:', error);
        }
      }
    }
  }
});

// Helper functions for authentication
export const signInWithGoogle = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    
    if (error) {
      logStore.logAuth('google_signin', false, { error });
    } else {
      logStore.logAuth('google_signin', true);
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('google_signin', false, { error });
    return { data: null, error };
  }
};

export const signInWithGitHub = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
        scopes: 'read:user user:email'
      },
    });
    
    if (error) {
      logStore.logAuth('github_signin', false, { error });
    } else {
      logStore.logAuth('github_signin', true);
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('github_signin', false, { error });
    return { data: null, error };
  }
};

// Email/password authentication functions
export const signUpWithEmail = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      logStore.logAuth('signup', false, { error, email });
    } else {
      logStore.logAuth('signup', true, { email });
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('signup', false, { error, email });
    return { data: null, error };
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      logStore.logAuth('signin', false, { error, email });
    } else {
      logStore.logAuth('signin', true, { email });
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('signin', false, { error, email });
    return { data: null, error };
  }
};

export const resetPassword = async (email: string) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) {
      logStore.logAuth('reset_password', false, { error, email });
    } else {
      logStore.logAuth('reset_password', true, { email });
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('reset_password', false, { error, email });
    return { data: null, error };
  }
};

export const updatePassword = async (newPassword: string) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    
    if (error) {
      logStore.logAuth('update_password', false, { error });
    } else {
      logStore.logAuth('update_password', true);
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('update_password', false, { error });
    return { data: null, error };
  }
};

export const signOut = async () => {
  try {
    // Clear any auth-related storage before signing out
    localStorage.removeItem('bolt.auth.token');
    sessionStorage.removeItem('bolt.auth.token');
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      logStore.logAuth('signout', false, { error });
    } else {
      logStore.logAuth('signout', true);
    }
    
    return { error };
  } catch (error) {
    logStore.logAuth('signout', false, { error });
    return { error };
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      logStore.logAuth('get_user', false, { error });
      return null;
    }
    
    return user;
  } catch (error) {
    logStore.logAuth('get_user', false, { error });
    return null;
  }
};

export const getSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      logStore.logAuth('get_session', false, { error });
      return null;
    }
    
    return session;
  } catch (error) {
    logStore.logAuth('get_session', false, { error });
    return null;
  }
};

// User data operations
export const storeUserData = async (userId: string, data: any) => {
  try {
    const { error } = await supabase
      .from('user_data')
      .upsert({ 
        user_id: userId,
        ...data,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      logStore.logAuth('store_user_data', false, { error, userId });
    } else {
      logStore.logAuth('store_user_data', true, { userId });
    }
    
    return { error };
  } catch (error) {
    logStore.logAuth('store_user_data', false, { error, userId });
    return { error };
  }
};

export const getUserData = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      logStore.logAuth('get_user_data', false, { error, userId });
    } else {
      logStore.logAuth('get_user_data', true, { userId });
    }
    
    return { data, error };
  } catch (error) {
    logStore.logAuth('get_user_data', false, { error, userId });
    return { data: null, error };
  }
}; 