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
      
      {/* Logo Creator Message Bar - Only show when chat hasn't started */}
      {!chat.started && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="bg-gradient-to-r from-[#F2E59F] to-[#07F29C] text-black px-4 py-2.5 shadow-lg">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="i-ph:palette text-xl text-black" />
                <span className="text-sm sm:text-base font-medium text-black">
                  Try out our
                </span>
                <a
                  href="/logo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-0.5 px-3 py-1 bg-black/10 hover:bg-black/20 text-black font-medium rounded-md transition-all duration-300 flex items-center gap-2 backdrop-blur-sm border border-black/20 text-sm"
                >
                  <span>VxC Logo Generator</span>
                  <div className="i-ph:arrow-right text-sm" />
                </a>
              </div>
              
              {/* Social Media Icons */}
              <div className="flex items-center gap-3">
                <a href="https://twitter.com/vibesxcoded" target="_blank" rel="noopener noreferrer" className="text-black/70 hover:text-black transition-colors">
                  <div className="i-simple-icons:twitter text-xl" />
                </a>
                <a href="https://github.com/vibesxcoded" target="_blank" rel="noopener noreferrer" className="text-black/70 hover:text-black transition-colors">
                  <div className="i-simple-icons:github text-xl" />
                </a>
                <a href="https://discord.gg/vibesxcoded" target="_blank" rel="noopener noreferrer" className="text-black/70 hover:text-black transition-colors">
                  <div className="i-simple-icons:discord text-xl" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
