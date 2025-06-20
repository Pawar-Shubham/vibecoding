import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import Cookies from 'js-cookie';
import type { GitHubUserResponse } from '~/types/GitHub';
import { classNames } from '~/utils/classNames';

interface GitHubAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GitHubAuthDialog({ isOpen, onClose }: GitHubAuthDialogProps) {
  const [token, setToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      toast.error('Please enter a GitHub token');
      return;
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token.trim()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to verify token: ${response.statusText}`);
      }

      const user = (await response.json()) as GitHubUserResponse;

      // Save the connection info
      Cookies.set('github_connection', JSON.stringify({ user, token: token.trim() }));

      toast.success('Successfully connected to GitHub!');
      onClose();
    } catch (error) {
      console.error('Error verifying GitHub token:', error);
      toast.error('Failed to verify GitHub token. Please check your token and try again.');
    }
  };

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" />
        <Dialog.Content className={classNames(
          'fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2',
          'w-[90vw] max-w-[500px]',
          'bg-white dark:bg-[#1A1A1A]',
          'rounded-xl shadow-xl overflow-hidden',
          'z-[101]'
        )}>
          {/* Header */}
          <div className="p-4 border-b border-[#E5E5E5] dark:border-[#333333] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={classNames(
                'w-10 h-10 rounded-xl',
                'bg-gradient-to-br from-[#07F29C]/20 to-[#07F29C]/10',
                'flex items-center justify-center',
                'text-[#07F29C] shadow-sm'
              )}>
                <span className="i-ph:github-logo w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-[#111111] dark:text-white">
                  Access Private Repositories
                </Dialog.Title>
                <p className="text-sm text-[#666666] dark:text-[#999999]">
                  Connect your GitHub account to access private repositories
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div className="bg-[#F9F9F9] dark:bg-[#252525] p-4 rounded-lg space-y-3">
              <h3 className="text-base font-medium text-[#111111] dark:text-white">Connect with GitHub Token</h3>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm text-[#666666] dark:text-[#999999] mb-1">
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className={classNames(
                      'w-full px-3 py-1.5 rounded-lg',
                      'border border-[#E5E5E5] dark:border-[#333333]',
                      'bg-white dark:bg-[#1A1A1A]',
                      'text-[#111111] dark:text-white',
                      'placeholder-[#999999]',
                      'text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 focus:border-[#07F29C]'
                    )}
                  />
                  <div className="mt-1 text-xs text-[#666666] dark:text-[#999999]">
                    Get your token at{' '}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#07F29C] hover:underline"
                    >
                      github.com/settings/tokens
                    </a>
                  </div>
                </div>

                <button
                  type="submit"
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg',
                    'bg-[#07F29C] text-white',
                    'hover:bg-[#07F29C]/90',
                    'transition-all duration-200',
                    'text-sm font-medium'
                  )}
                >
                  Connect GitHub Account
                </button>
              </form>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-[#1B1B1B] border border-bolt-elements-borderColor-dark">
              <div className="flex items-center gap-2 mb-2">
                <span className="i-ph:info text-[#F2E59F]" />
                <h3 className="text-sm font-medium text-white">Accessing Private Repositories</h3>
              </div>
              <div className="text-sm text-gray-400 space-y-2">
                <p>Important things to know about accessing private repositories:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>You must be granted access to the repository by its owner</li>
                  <li>Your GitHub token must have the 'repo' scope</li>
                  <li>For organization repositories, you may need additional permissions</li>
                  <li>No token can give you access to repositories you don't have permission for</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-[#E5E5E5] dark:border-[#333333] p-3 flex justify-end">
            <Dialog.Close asChild>
              <button
                onClick={onClose}
                className={classNames(
                  'px-4 py-1.5 rounded-lg',
                  'bg-[#F5F5F5] hover:bg-[#E5E5E5]',
                  'dark:bg-[#252525] dark:hover:bg-[#333333]',
                  'text-[#111111] dark:text-white',
                  'transition-colors text-sm'
                )}
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
