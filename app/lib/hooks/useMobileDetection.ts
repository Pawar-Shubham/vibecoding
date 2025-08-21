import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user is on a mobile device
 * Returns true for mobile devices (phones and tablets)
 */
export function useMobileDetection(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      // Check user agent for mobile indicators
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = [
        'mobile',
        'android',
        'iphone',
        'ipad',
        'ipod',
        'blackberry',
        'windows phone',
        'opera mini',
        'webos',
        'kindle'
      ];

      const isMobileUserAgent = mobileKeywords.some(keyword => 
        userAgent.includes(keyword)
      );

      // Also check screen width as a fallback
      const isMobileScreen = window.innerWidth <= 768;

      // Check for touch capability
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // Consider it mobile if any of these conditions are true
      setIsMobile(isMobileUserAgent || (isMobileScreen && isTouchDevice));
    };

    // Check immediately
    checkIsMobile();

    // Also check on resize
    window.addEventListener('resize', checkIsMobile);

    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  return isMobile;
}