import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';

interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch = memo(({ className }: ThemeSwitchProps) => {
  const theme = useStore(themeStore);
  const [domLoaded, setDomLoaded] = useState(false);

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  return (
    domLoaded && (
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
    )
  );
});
