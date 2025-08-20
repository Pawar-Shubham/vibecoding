import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { useStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';

export const meta: MetaFunction = () => {
  return [{ title: 'VxC' }, { name: 'description', content: 'Talk with VibesXCoded, an AI assistant to help you build your next project faster!' }];
};

export const loader = () => json({});

/**
 * Landing page component for VibesXCoded
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  const chat = useStore(chatStore);
  
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      
             {/* Social Media Icons - Bottom Right */}
       {!chat.started && (
         <div className="fixed bottom-4 right-4 flex items-center gap-3 z-50">
           <a
             href="https://x.com/vibesxcoded"
             target="_blank"
             rel="noopener noreferrer"
             className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
             title="Follow us on X (Twitter)"
           >
             <div className="i-simple-icons:twitter text-2xl" />
           </a>
           <a
             href="https://www.linkedin.com/company/vibesxcoded/about/"
             target="_blank"
             rel="noopener noreferrer"
             className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
             title="Follow us on LinkedIn"
           >
             <div className="i-simple-icons:linkedin text-2xl" />
           </a>
           <a
             href="https://discord.gg/UrPWWrzPqt"
             target="_blank"
             rel="noopener noreferrer"
             className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
             title="Join our Discord"
           >
             <div className="i-simple-icons:discord text-2xl" />
           </a>
         </div>
       )}
    </div>
  );
}
