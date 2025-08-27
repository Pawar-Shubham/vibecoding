import React from 'react';
import { useStore } from '@nanostores/react';
import { FaDiscord } from 'react-icons/fa6';
import { chatStore } from '~/lib/stores/chat';
import { FeedbackButton } from './feedback/FeedbackButton';

export function SocialMediaIcons() {
  const chat = useStore(chatStore);
  
  // Only show icons when chat hasn't started (homepage)
  if (chat.started) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-3 z-50">
      <a
        href="https://x.com/vibesxcoded"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        title="Follow us on X (Twitter)"
      >
        <div className="i-simple-icons:x text-xl" />
      </a>
		<a
			href="https://discord.gg/UrPWWrzPqt"
			target="_blank"
			rel="noopener noreferrer"
			className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
			title="Join our Discord"
		>
			<FaDiscord className="w-6 h-6" />
		</a>
      
      {/* Vertical divider */}
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
      
      {/* Feedback button */}
      <FeedbackButton />
    </div>
  );
} 