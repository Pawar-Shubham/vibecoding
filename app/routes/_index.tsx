import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';
import { Suspense } from 'react';
import { LazyChat, LazyBaseChat } from '~/components/lazy';

export const meta: MetaFunction = () => {
  return [{ title: 'VxC' }, { name: 'description', content: 'Talk with VibesXCoded, an AI assistant to help you build your next project faster!' }];
};

export const loader = () => json({});

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="animate-pulse text-gray-600">Loading...</div>
  </div>
);

/**
 * Landing page component for VibesXCoded
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <Suspense fallback={<LoadingFallback />}>
        <ClientOnly fallback={<LazyBaseChat />}>
          {() => <LazyChat />}
        </ClientOnly>
      </Suspense>
    </div>
  );
}
