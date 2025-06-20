import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { classNames } from '~/utils/classNames';
import { TabTile } from '~/components/@settings/shared/components/TabTile';
import { useUpdateCheck } from '~/lib/hooks/useUpdateCheck';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import {
  tabConfigurationStore,
  resetTabConfiguration,
} from '~/lib/stores/settings';
import { profileStore } from '~/lib/stores/profile';
import type { TabType } from './types';
import { DialogTitle } from '~/components/ui/Dialog';
import { AvatarDropdown } from './AvatarDropdown';

// Import only necessary tab components
import SettingsTab from '~/components/@settings/tabs/settings/SettingsTab';
import ConnectionsTab from '~/components/@settings/tabs/connections/ConnectionsTab';
import CloudProvidersTab from '~/components/@settings/tabs/providers/cloud/CloudProvidersTab';

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
}

const TAB_LABELS: Record<TabType, string> = {
  'settings': 'General',
  'connection': 'Connection',
  'cloud-providers': 'Cloud Providers'
} as const;

export function ControlPanel({ open, onClose }: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('settings'); // Default to 'settings' (General)
  
  // Define the tab order
  const tabs: TabType[] = ['settings', 'connection', 'cloud-providers'];

  // State
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);
  const profile = useStore(profileStore);

  // Status hooks
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();

  // Reset to default view when modal opens/closes
  useEffect(() => {
    if (!open) {
      setActiveTab('settings');
      setLoadingTab(null);
    } else {
      setActiveTab('settings');
    }
  }, [open]);

  // Handle closing
  const handleClose = () => {
    setActiveTab('settings');
    setLoadingTab(null);
    onClose();
  };

  const handleBack = () => {
    setActiveTab('settings');
  };

  const getTabComponent = (tabId: TabType) => {
    switch (tabId) {
      case 'settings':
        return <SettingsTab />;
      case 'cloud-providers':
        return <CloudProvidersTab />;
      case 'connection':
        return <ConnectionsTab />;
      default:
        return null;
    }
  };

  const getTabUpdateStatus = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'connection':
        return hasConnectionIssues;
      default:
        return false;
    }
  };

  const getStatusMessage = (tabId: TabType): string => {
    switch (tabId) {
      case 'connection':
        return currentIssue === 'disconnected'
          ? 'Connection lost'
          : currentIssue === 'high-latency'
            ? 'High latency detected'
            : 'Connection issues detected';
      default:
        return '';
    }
  };

  const handleTabClick = (tabId: TabType) => {
    setLoadingTab(tabId);
    setActiveTab(tabId);

    // Acknowledge notifications based on tab
    switch (tabId) {
      case 'connection':
        acknowledgeIssue();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 500);
  };

  const renderTabContent = () => {
    if (activeTab === 'settings') {
      return <SettingsTab />;
    } else if (activeTab === 'connection') {
      return <ConnectionsTab />;
    } else if (activeTab === 'cloud-providers') {
      return <CloudProvidersTab />;
    } else {
      return null;
    }
  };

  const getTabIcon = (tabId: TabType) => {
    switch (tabId) {
      case 'settings':
        return <span className="i-ph:gear w-4 h-4" />;
      case 'cloud-providers':
        return <span className="i-ph:cloud w-4 h-4" />;
      case 'connection':
        return <span className="i-ph:plug w-4 h-4" />;
      default:
        return null;
    }
  };

  const hasUpdate = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'connection':
        return hasConnectionIssues;
      default:
        return false;
    }
  };

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <div className="fixed inset-0 flex items-center justify-center z-control-panel modern-scrollbar">
          <RadixDialog.Overlay asChild>
            <motion.div
              className="absolute inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          </RadixDialog.Overlay>

          <RadixDialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={onClose}
            onPointerDownOutside={onClose}
            className="relative z-control-panel-content"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[1200px] h-[700px] flex overflow-hidden rounded-2xl bg-white dark:bg-[#1E1E1E] shadow-2xl"
            >
              {/* Left Sidebar */}
              <div className="w-[240px] bg-gray-50 dark:bg-[#141414] flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
                </div>
                <nav className="flex-1 p-4">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={classNames(
                        'w-full text-left px-4 py-3 rounded-lg mb-2 flex items-center gap-3 transition-colors',
                        activeTab === tab
                          ? 'bg-gray-200 dark:bg-[#2A2A2A] text-gray-900 dark:text-white'
                          : 'bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      )}
                    >
                      {getTabIcon(tab)}
                      <span>{TAB_LABELS[tab]}</span>
                      {hasUpdate(tab) && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-yellow-400" />
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Right Content Area */}
              <div className="flex-1 flex flex-col bg-white dark:bg-[#1E1E1E] relative">
                <div className="p-6 flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {TAB_LABELS[activeTab]}
                  </h3>
                  <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 rounded-full bg-transparent text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    aria-label="Close settings"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 15 15"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                    >
                      <path
                        d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-[#1E1E1E]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="h-full"
                    >
                      {renderTabContent()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
