'use client';

import React from 'react';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

export type BrandLogoVariant = 'full' | 'lockup' | 'mark';

export interface BrandLogoProps {
  /**
   * Logo visual variant:
   * - "full": Circle badge with live-text "PREMIUM" ribbon overlapping below (About, auth, footer, error).
   * - "lockup": Circle with scaled-down ribbon (and optional adjacent wordmark) for header & drawer.
   * - "mark": Circle alone (with optional light plate for dark bars) for Studio, Admin, and compact badges.
   */
  variant?: BrandLogoVariant;

  /**
   * Circle badge diameter in pixels.
   * If omitted, sensible defaults per variant are applied:
   * - "full": 96px
   * - "lockup": 46px (38px on mobile)
   * - "mark": 36px
   */
  size?: number;

  /**
   * Next.js Image priority loading (recommended for above-the-fold header logo).
   */
  priority?: boolean;

  /**
   * In lockup variant: whether to render the adjacent English & Urdu brand wordmark.
   * Defaults to false (caller can render custom layout or enable this for a complete lockup).
   */
  showWordmark?: boolean;

  /**
   * When true, renders a subtle light plate / ring behind the circle badge.
   * Highly recommended for dark top bars (e.g. Writer Studio, Admin shells, dark headers)
   * so the cream circle maintains crisp contrast against any background hue.
   */
  plate?: boolean;

  /**
   * Accessible alt text for the circle graphic.
   * Per WCAG specifications:
   * - In "full" and "lockup" variants, defaults to empty alt="" because the live "PREMIUM" text
   *   and adjacent text already name the brand, preventing repetitive screen-reader announcements.
   * - In "mark" variant without adjacent text, defaults to siteConfig.brandName.
   */
  alt?: string;

  /**
   * Additional wrapper class names.
   */
  className?: string;
}

/**
 * Helper to select the optimal pre-generated derivative circle asset.
 * Guarantees crisp high-DPI rendering with minimal bandwidth footprint.
 */
function getCircleSrc(size: number): string {
  if (size <= 64) return '/brand/logo-circle-64.png';
  if (size <= 96) return '/brand/logo-circle-96.png';
  if (size <= 128) return '/brand/logo-circle-128.png';
  if (size <= 192) return '/brand/logo-circle-192.png';
  if (size <= 256) return '/brand/logo-circle-256.png';
  return '/brand/logo-circle-512.png';
}

/**
 * BrandLogo
 *
 * Official UNB Premium Brand Mark component.
 * Combines the original circular badge artwork with a live-text CSS/SVG "PREMIUM" ribbon
 * that dynamically inherits the active site palette (ivory_ink, paper_teal, cream_maroon).
 */
export function BrandLogo({
  variant = 'full',
  size: userSize,
  priority = false,
  showWordmark = false,
  plate = false,
  alt: userAlt,
  className = '',
}: BrandLogoProps) {
  // 1. Resolve dimensions based on variant
  const defaultSize = variant === 'full' ? 96 : variant === 'lockup' ? 46 : 36;
  const size = userSize ?? defaultSize;

  // 2. Geometry calculations for the overlapping ribbon
  // - Ribbon width: ~76% of circle diameter
  // - Ribbon height: ~28% of circle diameter
  // - Overlap: ribbon overlaps bottom 15% of circle
  const ribbonWidth = Math.round(size * 0.78);
  const ribbonHeight = Math.max(16, Math.round(size * 0.28));
  const circleOverlap = Math.round(size * 0.15);
  const totalHeight = size + ribbonHeight - circleOverlap;

  // 3. Resolve accessible description
  const altText = userAlt !== undefined
    ? userAlt
    : variant === 'mark'
      ? siteConfig.brandName
      : ''; // Decorative when live text / wordmark is present

  const circleSrc = getCircleSrc(size);

  // ---------------------------------------------------------------------------
  // Variant: "mark" (Circle alone, for Studio, Admin, compact headers)
  // ---------------------------------------------------------------------------
  if (variant === 'mark') {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* Optional light plate for high contrast on dark or tinted shell bars */}
        {plate && (
          <div
            className="absolute inset-0 rounded-full bg-surface/90 border border-border shadow-xs pointer-events-none"
            aria-hidden="true"
          />
        )}
        <div className="relative w-full h-full rounded-full overflow-hidden shadow-xs">
          <Image
            src={circleSrc}
            alt={altText}
            width={size}
            height={size}
            priority={priority}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Live-Text Ribbon Element
  // Notched dovetail ends, double gold border, active palette fill, ivory live text.
  // ---------------------------------------------------------------------------
  const ribbonElement = (
    <div
      className={`relative inline-flex items-center justify-center select-none shadow-xs transition-colors forced-colors:outline forced-colors:outline-1 forced-colors:outline-CanvasText ${
        variant === 'lockup' ? 'max-[359px]:hidden' : ''
      }`}
      style={{
        width: ribbonWidth,
        height: ribbonHeight,
      }}
      aria-hidden="true"
    >
      {/* Crisp Notched Ribbon Background Plate with Double Border */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Notched Plate (Active Palette Primary Fill + Outer Hairline) */}
        <polygon
          points="0,0 100,0 92,14 100,28 0,28 8,14"
          fill="var(--brand-ribbon-bg, var(--color-primary))"
          stroke="var(--brand-ribbon-border-outer, var(--color-accent-strong))"
          strokeWidth="0.75"
        />
        {/* Inner Accent Border (Active Palette Gold Accent) */}
        <polygon
          points="3,2.5 97,2.5 90,14 97,25.5 3,25.5 10,14"
          fill="none"
          stroke="var(--brand-ribbon-border, var(--color-accent))"
          strokeWidth="1"
          strokeOpacity="0.9"
        />
      </svg>

      {/* Live Text: Editable from siteConfig.brandSuffix ("Premium") */}
      <span
        className="relative z-10 font-serif uppercase tracking-[0.22em] font-semibold text-[var(--brand-ribbon-text,#FBF8F2)] leading-none text-center pl-[0.22em]"
        style={{
          fontSize: `${Math.max(8, Math.round(ribbonHeight * 0.44))}px`,
        }}
      >
        {siteConfig.brandSuffix || 'Premium'}
      </span>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Variant: "full" (Stacked: circle on top, centered ribbon overlapping below)
  // ---------------------------------------------------------------------------
  if (variant === 'full') {
    return (
      <div
        className={`relative inline-flex flex-col items-center justify-start shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: size, height: totalHeight }}
      >
        {/* Circle Badge (with circular mask & optional plate) */}
        <div
          className="relative rounded-full overflow-hidden shadow-xs shrink-0"
          style={{ width: size, height: size }}
        >
          {plate && (
            <div
              className="absolute inset-0 rounded-full bg-surface/90 border border-border shadow-xs pointer-events-none"
              aria-hidden="true"
            />
          )}
          <Image
            src={circleSrc}
            alt={altText}
            width={size}
            height={size}
            priority={priority}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Live-Text Ribbon overlapping bottom of circle by ~15% */}
        <div
          className="absolute z-10 left-1/2 -translate-x-1/2"
          style={{ top: `${size - circleOverlap}px` }}
        >
          {ribbonElement}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "lockup" (Compact for header & drawer)
  // Responsive: on widths < 360px ribbon is hidden automatically.
  // ---------------------------------------------------------------------------
  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 group shrink-0 print:grayscale print:contrast-125 ${className}`}>
      {/* Stacked Badge + Overlapping Ribbon */}
      <div
        className="relative inline-flex flex-col items-center justify-start shrink-0"
        style={{ width: size, height: totalHeight }}
      >
        <div
          className="relative rounded-full overflow-hidden shadow-xs shrink-0"
          style={{ width: size, height: size }}
        >
          {plate && (
            <div
              className="absolute inset-0 rounded-full bg-surface/90 border border-border shadow-xs pointer-events-none"
              aria-hidden="true"
            />
          )}
          <Image
            src={circleSrc}
            alt={altText}
            width={size}
            height={size}
            priority={priority}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
          />
        </div>

        <div
          className="absolute z-10 left-1/2 -translate-x-1/2"
          style={{ top: `${size - circleOverlap}px` }}
        >
          {ribbonElement}
        </div>
      </div>

      {/* Optional Wordmark adjacent to badge */}
      {showWordmark && (
        <div className="flex flex-col">
          <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-primary leading-none">
            {siteConfig.brandPrefix || 'Urdu Novel Bank'}
          </span>
          <span
            dir="rtl"
            lang="ur"
            className="font-urdu text-[10px] sm:text-xs text-accent-strong font-medium leading-none mt-0.5"
          >
            {siteConfig.brandNameUrdu}
          </span>
        </div>
      )}
    </div>
  );
}

export default BrandLogo;

