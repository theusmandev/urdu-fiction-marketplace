'use client';

import React from 'react';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

export type BrandLogoVariant = 'full' | 'lockup' | 'mark';

export interface BrandLogoProps {
  /**
   * Logo visual variant:
   * - "full": Circular badge with live-text "PREMIUM" ribbon overlapping below (About, auth, footer, error).
   * - "lockup": Compact circular badge with scaled-down ribbon for Marketplace header and mobile drawer.
   * - "mark": Standalone circle badge (with optional light plate for dark bars) for Writer Studio and Admin shells.
   */
  variant?: BrandLogoVariant;

  /**
   * Circle badge diameter in pixels.
   * Defaults per variant:
   * - "full": 96px
   * - "lockup": 48px
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
  plate = false,
  alt: userAlt,
  className = '',
}: BrandLogoProps) {
  // 1. Resolve dimensions based on variant
  const defaultSize = variant === 'full' ? 96 : variant === 'lockup' ? 48 : 36;
  const size = userSize ?? defaultSize;

  // 2. Geometry calculations for the heraldic ribbon
  // - Ribbon width: ~92% of circle diameter (spans slightly wider than the circle's bottom curve)
  // - Ribbon height: ~26% of circle diameter
  // - Overlap: ribbon overlaps bottom 16% of circle, sitting snugly over the bottom rim
  const ribbonWidth = Math.round(size * 0.92);
  const ribbonHeight = Math.max(13, Math.round(size * 0.26));
  const circleOverlap = Math.round(size * 0.16);
  const totalHeight = size + ribbonHeight - circleOverlap;

  // 3. Notch and inner border geometry (crisp exact pixel values)
  const notchDepth = Math.max(3.5, Math.round(ribbonHeight * 0.32));
  const insetX = Math.min(2.5, Math.max(1.2, Math.round(ribbonHeight * 0.08 * 10) / 10));
  const insetY = Math.min(2, Math.max(1, Math.round(ribbonHeight * 0.07 * 10) / 10));
  const usableWidth = Math.max(20, ribbonWidth - (notchDepth + insetX) * 2);

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

  // 4. Proportional typography scaling
  const fontSize = Math.max(7, Math.round(ribbonHeight * 0.44 * 10) / 10);
  const letterSpacing = ribbonHeight >= 16 ? 0.15 : 0.11;

  // 5. Accessible description
  const altText = userAlt !== undefined
    ? userAlt
    : variant === 'mark'
      ? siteConfig.brandName
      : '';

  const circleSrc = getCircleSrc(size);

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
  // Notched swallowtail ends, double gold border, active palette primary fill, ivory live text.
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

      {/* Live Text: Editable from siteConfig.brandSuffix ("Premium") */}
      <span
        className="relative z-10 font-serif uppercase font-semibold text-[var(--brand-ribbon-text,#FBF8F2)] leading-none text-center whitespace-nowrap overflow-hidden text-ellipsis px-1 select-none"
        style={{
          fontSize: `${fontSize}px`,
          letterSpacing: `${letterSpacing}em`,
          paddingLeft: `${letterSpacing}em`, // offsets trailing letter-spacing to ensure optical center
          maxWidth: `${usableWidth}px`,
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
          className="w-full h-full object-contain transition-transform group-hover:scale-105"
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
