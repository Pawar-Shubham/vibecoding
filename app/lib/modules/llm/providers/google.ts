import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GoogleProvider');

// Global state for API key rotation and failure tracking
let currentKeyIndex = 0;
let lastUsedTime = 0;
const MIN_TIME_BETWEEN_SWITCHES = 60000; // 1 minute
const failedKeys = new Set<string>(); // Track failed keys
const keyFailureCooldown = new Map<string, number>(); // Cooldown for failed keys
const KEY_FAILURE_COOLDOWN_TIME = 300000; // 5 minutes cooldown for failed keys

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  // Method to get API keys as an array (supporting comma-separated values)
  private getApiKeysArray(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: IProviderSetting;
    serverEnv?: Record<string, string>;
    defaultApiTokenKey: string;
  }): string[] {
    const { apiKeys, providerSettings, serverEnv, defaultApiTokenKey } = options;
    
    // Try to get API key from multiple sources
    const apiKeyString = 
      apiKeys?.[this.name] || 
      serverEnv?.[defaultApiTokenKey] || 
      process?.env?.[defaultApiTokenKey];
    
    if (!apiKeyString) {
      return [];
    }
    
    // Split by comma and trim whitespace
    return apiKeyString.split(',').map(key => key.trim()).filter(key => key.length > 0);
  }

  // Helper method to check if a key is in cooldown
  private isKeyInCooldown(apiKey: string): boolean {
    const cooldownTime = keyFailureCooldown.get(apiKey);
    if (!cooldownTime) return false;
    
    const now = Date.now();
    if (now - cooldownTime > KEY_FAILURE_COOLDOWN_TIME) {
      // Cooldown expired, remove from failed keys
      keyFailureCooldown.delete(apiKey);
      failedKeys.delete(apiKey);
      return false;
    }
    return true;
  }

  // Helper method to mark a key as failed
  private markKeyAsFailed(apiKey: string): void {
    const keyPreview = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
    logger.warn(`🚫 Marking API key (${keyPreview}) as failed for 5 minutes`);
    failedKeys.add(apiKey);
    keyFailureCooldown.set(apiKey, Date.now());
  }

  // Method to get the next available (non-failed) API key
  private getAvailableApiKey(apiKeys: string[]): string {
    if (apiKeys.length === 0) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }
    
    if (apiKeys.length === 1) {
      const key = apiKeys[0];
      if (this.isKeyInCooldown(key)) {
        logger.warn(`Single API key is in cooldown, but using it anyway (no alternatives)`);
      }
      return key;
    }
    
    // Filter out keys that are in cooldown
    const availableKeys = apiKeys.filter(key => !this.isKeyInCooldown(key));
    
    if (availableKeys.length === 0) {
      logger.warn(`All API keys are in cooldown, using oldest failed key`);
      // If all keys are failed, use the one that's been in cooldown the longest
      let oldestKey = apiKeys[0];
      let oldestTime = keyFailureCooldown.get(oldestKey) || 0;
      
      for (const key of apiKeys) {
        const failTime = keyFailureCooldown.get(key) || 0;
        if (failTime < oldestTime) {
          oldestTime = failTime;
          oldestKey = key;
        }
      }
      return oldestKey;
    }
    
    // Rotate to next available key if enough time has passed or if current key is in cooldown
    const now = Date.now();
    const currentKey = apiKeys[currentKeyIndex];
    const shouldRotate = 
      now - lastUsedTime > MIN_TIME_BETWEEN_SWITCHES || 
      lastUsedTime === 0 || 
      this.isKeyInCooldown(currentKey);
    
    if (shouldRotate) {
      // Find next available key
      let nextIndex = (currentKeyIndex + 1) % apiKeys.length;
      while (this.isKeyInCooldown(apiKeys[nextIndex]) && nextIndex !== currentKeyIndex) {
        nextIndex = (nextIndex + 1) % apiKeys.length;
      }
      
      currentKeyIndex = nextIndex;
      lastUsedTime = now;
      logger.info(`Rotated to API key ${currentKeyIndex + 1}/${apiKeys.length} for ${this.name} provider`);
    }
    
    const selectedKey = apiKeys[currentKeyIndex];
    const keyPreview = selectedKey.substring(0, 10) + '...' + selectedKey.substring(selectedKey.length - 4);
    logger.info(`Using API key ${currentKeyIndex + 1}/${apiKeys.length} (${keyPreview}) for ${this.name} provider`);
    
    return selectedKey;
  }

  // Method to try an operation with automatic failover
  private async tryWithFailover<T>(
    apiKeys: string[],
    operation: (apiKey: string) => Promise<T>,
    operationName: string
  ): Promise<T> {
    const errors: Array<{ keyIndex: number; error: any }> = [];
    
    // Try each available key
    for (let attempt = 0; attempt < apiKeys.length; attempt++) {
      const apiKey = this.getAvailableApiKey(apiKeys);
      const keyIndex = apiKeys.indexOf(apiKey);
      const keyPreview = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
      
      try {
        logger.info(`Attempting ${operationName} with API key ${keyIndex + 1}/${apiKeys.length} (${keyPreview})`);
        const result = await operation(apiKey);
        logger.info(`✅ ${operationName} successful with API key ${keyIndex + 1}/${apiKeys.length}`);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`❌ ${operationName} failed with API key ${keyIndex + 1}/${apiKeys.length}: ${errorMessage}`);
        
        // Check if this is a quota or auth error (should mark key as failed)
        if (errorMessage.includes('quota') || 
            errorMessage.includes('QUOTA_EXCEEDED') ||
            errorMessage.includes('403') ||
            errorMessage.includes('invalid') ||
            errorMessage.includes('API_KEY_INVALID')) {
          this.markKeyAsFailed(apiKey);
        }
        
        errors.push({ keyIndex, error });
        
        // If this is the last attempt, throw the error
        if (attempt === apiKeys.length - 1) {
          logger.error(`All API keys failed for ${operationName}. Errors:`, errors);
          throw new Error(`All ${apiKeys.length} API keys failed for ${operationName}. Last error: ${errorMessage}`);
        }
        
        logger.info(`🔄 Trying next available API key...`);
      }
    }
    
    // This should never be reached
    throw new Error(`All API keys failed for ${operationName}`);
  }

  staticModels: ModelInfo[] = [
    { 
      name: 'gemini-2.5-flash-preview-05-20',
      label: 'Gemini 2.5 Flash Preview 05-20 - context 1114k',
      provider: 'Google',
      maxTokenAllowed: 1114000
    },
    { name: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash', provider: 'Google', maxTokenAllowed: 8192 },
    {
      name: 'gemini-2.0-flash-thinking-exp-01-21',
      label: 'Gemini 2.0 Flash-thinking-exp-01-21',
      provider: 'Google',
      maxTokenAllowed: 65536,
    },
    { name: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-flash-002', label: 'Gemini 1.5 Flash-002', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash-8b', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-pro-002', label: 'Gemini 1.5 Pro-002', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-exp-1206', label: 'Gemini exp-1206', provider: 'Google', maxTokenAllowed: 8192 },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const availableApiKeys = this.getApiKeysArray({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    return this.tryWithFailover(
      availableApiKeys,
      async (apiKey: string) => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          headers: {
            ['Content-Type']: 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as any;
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const res = (await response.json()) as any;
        const data = res.models.filter((model: any) => model.outputTokenLimit > 8000);

        return data.map((m: any) => ({
          name: m.name.replace('models/', ''),
          label: `${m.displayName} - context ${Math.floor((m.inputTokenLimit + m.outputTokenLimit) / 1000) + 'k'}`,
          provider: this.name,
          maxTokenAllowed: m.inputTokenLimit + m.outputTokenLimit || 8000,
        }));
      },
      'dynamic models fetch'
    );
  }

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    logger.info(`Creating model instance for ${model} with ${this.name} provider`);

    const availableApiKeys = this.getApiKeysArray({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    logger.info(`Found ${availableApiKeys.length} available API keys for ${this.name} provider`);

    // Create a wrapper model that handles automatic failover
    const createModelWithFailover = () => {
      // Get the best available API key right now
      const apiKey = this.getAvailableApiKey(availableApiKeys);
      const google = createGoogleGenerativeAI({ apiKey });
      const baseModel = google(model);

      // Create a wrapper that adds failover to model methods
      return {
        ...baseModel,
        // Override doGenerate to add failover (this is the actual method used by the AI SDK)
        doGenerate: async (params: any) => {
          return this.tryWithFailover(
            availableApiKeys,
            async (retryApiKey: string) => {
              const retryGoogle = createGoogleGenerativeAI({ apiKey: retryApiKey });
              const retryModel = retryGoogle(model);
              return await (retryModel as any).doGenerate(params);
            },
            'content generation'
          );
        },
        // Override doStream to add failover
        doStream: async (params: any) => {
          return this.tryWithFailover(
            availableApiKeys,
            async (retryApiKey: string) => {
              const retryGoogle = createGoogleGenerativeAI({ apiKey: retryApiKey });
              const retryModel = retryGoogle(model);
              return await (retryModel as any).doStream(params);
            },
            'streaming content generation'
          );
        }
      };
    };

    const modelWithFailover = createModelWithFailover();
    logger.info(`Model instance created for ${model} with automatic failover support`);
    
    return modelWithFailover as LanguageModelV1;
  }
}
