export function CloudProvidersTab() {
  return (
    <div className="space-y-6">
      {/* Provider sections */}
      <div className="space-y-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="bg-[#2A2A2A] rounded-lg p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {provider.icon}
                <h3 className="text-lg font-medium text-white">{provider.name}</h3>
              </div>
              <Switch
                checked={provider.enabled}
                onChange={() => toggleProvider(provider.id)}
                className={classNames(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                  provider.enabled ? 'bg-indigo-600' : 'bg-gray-700'
                )}
              >
                <span
                  className={classNames(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    provider.enabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </Switch>
            </div>
            {provider.enabled && (
              <div className="space-y-4 pt-2">
                {provider.models.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between pl-8"
                  >
                    <span className="text-gray-300">{model.name}</span>
                    <Switch
                      checked={model.enabled}
                      onChange={() => toggleModel(provider.id, model.id)}
                      className={classNames(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                        model.enabled ? 'bg-indigo-600' : 'bg-gray-700'
                      )}
                    >
                      <span
                        className={classNames(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          model.enabled ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </Switch>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 