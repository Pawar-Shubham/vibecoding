import { AnimatePresence, motion } from 'framer-motion';
import type { SupabaseAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';
import { supabaseConnection } from '~/lib/stores/supabase';
import { useStore } from '@nanostores/react';
import { useState } from 'react';

interface Props {
  alert: SupabaseAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export function SupabaseChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { content } = alert;
  const connection = useStore(supabaseConnection);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Determine connection state
  const isConnected = !!(connection.token && connection.selectedProjectId);

  // Set title and description based on connection state
  const title = isConnected ? 'Supabase Query' : 'Supabase Connection Required';
  const description = isConnected ? 'Execute database query' : 'Supabase connection required';
  const message = isConnected
    ? 'Please review the proposed changes and apply them to your database.'
    : 'Please connect to Supabase to continue with this operation.';

  const handleConnectClick = () => {
    // Dispatch an event to open the Supabase connection dialog
    document.dispatchEvent(new CustomEvent('open-supabase-connection'));
  };

  // Determine if we should show the Connect button or Apply Changes button
  const showConnectButton = !isConnected;

  const executeSupabaseAction = async (sql: string) => {
    if (!connection.token || !connection.selectedProjectId) {
      console.error('No Supabase token or project selected');
      return;
    }

    setIsExecuting(true);

    try {
      const response = await fetch('/api/supabase/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${connection.token}`,
        },
        body: JSON.stringify({
          projectId: connection.selectedProjectId,
          query: sql,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as any;
        throw new Error(`Supabase query failed: ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();
      console.log('Supabase query executed successfully:', result);
      clearAlert();
    } catch (error) {
      console.error('Failed to execute Supabase action:', error);
      postMessage(
        `*Error executing Supabase query please fix and return the query again*\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n`,
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const cleanSqlContent = (content: string) => {
    if (!content) {
      return '';
    }

    let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');

    cleaned = cleaned.replace(/(--).*$/gm, '').replace(/(#).*$/gm, '');

    const statements = cleaned
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0)
      .join(';\n\n');

    return statements;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-chat rounded-lg border border-gray-600 bg-gray-800"
      >
        {/* Header */}
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <img height="10" width="18" crossOrigin="anonymous" src="https://cdn.simpleicons.org/supabase" />
            <h3 className="text-sm font-medium text-green-400">{title}</h3>
          </div>
        </div>

        {/* SQL Content */}
        <div className="px-4">
          {!isConnected ? (
            <div className="p-3 rounded-md bg-gray-700">
              <span className="text-sm text-gray-300">
                You must first connect to Supabase and select a project.
              </span>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full text-left p-3 rounded-md bg-gray-700 hover:bg-gray-600 transition-colors mb-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">View Query</span>
                  <div
                    className={classNames(
                      'i-ph:caret-down w-4 h-4 transition-transform text-gray-400',
                      !isCollapsed ? 'rotate-180' : '',
                    )}
                  />
                </div>
              </button>

              {!isCollapsed && (
                <div className="bg-gray-900 rounded-md p-3 mb-4 border border-gray-600">
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">{content}</pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="p-4">
          <p className="text-sm text-gray-300 mb-4">{message}</p>

          <div className="flex gap-2">
            {showConnectButton ? (
              <button
                onClick={handleConnectClick}
                className={classNames(
                  `px-3 py-2 rounded-md text-sm font-medium`,
                  'bg-green-600 hover:bg-green-700',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
                  'text-white',
                  'flex items-center gap-1.5',
                )}
              >
                Connect to Supabase
              </button>
            ) : (
              <button
                onClick={() => executeSupabaseAction(content)}
                disabled={isExecuting}
                className={classNames(
                  `px-3 py-2 rounded-md text-sm font-medium`,
                  'bg-green-600 hover:bg-green-700',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
                  'text-white',
                  'flex items-center gap-1.5',
                  isExecuting ? 'opacity-70 cursor-not-allowed' : '',
                )}
              >
                {isExecuting ? 'Applying...' : 'Apply Changes'}
              </button>
            )}
            <button
              onClick={clearAlert}
              disabled={isExecuting}
              className={classNames(
                `px-3 py-2 rounded-md text-sm font-medium`,
                'bg-gray-600 hover:bg-gray-500',
                'focus:outline-none',
                'text-white',
                isExecuting ? 'opacity-70 cursor-not-allowed' : '',
              )}
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
