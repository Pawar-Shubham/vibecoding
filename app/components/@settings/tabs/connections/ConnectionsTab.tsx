import { motion } from 'framer-motion';
import React, { Suspense } from 'react';
import { classNames } from '~/utils/classNames';
import GitHubConnection from './GithubConnection';
import NetlifyConnection from './NetlifyConnection';
import SpotifyConnection from './SpotifyConnection';

// Loading fallback component
const LoadingFallback = () => (
  <div className="p-4 bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor">
    <div className="flex items-center justify-center gap-2 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
      <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
      <span>Loading connection...</span>
    </div>
  </div>
);

export default function ConnectionsTab() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex items-center gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="i-ph:plugs-connected w-5 h-5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            Connection Settings
          </h2>
        </div>
      </motion.div>
      <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
        Manage your external service connections and integrations
      </p>

      <div className="grid grid-cols-1 gap-6">
        <GitHubConnection />
        <NetlifyConnection />
        <SpotifyConnection />
      </div>

      {/* Additional help text */}
      <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 p-4 rounded-lg">
        <p className="flex items-center gap-1 mb-2">
          <span className="i-ph:lightbulb w-4 h-4 text-bolt-elements-icon-success dark:text-bolt-elements-icon-success" />
          <span className="font-medium">Troubleshooting Tip:</span>
        </p>
        <p className="mb-2">
          If you're having trouble with connections, check your browser console for errors and verify that your tokens have the correct permissions.
        </p>
        <p>For persistent issues:</p>
        <ol className="list-decimal list-inside pl-4 mt-1">
          <li>Check your browser console for errors</li>
          <li>Verify that your tokens have the correct permissions</li>
          <li>Try clearing your browser cache and cookies</li>
          <li>Ensure your browser allows third-party cookies if using integrations</li>
        </ol>
      </div>
    </div>
  );
}
