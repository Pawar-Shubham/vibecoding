import type { LoaderFunctionArgs } from '@remix-run/node';

const ALLOWED_HOSTNAMES = new Set([
  'lh3.googleusercontent.com',
  'googleusercontent.com',
  'avatars.githubusercontent.com',
  'secure.gravatar.com',
  'gravatar.com',
]);

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const urlObj = new URL(request.url);
    const target = urlObj.searchParams.get('url');

    if (!target) {
      return new Response('Missing url parameter', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response('Invalid url parameter', { status: 400 });
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return new Response('Unsupported protocol', { status: 400 });
    }

    const hostname = parsed.hostname.toLowerCase();
    if (![...ALLOWED_HOSTNAMES].some((allowed) => hostname === allowed || hostname.endsWith('.' + allowed))) {
      return new Response('Hostname not allowed', { status: 400 });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'VxC-Image-Proxy',
      },
    });

    if (!upstream.ok) {
      return new Response('Upstream fetch failed', { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await upstream.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
}


