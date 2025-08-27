import { memo } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { classNames } from '~/utils/classNames';

interface SwitchProps {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (event: boolean) => void;
}

export const Switch = memo(({ className, onCheckedChange, checked }: SwitchProps) => {
  return (
    <SwitchPrimitive.Root
      className={classNames(
        'relative h-6 w-11 cursor-pointer rounded-full',
        // Off state: clearer neutral track
        'bg-gray-200 dark:bg-[#141414]',
        'transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
        'disabled:cursor-not-allowed disabled:opacity-30',
        // Checked state: brand accent (force in both themes)
        'data-[state=checked]:bg-[#07F29C] dark:data-[state=checked]:bg-[#07F29C] data-[state=checked]:border-[#07F29C]',
        // Stronger border contrast in off state
        'border border-gray-300 dark:border-gray-600',
        className,
      )}
      checked={checked}
      onCheckedChange={(e) => onCheckedChange?.(e)}
    >
      <SwitchPrimitive.Thumb
        className={classNames(
          'block h-5 w-5 rounded-full bg-white',
          'shadow-lg shadow-black/20',
          'transition-transform duration-200 ease-in-out',
          'translate-x-0.5',
          'data-[state=checked]:translate-x-[1.375rem]',
          'will-change-transform',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
