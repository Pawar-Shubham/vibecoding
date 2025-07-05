import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { google } from 'googleapis';

const YOUTUBE_API_KEY = 'AIzaSyAL6oiTLhhj1LCpWA2oyU3WoL1IS3FQZkY';

// Initialize YouTube API client
const youtube = google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY
});

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

    // Search for videos
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: 10,
      order: 'relevance',
      videoCategoryId: '10', // Music category
      safeSearch: 'moderate'
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return json({ 
        results: [],
        query,
        message: 'No results found'
      });
    }

    // Get video IDs for duration lookup
    const videoIds = searchResponse.data.items
      .map(item => item.id?.videoId)
      .filter(Boolean) as string[];

    // Get video details for duration
    const detailsResponse = await youtube.videos.list({
      part: ['contentDetails'],
      id: videoIds
    });

    // Process results
    const results = searchResponse.data.items.map((item, index) => {
      const videoId = item.id?.videoId;
      const duration = detailsResponse.data.items?.[index]?.contentDetails?.duration;
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
        // Note: This is the YouTube video URL, not direct audio
        // For audio-only playback, you'd need additional processing
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
      totalResults: searchResponse.data.pageInfo?.totalResults || 0
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