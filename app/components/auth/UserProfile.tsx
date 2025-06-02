import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { signOut } from '~/lib/supabase';
import { toast } from 'react-toastify';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';

interface UserProfileProps {
  user: any;
}

export function UserProfile({ user }: UserProfileProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsLoading(true);
      
      // Close any open dropdowns/modals first
      setIsSettingsOpen(false);
      
      // Navigate first, then sign out
      window.location.href = '/';
      
      // Sign out after navigation is initiated
      const { error } = await signOut();
      
      if (error) {
        console.error('Sign out error:', error);
        toast.error('Failed to sign out');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  if (!user) return null;

  // Get user avatar or first letter of email or name
  const userAvatar = user.user_metadata?.avatar_url || null;
  const userName = user.user_metadata?.name || user.email || 'User';
  const userInitial = userName[0].toUpperCase();
  
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button 
            className="flex items-center justify-center h-9 w-9 rounded-full focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 shadow-sm border border-gray-200 dark:border-gray-700" 
            aria-label="User profile"
          >
            {userAvatar ? (
              <img 
                src={userAvatar} 
                alt="User avatar" 
                className="h-9 w-9 rounded-full object-cover"
                onError={(e) => {
                  // If image fails to load, replace with initial
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = `
                    <div class="h-9 w-9 flex items-center justify-center rounded-full bg-accent-600 text-white font-medium">
                      ${userInitial}
                    </div>
                  `;
                }}
              />
            ) : (
              <div className="h-9 w-9 flex items-center justify-center rounded-full bg-accent-600 text-white font-medium">
                {userInitial}
              </div>
            )}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-[220px] bg-white dark:bg-bolt-elements-bg-depth-1 rounded-md p-2 shadow-md border border-gray-200 dark:border-bolt-elements-borderColor z-50"
            sideOffset={5}
            align="end"
          >
            <div className="px-3 py-3 mb-1">
              <div className="text-sm font-medium text-gray-900 dark:text-bolt-elements-textPrimary">
                {user.user_metadata?.name || userName}
              </div>
              {user.email && (
                <div className="text-xs text-gray-600 dark:text-bolt-elements-textSecondary mt-1">
                  {user.email}
                </div>
              )}
            </div>
            
            <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-bolt-elements-borderColor my-1" />
            
            <DropdownMenu.Item 
              className="text-sm rounded-md flex items-center justify-between h-8 px-3 py-4 text-gray-800 dark:text-bolt-elements-textPrimary hover:bg-[#2a2a2a] cursor-pointer transition-colors"
              onClick={handleSettingsClick}
            >
              <span>Settings</span>
              <div className="i-ph:gear-six text-lg" />
            </DropdownMenu.Item>

            <DropdownMenu.Item 
              className="text-sm rounded-md flex items-center justify-between h-8 px-3 py-4 text-gray-800 dark:text-bolt-elements-textPrimary hover:bg-[#2a2a2a] cursor-pointer transition-colors"
              onClick={handleSignOut}
              disabled={isLoading}
            >
              <span>{isLoading ? 'Signing out...' : 'Sign out'}</span>
              <div className="i-ph:sign-out text-lg" />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ControlPanel open={isSettingsOpen} onClose={handleSettingsClose} />
    </>
  );
} 