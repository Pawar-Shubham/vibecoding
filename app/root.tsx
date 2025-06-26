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
import { motion } from 'framer-motion';
import { atom } from 'nanostores';


import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import authModalStyles from './styles/auth-modal.css?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

// Inline navigation store to avoid import issues
const navigationLoading = atom<boolean>(false);

// Inline useMinimumLoadingTime hook to avoid import issues
function useMinimumLoadingTime(isLoading: boolean, minimumMs: number = 1500) {
  const [showLoading, setShowLoading] = useState(isLoading);
  const [startTime, setStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading && !startTime) {
      // Start loading - record the start time
      setStartTime(Date.now());
      setShowLoading(true);
    } else if (!isLoading && startTime) {
      // Loading finished - check if minimum time has passed
      const elapsed = Date.now() - startTime;
      const remaining = minimumMs - elapsed;

      if (remaining > 0) {
        // Need to wait longer
        const timeout = setTimeout(() => {
          setShowLoading(false);
          setStartTime(null);
        }, remaining);

        return () => clearTimeout(timeout);
      } else {
        // Minimum time already passed
        setShowLoading(false);
        setStartTime(null);
      }
    } else if (!isLoading && !startTime) {
      // Not loading and no start time
      setShowLoading(false);
    }
  }, [isLoading, startTime, minimumMs]);

  return showLoading;
}

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

// Import feedback components
import { SocialMediaIcons } from '~/components/SocialMediaIcons.tsx';
import { DynamicFeedback } from './components/feedback/DynamicFeedback';

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
  const [isPageReloading, setIsPageReloading] = useState(false); // Start with loading off
  const shouldShowPageReloadLoading = useMinimumLoadingTime(isPageReloading, 1500);
  
  // Global loading state for any type of loading
  const [isAppLoading, setIsAppLoading] = useState(true);
  const shouldShowAppLoading = useMinimumLoadingTime(isAppLoading, 1500);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle page loading states - simplified to avoid getting stuck
  useEffect(() => {
    const handleBeforeUnload = () => {
      setIsPageReloading(true);
      setIsAppLoading(true);
    };

    const handleStartNavigationLoading = () => {
      navigationLoading.set(true);
    };

    const handleStopNavigationLoading = () => {
      navigationLoading.set(false);
    };

    // Listen for navigation loading events from components
    window.addEventListener('start-navigation-loading', handleStartNavigationLoading);
    window.addEventListener('stop-navigation-loading', handleStopNavigationLoading);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Turn off page reload loading after component mounts
    setIsPageReloading(false);
    
    // Turn off app loading after a short delay to allow content to render
    const timer = setTimeout(() => {
      setIsAppLoading(false);
    }, 100);

    return () => {
      window.removeEventListener('start-navigation-loading', handleStartNavigationLoading);
      window.removeEventListener('stop-navigation-loading', handleStopNavigationLoading);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearTimeout(timer);
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

  return (
    <>
      {(shouldShowNavigationLoading || shouldShowPageReloadLoading || shouldShowAppLoading) && <LoadingScreen />}
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <SocialMediaIcons />
      <ClientOnly>{() => <DynamicFeedback />}</ClientOnly>
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
