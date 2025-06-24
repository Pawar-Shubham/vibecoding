import { useStore } from '@nanostores/react';
import { chatStore } from './lib/stores/chat';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import React, { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';
import { useAuth } from './lib/hooks/useAuth';
import { navigationLoading } from './lib/stores/navigation';
import { useMinimumLoadingTime } from './lib/hooks/useMinimumLoadingTime';
import { motion } from 'framer-motion';


import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import authModalStyles from './styles/auth-modal.css?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

// Inline LoadingScreen component to avoid import issues
function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 flex flex-col items-center justify-center z-50">
      {/* Pulsating Logo */}
      <motion.div
        className="mb-8"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <img 
          src="/logo-dark-styled.png" 
          alt="VxC Logo" 
          className="h-16 w-auto hidden dark:block"
        />
        <img 
          src="/chat-logo-light-styled.png" 
          alt="VxC Logo" 
          className="h-16 w-auto dark:hidden block"
        />
      </motion.div>

      {/* Three Dots Loading Animation */}
      <div className="flex space-x-2">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            className="w-3 h-3 bg-gray-600 dark:bg-gray-400 rounded-full"
            animate={{
              y: [0, -10, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: index * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Inline SocialMediaIcons component to avoid import issues
function SocialMediaIcons() {
  const location = useLocation();
  const { started: chatStarted } = useStore(chatStore);
  
  // Hide icons if we're not on homepage or if chat has started
  if (location.pathname !== '/' || chatStarted) {
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
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      </a>
      <a
        href="https://discord.gg/j3CPCgbc"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        title="Join our Discord"
      >
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      </a>
    </div>
  );
}

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/logo-dark-styled.png',
    type: 'image/png',
    sizes: '32x32',
  },
  {
    rel: 'icon',
    href: '/logo-dark-styled.png',
    type: 'image/png',
    sizes: '96x96',
  },
  {
    rel: 'apple-touch-icon',
    href: '/logo-dark-styled.png',
    sizes: '180x180',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: authModalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
    <meta name="keywords" content="website coder, coding software, code editor, no code, ai for coding, best website builder, create a website for free, website builder for small business, web designer, website maker free, vibe code, building websites" />
    <meta property="og:title" content="VxC - VIBESxCODED" />
    <meta property="og:description" content="Talk with VxC, an AI Full-Stack Developer to help you build your next project faster!" />
    <meta property="og:image" content="/logo-dark-styled.png" />
    <meta property="og:image:alt" content="VibesXCoded Logo" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="VxC - VIBESxCODED" />
    <meta name="twitter:description" content="Talk with VxC, an AI Full-Stack Developer to help you build your next project faster!" />
    <meta name="twitter:image" content="/logo-dark-styled.png" />
    <Meta />
    <Links />
    
    {/* Microsoft Clarity */}
    <script
      type="text/javascript"
      dangerouslySetInnerHTML={{
        __html: `
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "rd5l2kpuge");
        `
      }}
    />

    {/* Google Tag Manager */}
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-CGFG5MX371" />
    <script
      dangerouslySetInnerHTML={{
        __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-CGFG5MX371');
        `
      }}
    />
    
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);
  const isNavigating = useStore(navigationLoading);
  const shouldShowNavigationLoading = useMinimumLoadingTime(isNavigating, 1500);
  const [isPageReloading, setIsPageReloading] = useState(true); // Start with loading on
  const shouldShowPageReloadLoading = useMinimumLoadingTime(isPageReloading, 1500);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle page loading states
  useEffect(() => {
    const handleBeforeUnload = () => {
      setIsPageReloading(true);
    };

    // Stop loading when document is ready
    const stopLoading = () => {
      setIsPageReloading(false);
    };

    // Check if page is already loaded
    if (document.readyState === 'complete') {
      // Page already loaded, stop loading after a short delay
      const timer = setTimeout(stopLoading, 100);
      return () => clearTimeout(timer);
    } else {
      // Page still loading, wait for it to complete
      window.addEventListener('load', stopLoading);
      document.addEventListener('DOMContentLoaded', stopLoading);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('load', stopLoading);
      document.removeEventListener('DOMContentLoaded', stopLoading);
    };
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then(registration => {
            console.log('ServiceWorker registration successful');
          })
          .catch(err => {
            console.error('ServiceWorker registration failed:', err);
          });
      });
    }
  }, []);

  // Show loading screen during initial page load to prevent content flash
  if (shouldShowPageReloadLoading && !shouldShowNavigationLoading) {
    return (
      <>
        <LoadingScreen />
        <ScrollRestoration />
        <Scripts />
      </>
    );
  }

  return (
    <>
      {shouldShowNavigationLoading && <LoadingScreen />}
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <SocialMediaIcons />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/stores/logs';

export default function App() {
  const theme = useStore(themeStore);
  useAuth(); // This will handle auth initialization

  useEffect(() => {
    logStore.logSystem('Application initialized', {
      theme,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  }, []);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
