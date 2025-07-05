import { useState } from 'react';

interface AudioExtractionResponse {
  success: boolean;
  audioUrl?: string;
  proxiedUrl?: string;
  title?: string;
  duration?: number;
  error?: string;
  debug?: any;
  videoId?: string;
}

export function useYouTubeAudio() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const extractAudio = async (youtubeId: string): Promise<AudioExtractionResponse> => {
    setIsExtracting(true);
    setExtractionError(null);

    try {
      console.log('Extracting audio for YouTube ID:', youtubeId);
      
      const response = await fetch('/api/youtube-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ youtubeId }),
      });

      const data = await response.json();
      console.log('Audio extraction response:', data);

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to extract audio');
      }

      // Always use proxy URL to avoid CORS issues
      if (data.proxiedUrl) {
        console.log('Using proxy URL to avoid CORS:', data.proxiedUrl);
        return {
          ...data,
          audioUrl: data.proxiedUrl // Use proxy URL as the main audio URL
        };
      } else if (data.audioUrl) {
        // Fallback to direct URL if no proxy available
        console.log('No proxy URL available, using direct URL:', data.audioUrl);
        return data;
      }

      throw new Error('No audio URL available');
    } catch (error) {
      console.error('Audio extraction error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setExtractionError(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setIsExtracting(false);
    }
  };

  const testAudioUrl = async (url: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const testAudio = new Audio();
      let resolved = false;
      
      const cleanup = () => {
        testAudio.src = '';
        testAudio.removeEventListener('canplaythrough', handleSuccess);
        testAudio.removeEventListener('error', handleError);
      };
      
      const handleSuccess = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ success: true });
      };
      
      const handleError = (e: Event) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        
        const errorMessage = testAudio.error?.code 
          ? `Audio error (${testAudio.error.code}): ${getAudioErrorMessage(testAudio.error.code)}`
          : 'Failed to load audio URL';
          
        resolve({ success: false, error: errorMessage });
      };
      
      testAudio.addEventListener('canplaythrough', handleSuccess);
      testAudio.addEventListener('error', handleError);
      
      // Set timeout for testing
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ success: false, error: 'Audio test timed out' });
      }, 5000);
      
      // Start testing
      testAudio.crossOrigin = 'anonymous';
      testAudio.src = url;
      testAudio.load();
    });
  };

  return {
    extractAudio,
    isExtracting,
    extractionError,
  };
}

function getAudioErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case 1: // MEDIA_ERR_ABORTED
      return 'Audio loading was aborted';
    case 2: // MEDIA_ERR_NETWORK
      return 'Network error while loading audio';
    case 3: // MEDIA_ERR_DECODE
      return 'Audio decoding error';
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return 'Audio format not supported or URL inaccessible (CORS)';
    default:
      return 'Unknown audio error';
  }
} 