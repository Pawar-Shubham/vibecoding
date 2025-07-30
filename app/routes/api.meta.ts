import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export const loader = async ({ request: _request }: LoaderFunctionArgs) => {
  return json({
    name: 'VxC - VIBESxCODED',
    short_name: 'VxC',
    description: 'Talk with VxC, an AI Full-Stack Developer to help you build your next project faster!',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/logo-dark-styled.png',
        sizes: '192x192',
        type: 'image/png'
      }
    ]
  });
};