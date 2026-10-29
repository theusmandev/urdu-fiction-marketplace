'use client';

import React from 'react';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

export type BrandLogoVariant = 'full' | 'roundel' | 'lockup' | 'mark' | 'wordmark' | 'tag';

export interface BrandLogoProps {
  /**
   * Logo visual variant:
   * - "full": Complete vector logo with roundel and ribbon (footer, auth, about, error/404).
   * - "roundel": Circular roundel alone without ribbon (quill, book, calligraphy, swoosh, English text).
   * - "lockup": Header lockup composed of calligraphy wordmark + flat tag.
   * - "mark": Quill and book inside circle ring (favicon, tiny avatars, studio/admin top bars).
   * - "wordmark": Urdu calligraphy with ink swoosh underline.
   * - "tag": Flat "PREMIUM" ribbon tag (18-22px height).
   */
  variant?: BrandLogoVariant;

  /**
   * Primary dimension in pixels (width or diameter depending on variant).
   * Defaults:
   * - "full": 96px width (103px height)
   * - "roundel": 96px diameter
   * - "lockup": 95px-115px responsive width (composed typography lockup)
   * - "mark": 36px diameter
   * - "wordmark": 40px height (~105px width)
   * - "tag": 20px height (~145px width)
   */
  size?: number;

  /**
   * Explicit width override in pixels.
   */
  width?: number;

  /**
   * Explicit height override in pixels.
   */
  height?: number;

  /**
   * Above-the-fold priority loading (recommended for header lockup).
   */
  priority?: boolean;

  /**
   * Subtle light circular plate/ring behind roundel/mark for high contrast on dark shells.
   */
  plate?: boolean;

  /**
   * Accessible alt text for screen readers.
   * Defaults to siteConfig.brandName for standalone views, or empty if decorative/nested inside an aria-labeled link.
   */
  alt?: string;

  /**
   * Optional additional CSS classes.
   */
  className?: string;
}

/**
 * BrandLogo
 *
 * Official UNB Premium Vector Brand Mark component.
 * Sourced directly from public/brand vector SVGs:
 * - logo-full.svg (viewBox 0 0 1250 1345)
 * - logo-roundel.svg (viewBox 25 25 1200 1200)
 * - logo-mark.svg (viewBox 25 25 1200 1200)
 * - logo-wordmark.svg (viewBox 150 632 950 362)
 * - tag-premium.svg (viewBox 95 1172 1060 146)
 */
export function BrandLogo({
  variant = 'full',
  size: userSize,
  width: userWidth,
  height: userHeight,
  priority = false,
  plate = false,
  alt: userAlt,
  className = '',
}: BrandLogoProps) {
  // ---------------------------------------------------------------------------
  // Variant: "mark" (quill + book inside circle ring, with optional plate)
  // ---------------------------------------------------------------------------
  if (variant === 'mark') {
    const s = userWidth ?? userSize ?? 36;
    const resolvedAlt = userAlt !== undefined ? userAlt : siteConfig.brandName;

    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: s, height: s }}
      >
        {plate && (
          <div
            className="absolute inset-0 rounded-full bg-surface/90 border border-border shadow-xs pointer-events-none"
            aria-hidden="true"
          />
        )}
        <Image
          src="/brand/logo-mark.svg"
          alt={resolvedAlt}
          width={s}
          height={s}
          priority={priority}
          unoptimized
          loading={priority ? 'eager' : 'lazy'}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "roundel" (complete circle without ribbon)
  // ---------------------------------------------------------------------------
  if (variant === 'roundel') {
    const s = userWidth ?? userSize ?? 96;
    const resolvedAlt = userAlt !== undefined ? userAlt : siteConfig.brandName;

    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: s, height: s }}
      >
        {plate && (
          <div
            className="absolute inset-0 rounded-full bg-surface/90 border border-border shadow-xs pointer-events-none"
            aria-hidden="true"
          />
        )}
        <Image
          src="/brand/logo-roundel.svg"
          alt={resolvedAlt}
          width={s}
          height={s}
          priority={priority}
          unoptimized
          loading={priority ? 'eager' : 'lazy'}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "wordmark" (Urdu calligraphy + ink swoosh)
  // ---------------------------------------------------------------------------
  if (variant === 'wordmark') {
    const h = userHeight ?? userSize ?? 40;
    const w = userWidth ?? Math.round(h * (950 / 362));
    const resolvedAlt = userAlt !== undefined ? userAlt : siteConfig.brandName;

    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: w, height: h }}
      >
        <Image
          src="/brand/logo-wordmark.svg"
          alt={resolvedAlt}
          width={w}
          height={h}
          priority={priority}
          unoptimized
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "tag" (flat ribbon "PREMIUM")
  // ---------------------------------------------------------------------------
  if (variant === 'tag') {
    const h = userHeight ?? userSize ?? 20;
    const w = userWidth ?? Math.round(h * (1060 / 146));
    const resolvedAlt = userAlt !== undefined ? userAlt : 'Premium';

    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: w, height: h }}
      >
        <Image
          src="/brand/tag-premium.svg"
          alt={resolvedAlt}
          width={w}
          height={h}
          priority={priority}
          unoptimized
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "lockup" (Marketplace Header & Drawer: Wordmark + Tag only)
  // Clean typography stack: Urdu Calligraphy on top, Flat Premium Tag on bottom.
  // Visible across all screen sizes (no mark, no max-[359px]:hidden).
  // ---------------------------------------------------------------------------
  if (variant === 'lockup') {
    const explicitWidth = userWidth ?? (userSize && userSize >= 70 ? userSize : undefined);
    const resolvedAlt = userAlt !== undefined ? userAlt : siteConfig.brandName;

    return (
      <div
        className={`relative inline-flex flex-col items-center justify-center shrink-0 select-none outline-none focus:outline-none print:grayscale print:contrast-125 w-[95px] sm:w-[115px] gap-0.5 sm:gap-1 ${className}`}
        style={explicitWidth ? { width: explicitWidth } : undefined}
      >
        {/* Top: Urdu Calligraphy Wordmark (950 x 362) - proportionally frames inside tag */}
        <div className="w-[89.6%] flex items-center justify-center">
          <Image
            src="/brand/logo-wordmark.svg"
            alt={resolvedAlt}
            width={950}
            height={362}
            priority={priority}
            unoptimized
            loading={priority ? 'eager' : 'lazy'}
            className="w-full h-auto object-contain transition-opacity group-hover:opacity-90"
          />
        </div>

        {/* Bottom: Flat Premium Tag (1060 x 146) */}
        <div className="w-full flex items-center justify-center">
          <Image
            src="/brand/tag-premium.svg"
            alt=""
            width={1060}
            height={146}
            priority={priority}
            unoptimized
            loading={priority ? 'eager' : 'lazy'}
            className="w-full h-auto object-contain"
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "full" (Complete Roundel + Ribbon) — Default
  // ---------------------------------------------------------------------------
  const w = userWidth ?? userSize ?? 96;
  const h = userHeight ?? Math.round(w * (1345 / 1250));
  const resolvedAlt = userAlt !== undefined ? userAlt : siteConfig.brandName;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
      style={{ width: w, height: h }}
    >
      <Image
        src="/brand/logo-full.svg"
        alt={resolvedAlt}
        width={w}
        height={h}
        priority={priority}
        unoptimized
        loading={priority ? 'eager' : 'lazy'}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export default BrandLogo;
