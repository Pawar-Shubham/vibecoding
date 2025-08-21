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

// Health check cache
const keyHealthCache = new Map<string, { isHealthy: boolean; lastChecked: number; quotaAvailable: boolean }>();
const HEALTH_CHECK_CACHE_TIME = 60000; // Cache health checks for 1 minute
const HEALTH_CHECK_TIMEOUT = 5000; // 5 second timeout for health checks

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

  // Helper method to check API key health
  private async checkApiKeyHealth(apiKey: string): Promise<{ isHealthy: boolean; quotaAvailable: boolean; error?: string }> {
    const keyPreview = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
    
    try {
      logger.info(`🔍 Health checking API key (${keyPreview})`);
      
      // Use a controller to implement timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        logger.info(`✅ API key (${keyPreview}) is healthy`);
        return { isHealthy: true, quotaAvailable: true };
      } else {
        const errorData = await response.json().catch(() => ({})) as any;
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        
        if (response.status === 429 || errorMessage.includes('quota')) {
          logger.warn(`⚠️ API key (${keyPreview}) quota exceeded`);
          return { isHealthy: false, quotaAvailable: false, error: 'quota_exceeded' };
        } else if (response.status === 403 || errorMessage.includes('invalid') || errorMessage.includes('API key not valid')) {
          logger.warn(`❌ API key (${keyPreview}) is invalid`);
          return { isHealthy: false, quotaAvailable: false, error: 'invalid_key' };
        } else {
          logger.warn(`⚠️ API key (${keyPreview}) health check failed: ${errorMessage}`);
          return { isHealthy: false, quotaAvailable: false, error: errorMessage };
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn(`⏰ API key (${keyPreview}) health check timed out`);
        return { isHealthy: false, quotaAvailable: false, error: 'timeout' };
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`❌ API key (${keyPreview}) health check error: ${errorMessage}`);
      return { isHealthy: false, quotaAvailable: false, error: errorMessage };
    }
  }

  // Helper method to get cached health or perform new health check
  private async getApiKeyHealth(apiKey: string): Promise<{ isHealthy: boolean; quotaAvailable: boolean }> {
    const now = Date.now();
    const cached = keyHealthCache.get(apiKey);
    
    // Use cached result if it's recent
    if (cached && (now - cached.lastChecked) < HEALTH_CHECK_CACHE_TIME) {
      return { isHealthy: cached.isHealthy, quotaAvailable: cached.quotaAvailable };
    }
    
    // Perform new health check
    const health = await this.checkApiKeyHealth(apiKey);
    
    // Cache the result
    keyHealthCache.set(apiKey, {
      isHealthy: health.isHealthy,
      quotaAvailable: health.quotaAvailable,
      lastChecked: now
    });
    
    // If key is unhealthy, mark it as failed
    if (!health.isHealthy) {
      this.markKeyAsFailed(apiKey);
    }
    
    return { isHealthy: health.isHealthy, quotaAvailable: health.quotaAvailable };
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
      keyHealthCache.delete(apiKey); // Clear health cache too
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

  // Method to get the next available and healthy API key
  private async getHealthyApiKey(apiKeys: string[]): Promise<string> {
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
    
    logger.info(`🔍 Proactively checking health of ${availableKeys.length} available API keys`);
    
    // Check health of available keys (in parallel for speed)
    const healthPromises = availableKeys.map(async key => {
      const health = await this.getApiKeyHealth(key);
      return { key, ...health };
    });
    
    const healthResults = await Promise.all(healthPromises);
    
    // Filter to only healthy keys
    const healthyKeys = healthResults.filter(result => result.isHealthy).map(result => result.key);
    
    if (healthyKeys.length === 0) {
      logger.warn(`⚠️ No healthy API keys found, trying least recently failed key`);
      
      // If no keys are healthy, use the one that's been in cooldown the longest
      let oldestKey = availableKeys[0];
      let oldestTime = keyFailureCooldown.get(oldestKey) || 0;
      
      for (const key of availableKeys) {
        const failTime = keyFailureCooldown.get(key) || 0;
        if (failTime < oldestTime) {
          oldestTime = failTime;
          oldestKey = key;
        }
      }
      return oldestKey;
    }
    
    logger.info(`✅ Found ${healthyKeys.length} healthy API keys`);
    
    // Rotate through healthy keys
    const now = Date.now();
    const currentKey = apiKeys[currentKeyIndex];
    const shouldRotate = 
      now - lastUsedTime > MIN_TIME_BETWEEN_SWITCHES || 
      lastUsedTime === 0 || 
      this.isKeyInCooldown(currentKey) ||
      !healthyKeys.includes(currentKey);
    
    if (shouldRotate) {
      // Find next healthy key
      let nextIndex = (currentKeyIndex + 1) % apiKeys.length;
      while (!healthyKeys.includes(apiKeys[nextIndex]) && nextIndex !== currentKeyIndex) {
        nextIndex = (nextIndex + 1) % apiKeys.length;
      }
      
      // If we couldn't find a healthy key in sequence, use the first healthy one
      if (!healthyKeys.includes(apiKeys[nextIndex])) {
        const firstHealthyKey = healthyKeys[0];
        nextIndex = apiKeys.indexOf(firstHealthyKey);
      }
      
      currentKeyIndex = nextIndex;
      lastUsedTime = now;
      logger.info(`Rotated to healthy API key ${currentKeyIndex + 1}/${apiKeys.length} for ${this.name} provider`);
    }
    
    const selectedKey = apiKeys[currentKeyIndex];
    const keyPreview = selectedKey.substring(0, 10) + '...' + selectedKey.substring(selectedKey.length - 4);
    logger.info(`Using healthy API key ${currentKeyIndex + 1}/${apiKeys.length} (${keyPreview}) for ${this.name} provider`);
    
    return selectedKey;
  }

  // Method to try an operation with proactive health checking and automatic failover
  private async tryWithFailover<T>(
    apiKeys: string[],
    operation: (apiKey: string) => Promise<T>,
    operationName: string
  ): Promise<T> {
    // First, get a healthy API key proactively
    const healthyApiKey = await this.getHealthyApiKey(apiKeys);
    const keyIndex = apiKeys.indexOf(healthyApiKey);
    const keyPreview = healthyApiKey.substring(0, 10) + '...' + healthyApiKey.substring(healthyApiKey.length - 4);
    
    try {
      logger.info(`Attempting ${operationName} with pre-validated healthy API key ${keyIndex + 1}/${apiKeys.length} (${keyPreview})`);
      const result = await operation(healthyApiKey);
      logger.info(`✅ ${operationName} successful with API key ${keyIndex + 1}/${apiKeys.length}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`❌ ${operationName} failed with pre-validated key ${keyIndex + 1}/${apiKeys.length}: ${errorMessage}`);
      
      // Mark this key as failed since it was supposed to be healthy
      this.markKeyAsFailed(healthyApiKey);
      
      logger.info(`🔄 Trying reactive failover to other keys...`);
      
      // Fall back to reactive approach for remaining keys
      const remainingKeys = apiKeys.filter(key => key !== healthyApiKey && !this.isKeyInCooldown(key));
      
      if (remainingKeys.length === 0) {
        logger.error(`No more API keys available for ${operationName}`);
        throw new Error(`All API keys failed for ${operationName}. Last error: ${errorMessage}`);
      }
      
      for (let i = 0; i < remainingKeys.length; i++) {
        const fallbackKey = remainingKeys[i];
        const fallbackIndex = apiKeys.indexOf(fallbackKey);
        const fallbackPreview = fallbackKey.substring(0, 10) + '...' + fallbackKey.substring(fallbackKey.length - 4);
        
        try {
          logger.info(`Attempting ${operationName} with fallback API key ${fallbackIndex + 1}/${apiKeys.length} (${fallbackPreview})`);
          const result = await operation(fallbackKey);
          logger.info(`✅ ${operationName} successful with fallback API key ${fallbackIndex + 1}/${apiKeys.length}`);
          return result;
        } catch (fallbackError) {
          const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          logger.warn(`❌ ${operationName} failed with fallback API key ${fallbackIndex + 1}/${apiKeys.length}: ${fallbackErrorMessage}`);
          
          // Check if this is a quota or auth error (should mark key as failed)
          if (fallbackErrorMessage.includes('quota') || 
              fallbackErrorMessage.includes('QUOTA_EXCEEDED') ||
              fallbackErrorMessage.includes('403') ||
              fallbackErrorMessage.includes('invalid') ||
              fallbackErrorMessage.includes('API_KEY_INVALID')) {
            this.markKeyAsFailed(fallbackKey);
          }
          
          // If this is the last fallback key, throw the error
          if (i === remainingKeys.length - 1) {
            logger.error(`All fallback API keys failed for ${operationName}`);
            throw new Error(`All ${apiKeys.length} API keys failed for ${operationName}. Last error: ${fallbackErrorMessage}`);
          }
        }
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

    // Create a wrapper model that handles proactive health checking and automatic failover
    const createModelWithFailover = () => {
      // Create a base model with the first available key for structure
      const tempApiKey = availableApiKeys[0];
      const google = createGoogleGenerativeAI({ apiKey: tempApiKey });
      const baseModel = google(model);

      // Create a wrapper that adds proactive health checking and failover to model methods
      return {
        ...baseModel,
        // Override doGenerate to add proactive health checking and failover
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
        // Override doStream to add proactive health checking and failover
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
