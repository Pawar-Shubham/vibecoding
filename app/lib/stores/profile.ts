import { atom } from 'nanostores';
import { supabase, storeUserData, getUserData } from '~/lib/supabase';

interface Profile {
  username: string;
  bio: string;
  email: string;
  avatar: string;
  userId?: string; // Track which user this profile belongs to
}

// Initialize with empty profile
const initialProfile: Profile = {
  username: '',
  bio: '',
  email: '',
  avatar: '',
  userId: undefined,
};

export const profileStore = atom<Profile>(initialProfile);

// Clear profile data (called on sign out)
export const clearProfile = () => {
  profileStore.set(initialProfile);
  
  // Clear localStorage backup
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bolt_profile');
  }
};

// Load profile data from Supabase for a specific user
export const loadProfileFromSupabase = async (userId: string): Promise<Profile | null> => {
  try {
    const { data, error } = await getUserData(userId);
    
    if (error || !data) {
      console.log('No profile data found in Supabase for user:', userId);
      return null;
    }

    // Extract profile data from the preferences field
    const profileData = data.preferences?.profile;
    if (!profileData) {
      console.log('No profile data in preferences for user:', userId);
      return null;
    }

    const profile: Profile = {
      username: profileData.username || '',
      bio: profileData.bio || '',
      email: profileData.email || '',
      avatar: profileData.avatar || '',
      userId: userId, // Always set the userId
    };

    // Update the store with loaded data
    profileStore.set(profile);

    // Also update localStorage for backup (with user ID)
    if (typeof window !== 'undefined') {
      localStorage.setItem('bolt_profile', JSON.stringify(profile));
    }

    console.log('Profile loaded from Supabase for user:', userId);
    return profile;
  } catch (error) {
    console.error('Error loading profile from Supabase:', error);
    return null;
  }
};

// Save profile data to Supabase
export const saveProfileToSupabase = async (userId: string, profile: Profile): Promise<boolean> => {
  try {
    // Get existing user data first
    const { data: existingData } = await getUserData(userId);
    
    // Merge profile data into preferences
    const preferences = {
      ...(existingData?.preferences || {}),
      profile: {
        username: profile.username,
        bio: profile.bio,
        email: profile.email,
        avatar: profile.avatar,
      }
    };

    // Use direct upsert with explicit onConflict handling
    const { error } = await supabase
      .from('user_data')
      .upsert({ 
        user_id: userId,
        preferences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      console.error('Error saving profile to Supabase:', error);
      return false;
    }

    console.log('Profile saved to Supabase for user:', userId);
    return true;
  } catch (error) {
    console.error('Error saving profile to Supabase:', error);
    return false;
  }
};

// Utility function to validate that we're working with the correct user
export const validateUserProfile = (userId: string): boolean => {
  const currentProfile = profileStore.get();
  
  if (!userId) {
    console.warn('No userId provided for profile operation');
    return false;
  }
  
  if (currentProfile.userId && currentProfile.userId !== userId) {
    console.error('Profile operation attempted for wrong user:', {
      currentProfileUserId: currentProfile.userId,
      requestedUserId: userId
    });
    return false;
  }
  
  return true;
};

// Get current user's profile data safely
export const getCurrentUserProfile = (userId: string): Profile | null => {
  if (!validateUserProfile(userId)) {
    return null;
  }
  
  const profile = profileStore.get();
  
  // If profile has no userId set, it might be uninitialized
  if (!profile.userId) {
    console.warn('Profile has no userId set, might be uninitialized');
    return null;
  }
  
  return profile;
};

export const updateProfile = async (updates: Partial<Profile>, userId?: string) => {
  if (!userId) {
    console.warn('No userId provided for profile update');
    return;
  }

  if (!validateUserProfile(userId)) {
    console.error('Profile update blocked for security reasons');
    return;
  }

  const currentProfile = profileStore.get();
  
  const updatedProfile = { 
    ...currentProfile, 
    ...updates, 
    userId: userId // Always ensure userId is set
  };
  
  // Update the store immediately for UI responsiveness
  profileStore.set(updatedProfile);

  // Persist to localStorage for backup (with user ID check)
  if (typeof window !== 'undefined') {
    localStorage.setItem('bolt_profile', JSON.stringify(updatedProfile));
  }

  // Save to Supabase
  try {
    await saveProfileToSupabase(userId, updatedProfile);
    console.log('Profile updated for user:', userId);
  } catch (error) {
    console.error('Failed to sync profile to Supabase:', error);
    // Don't throw error here to maintain UI responsiveness
  }
};

// Initialize profile data when user authenticates
export const initializeProfile = async (userId: string, userMetadata?: any) => {
  try {
    console.log('Initializing profile for user:', userId);
    
    // Get current profile to check if it belongs to a different user
    const currentProfile = profileStore.get();
    if (currentProfile.userId && currentProfile.userId !== userId) {
      console.log('Profile belongs to different user, clearing:', {
        currentUserId: currentProfile.userId,
        newUserId: userId
      });
    }
    
    // Always clear any existing profile data first to prevent cross-user contamination
    clearProfile();
    
    // First try to load from Supabase
    const supabaseProfile = await loadProfileFromSupabase(userId);
    
    if (supabaseProfile) {
      // Successfully loaded from Supabase
      console.log('Profile loaded from Supabase for user:', userId);
      return;
    }

    // If no Supabase data, check localStorage for this specific user
    let profileToSave: Profile;
    
    if (typeof window !== 'undefined') {
      const localProfile = localStorage.getItem('bolt_profile');
      if (localProfile) {
        try {
          const parsed = JSON.parse(localProfile);
          // Only use localStorage data if it's for the same user
          if (parsed.userId === userId) {
            profileToSave = parsed;
            console.log('Using localStorage profile for same user:', userId);
          } else {
            console.log('localStorage profile is for different user, creating new profile');
            // Clear localStorage since it's for a different user
            localStorage.removeItem('bolt_profile');
            profileToSave = createDefaultProfile(userMetadata, userId);
          }
        } catch {
          profileToSave = createDefaultProfile(userMetadata, userId);
        }
      } else {
        // Create from user metadata or defaults
        profileToSave = createDefaultProfile(userMetadata, userId);
      }
    } else {
      profileToSave = createDefaultProfile(userMetadata, userId);
    }

    // Update store
    profileStore.set(profileToSave);

    // Save to Supabase for future use
    await saveProfileToSupabase(userId, profileToSave);
    
    console.log('Profile initialized for user:', userId);

  } catch (error) {
    console.error('Error initializing profile:', error);
    
    // Fallback to default profile
    const defaultProfile = createDefaultProfile(userMetadata, userId);
    profileStore.set(defaultProfile);
  }
};

// Helper function to create default profile from user metadata
const createDefaultProfile = (userMetadata?: any, userId?: string): Profile => {
  return {
    username: userMetadata?.username || userMetadata?.name || '',
    bio: userMetadata?.bio || '',
    email: userMetadata?.email || '',
    avatar: userMetadata?.avatar_url || '',
    userId: userId,
  };
};
