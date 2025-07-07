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

// Four-tier fallback system for audio extraction
async function extractAudioUrlTier1(videoId: string): Promise<AudioExtractionResult> {
  try {
    console.log('Tier 1: Trying yt1s.com API');
    
    const response = await fetch('https://yt1s.com/api/ajaxSearch/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://yt1s.com',
        'Referer': 'https://yt1s.com/',
      },
      body: `q=https://www.youtube.com/watch?v=${videoId}&vt=mp3`
    });

    if (!response.ok) {
      throw new Error(`yt1s.com API failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status === 'ok' && data.links && data.links.mp3) {
      const mp3Links = data.links.mp3;
      const bestQuality = mp3Links['mp3128'] || mp3Links['mp3320'] || Object.values(mp3Links)[0];
      
      if (bestQuality && bestQuality.url) {
        return {
          success: true,
          audioUrl: bestQuality.url,
          title: data.title,
          duration: data.t,
          debug: { method: 'yt1s.com', tier: 1 }
        };
      }
    }
    
    throw new Error('No audio URL found in yt1s.com response');
  } catch (error) {
    console.log('Tier 1 failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tier 1 extraction failed',
      debug: { method: 'yt1s.com', tier: 1, error: error?.toString() }
    };
  }
}

async function extractAudioUrlTier2(videoId: string): Promise<AudioExtractionResult> {
  try {
    console.log('Tier 2: Trying y2mate.com API');
    
    // First, get the video info
    const infoResponse = await fetch('https://www.y2mate.com/mates/analyzeV2/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.y2mate.com',
        'Referer': 'https://www.y2mate.com/',
      },
      body: `k_query=https://www.youtube.com/watch?v=${videoId}&k_page=home&hl=en&q_auto=0`
    });

    if (!infoResponse.ok) {
      throw new Error(`y2mate.com info API failed: ${infoResponse.status}`);
    }

    const infoData = await infoResponse.json();
    
    if (infoData.status === 'ok' && infoData.links && infoData.links.mp3) {
      const mp3Links = infoData.links.mp3;
      const bestQuality = mp3Links['mp3128'] || mp3Links['mp3320'] || Object.values(mp3Links)[0];
      
      if (bestQuality && bestQuality.k) {
        // Convert the video
        const convertResponse = await fetch('https://www.y2mate.com/mates/convertV2/index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://www.y2mate.com',
            'Referer': 'https://www.y2mate.com/',
          },
          body: `vid=${videoId}&k=${bestQuality.k}`
        });

        if (convertResponse.ok) {
          const convertData = await convertResponse.json();
          
          if (convertData.status === 'ok' && convertData.dlink) {
            return {
              success: true,
              audioUrl: convertData.dlink,
              title: infoData.title,
              duration: infoData.t,
              debug: { method: 'y2mate.com', tier: 2 }
            };
          }
        }
      }
    }
    
    throw new Error('No audio URL found in y2mate.com response');
  } catch (error) {
    console.log('Tier 2 failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tier 2 extraction failed',
      debug: { method: 'y2mate.com', tier: 2, error: error?.toString() }
    };
  }
}

async function extractAudioUrlTier3(videoId: string): Promise<AudioExtractionResult> {
  try {
    console.log('Tier 3: Trying YouTube internal API');
    
    // Get video info from YouTube's internal API
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube page fetch failed: ${response.status}`);
    }

    const html = await response.text();
    
    // Extract player response from HTML
    const playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.+?});/);
    if (!playerResponseMatch) {
      throw new Error('Could not find player response in YouTube HTML');
    }

    const playerResponse = JSON.parse(playerResponseMatch[1]);
    const streamingData = playerResponse.streamingData;
    
    if (!streamingData) {
      throw new Error('No streaming data found in player response');
    }

    // Look for audio-only formats
    const audioFormats = streamingData.adaptiveFormats?.filter((format: any) => 
      format.mimeType?.includes('audio/') && format.url
    ) || [];

    if (audioFormats.length > 0) {
      // Prefer WebM audio formats, then MP4
      const webmFormat = audioFormats.find((f: any) => f.mimeType.includes('audio/webm'));
      const mp4Format = audioFormats.find((f: any) => f.mimeType.includes('audio/mp4'));
      const bestFormat = webmFormat || mp4Format || audioFormats[0];

      return {
        success: true,
        audioUrl: bestFormat.url,
        title: playerResponse.videoDetails?.title,
        duration: parseInt(playerResponse.videoDetails?.lengthSeconds || '0'),
        debug: { method: 'youtube-internal', tier: 3, format: bestFormat.mimeType }
      };
    }

    throw new Error('No audio formats found in streaming data');
  } catch (error) {
    console.log('Tier 3 failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tier 3 extraction failed',
      debug: { method: 'youtube-internal', tier: 3, error: error?.toString() }
    };
  }
}

async function extractAudioUrlTier4(videoId: string): Promise<AudioExtractionResult> {
  try {
    console.log('Tier 4: Trying local yt-dlp (fallback)');
    
    // This tier would use yt-dlp if available (for local development)
    // In production (Cloudflare), this will always fail as expected
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error('yt-dlp not available in serverless environment');
    }

    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      const ytDlp = spawn('yt-dlp', [
        '--format', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--get-url',
        '--no-warnings',
        `https://www.youtube.com/watch?v=${videoId}`
      ]);

      let output = '';
      let error = '';

      ytDlp.stdout.on('data', (data) => {
        output += data.toString();
      });

      ytDlp.stderr.on('data', (data) => {
        error += data.toString();
      });

      ytDlp.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const audioUrl = output.trim().split('\n')[0];
          resolve({
            success: true,
            audioUrl,
            debug: { method: 'yt-dlp', tier: 4 }
          });
        } else {
          resolve({
            success: false,
            error: error || `yt-dlp exited with code ${code}`,
            debug: { method: 'yt-dlp', tier: 4, code, error }
          });
        }
      });

      ytDlp.on('error', (err) => {
        resolve({
          success: false,
          error: 'yt-dlp not available or failed to start',
          debug: { method: 'yt-dlp', tier: 4, spawnError: err.toString() }
        });
      });
    });
  } catch (error) {
    console.log('Tier 4 failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tier 4 extraction failed',
      debug: { method: 'yt-dlp', tier: 4, error: error?.toString() }
    };
  }
}

async function extractAudioUrl(youtubeUrl: string): Promise<AudioExtractionResult> {
  const videoId = youtubeUrl.split('v=')[1]?.split('&')[0];
  
  if (!videoId) {
    return {
      success: false,
      error: 'Invalid YouTube URL',
      debug: { url: youtubeUrl }
    };
  }

  // Try each tier in sequence
  const tiers = [
    extractAudioUrlTier1,
    extractAudioUrlTier2,
    extractAudioUrlTier3,
    extractAudioUrlTier4
  ];

  for (let i = 0; i < tiers.length; i++) {
    try {
      const result = await tiers[i](videoId);
      if (result.success) {
        console.log(`Successfully extracted audio using tier ${i + 1}`);
        return result;
      }
    } catch (error) {
      console.log(`Tier ${i + 1} failed:`, error);
    }
  }

  return {
    success: false,
    error: 'All extraction methods failed',
    debug: { videoId, allTiersFailed: true }
  };
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
        proxiedUrl: `/api/youtube-audio?proxy=true&videoId=${videoId}`,
        cached: true,
        videoId
      });
    }

    console.log('Extracting audio URL using four-tier fallback system for:', fullUrl);

    // Extract audio URL using four-tier fallback system
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
        proxiedUrl: `/api/youtube-audio?proxy=true&videoId=${videoId}`,
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