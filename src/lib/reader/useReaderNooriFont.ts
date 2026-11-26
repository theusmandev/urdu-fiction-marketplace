'use client';

import { useState, useEffect } from 'react';
import type { ReaderUrduFont } from '@/lib/settings/reader-font';

/**
 * useReaderNooriFont
 *
 * Implements zero-reflow, zero-metrics-mismatch progressive loading for Jameel Noori Nastaleeq:
 * 1. When setting is 'gulzar' or nooriFontUrl is null: 0 bytes downloaded, instantly returns 'gulzar'.
 * 2. When setting is 'noori' with valid nooriFontUrl:
 *    - Checks if font is already cached in document.fonts.
 *    - If already available or loads within 150ms (cached disk hit): immediately activates 'noori'.
 *    - If on slow 3G/4G (takes > 150ms): locks 'gulzar' for the ENTIRE current chapter to prevent mid-read reflow.
 *      Loads in the background so next chapter / page load hits cache instantly.
 *    - If load fails (CORS, network error, 404): gracefully stays on 'gulzar'.
 */
export function useReaderNooriFont(
  effectiveFont: ReaderUrduFont = 'gulzar',
  nooriFontUrl: string | null = null
): ReaderUrduFont {
  const [loadedNoori, setLoadedNoori] = useState<boolean>(() => {
    if (effectiveFont !== 'noori' || !nooriFontUrl) {
      return false;
    }
    if (typeof window !== 'undefined' && 'fonts' in document) {
      try {
        return document.fonts.check('16px JameelNooriNastaleeq');
      } catch {
        return false;
      }
    }
    return false;
  });

  useEffect(() => {
    if (effectiveFont !== 'noori' || !nooriFontUrl) {
      return;
    }

    if (typeof window === 'undefined' || !('fonts' in document)) {
      return;
    }

    // Check if already loaded in browser font set
    try {
      if (document.fonts.check('16px JameelNooriNastaleeq')) {
        return;
      }
    } catch {
      // Continue to loading attempt
    }

    let mounted = true;
    let windowExpired = false;

    // Race window: 150ms for local disk cache hits
    const cacheWindowTimer = setTimeout(() => {
      windowExpired = true;
    }, 150);

    try {
      const face = new FontFace(
        'JameelNooriNastaleeq',
        `url("${nooriFontUrl}") format("woff2")`,
        {
          style: 'normal',
          weight: '400',
          display: 'swap',
        }
      );

      face
        .load()
        .then((loadedFace) => {
          clearTimeout(cacheWindowTimer);
          document.fonts.add(loadedFace);

          if (!mounted) return;

          // Only switch font if it resolved within the 150ms initial cache window!
          // If it took longer (first-time 3G/4G download), do NOT swap mid-read!
          // Keep activeFont = 'gulzar' for the duration of this chapter.
          if (!windowExpired) {
            setLoadedNoori(true);
          }
        })
        .catch((err) => {
          clearTimeout(cacheWindowTimer);
          console.warn('[useReaderNooriFont] Font download failed, remaining on Gulzar:', err);
        });
    } catch (err) {
      clearTimeout(cacheWindowTimer);
      console.warn('[useReaderNooriFont] FontFace creation failed:', err);
    }

    return () => {
      mounted = false;
      clearTimeout(cacheWindowTimer);
    };
  }, [effectiveFont, nooriFontUrl]);

  if (effectiveFont !== 'noori' || !nooriFontUrl) {
    return 'gulzar';
  }

  return loadedNoori ? 'noori' : 'gulzar';
}
