import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';

const YOUTUBE_API_KEY = 'AIzaSyAL6oiTLhhj1LCpWA2oyU3WoL1IS3FQZkY';
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

// Helper function to parse ISO 8601 duration to seconds
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { query } = await request.json();
    
    if (!query || typeof query !== 'string') {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    console.log('Searching YouTube for:', query);

    // Search for videos using fetch
    const searchUrl = new URL(`${YOUTUBE_API_BASE_URL}/search`);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', '10');
    searchUrl.searchParams.set('order', 'relevance');
    searchUrl.searchParams.set('videoCategoryId', '10'); // Music category
    searchUrl.searchParams.set('safeSearch', 'moderate');
    searchUrl.searchParams.set('key', YOUTUBE_API_KEY);

    const searchResponse = await fetch(searchUrl.toString());
    const searchData = await searchResponse.json();

    if (!searchData.items || searchData.items.length === 0) {
      return json({ 
        results: [],
        query,
        message: 'No results found'
      });
    }

    // Get video IDs for duration lookup
    const videoIds = searchData.items
      .map((item: any) => item.id?.videoId)
      .filter(Boolean);

    // Get video details for duration using fetch
    const detailsUrl = new URL(`${YOUTUBE_API_BASE_URL}/videos`);
    detailsUrl.searchParams.set('part', 'contentDetails');
    detailsUrl.searchParams.set('id', videoIds.join(','));
    detailsUrl.searchParams.set('key', YOUTUBE_API_KEY);

    const detailsResponse = await fetch(detailsUrl.toString());
    const detailsData = await detailsResponse.json();

    // Process results
    const results = searchData.items.map((item: any, index: number) => {
      const videoId = item.id?.videoId;
      const duration = detailsData.items?.[index]?.contentDetails?.duration;
      const durationInSeconds = duration ? parseDuration(duration) : 0;

      return {
        id: videoId || `yt-${Date.now()}-${index}`,
        title: item.snippet?.title || 'Unknown Title',
        artist: item.snippet?.channelTitle || 'Unknown Artist',
        thumbnail: item.snippet?.thumbnails?.high?.url || 
                  item.snippet?.thumbnails?.medium?.url || 
                  item.snippet?.thumbnails?.default?.url || 
                  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        duration: durationInSeconds,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        youtubeId: videoId,
        publishedAt: item.snippet?.publishedAt,
        description: item.snippet?.description?.substring(0, 200) + '...' || ''
      };
    });

    console.log(`Found ${results.length} results for "${query}"`);

    return json({ 
      results,
      query,
      timestamp: new Date().toISOString(),
      totalResults: searchData.pageInfo?.totalResults || 0
    });

  } catch (error) {
    console.error('YouTube API error:', error);
    
    // Fallback to demo data if API fails
    const demoResults = [
      {
        id: `fallback-1-${Date.now()}`,
        title: `${query} - Audio Version`,
        artist: 'Demo Content',
        thumbnail: `https://picsum.photos/300/300?random=${Math.random()}&grayscale`,
        duration: Math.floor(Math.random() * 300) + 120,
        url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
        youtubeId: 'demo',
        publishedAt: new Date().toISOString(),
        description: 'Demo content while YouTube API is unavailable'
      }
    ];

    return json({ 
      results: demoResults,
      query,
      timestamp: new Date().toISOString(),
      warning: 'Using demo data - YouTube API unavailable',
      error: error instanceof Error ? error.message : 'YouTube API error'
    });
  }
}

// Note: For actual audio playback from YouTube, you would need:
// 1. A service to extract audio URLs (like youtube-dl, yt-dlp)
// 2. Or YouTube Music API access
// 3. Or a proxy service that handles audio extraction
// 
// Current implementation returns YouTube video URLs which require
// additional processing for audio-only playback. 