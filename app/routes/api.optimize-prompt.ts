import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.optimize-prompt');

interface AppContext {
  env?: {
    GOOGLE_GENERATIVE_AI_API_KEY?: string;
  };
}

export async function action({ request, context }: ActionFunctionArgs & { context: AppContext }) {
  try {
    const body = await request.json() as { 
      userMessage: string; 
      conversationHistory: Array<{
        type: 'user' | 'assistant', 
        content: string
      }>; 
      images?: Array<{
        imageData: string;
        mimeType: string;
        source: string;
      }>;
    };
    const { userMessage, conversationHistory, images } = body;

    if (!userMessage) {
      return json({ error: 'User message is required' }, { status: 400 });
    }

    // Get API key from environment variables
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || context.env?.GOOGLE_GENERATIVE_AI_API_KEY;
    
    if (!apiKey) {
      logger.error('Gemini API key not found in environment variables');
      return json({ error: 'Gemini API key not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment variables.' }, { status: 500 });
    }

    logger.info('Optimizing prompt with conversation history:', conversationHistory.length, 'messages', 'and', images?.length || 0, 'images');

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      contextPrompt = `Previous conversation context:\n`;
      conversationHistory.forEach((msg, index) => {
        contextPrompt += `${index + 1}. ${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      contextPrompt += `\nLatest user request: ${userMessage}\n\n`;
    }

    // Add image context information
    if (images && images.length > 0) {
      contextPrompt += `Images provided:\n`;
      images.forEach((image, index) => {
        contextPrompt += `${index + 1}. ${image.source}\n`;
      });
      contextPrompt += `\n`;
    }

    const systemPrompt = `You are a prompt optimization expert for logo generation using Gemini AI. Your job is to:

1. Analyze the conversation history and any provided images along with the latest user request
2. Create a consolidated, optimized prompt command specifically for Gemini to generate logos
3. ALWAYS prioritize the LATEST changes over previous ones and automatically remove conflicting commands
4. Combine all requirements into a single, clear, detailed prompt for logo creation
5. Focus on: logo name/text, style, colors, typography, symbols, layout, mood/vibe
6. Be specific and descriptive for better logo generation results

CRITICAL CONTEXT:
- You are seeing images from multiple sources with clear labels:
  * "user-reference: [filename]" - Reference materials uploaded/pasted by user (inspiration, style guides, existing logos to reference)
  * "current-logo" - The most recent logo iteration that the user wants to modify
  * "previous-logo" - The logo from before the current one, showing design evolution
- The same image data you're seeing is also being sent to the Gemini image generation model
- The image generation model will use these images as references for creating the next iteration
- Your optimized prompt will be combined with these images to generate the next iteration
- Focus on describing changes, improvements, or new elements based on the reference images and current logo state
- Consider the design evolution from previous → current → requested changes

CRITICAL RULES for handling changes:
- You should ONLY modify the text and create prompt commands for Gemini to create logos
- Latest changes OVERRIDE and REPLACE previous changes for the same attribute
- Automatically remove conflicting commands (e.g., if color changed from pink to blue, completely remove pink and only keep blue)
- If user says "change color to blue" after previously saying "pink", the optimized prompt should contain NO reference to pink at all
- Always prioritize the most recent change for any design attribute (color, style, shape, text, etc.)
- Consolidate all valid, non-conflicting requirements into one comprehensive prompt
- Keep the company/brand name if specified
- Make the prompt detailed but focused specifically for logo generation
- Don't mention the conversation history in the output prompt
- When there are user reference images, incorporate relevant style elements that match the user's request
- When there's a current logo, focus on describing the desired changes or improvements to that existing design
- Use the previous logo to understand the design direction and maintain good elements while applying requested changes

The output should be a clean, optimized prompt that Gemini can use to generate logos while persisting only the latest changes and removing any conflicting previous commands.

Output ONLY the optimized prompt for logo generation, nothing else.`;

    const fullPrompt = `${systemPrompt}\n\n${contextPrompt || userMessage}`;

    // Prepare the request body for Gemini API
    const requestBody: any = {
      contents: [{
        parts: [{
          text: fullPrompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      }
    };

    // Add all images to the request if available
    if (images && images.length > 0) {
      // Add images in order (user-uploaded first, then current logo)
      images.forEach((image) => {
        requestBody.contents[0].parts.unshift({
          inline_data: {
            mime_type: image.mimeType || 'image/png',
            data: image.imageData
          }
        });
      });
      logger.info(`Added ${images.length} images to optimization request`);
    }

    // Retry logic for handling overloaded model
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempt ${attempt}/${maxRetries} to optimize prompt`);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const data = await response.json() as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                }>;
              };
            }>;
            error?: any;
          };

          if (data.error) {
            throw new Error(data.error.message || 'Gemini API error');
          }

          const optimizedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!optimizedPrompt) {
            throw new Error('No optimized prompt generated');
          }

          logger.info('Successfully optimized prompt on attempt', attempt);
          return json({
            success: true,
            optimizedPrompt: optimizedPrompt.trim(),
          });
        }

        // Handle different error types
        const errorData = await response.text();
        let parsedError: any = {};
        try {
          parsedError = JSON.parse(errorData);
        } catch {
          parsedError = { message: errorData };
        }

        // Check for 503 (overloaded) or rate limit errors
        if (response.status === 503 || response.status === 429) {
          logger.warn(`Attempt ${attempt}: Model overloaded (${response.status}), retrying...`);
          lastError = parsedError;
          
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, attempt - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } else {
          // For other errors, don't retry
          logger.error('Gemini API error:', response.status, errorData);
          throw new Error(parsedError.error?.message || 'Failed to optimize prompt');
        }

      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }
        logger.warn(`Attempt ${attempt} failed:`, error);
      }
    }

    // If we get here, all retries failed
    logger.error('All attempts failed. Last error:', lastError);
    
    if (lastError?.error?.code === 503 || lastError?.error?.status === 'UNAVAILABLE') {
      return json({ 
        error: 'Gemini is currently overloaded. Please try again in a few moments.' 
      }, { status: 503 });
    }

    return json({ 
      error: lastError?.error?.message || lastError?.message || 'Failed to optimize prompt after multiple attempts' 
    }, { status: 500 });

  } catch (error) {
    logger.error('Prompt optimization failed:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
} 