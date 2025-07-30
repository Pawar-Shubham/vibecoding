import type { ServerBuild } from '@remix-run/cloudflare';
import { createPagesFunctionHandler } from '@remix-run/cloudflare-pages';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  
  // Block direct access to source files (.tsx, .ts, .js files from app directory)
  if (url.pathname.startsWith('/app/') || 
      url.pathname.endsWith('.tsx') || 
      url.pathname.endsWith('.ts') ||
      url.pathname.includes('/components/') ||
      url.pathname.includes('/lib/') ||
      url.pathname.includes('/utils/') ||
      url.pathname.includes('/types/') ||
      url.pathname.includes('/stores/') ||
      url.pathname.includes('/hooks/')) {
    
    return new Response('Not Found', { 
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  const serverBuild = (await import('../build/server')) as unknown as ServerBuild;

  const handler = createPagesFunctionHandler({
    build: serverBuild,
  });

  return handler(context);
};
