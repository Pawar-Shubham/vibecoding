import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import type { UserProfile } from '~/components/@settings/core/types';
import { isMac } from '~/utils/os';

// Helper to get modifier key symbols/text
const getModifierSymbol = (modifier: string): string => {
  switch (modifier) {
    case 'meta':
      return isMac ? '⌘' : 'Win';
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    case 'shift':
      return '⇧';
    default:
      return modifier;
  }
};

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');
  const [settings, setSettings] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved
      ? JSON.parse(saved)
      : {
          language: 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  });

  useEffect(() => {
    setCurrentTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Save settings automatically when they change (without toast notification)
  useEffect(() => {
    try {
      // Get existing profile data
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

      // Merge with new settings
      const updatedProfile = {
        ...existingProfile,
        language: settings.language,
        timezone: settings.timezone,
      };

      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }, [settings]);

  return (
    <div className="space-y-4">
      {/* Language Settings */}
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 space-y-4 border border-gray-200 dark:border-gray-800"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:palette-fill w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-bolt-elements-textPrimary">Preferences</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:translate-fill w-4 h-4 text-gray-500 dark:text-bolt-elements-textSecondary" />
            <label className="block text-sm text-gray-500 dark:text-bolt-elements-textSecondary">Language</label>
          </div>
          <select
            value={settings.language}
            onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-white dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700',
              'text-gray-900 dark:text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-yellow-500/30',
              'transition-all duration-200',
            )}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="ru">Русский</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </div>
      </motion.div>

      {/* Timezone */}
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-800"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:clock-fill w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-bolt-elements-textPrimary">Time Settings</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:globe-fill w-4 h-4 text-gray-500 dark:text-bolt-elements-textSecondary" />
            <label className="block text-sm text-gray-500 dark:text-bolt-elements-textSecondary">Timezone</label>
          </div>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-white dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700',
              'text-gray-900 dark:text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-yellow-500/30',
              'transition-all duration-200',
            )}
          >
            <option value={currentTimezone}>{currentTimezone}</option>
          </select>
        </div>
      </motion.div>

      {/* Simplified Keyboard Shortcuts */}
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-800"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:keyboard-fill w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-bolt-elements-textPrimary">Keyboard Shortcuts</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex flex-col">
              <span className="text-sm text-gray-900 dark:text-bolt-elements-textPrimary">Toggle Theme</span>
              <span className="text-xs text-gray-500 dark:text-bolt-elements-textSecondary">Switch between light and dark mode</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 text-xs font-semibold text-gray-600 dark:text-bolt-elements-textSecondary bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                {getModifierSymbol('meta')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-gray-600 dark:text-bolt-elements-textSecondary bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                {getModifierSymbol('alt')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-gray-600 dark:text-bolt-elements-textSecondary bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                {getModifierSymbol('shift')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-gray-600 dark:text-bolt-elements-textSecondary bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                D
              </kbd>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
