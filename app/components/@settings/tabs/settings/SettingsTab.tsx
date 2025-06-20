import { useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { profileStore, updateProfile } from '~/lib/stores/profile';
import { toast } from 'react-toastify';
import { debounce } from '~/utils/debounce';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { motion } from 'framer-motion';
import { useAuth } from '~/lib/hooks/useAuth';

interface Profile {
  username: string;
  email: string;
  bio: string;
  avatar?: string;
}

export default function SettingsTab() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile>({
    username: user?.user_metadata?.username || '',
    email: user?.email || '',
    bio: user?.user_metadata?.bio || '',
    avatar: user?.user_metadata?.avatar_url,
  });
  const [isUploading, setIsUploading] = useState(false);

  const handleProfileUpdate = useCallback((field: keyof Profile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  }, []);

  // Create debounced update functions
  const debouncedUpdate = useCallback(
    debounce((field: 'username' | 'bio' | 'email', value: string) => {
      updateProfile({ [field]: value });
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`);
    }, 1000),
    [],
  );

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsUploading(true);

      // Convert the file to base64
      const reader = new FileReader();

      reader.onloadend = () => {
        const base64String = reader.result as string;
        updateProfile({ avatar: base64String });
        setIsUploading(false);
        toast.success('Profile picture updated');
      };

      reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        setIsUploading(false);
        toast.error('Failed to update profile picture');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setIsUploading(false);
      toast.error('Failed to update profile picture');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="space-y-6">
        {/* Personal Information Section */}
        <div>
          {/* Avatar Upload */}
          <div className="flex items-start gap-6 mb-8">
            <div
              className={classNames(
                'w-24 h-24 rounded-full overflow-hidden',
                'bg-gray-100 dark:bg-gray-800/50',
                'flex items-center justify-center',
                'ring-1 ring-gray-200 dark:ring-gray-700',
                'relative group',
                'transition-all duration-300 ease-out',
                'hover:ring-[#07F29C]/30 dark:hover:ring-[#07F29C]/30',
                'hover:shadow-lg hover:shadow-[#07F29C]/10',
              )}
            >
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt="Profile"
                  className={classNames(
                    'w-full h-full object-cover',
                    'transition-all duration-300 ease-out',
                    'group-hover:scale-105 group-hover:brightness-90',
                  )}
                />
              ) : (
                <div className="i-ph:robot-fill w-16 h-16 text-gray-400 dark:text-gray-500 transition-colors group-hover:text-[#07F29C]/70 transform -translate-y-1" />
              )}

              <label
                className={classNames(
                  'absolute inset-0',
                  'flex items-center justify-center',
                  'bg-black/0 group-hover:bg-black/40',
                  'cursor-pointer transition-all duration-300 ease-out',
                  isUploading ? 'cursor-wait' : '',
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={isUploading}
                />
                {isUploading ? (
                  <div className="i-ph:spinner-gap w-6 h-6 text-white animate-spin" />
                ) : (
                  <div className="i-ph:camera-plus w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out transform group-hover:scale-110" />
                )}
              </label>
            </div>

            <div className="flex-1 pt-1">
              <label className="block text-base font-medium text-gray-900 dark:text-gray-100 mb-1">
                Profile Picture
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload a profile picture or avatar</p>
            </div>
          </div>

          {/* Username and Email Inputs */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Username Input */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Username</label>
              <div className="relative group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  <div className="i-ph:user-circle-fill w-5 h-5 text-gray-400 dark:text-gray-500 transition-colors group-focus-within:text-[#07F29C]" />
                </div>
                <input
                  type="text"
                  value={profile.username}
                  onChange={(e) => handleProfileUpdate('username', e.target.value)}
                  className={classNames(
                    'w-full pl-11 pr-4 py-2.5 rounded-xl',
                    'bg-white dark:bg-gray-800/50',
                    'border border-gray-200 dark:border-gray-700/50',
                    'text-gray-900 dark:text-white',
                    'placeholder-gray-400 dark:placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 focus:border-[#07F29C]/30',
                    'transition-all duration-300 ease-out',
                  )}
                  placeholder="Enter your username"
                />
              </div>
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Email</label>
              <div className="relative group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  <div className="i-ph:envelope-fill w-5 h-5 text-gray-400 dark:text-gray-500 transition-colors group-focus-within:text-[#07F29C]" />
                </div>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => handleProfileUpdate('email', e.target.value)}
                  className={classNames(
                    'w-full pl-11 pr-4 py-2.5 rounded-xl',
                    'bg-white dark:bg-gray-800/50',
                    'border border-gray-200 dark:border-gray-700/50',
                    'text-gray-900 dark:text-white',
                    'placeholder-gray-400 dark:placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 focus:border-[#07F29C]/30',
                    'transition-all duration-300 ease-out',
                  )}
                  placeholder="Enter your email address"
                />
              </div>
            </div>
          </div>

          {/* Bio Input */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Bio</label>
            <div className="relative group">
              <div className="absolute left-3.5 top-3">
                <div className="i-ph:text-aa w-5 h-5 text-gray-400 dark:text-gray-500 transition-colors group-focus-within:text-[#07F29C]" />
              </div>
              <textarea
                value={profile.bio}
                onChange={(e) => handleProfileUpdate('bio', e.target.value)}
                className={classNames(
                  'w-full pl-11 pr-4 py-2.5 rounded-xl',
                  'bg-white dark:bg-gray-800/50',
                  'border border-gray-200 dark:border-gray-700/50',
                  'text-gray-900 dark:text-white',
                  'placeholder-gray-400 dark:placeholder-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 focus:border-[#07F29C]/30',
                  'transition-all duration-300 ease-out',
                  'resize-none',
                  'h-32',
                )}
                placeholder="Tell us about yourself"
              />
            </div>
          </div>

          {/* Theme Switch Section */}
          <motion.div
            className={classNames(
              'group relative p-4 rounded-lg transition-all duration-200',
              'bg-bolt-elements-background-depth-2',
              'hover:bg-bolt-elements-background-depth-3',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <motion.div
                  className={classNames(
                    'w-12 h-12 flex items-center justify-center rounded-xl',
                    'bg-bolt-elements-background-depth-3',
                    'text-[#F2E59F]',
                  )}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <div className="i-ph:palette-fill w-7 h-7" />
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-[#F2E59F] transition-colors">
                      Theme
                    </h4>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                    Switch between light and dark mode
                  </p>
                </div>
              </div>
              <ThemeSwitch variant="switch" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
