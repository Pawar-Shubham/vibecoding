import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';

// Cache for audio URLs to avoid repeated extractions
const audioUrlCache = new Map<string, { url: string; expires: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface AudioExtractionResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
  title?: string;
  duration?: number;
  debug?: any;
}

// Alternative approach for environments that don't support child_process
async function extractAudioUrlFallback(youtubeUrl: string): Promise<AudioExtractionResult> {
  try {
    // Use a third-party API or service for YouTube audio extraction
    // This is a placeholder - you would integrate with services like:
    // - RapidAPI YouTube services
    // - Custom microservice with yt-dlp
    // - YouTube-DL web services
    
    const videoId = youtubeUrl.split('v=')[1]?.split('&')[0];
    
    // For now, we'll return a demo response indicating the need for setup
    return {
      success: false,
      error: 'YouTube audio extraction requires additional setup. Please configure yt-dlp or use a microservice.',
      debug: { method: 'fallback', videoId }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
      debug: { method: 'fallback', error: error?.toString() }
    };
  }
}

async function extractAudioUrl(youtubeUrl: string): Promise<AudioExtractionResult> {
  try {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      console.log('Starting yt-dlp extraction for:', youtubeUrl);
      
      // Use simpler format selection that works with current YouTube formats
      const ytDlp = spawn('yt-dlp', [
        '--format', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--get-title',
        '--get-duration',
        '--get-url',
        '--no-warnings',
        '--no-playlist',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--force-generic-extractor', // Bypass format-specific extractors
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        youtubeUrl
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      let output = '';
      let error = '';
      let hasResolved = false;

      ytDlp.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log('yt-dlp stdout chunk:', chunk);
      });

      ytDlp.stderr.on('data', (data) => {
        const chunk = data.toString();
        error += chunk;
        console.log('yt-dlp stderr chunk:', chunk);
      });

      ytDlp.on('close', (code) => {
        if (hasResolved) return;
        hasResolved = true;
        
        console.log('yt-dlp finished with code:', code);
        console.log('Full output:', output);
        console.log('Full error:', error);
        
        if (code === 0 && output.trim()) {
          const lines = output.trim().split('\n').filter(line => line.trim());
          console.log('yt-dlp output lines:', lines);
          
          if (lines.length >= 3) {
            const title = lines[0];
            const audioUrl = lines[1]; 
            const duration = lines[2];
            
            console.log('Parsed data:', { 
              title, 
              duration, 
              audioUrl: audioUrl?.substring(0, 100) + '...',
              urlValid: audioUrl && (audioUrl.startsWith('http') || audioUrl.startsWith('https'))
            });
            
            if (audioUrl && (audioUrl.startsWith('http') || audioUrl.startsWith('https'))) {
              resolve({
                success: true,
                audioUrl: audioUrl.trim(),
                title: title?.trim(),
                duration: parseDuration(duration),
                debug: { lines, method: 'yt-dlp' }
              });
            } else {
              console.error('Invalid URL extracted:', { audioUrl, lines });
              resolve({
                success: false,
                error: `Invalid audio URL extracted. Got: ${audioUrl || 'undefined'}`,
                debug: { lines, audioUrl, method: 'yt-dlp' }
              });
            }
          } else {
            resolve({
              success: false,
              error: `Insufficient output from yt-dlp. Expected 3 lines, got ${lines.length}`,
              debug: { lines, output, method: 'yt-dlp' }
            });
          }
        } else {
          console.error('yt-dlp failed with code:', code, 'error:', error);
          resolve({
            success: false,
            error: error || `yt-dlp exited with code ${code}`,
            debug: { code, error, output, method: 'yt-dlp' }
          });
        }
      });

      ytDlp.on('error', (err) => {
        if (hasResolved) return;
        hasResolved = true;
        
        console.error('yt-dlp spawn error:', err);
        resolve({
          success: false,
          error: 'yt-dlp not available or failed to start. Please ensure yt-dlp is installed.',
          debug: { spawnError: err.toString(), method: 'yt-dlp' }
        });
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (hasResolved) return;
        hasResolved = true;
        
        ytDlp.kill();
        resolve({
          success: false,
          error: 'Audio extraction timed out',
          debug: { timeout: true, method: 'yt-dlp' }
        });
      }, 30000);
    });
  } catch (importError) {
    console.log('child_process not available, using fallback method');
    return extractAudioUrlFallback(youtubeUrl);
  }
}

function parseDuration(durationStr: string): number {
  if (!durationStr) return 0;
  
  // Parse duration formats like "3:33" or "1:23:45"
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  }
  return 0;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { youtubeId, youtubeUrl, proxy } = await request.json();
    
    if (!youtubeId && !youtubeUrl) {
      return json({ error: 'YouTube ID or URL is required' }, { status: 400 });
    }

    // Handle proxy request for audio streaming
    if (proxy && youtubeId) {
      const cached = audioUrlCache.get(youtubeId);
      if (cached && cached.expires > Date.now()) {
        try {
          // Fetch the audio and stream it back
          const audioResponse = await fetch(cached.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.youtube.com/'
            }
          });

          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            return new Response(audioBlob, {
              headers: {
                'Content-Type': 'audio/mp4',
                'Content-Length': audioBlob.size.toString(),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=1800' // 30 minutes
              }
            });
          }
        } catch (proxyError) {
          console.error('Proxy error:', proxyError);
          return json({ error: 'Failed to proxy audio stream' }, { status: 500 });
        }
      }
      
      return json({ error: 'Audio URL not found or expired' }, { status: 404 });
    }

    const videoId = youtubeId || youtubeUrl.split('v=')[1]?.split('&')[0];
    const fullUrl = youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`;

    // Validate YouTube URL
    if (!videoId || videoId.length !== 11) {
      return json({ error: 'Invalid YouTube video ID' }, { status: 400 });
    }

    console.log('Processing request for video:', videoId, fullUrl);

    // Check cache first
    const cached = audioUrlCache.get(videoId);
    if (cached && cached.expires > Date.now()) {
      console.log('Returning cached audio URL for:', videoId);
      return json({
        success: true,
        audioUrl: cached.url,
        proxiedUrl: `/api/youtube-audio?proxy=true&videoId=${videoId}`, // Alternative proxy URL
        cached: true,
        videoId
      });
    }

    console.log('Extracting audio URL for:', fullUrl);

    // Extract audio URL using yt-dlp
    const result = await extractAudioUrl(fullUrl);

    if (result.success && result.audioUrl) {
      // Cache the result
      audioUrlCache.set(videoId, {
        url: result.audioUrl,
        expires: Date.now() + CACHE_DURATION
      });

      console.log('Successfully extracted audio URL for:', videoId);
      return json({
        success: true,
        audioUrl: result.audioUrl,
        proxiedUrl: `/api/youtube-audio?proxy=true&videoId=${videoId}`, // Alternative proxy URL
        title: result.title,
        duration: result.duration,
        videoId,
        debug: result.debug
      });
    } else {
      console.error('Failed to extract audio:', result.error);
      return json({
        success: false,
        error: result.error || 'Failed to extract audio URL',
        debug: result.debug,
        videoId
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Audio extraction error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      debug: { catchError: error?.toString() }
    }, { status: 500 });
  }
}

// Handle GET requests for proxy
export async function loader({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const proxy = url.searchParams.get('proxy');
  const videoId = url.searchParams.get('videoId');
  const startTime = url.searchParams.get('t'); // timestamp parameter for seeking

  if (proxy === 'true' && videoId) {
    const cached = audioUrlCache.get(videoId);
    if (cached && cached.expires > Date.now()) {
      try {
        console.log('Proxying audio for:', videoId, startTime ? `starting at ${startTime}s` : '');
        
        // Prepare headers for the upstream request
        const upstreamHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com',
          'Accept': 'audio/webm,audio/mp4,audio/mp3,audio/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9'
        };

        // Handle range requests for seeking
        const rangeHeader = request.headers.get('range');
        if (rangeHeader) {
          upstreamHeaders['Range'] = rangeHeader;
          console.log('Forwarding range request:', rangeHeader);
        }

        // First make a HEAD request to get content type and size
        const headResponse = await fetch(cached.url, {
          method: 'HEAD',
          headers: upstreamHeaders
        });

        if (!headResponse.ok) {
          console.error('HEAD request failed:', headResponse.status);
          // URL might have expired, try to refresh it
          audioUrlCache.delete(videoId);
          return new Response('Audio URL expired', { status: 410 });
        }

        const contentType = headResponse.headers.get('content-type');
        let finalContentType = contentType;

        // Ensure we're sending a supported audio content type
        if (!contentType || !contentType.includes('audio/')) {
          // Try to determine content type from URL or default to mp3
          if (cached.url.includes('.m4a')) {
            finalContentType = 'audio/mp4';
          } else if (cached.url.includes('.webm')) {
            finalContentType = 'audio/webm';
          } else {
            finalContentType = 'audio/mpeg'; // Default to MP3
          }
        }

        // Now make the actual request
        const audioResponse = await fetch(cached.url, {
          headers: upstreamHeaders
        });

        if (audioResponse.ok || audioResponse.status === 206) {
          const responseHeaders: Record<string, string> = {
            'Content-Type': finalContentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Range',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=1800'
          };

          // Forward range response headers
          const contentRange = audioResponse.headers.get('content-range');
          const contentLength = audioResponse.headers.get('content-length');
          
          if (contentRange) {
            responseHeaders['Content-Range'] = contentRange;
          }
          if (contentLength) {
            responseHeaders['Content-Length'] = contentLength;
          }

          // Stream the response
          return new Response(audioResponse.body, {
            status: audioResponse.status,
            headers: responseHeaders
          });
        } else {
          console.error('Audio fetch failed:', audioResponse.status);
          return new Response('Failed to fetch audio stream', { 
            status: audioResponse.status 
          });
        }
      } catch (proxyError) {
        console.error('Proxy error:', proxyError);
        return new Response('Failed to proxy audio stream', { 
          status: 500,
          statusText: proxyError instanceof Error ? proxyError.message : 'Unknown error'
        });
      }
    }
    
    return new Response('Audio URL not found or expired', { status: 404 });
  }

  return new Response('Not found', { status: 404 });
}

// Cleanup expired cache entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of audioUrlCache.entries()) {
      if (value.expires < now) {
        audioUrlCache.delete(key);
      }
    }
  }, 5 * 60 * 1000); // Clean every 5 minutes
} 