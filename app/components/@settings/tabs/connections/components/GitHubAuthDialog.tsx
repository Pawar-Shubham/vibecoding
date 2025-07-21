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
            <div className="bg-[#F9F9F9] dark:bg-[#252525] p-4 rounded-lg space-y-3 flex flex-col items-center justify-center">
              <h3 className="text-base font-medium text-[#111111] dark:text-white mb-2">Connect with GitHub in Settings</h3>
              <p className="text-sm text-[#666666] dark:text-[#999999] mb-4 text-center">
                To access private repositories, please connect your GitHub account in <b>Settings &gt; Connections</b>.<br />
                Once connected, you can use your account here without entering your token again.
              </p>
              <button
                onClick={() => {
                  window.location.href = '/settings';
                }}
                className={classNames(
                  'px-6 py-2 rounded-lg',
                  'bg-[#07F29C] text-white',
                  'hover:bg-[#07F29C]/90',
                  'transition-all duration-200',
                  'text-sm font-medium'
                )}
              >
                Go to Settings &gt; Connections
              </button>
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
