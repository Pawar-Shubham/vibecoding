import type { ProviderName, ProviderConfig, StatusCheckResult } from './types';
import { BaseProviderChecker } from './base-provider';
import { GoogleStatusChecker } from './providers/google';
import { AnthropicStatusChecker } from './providers/anthropic';

export class ProviderStatusCheckerFactory {
  private static _providerConfigs: Record<ProviderName, ProviderConfig> = {
    Google: {
      statusUrl: 'https://status.cloud.google.com/',
      apiUrl: 'https://generativelanguage.googleapis.com/v1/models',
      headers: {},
      testModel: 'gemini-pro',
    },
    Anthropic: {
      statusUrl: 'https://status.anthropic.com/',
      apiUrl: 'https://api.anthropic.com/v1/models',
      headers: {
        'anthropic-version': '2023-06-01',
      },
      testModel: 'claude-3-sonnet-20240229',
    },
  };

  static createChecker(provider: ProviderName): BaseProviderChecker {
    const config = this._providerConfigs[provider];
    if (!config) {
      throw new Error(`No configuration found for provider ${provider}`);
    }

    switch (provider) {
      case 'Google':
        return new GoogleStatusChecker(config);
      case 'Anthropic':
        return new AnthropicStatusChecker(config);
      default:
        throw new Error(`No checker implementation found for provider ${provider}`);
    }
  }
}
