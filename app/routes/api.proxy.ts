import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { z } from 'zod';

const proxyCommandSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
});

async function handleCurl(args: string[]): Promise<Response> {
  try {
    // Basic curl argument parsing
    const urlIndex = args.findIndex(arg => !arg.startsWith('-'));
    if (urlIndex === -1) {
      return json({ error: 'No URL provided' }, { status: 400 });
    }

    // Clean the URL by removing ANSI escape sequences and trimming
    let url = args[urlIndex].replace(/\u001b\[\d+~/g, '').trim();
    
    // Ensure URL has protocol, but skip for localhost
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('localhost')) {
      url = 'https://' + url;
    }
    console.log('[Proxy] Cleaned URL:', url);

    const method = args.includes('-X') ? args[args.indexOf('-X') + 1] : 'GET';
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // Parse headers
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-H' && args[i + 1]) {
        const [key, value] = args[i + 1].split(': ');
        headers[key] = value;
        i++;
      }
    }

    console.log('[Proxy] Curl request:', { url, method, headers });

    const response = await fetch(url, {
      method,
      headers,
      credentials: 'omit',
      mode: 'cors',
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return json({ 
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data 
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (error) {
    console.error('[Proxy] Curl error:', error);
    // More detailed error logging
    if (error instanceof Error) {
      console.error('[Proxy] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return json({ 
      error: String(error),
      details: error instanceof Error ? error.stack : undefined 
    }, { status: 500 });
  }
}

async function handleFetch(args: string[]): Promise<Response> {
  try {
    if (args.length === 0) {
      return json({ error: 'No URL provided' }, { status: 400 });
    }

    // Clean the URL by removing ANSI escape sequences and trimming
    let url = args[0].replace(/\u001b\[\d+~/g, '').trim();
    
    // Ensure URL has protocol, but skip for localhost
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('localhost')) {
      url = 'https://' + url;
    }
    console.log('[Proxy] Cleaned URL:', url);

    const options = args[1] ? JSON.parse(args[1]) : {};
    
    // Add default headers for API requests if none provided
    if (!options.headers) {
      options.headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
    }

    console.log('[Proxy] Fetch request:', { url, options });

    const response = await fetch(url, {
      ...options,
      credentials: 'omit',
      mode: 'cors',
    });
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
      // Log the actual JSON data
      console.log('[Proxy] Response data:', JSON.stringify(data, null, 2));
    } else {
      data = await response.text();
      console.log('[Proxy] Response text:', data);
    }
    
    return json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (error) {
    console.error('[Proxy] Fetch error:', error);
    if (error instanceof Error) {
      console.error('[Proxy] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return json({ 
      error: String(error),
      details: error instanceof Error ? error.stack : undefined 
    }, { status: 500 });
  }
}

const SUPPORTED_COMMANDS = new Set(['curl', 'fetch']);

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const rawCommand = url.searchParams.get('command');
    
    console.log('[Proxy] Received request:', url.toString());
    console.log('[Proxy] Raw command:', rawCommand);
    
    if (!rawCommand) {
      return json({ error: 'No command provided' }, { status: 400 });
    }

    try {
      // Parse the command string into command and args
      const parsedCommand = JSON.parse(decodeURIComponent(rawCommand));
      console.log('[Proxy] Parsed command:', parsedCommand);
      
      const { command, args } = proxyCommandSchema.parse(parsedCommand);
      console.log('[Proxy] Validated command:', command);
      console.log('[Proxy] Validated args:', args);

      if (!SUPPORTED_COMMANDS.has(command)) {
        return json({ error: 'Unsupported command' }, { status: 400 });
      }

      switch (command) {
        case 'curl':
          return handleCurl(args);
        case 'fetch':
          return handleFetch(args);
        default:
          return json({ error: 'Unsupported command' }, { status: 400 });
      }
    } catch (parseError) {
      console.error('[Proxy] Command parsing error:', parseError);
      return json({ error: `Failed to parse command: ${parseError}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Proxy] General error:', error);
    return json({ error: String(error) }, { status: 500 });
  }
} 