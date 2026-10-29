'use client';

import React from 'react';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

export type BrandLogoVariant = 'full' | 'lockup' | 'mark';

export interface BrandLogoProps {
  /**
   * Logo visual variant:
   * - "full": Circular badge with live-text "PREMIUM" ribbon overlapping below (About, auth, footer, error).
   * - "lockup": Compact circular badge with scaled ribbon for Marketplace header and mobile drawer.
   * - "mark": Standalone circle badge (with optional light plate for dark bars) for Writer Studio and Admin shells.
   */
  variant?: BrandLogoVariant;

  /**
   * Circle badge diameter in pixels.
   * Defaults per variant:
   * - "full": 96px
   * - "lockup": 46px
   * - "mark": 36px
   */
  size?: number;

  /**
   * Next.js Image priority loading (recommended for above-the-fold header logo).
   */
  priority?: boolean;

  /**
   * When true, renders a subtle light plate / ring behind the circle badge.
   * Recommended for dark top bars (e.g. Writer Studio, Admin shells)
   * so the cream circle maintains crisp contrast against any background hue.
   */
  plate?: boolean;

  /**
   * Accessible alt text for the circle graphic.
   * Per WCAG specifications:
   * - In "full" and "lockup" variants, defaults to empty alt="" because the parent link
   *   or container has an aria-label, and the live "PREMIUM" text is decorative to screen readers.
   * - In "mark" variant, defaults to siteConfig.brandName.
   */
  alt?: string;

  /**
   * Additional wrapper class names.
   */
  className?: string;
}

/**
 * BrandLogo
 *
 * Official UNB Premium Brand Mark component.
 * Combines the master circular badge artwork (512x512 unoptimized for Retina sharpness)
 * with a live-text CSS/SVG "PREMIUM" ribbon that dynamically inherits the active site palette
 * (ivory_ink, paper_teal, cream_maroon).
 */
export function BrandLogo({
  variant = 'full',
  size: userSize,
  priority = false,
  plate = false,
  alt: userAlt,
  className = '',
}: BrandLogoProps) {
  // 1. Resolve dimensions based on variant
  const defaultSize = variant === 'full' ? 96 : variant === 'lockup' ? 46 : 36;
  const size = userSize ?? defaultSize;
  const isCompact = variant === 'lockup' || size <= 56;

  // 2. Geometry calculations for the heraldic ribbon
  // - Compact/Header (lockup): Ribbon spans wider than the circle (min 58px / ~118%)
  //   so the full uppercase text "PREMIUM" has generous breathing room and NEVER truncates.
  // - Full/Footer (full): Ribbon spans ~92% of the larger circle diameter.
  const ribbonWidth = isCompact
    ? Math.max(58, Math.round(size * 1.18))
    : Math.round(size * 0.92);

  const ribbonHeight = isCompact
    ? Math.max(14, Math.round(size * 0.28))
    : Math.max(16, Math.round(size * 0.25));

  const circleOverlap = Math.round(size * 0.16);
  const totalHeight = size + ribbonHeight - circleOverlap;

  // 3. Crisp exact pixel values for swallowtail notch and inner gold border
  const notchDepth = isCompact ? 4.5 : Math.max(5, Math.round(ribbonHeight * 0.32));
  const insetX = isCompact ? 1.5 : Math.min(2.5, Math.max(1.5, Math.round(ribbonHeight * 0.08 * 10) / 10));
  const insetY = isCompact ? 1.2 : Math.min(2, Math.max(1.2, Math.round(ribbonHeight * 0.07 * 10) / 10));

  const outerPoints = [
    `0,0`,
    `${ribbonWidth},0`,
    `${ribbonWidth - notchDepth},${ribbonHeight / 2}`,
    `${ribbonWidth},${ribbonHeight}`,
    `0,${ribbonHeight}`,
    `${notchDepth},${ribbonHeight / 2}`,
  ].join(' ');

  const innerPoints = [
    `${insetX},${insetY}`,
    `${ribbonWidth - insetX},${insetY}`,
    `${ribbonWidth - insetX - notchDepth},${ribbonHeight / 2}`,
    `${ribbonWidth - insetX},${ribbonHeight - insetY}`,
    `${insetX},${ribbonHeight - insetY}`,
    `${insetX + notchDepth},${ribbonHeight / 2}`,
  ].join(' ');

  // 4. Proportional typography scaling (header lockup uses text-[8.5px] with tracking-[0.14em])
  const fontSize = isCompact
    ? 8.5
    : Math.max(10, Math.round(ribbonHeight * 0.44 * 10) / 10);
  const letterSpacing = isCompact ? 0.14 : 0.15;

  // 5. Accessible description
  const altText = userAlt !== undefined
    ? userAlt
    : variant === 'mark'
      ? siteConfig.brandName
      : '';

  // ---------------------------------------------------------------------------
  // Variant: "mark" (Circle alone, for Writer Studio, Admin shells)
  // ---------------------------------------------------------------------------
  if (variant === 'mark') {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
        style={{ width: size, height: size }}
      >
        {plate && (
          <div
            className="absolute inset-0 rounded-full bg-surface/90 border border-border shadow-xs pointer-events-none"
            aria-hidden="true"
          />
        )}
        <div className="relative w-full h-full rounded-full overflow-hidden shadow-xs">
          <Image
            src="/brand/logo-circle-512.png"
            alt={altText}
            width={size}
            height={size}
            priority={priority}
            unoptimized
            className="w-full h-full object-contain"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Live-Text Ribbon Element
  // Swallowtail notched ends, double gold border, active palette primary fill, ivory live text.
  // Never truncated — the full word "PREMIUM" is always 100% visible.
  // ---------------------------------------------------------------------------
  const ribbonElement = (
    <div
      className="relative inline-flex items-center justify-center select-none shadow-xs transition-colors forced-colors:outline forced-colors:outline-1 forced-colors:outline-CanvasText px-2.5"
      style={{
        width: ribbonWidth,
        height: ribbonHeight,
      }}
      aria-hidden="true"
    >
      {/* Crisp Notched Ribbon Background Plate with Double Border */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-xs"
        viewBox={`0 0 ${ribbonWidth} ${ribbonHeight}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Notched Plate (Active Palette Primary Fill + Outer Hairline) */}
        <polygon
          points={outerPoints}
          fill="var(--brand-ribbon-bg, var(--color-primary))"
          stroke="var(--brand-ribbon-border-outer, var(--color-accent-strong))"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        {/* Inner Accent Border (Active Palette Gold Accent) */}
        <polygon
          points={innerPoints}
          fill="none"
          stroke="var(--brand-ribbon-border, var(--color-accent))"
          strokeWidth="1"
          strokeOpacity="0.9"
          strokeLinejoin="round"
        />
      </svg>

      {/* Live Text: 100% visible, never truncated, generous breathing room */}
      <span
        className="relative z-10 font-serif uppercase font-semibold text-[var(--brand-ribbon-text,#FBF8F2)] leading-none text-center whitespace-nowrap select-none"
        style={{
          fontSize: `${fontSize}px`,
          letterSpacing: `${letterSpacing}em`,
          paddingLeft: `${letterSpacing}em`, // offsets trailing letter-spacing to ensure optical center
        }}
      >
        {siteConfig.brandSuffix || 'Premium'}
      </span>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Variants: "full" and "lockup" (Stacked: circle badge + overlapping ribbon)
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`relative inline-flex flex-col items-center justify-start shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
      style={{ width: Math.max(size, ribbonWidth), height: totalHeight }}
    >
      {/* Circle Badge (High-DPI 512px master, circular mask & optional plate) */}
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
          src="/brand/logo-circle-512.png"
          alt={altText}
          width={size}
          height={size}
          priority={priority}
          unoptimized
          className="w-full h-full object-contain transition-transform group-hover:scale-105"
          style={{ imageRendering: '-webkit-optimize-contrast' }}
        />
      </div>

      {/* Live-Text Ribbon overlapping bottom of circle by ~16% */}
      <div
        className="absolute z-10 left-1/2 -translate-x-1/2"
        style={{ top: `${size - circleOverlap}px` }}
      >
        {ribbonElement}
      </div>
    </div>
  );
}

export default BrandLogo;
