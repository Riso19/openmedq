import { useState, useEffect } from 'react';
import { db } from '../lib/db';

interface LocalImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  srcPath: string | undefined;
}

export function LocalImage({ srcPath, alt, ...props }: LocalImageProps) {
  const [objectUrl, setObjectUrl] = useState<string>(() => {
    if (!srcPath) return '';
    if (srcPath.startsWith('http://') || srcPath.startsWith('https://') || srcPath.startsWith('data:')) {
      return srcPath;
    }
    return '';
  });

  useEffect(() => {
    if (!srcPath) {
      Promise.resolve().then(() => {
        setObjectUrl('');
      });
      return;
    }

    const pathVal = srcPath;

    // If it's already a full remote URL or data URL, use it directly
    if (pathVal.startsWith('http://') || pathVal.startsWith('https://') || pathVal.startsWith('data:')) {
      Promise.resolve().then(() => {
        setObjectUrl(pathVal);
      });
      return;
    }

    let active = true;
    let currentObjectUrl = '';

    async function loadCachedImage() {
      try {
        // Query Dexie
        const cached = await db.cachedImages.get(pathVal);
        if (cached && cached.blob) {
          if (active) {
            currentObjectUrl = URL.createObjectURL(cached.blob);
            setObjectUrl(currentObjectUrl);
          }
        } else {
          // Fallback to CDN URL
          const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
          const cleanPath = pathVal.startsWith('/') ? pathVal : `/${pathVal}`;
          if (active) {
            setObjectUrl(`${cdnUrl}${cleanPath}`);
          }
        }
      } catch (err) {
        console.warn("Failed to load local cached image.");
        // Direct fallback
        const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
        const cleanPath = pathVal.startsWith('/') ? pathVal : `/${pathVal}`;
        if (active) {
          setObjectUrl(`${cdnUrl}${cleanPath}`);
        }
      }
    }

    loadCachedImage();

    return () => {
      active = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [srcPath]);

  if (!srcPath) return null;

  return (
    <img
      src={objectUrl}
      alt={alt || 'Clinical illustration'}
      {...props}
    />
  );
}

