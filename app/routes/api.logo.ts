import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.logo');

// Dynamic import function
async function getGenAI() {
  try {
    const { GoogleGenAI, Modality } = await import('@google/genai');
    return { GoogleGenAI, Modality };
  } catch (error) {
    logger.error('Failed to import @google/genai:', error);
    // Try alternative import method
    try {
      const genaiModule = require('@google/genai');
      return { 
        GoogleGenAI: genaiModule.GoogleGenAI, 
        Modality: genaiModule.Modality 
      };
    } catch (requireError) {
      logger.error('Both dynamic import and require failed:', requireError);
      throw new Error('Google GenAI module not available');
    }
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json() as { 
      prompt?: string; 
      apiKey?: string; 
      images?: Array<{
        imageData: string;
        mimeType: string;
        source: string;
      }>;
    };
    const { prompt, apiKey, images } = body;

    if (!prompt) {
      return json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!apiKey) {
      return json({ error: 'Google Gemini API key is required' }, { status: 400 });
    }

    logger.info('Starting logo generation with prompt:', prompt.substring(0, 100) + '...');
    if (images && images.length > 0) {
      const sourceCounts = images.reduce((acc, img) => {
        const sourceType = img.source.split(':')[0]; // Get the part before the colon
        acc[sourceType] = (acc[sourceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      logger.info('Including images:', Object.entries(sourceCounts).map(([type, count]) => `${count} ${type}`).join(', '));
    }

    // Get GenAI dynamically
    const { GoogleGenAI, Modality } = await getGenAI();
    
    if (!GoogleGenAI || !Modality) {
      return json({ error: 'Google GenAI module not available' }, { status: 500 });
    }
    
    const ai = new GoogleGenAI({ apiKey });

    // Build content array with text and optional images
    let contents: any = prompt;
    
    if (images && images.length > 0) {
      contents = [
        {
          text: prompt
        }
      ];

      // Add all images to the content
      images.forEach((image) => {
        contents.push({
          inlineData: {
            data: image.imageData,
            mimeType: image.mimeType
          }
        });
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    let imageData: string | null = null;
    let description = '';

    if (!response.candidates || response.candidates.length === 0) {
      return json({ error: 'No response candidates generated' }, { status: 500 });
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      return json({ error: 'Invalid response structure' }, { status: 500 });
    }

    for (const part of candidate.content.parts) {
      if (part.text) {
        description = part.text;
        logger.info('Generated description:', description.substring(0, 100) + '...');
      } else if (part.inlineData && part.inlineData.data) {
        imageData = part.inlineData.data;
        logger.info('Generated image data length:', imageData?.length || 0);
      }
    }

    if (!imageData) {
      return json({ error: 'No image was generated' }, { status: 500 });
    }

    return json({
      success: true,
      imageData,
      description,
      mimeType: 'image/png'
    });

  } catch (error) {
    logger.error('Logo generation failed:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
} 