import { createClient } from '@supabase/supabase-js';

const supabaseUrl = `https://hwxqmtguaaarjneyfyad.supabase.co`;
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3eHFtdGd1YWFhcmpuZXlmeWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MDEwNDMsImV4cCI6MjA2MzQ3NzA0M30.Pvt-oOEqunDzCz3gm6VdN6N1JCCpSfjs540ic3WtxjE';

// Create a singleton Supabase client with session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Helper functions for authentication
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  
  return { data, error };
};

export const signInWithGitHub = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin,
    },
  });
  
  return { data, error };
};

// Email/password authentication functions
export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  
  return { data, error };
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  return { data, error };
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  
  return { data, error };
};

export const updatePassword = async (newPassword: string) => {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });
  
  return { data, error };
};

export const signOut = async () => {
  return await supabase.auth.signOut();
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// User data operations
export const storeUserData = async (userId: string, data: any) => {
  const { error } = await supabase
    .from('user_data')
    .upsert({ 
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString()
    });
  
  return { error };
};

export const getUserData = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_data')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  return { data, error };
}; 