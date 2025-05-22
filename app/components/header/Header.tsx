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
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <img src="/logo-light-styled.png" alt="logo" className="w-[90px] inline-block dark:hidden" />
          <img src="/logo-dark-styled.png" alt="logo" className="w-[90px] inline-block hidden dark:block" />
        </a>
      </div>
      
      {/* Centered project name */}
      {chat.started && (
        <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
          <ClientOnly>{() => <ChatDescription />}</ClientOnly>
        </span>
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
