import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';
import * as SwitchPrimitive from '@radix-ui/react-switch';

interface ThemeSwitchProps {
  className?: string;
  variant?: 'icon' | 'switch';
}

export const ThemeSwitch = memo(({ className, variant = 'icon' }: ThemeSwitchProps) => {
  const theme = useStore(themeStore);
  const [domLoaded, setDomLoaded] = useState(false);

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  if (!domLoaded) return null;

  if (variant === 'icon') {
    return (
      <button
        className={classNames(
          'flex items-center rounded-md p-1',
          'text-[#666] bg-transparent',
          'hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10',
          'transition-colors',
          className
        )}
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <div className={theme === 'dark' ? 'i-ph:sun-dim text-xl' : 'i-ph:moon-stars text-xl'} />
      </button>
    );
  }

  return (
    <SwitchPrimitive.Root
      className={classNames(
        'relative h-6 w-11 cursor-pointer rounded-full',
        'bg-gray-200 dark:bg-gray-700',
        'transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus:ring-[#07F29C]/30 focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-30',
        'data-[state=checked]:bg-[#07F29C]',
        'border border-gray-300 dark:border-gray-600',
        className,
      )}
      checked={theme === 'dark'}
      onCheckedChange={toggleTheme}
    >
      <div className="absolute inset-0.5 flex justify-between items-center px-[2px] pointer-events-none">
        {/* Sun icon */}
        <div className="w-4 h-4 text-gray-600">
          <div className="i-ph:sun-dim w-3.5 h-3.5" />
        </div>
        {/* Moon icon */}
        <div className="w-4 h-4 text-white">
          <div className="i-ph:moon-stars w-3.5 h-3.5" />
        </div>
      </div>
      <SwitchPrimitive.Thumb
        className={classNames(
          'block h-5 w-5 rounded-full bg-white',
          'shadow-lg shadow-black/10',
          'transition-transform duration-200 ease-in-out',
          'translate-x-0',
          'data-[state=checked]:translate-x-5',
          'will-change-transform',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
