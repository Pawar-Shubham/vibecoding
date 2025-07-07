import { Switch } from '@headlessui/react';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { settingsStore } from '~/lib/stores/settings';

export function GeneralTab() {
  const settings = useStore(settingsStore);

  const updateSettings = (key: string, value: boolean) => {
    settingsStore.setKey(key, value);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-medium text-white">Appearance</h3>
        <p className="text-sm text-gray-400">
          Customize how the application looks on your device.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-white">Dark Mode</h4>
            <p className="text-sm text-gray-400">
              Enable dark mode for a better viewing experience in low-light environments.
            </p>
          </div>
          <Switch
            checked={settings.darkMode}
            onChange={(value) => updateSettings('darkMode', value)}
            className={classNames(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
              settings.darkMode ? 'bg-indigo-600' : 'bg-gray-700'
            )}
          >
            <span
              className={classNames(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.darkMode ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </Switch>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-white">Reduced Motion</h4>
            <p className="text-sm text-gray-400">
              Reduce motion effects throughout the application.
            </p>
          </div>
          <Switch
            checked={settings.reducedMotion}
            onChange={(value) => updateSettings('reducedMotion', value)}
            className={classNames(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
              settings.reducedMotion ? 'bg-indigo-600' : 'bg-gray-700'
            )}
          >
            <span
              className={classNames(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.reducedMotion ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </Switch>
        </div>
      </div>
    </div>
  );
} 