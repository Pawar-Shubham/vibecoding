import { useState, useEffect } from 'react';
import clsx from 'clsx';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  placeholderSrc?: string;
}

export function OptimizedImage({ 
  src, 
  alt, 
  className,
  placeholderSrc,
  ...props 
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholderSrc || src);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setCurrentSrc(src);
      setIsLoaded(true);
    };
  }, [src]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={clsx(
        'transition-opacity duration-300',
        !isLoaded && 'opacity-50 blur-sm',
        isLoaded && 'opacity-100 blur-0',
        className
      )}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
} 