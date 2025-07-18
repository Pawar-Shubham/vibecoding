import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { GoogleGenAI, Modality } from '@google/genai';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.logo');

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json() as { prompt?: string; apiKey?: string; previousImage?: string };
    const { prompt, apiKey, previousImage } = body;

    if (!prompt) {
      return json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!apiKey) {
      return json({ error: 'Google Gemini API key is required' }, { status: 400 });
    }

    logger.info('Starting logo generation with prompt:', prompt.substring(0, 100) + '...');
    if (previousImage) {
      logger.info('Including previous image context');
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build content array with text and optional previous image
    let contents: any = prompt;
    
    if (previousImage) {
      contents = [
        {
          text: prompt
        },
        {
          inlineData: {
            data: previousImage,
            mimeType: "image/png"
          }
        }
      ];
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
        logger.info('Generated image data length:', imageData.length);
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