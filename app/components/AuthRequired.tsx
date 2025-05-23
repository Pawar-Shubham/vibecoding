import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';
import { FiLock } from 'react-icons/fi';

interface AuthRequiredProps {
  children: React.ReactNode;
  message?: string;
}

export function AuthRequired({ children, message = 'Please log in to access this feature' }: AuthRequiredProps) {
  const auth = useStore(authStore);

  if (!auth.initialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <FiLock className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{message}</p>
        <button
          onClick={() => {
            // Trigger your auth modal or redirect to login page
            const event = new CustomEvent('open-auth-modal');
            window.dispatchEvent(event);
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Log In
        </button>
      </div>
    );
  }

  return <>{children}</>;
} 