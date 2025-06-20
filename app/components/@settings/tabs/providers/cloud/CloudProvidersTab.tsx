import React, { useEffect, useState, useCallback } from 'react';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import type { IProviderConfig } from '~/types/model';
import { logStore } from '~/lib/stores/logs';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { SiGoogle } from 'react-icons/si';
import { FaBrain } from 'react-icons/fa';
import type { IconType } from 'react-icons';

// Add type for provider names to ensure type safety
type ProviderName = 'Google' | 'Anthropic';

// Update the PROVIDER_ICONS type to use the ProviderName type
const PROVIDER_ICONS: Record<ProviderName, IconType> = {
  Google: SiGoogle,
  Anthropic: FaBrain,
};

// Update PROVIDER_DESCRIPTIONS to use the same type
const PROVIDER_DESCRIPTIONS: Record<ProviderName, string> = {
  Google: 'Access Gemini and other Google models',
  Anthropic: 'Access Claude and other Anthropic models',
};

const CloudProvidersTab = () => {
  const settings = useSettings();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [filteredProviders, setFilteredProviders] = useState<IProviderConfig[]>([]);
  const [categoryEnabled, setCategoryEnabled] = useState<boolean>(false);

  // Load and filter providers
  useEffect(() => {
    const newFilteredProviders = Object.entries(settings.providers || {})
      .filter(([key]) => ['Google', 'Anthropic'].includes(key))
      .map(([key, value]) => ({
        name: key,
        settings: value.settings,
        staticModels: value.staticModels || [],
        getDynamicModels: value.getDynamicModels,
        getApiKeyLink: value.getApiKeyLink,
        labelForGetApiKey: value.labelForGetApiKey,
        icon: value.icon,
      }));

    const sorted = newFilteredProviders.sort((a, b) => a.name.localeCompare(b.name));
    setFilteredProviders(sorted);

    // Update category enabled state
    const allEnabled = newFilteredProviders.every((p) => p.settings.enabled);
    setCategoryEnabled(allEnabled);
  }, [settings.providers]);

  const handleToggleCategory = useCallback(
    (enabled: boolean) => {
      // Update all providers
      filteredProviders.forEach((provider) => {
        settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });
      });

      setCategoryEnabled(enabled);
      toast.success(enabled ? 'All cloud providers enabled' : 'All cloud providers disabled');
    },
    [filteredProviders, settings],
  );

  const handleToggleProvider = useCallback(
    (provider: IProviderConfig, enabled: boolean) => {
      // Don't allow disabling Google provider
      if (provider.name === 'Google') {
        toast.info('Google is the default provider and cannot be disabled');
        return;
      }

      // Update the provider settings in the store
      settings.updateProviderSettings(provider.name, { ...provider.settings, enabled });

      if (enabled) {
        logStore.logProvider(`Provider ${provider.name} enabled`, { provider: provider.name });
        toast.success(`${provider.name} enabled`);
      } else {
        logStore.logProvider(`Provider ${provider.name} disabled`, { provider: provider.name });
        toast.success(`${provider.name} disabled`);
      }
    },
    [settings],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Cloud Providers</h3>
          <p className="text-sm text-bolt-elements-textSecondary mt-1">
            Configure and manage your cloud AI providers
          </p>
        </div>
        <Switch
          checked={categoryEnabled}
          onCheckedChange={handleToggleCategory}
          aria-label="Toggle all cloud providers"
        />
      </div>

      <div className="grid gap-4">
        {filteredProviders.map((provider, index) => (
          <motion.div
            key={provider.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={classNames(
              'group relative p-4 rounded-lg transition-all duration-200',
              'bg-bolt-elements-background-depth-2',
              'hover:bg-bolt-elements-background-depth-3',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <motion.div
                  className={classNames(
                    'w-12 h-12 flex items-center justify-center rounded-xl',
                    'bg-bolt-elements-background-depth-3',
                    provider.settings.enabled ? 'text-yellow-500' : 'text-bolt-elements-textSecondary',
                  )}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  {React.createElement(PROVIDER_ICONS[provider.name as ProviderName], {
                    className: 'w-7 h-7',
                    'aria-label': `${provider.name} icon`,
                  })}
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-yellow-500 transition-colors">
                      {provider.name}
                    </h4>
                    {provider.name === 'Google' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-500 font-medium">
                        Default Provider
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                    {PROVIDER_DESCRIPTIONS[provider.name as ProviderName]}
                  </p>
                </div>
              </div>
              <Switch
                checked={provider.settings.enabled}
                onCheckedChange={(checked) => handleToggleProvider(provider, checked)}
                aria-label={`Toggle ${provider.name} provider`}
                disabled={provider.name === 'Google'}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default CloudProvidersTab;
