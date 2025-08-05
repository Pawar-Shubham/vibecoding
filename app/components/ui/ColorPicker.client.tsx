import React, { lazy, Suspense } from 'react';

// Lazy load react-colorful to avoid SSR issues
const HexColorPicker = lazy(() => 
  import('react-colorful').then(module => ({ 
    default: module.HexColorPicker 
  }))
);

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  style?: React.CSSProperties;
}

export function ColorPicker({ color, onChange, style }: ColorPickerProps) {
  return (
    <Suspense 
      fallback={
        <div className="text-center text-gray-500 p-4">
          Loading color picker...
        </div>
      }
    >
      <HexColorPicker
        color={color}
        onChange={onChange}
        style={style}
      />
    </Suspense>
  );
}