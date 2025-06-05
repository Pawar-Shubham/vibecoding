import type { IconType } from 'react-icons';

export type ProviderName = 'Google' | 'Anthropic';

export type ServiceStatus = {
  provider: ProviderName;
  status: 'operational' | 'degraded' | 'down';
  lastChecked: string;
  statusUrl?: string;
  icon?: IconType;
  message?: string;
  responseTime?: number;
  incidents?: string[];
};

export interface ProviderConfig {
  statusUrl: string;
  apiUrl: string;
  headers: Record<string, string>;
  testModel: string;
}

export interface StatusCheckResult {
  status: 'operational' | 'degraded' | 'down';
  message: string;
  incidents: string[];
}

export interface ApiResponse {
  status: number;
  data: any;
}
