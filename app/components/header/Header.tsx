import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { UserProfile } from '../auth/UserProfile';
import { useAuth } from '~/lib/hooks/useAuth';
import { useState } from 'react';
import { AuthModal } from '../auth/AuthModal';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { Menu } from '~/components/sidebar/Menu.client';

export function Header() {
  const chat = useStore(chatStore);
  const { user, isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');

  const handleOpenAuthModal = (tab: 'signin' | 'signup') => {
    setAuthTab(tab);
    setShowAuthModal(true);
  };

  return (
    <header
      className={classNames('flex items-center p-5 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary">
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {!chat.started ? (
            <>
              <img src="/logo-light-styled.png" alt="logo" className="w-[90px] inline-block dark:hidden" />
              <img src="/logo-dark-styled.png" alt="logo" className="w-[90px] inline-block hidden dark:block" />
            </>
          ) : (
            <>
              <img src="/chat-logo-light-styled.png" alt="logo" className="w-[90px] inline-block dark:hidden" />
              <img src="/chat-logo-dark-styled.png" alt="logo" className="w-[90px] inline-block hidden dark:block" />
            </>
          )}
        </a>
      </div>
      
      {/* Centered project name with menu */}
      {chat.started && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 relative">
            <ClientOnly>{() => <Menu isLandingPage={false} />}</ClientOnly>
            <span className="truncate text-center text-bolt-elements-textPrimary">
              <ClientOnly>{() => <ChatDescription />}</ClientOnly>
            </span>
          </div>
        </div>
      )}

      {/* Right-aligned action buttons and user profile */}
      <div className="flex items-center gap-3 ml-auto">
        {chat.started && (
          <ClientOnly>
            {() => (
              <div className="mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        )}
        
        <ClientOnly>
          {() => (
            <div className="flex items-center gap-3">
              <div className="text-gray-700 dark:text-gray-300">
                <ThemeSwitch />
              </div>
              {!isAuthenticated ? (
                <>
                  <button
                    onClick={() => handleOpenAuthModal('signin')}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-colors border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => handleOpenAuthModal('signup')}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-colors bg-accent-600 hover:bg-accent-700 text-white shadow-sm"
                  >
                    Get Started
                  </button>
                </>
              ) : (
                <UserProfile user={user} />
              )}
            </div>
          )}
        </ClientOnly>
      </div>
      
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        initialTab={authTab}
      />
    </header>
  );
}
