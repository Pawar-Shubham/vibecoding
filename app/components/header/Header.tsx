import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { UserProfile } from '../auth/UserProfile';
import { useAuth } from '~/lib/hooks/useAuth';
import { useState, useEffect } from 'react';
import { AuthModal } from '../auth/AuthModal';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { Menu } from '~/components/sidebar/Menu.client';
import { sidebarStore, toggleSidebar } from '~/lib/stores/sidebar';

export function Header() {
  const chat = useStore(chatStore);
  const isSidebarOpen = useStore(sidebarStore);
  const { user, isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');

  const handleOpenAuthModal = (tab: 'signin' | 'signup') => {
    setAuthTab(tab);
    setShowAuthModal(true);
  };

  const handleAuthSuccess = (pendingPrompt?: string) => {
    if (pendingPrompt) {
      // Trigger the prompt generation
      const event = new CustomEvent('generate-prompt', { detail: { prompt: pendingPrompt } });
      window.dispatchEvent(event);
    }
  };

  // Listen for the open-auth-modal event
  useEffect(() => {
    const handleOpenAuthModalEvent = () => {
      handleOpenAuthModal('signin');
    };

    window.addEventListener('open-auth-modal', handleOpenAuthModalEvent);
    return () => {
      window.removeEventListener('open-auth-modal', handleOpenAuthModalEvent);
    };
  }, []);

  return (
    <header
      className={classNames(
        'flex items-center h-[var(--header-height)] bg-transparent', 
        {
          'p-5': isAuthenticated,
          'pl-0 pr-5 py-5': !isAuthenticated, // Remove left padding when logged out
        }
      )}
    >
      {/* Sidebar Toggle Button - Only show when authenticated */}
      {isAuthenticated && (
        <button
          onClick={toggleSidebar}
          onMouseEnter={() => sidebarStore.set(true)}
          className="flex items-center justify-center p-0 bg-transparent"
        >
          <span className="i-ph:sidebar-simple w-5 h-5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200" />
        </button>
      )}

      {/* Menu component - Only show when authenticated */}
      {isAuthenticated && (
        <ClientOnly>{() => <Menu isLandingPage={false} />}</ClientOnly>
      )}

      {/* Logo - always visible and above the menu */}
      <div 
        className={classNames(
          "flex items-center z-[99] text-bolt-elements-textPrimary transition-all duration-300",
          {
            "ml-1 opacity-100": !isSidebarOpen && isAuthenticated,
            "opacity-0": isSidebarOpen,
            "ml-0": !isAuthenticated, // No left margin when not authenticated
          }
        )}
      >
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
      
      {/* Centered project name */}
      {chat.started && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 relative">
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
                    className="px-4 py-2 text-sm font-medium rounded-md transition-all duration-500 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm flex items-center gap-2"
                  >
                    <div className="i-ph:sign-in text-lg" />
                    Sign In
                  </button>
                  <button
                    onClick={() => handleOpenAuthModal('signup')}
                    className="px-4 py-2 text-sm font-medium rounded-md relative overflow-hidden flex items-center gap-2"
                    style={{
                      background: 'linear-gradient(90deg, #ffd700, #4CAF50)',
                    }}
                  >
                    <div className="i-ph:rocket-launch text-lg" />
                    <span className="relative z-10 text-black">Get Started</span>
                    <div
                      className="absolute inset-0 transition-opacity duration-500 ease-in-out opacity-0 hover:opacity-100"
                      style={{
                        background: 'linear-gradient(90deg, #4CAF50, #ffd700)',
                      }}
                    />
                  </button>
                </>
              ) : (
                <UserProfile user={user} />
              )}
            </div>
          )}
        </ClientOnly>
      </div>

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          initialTab={authTab}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </header>
  );
}
