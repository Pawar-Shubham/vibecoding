import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { SiGoogle } from 'react-icons/si';
import { FaBrain } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { useSettings } from '~/lib/hooks/useSettings';
import { ProviderStatusCheckerFactory } from '../service-status/provider-factory';

type ProviderName = 'Google' | 'Anthropic';

type ProviderConfig = {
  statusUrl: string;
  apiUrl: string;
  headers: Record<string, string>;
  testModel: string;
};

type ServiceStatus = {
  status: 'operational' | 'degraded' | 'down';
  message: string;
  incidents: string[];
};

const PROVIDER_ICONS: Record<ProviderName, IconType> = {
  Google: SiGoogle,
  Anthropic: FaBrain,
};

const ServiceStatusTab = () => {
  const { providers } = useSettings();
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ServiceStatus>>({});

  useEffect(() => {
    const checkProviderStatus = async (provider: ProviderName) => {
      try {
        const checker = ProviderStatusCheckerFactory.createChecker(provider);
        const status = await checker.checkStatus();
        setProviderStatuses((prev) => ({ ...prev, [provider]: status }));
      } catch (error) {
        console.error(`Error checking status for ${provider}:`, error);
        setProviderStatuses((prev) => ({
          ...prev,
          [provider]: {
            status: 'down',
            message: 'Error checking status',
            incidents: ['Unable to fetch status information'],
          },
        }));
      }
    };

    const enabledProviders = Object.entries(providers || {})
      .filter(([key, value]) => value.settings.enabled && ['Google', 'Anthropic'].includes(key))
      .map(([key]) => key as ProviderName);

    enabledProviders.forEach(checkProviderStatus);
  }, [providers]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Service Status</h3>
        <p className="text-sm text-bolt-elements-textSecondary">
          Check the operational status of your enabled AI providers
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(providerStatuses).map(([provider, status], index) => (
          <motion.div
            key={provider}
            className={classNames(
              'rounded-lg border bg-bolt-elements-background text-bolt-elements-textPrimary shadow-sm',
              'bg-bolt-elements-background-depth-2',
              'hover:bg-bolt-elements-background-depth-3',
              'transition-all duration-200',
              'relative overflow-hidden group',
              'p-4',
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center gap-4">
              <motion.div
                className={classNames(
                  'w-12 h-12 flex items-center justify-center rounded-xl',
                  'bg-bolt-elements-background-depth-3',
                  status.status === 'operational'
                    ? 'text-green-500'
                    : status.status === 'degraded'
                    ? 'text-yellow-500'
                    : 'text-red-500',
                )}
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                {React.createElement(PROVIDER_ICONS[provider as ProviderName], {
                  className: 'w-7 h-7',
                  'aria-label': `${provider} icon`,
                })}
              </motion.div>
              <div>
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{provider}</h4>
                <p className="text-xs text-bolt-elements-textSecondary mt-0.5">{status.message}</p>
                {status.incidents.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {status.incidents.map((incident, i) => (
                      <li key={i} className="text-xs text-red-500">
                        {incident}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ServiceStatusTab;
