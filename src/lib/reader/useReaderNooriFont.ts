'use client';

import { useState, useEffect } from 'react';
import type { ReaderUrduFont } from '../settings/reader-font.ts';
import {
  shouldSkipNooriDownload,
  type NetworkInformationLike,
} from '../settings/reader-font-constants.ts';

export { shouldSkipNooriDownload, type NetworkInformationLike };

interface NavigatorWithConnection {
  connection?: NetworkInformationLike;
}

/**
 * Checks whether Jameel Noori Nastaleeq is registered and successfully loaded in document.fonts.
 *
 * NOTE: We strictly inspect document.fonts entries for family and status === 'loaded'.
 * We MUST NOT call document.fonts.check() for fonts not yet registered, because per the
 * W3C CSS Font Loading Level 3 specification, document.fonts.check() returns TRUE when
 * a font does not exist in document.fonts (since there are zero pending downloads for it).
 */
export function isNooriFontLoaded(): boolean {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return false;
  }
  try {
    for (const font of document.fonts) {
      const family = font.family.replace(/['"]/g, '').trim();
      if (family === 'JameelNooriNastaleeq' && font.status === 'loaded') {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

// In-flight singleton load promise to prevent duplicate FontFace downloads across
// rapid component remounts or chapter transitions.
let inFlightNooriPromise: Promise<boolean> | null = null;

export function _resetInFlightNooriPromiseForTesting(): void {
  inFlightNooriPromise = null;
}

/**
 * useReaderNooriFont
 *
 * Implements zero-reflow, zero-metrics-mismatch progressive loading for Jameel Noori Nastaleeq:
 * 1. When setting is 'gulzar' or nooriFontUrl is null: 0 bytes downloaded, instantly returns 'gulzar'.
 * 2. When user has Data Saver enabled or connection is slow-2g/2g/3g: skips download completely and stays on Gulzar.
 * 3. When setting is 'noori' with valid nooriFontUrl:
 *    - Checks if font is already cached and loaded in document.fonts.
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
    if (typeof window !== 'undefined') {
      if (typeof navigator !== 'undefined') {
        const nav = navigator as unknown as NavigatorWithConnection;
        if (shouldSkipNooriDownload(nav.connection)) {
          return false;
        }
      }
      return isNooriFontLoaded();
    }
    return false;
  });

  useEffect(() => {
    if (effectiveFont !== 'noori' || !nooriFontUrl) {
      return;
    }

    if (typeof window === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined') {
      return;
    }

    // Skip heavy font download on Data-Saver mode or slow 2G/3G connections
    if (typeof navigator !== 'undefined') {
      const nav = navigator as unknown as NavigatorWithConnection;
      if (shouldSkipNooriDownload(nav.connection)) {
        return;
      }
    }

    // If already loaded in browser font set, activate immediately and return
    if (isNooriFontLoaded()) {
      setLoadedNoori(true);
      return;
    }

    let mounted = true;
    let windowExpired = false;

    // Race window: 150ms for local disk cache hits
    const cacheWindowTimer = setTimeout(() => {
      windowExpired = true;
    }, 150);

    const executeLoad = async () => {
      if (!inFlightNooriPromise) {
        inFlightNooriPromise = (async () => {
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

            const loadedFace = await face.load();
            document.fonts.add(loadedFace);
            return true;
          } catch (err) {
            console.warn('[useReaderNooriFont] Font download failed, remaining on Gulzar:', err);
            return false;
          }
        })();
      }

      const success = await inFlightNooriPromise;
      clearTimeout(cacheWindowTimer);

      if (!success) {
        inFlightNooriPromise = null;
        return;
      }

      if (!mounted) return;

      // Only switch font if it resolved within the 150ms initial cache window!
      // If it took longer (first-time 3G/4G download), do NOT swap mid-read!
      // Keep activeFont = 'gulzar' for the duration of this chapter.
      if (!windowExpired) {
        setLoadedNoori(true);
      }
    };

    executeLoad();

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
