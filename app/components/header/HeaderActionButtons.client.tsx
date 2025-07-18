import { useStore } from '@nanostores/react';
import useViewport from '~/lib/hooks';
import { chatStore } from '~/lib/stores/chat';
import { netlifyConnection } from '~/lib/stores/netlify';

import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { useEffect, useRef, useState } from 'react';
import { streamingState } from '~/lib/stores/streaming';
import { NetlifyDeploymentLink } from '~/components/chat/NetlifyDeploymentLink.client';

import { useNetlifyDeploy } from '~/components/deploy/NetlifyDeploy.client';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const netlifyConn = useStore(netlifyConnection);

  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingTo, setDeployingTo] = useState<'netlify' | null>(null);
  const isSmallViewport = useViewport(1024);
  const canHideChat = showWorkbench || !showChat;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isStreaming = useStore(streamingState);

  const { handleNetlifyDeploy } = useNetlifyDeploy();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const onNetlifyDeploy = async () => {
    setIsDeploying(true);
    setDeployingTo('netlify');

    try {
      await handleNetlifyDeploy();
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  return (
    <div className="flex">
      <div className="relative" ref={dropdownRef}>
        <div className="flex border border-gray-300 dark:border-bolt-elements-borderColor rounded-md overflow-hidden mr-2 text-sm shadow-sm">
          <Button
            active
            disabled={isDeploying || !activePreview || isStreaming}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="p-1.5 px-3 min-w-[40px] !bg-white dark:!bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-[#07F29C] transition-all duration-200 flex items-center gap-2"
          >
            <div className="i-ph:rocket-launch" />
            Deploy
            <div
              className={classNames('i-ph:caret-down w-4 h-4 transition-transform', isDropdownOpen ? 'rotate-180' : '')}
            />
          </Button>
        </div>

        {isDropdownOpen && (
          <div className="absolute right-2 flex flex-col gap-1 z-50 p-1 mt-1 min-w-[13.5rem] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-300 dark:border-bolt-elements-borderColor">
            <Button
              active
              onClick={() => {
                onNetlifyDeploy();
                setIsDropdownOpen(false);
              }}
              disabled={isDeploying || !activePreview || !netlifyConn.user}
              className="flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-gray-100 dark:hover:bg-gray-700 gap-2 rounded-md group relative"
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/netlify"
              />
              <span className="mx-auto">
                {!netlifyConn.user ? 'No Netlify Account Connected' : 'Deploy to Netlify'}
              </span>
              {netlifyConn.user && <NetlifyDeploymentLink />}
            </Button>

          </div>
        )}
      </div>
      <div className="flex border border-gray-300 dark:border-bolt-elements-borderColor rounded-md overflow-hidden shadow-sm">
        <Button
          active={showWorkbench}
          onClick={() => {
            if (showWorkbench && !showChat) {
              chatStore.setKey('showChat', true);
            }
            workbenchStore.showWorkbench.set(!showWorkbench);
          }}
          className="p-1.5 px-3 min-w-[40px] !bg-white dark:!bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-[#07F29C] transition-all duration-200 flex items-center justify-center"
          title="Toggle Code View"
        >
          <div className="i-bolt:chat text-sm" />
        </Button>
        <div className="w-[1px] bg-gray-300 dark:bg-bolt-elements-borderColor" />
        <Button
          active={showChat}
          disabled={!canHideChat || isSmallViewport}
          onClick={() => {
            if (canHideChat) {
              chatStore.setKey('showChat', !showChat);
            }
          }}
          className="p-1.5 px-3 min-w-[40px] !bg-white dark:!bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-[#07F29C] transition-all duration-200 flex items-center justify-center"
          title="Toggle Chat View"
        >
          <div className="i-ph:code-bold" />
        </Button>
      </div>
    </div>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: VoidFunction;
  className?: string;
  title?: string;
}

function Button({ active = false, disabled = false, children, onClick, className, title }: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center p-1.5',
        {
          'bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundActive text-gray-700 dark:text-gray-400 hover:text-bolt-elements-textPrimary':
            !active,
          'bg-accent-100 dark:bg-bolt-elements-item-backgroundAccent text-accent-700 dark:text-bolt-elements-item-contentAccent': active && !disabled,
          'bg-bolt-elements-item-backgroundDefault text-gray-300 dark:text-alpha-white-20 cursor-not-allowed':
            disabled,
        },
        className,
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
