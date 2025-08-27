import { ClientOnly } from "remix-utils/client-only";
import { Header } from "~/components/header/Header";
import { LogoGenerator } from "~/components/logo/LogoGenerator.client";
import { useState } from "react";

export default function LogoPage() {
  const [hasMessages, setHasMessages] = useState(false);

  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={<div className="flex-1" />}>
        {() => <LogoGenerator onMessagesChange={setHasMessages} />}
      </ClientOnly>
      
      {/* Social Media Icons - Only show when no messages */}
      {!hasMessages && (
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
            href="https://www.linkedin.com/company/vibesxcoded/about/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Follow us on LinkedIn"
          >
            <div className="i-simple-icons:linkedin text-xl" />
          </a>
          <a
            href="https://discord.gg/UrPWWrzPqt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Join our Discord"
          >
            <div className="i-simple-icons:discord text-xl" />
          </a>
        </div>
      )}
    </div>
  );
}
