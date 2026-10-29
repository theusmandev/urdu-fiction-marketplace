'use client';

import React from 'react';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

export type BrandLogoVariant = 'full' | 'lockup' | 'mark';

export interface BrandLogoProps {
  /**
   * Logo visual variant:
   * - "full": Classic vertical crest — circular badge with live-text heraldic ribbon tucked underneath.
   *   Used on About, auth pages, footer, loading screens, 404/error pages.
   * - "lockup": Horizontal side-by-side — clean circle on the left + luxury pill badge on the right.
   *   Used in the Marketplace sticky header and mobile drawer. No bottom ribbon.
   * - "mark": Standalone circle badge with circular mask and optional contrast plate.
   *   Used in Writer Studio and Admin shell top bars.
   */
  variant?: BrandLogoVariant;

  /**
   * Circle badge diameter in pixels.
   * Defaults per variant:
   * - "full": 96px
   * - "lockup": 48px (desktop) / caller may pass 40px for mobile
   * - "mark": 36px
   */
  size?: number;

  /**
   * Next.js Image priority loading (recommended for above-the-fold header logo).
   */
  priority?: boolean;

  /**
   * When true, renders a subtle light plate / ring behind the circle badge.
   * Recommended for dark top bars (Writer Studio, Admin shells) so the cream
   * circle maintains crisp contrast against any background hue.
   */
  plate?: boolean;

  /**
   * Accessible alt text for the circle graphic.
   * - "full" / "lockup": defaults to "" because the parent link has an aria-label.
   * - "mark": defaults to siteConfig.brandName.
   */
  alt?: string;

  /** Additional wrapper class names. */
  className?: string;
}

/**
 * Resolve the best-sized pre-generated derivative for the requested render size.
 * We use the 256px derivative for all renders up to 200px (2x Retina coverage)
 * and the 512px derivative for larger renders, with `unoptimized` to prevent
 * Next.js from running its own lossy compression on already-sharp PNGs.
 */
function getCircleSrc(size: number): string {
  if (size <= 96) return '/brand/logo-circle-256.png';  // 2–4× Retina coverage for small circles
  if (size <= 200) return '/brand/logo-circle-256.png'; // still enough at 256 for up to 200px display
  return '/brand/logo-circle-512.png';                  // large full/auth variants
}

/**
 * BrandLogo
 *
 * Official UNB Premium brand mark component with three distinct layouts:
 *
 * • "lockup"  → Horizontal side-by-side (header, drawer):
 *               [●Circle]  [★ PREMIUM ★]
 *
 * • "full"    → Vertical crest (footer, auth, about):
 *               [  ●Circle  ]
 *               [──PREMIUM──]
 *
 * • "mark"    → Circle alone (Studio, Admin top bars).
 *
 * All colour values come from CSS palette tokens so the component
 * inherits the active site palette (ivory_ink / paper_teal / cream_maroon)
 * automatically with zero inline hex values.
 */
export function BrandLogo({
  variant = 'full',
  size: userSize,
  priority = false,
  plate = false,
  alt: userAlt,
  className = '',
}: BrandLogoProps) {
  const defaultSize = variant === 'full' ? 96 : variant === 'lockup' ? 48 : 36;
  const size = userSize ?? defaultSize;
  const circleSrc = getCircleSrc(size);
  const altText = userAlt !== undefined
    ? userAlt
    : variant === 'mark' ? siteConfig.brandName : '';

  // ---------------------------------------------------------------------------
  // Shared: Circle badge with optional contrast plate
  // ---------------------------------------------------------------------------
  const circleEl = (
    <div
      className="relative rounded-full overflow-hidden shrink-0"
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
        unoptimized
        className="w-full h-full object-contain"
      />
    </div>
  );

  // ---------------------------------------------------------------------------
  // Variant: "mark" — standalone circle for Studio / Admin shells
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
            unoptimized
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "lockup" — Horizontal side-by-side for header & mobile drawer
  //
  // Layout:  [Circle badge]  [✦ PREMIUM ✦]
  //
  // The pill badge uses the palette's primary fill, a gold accent border,
  // and ivory serif text. No bottom ribbon is attached to the circle.
  // ---------------------------------------------------------------------------
  if (variant === 'lockup') {
    // Pill badge proportions scale with circle size
    const pillH = Math.max(20, Math.round(size * 0.40));
    const pillFontSize = Math.max(8, Math.round(pillH * 0.40));
    const pillPx = Math.max(10, Math.round(pillH * 0.55));
    const pillRadius = Math.round(pillH / 2);

    return (
      <div
        className={`inline-flex items-center gap-2 shrink-0 select-none print:grayscale print:contrast-125 group ${className}`}
        style={{ height: size }}
      >
        {/* Left: Clean circular emblem (no ribbon) */}
        <div
          className="relative rounded-full overflow-hidden shrink-0 shadow-xs"
          style={{ width: size, height: size }}
        >
          {plate && (
            <div
              className="absolute inset-0 rounded-full bg-surface/90 border border-border pointer-events-none"
              aria-hidden="true"
            />
          )}
          <Image
            src={circleSrc}
            alt={altText}
            width={size}
            height={size}
            priority={priority}
            unoptimized
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
          />
        </div>

        {/* Right: Luxury horizontal pill badge */}
        <div
          className="relative inline-flex items-center justify-center shrink-0 select-none max-[359px]:hidden"
          style={{ height: pillH, paddingLeft: pillPx, paddingRight: pillPx, borderRadius: pillRadius }}
          aria-hidden="true"
        >
          {/* Pill fill + border rendered as a single inline SVG for perfect alignment */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 100 100`}
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Fill */}
            <rect
              x="0.5" y="0.5" width="99" height="99"
              rx="50"
              fill="var(--brand-ribbon-bg, var(--color-primary))"
            />
            {/* Outer hairline */}
            <rect
              x="0.5" y="0.5" width="99" height="99"
              rx="50"
              fill="none"
              stroke="var(--brand-ribbon-border-outer, var(--color-accent-strong))"
              strokeWidth="1.5"
            />
            {/* Inner gold accent ring */}
            <rect
              x="5" y="5" width="90" height="90"
              rx="45"
              fill="none"
              stroke="var(--brand-ribbon-border, var(--color-accent))"
              strokeWidth="1.5"
              strokeOpacity="0.85"
            />
          </svg>

          {/* Pill text */}
          <span
            className="relative z-10 font-serif uppercase font-semibold text-[var(--brand-ribbon-text,#FBF8F2)] whitespace-nowrap leading-none select-none"
            style={{
              fontSize: `${pillFontSize}px`,
              letterSpacing: '0.18em',
              paddingLeft: '0.18em',
            }}
          >
            {/* Ornamental stars flanking the brand suffix */}
            ✦ {siteConfig.brandSuffix || 'Premium'} ✦
          </span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant: "full" — Classic vertical crest for footer, auth, about pages
  //
  // Geometry: circle on top, swallowtail heraldic ribbon overlapping the bottom rim.
  // ---------------------------------------------------------------------------
  const ribbonWidth = Math.round(size * 0.92);
  const ribbonHeight = Math.max(16, Math.round(size * 0.25));
  const circleOverlap = Math.round(size * 0.16);
  const totalHeight = size + ribbonHeight - circleOverlap;

  const notchDepth = Math.max(5, Math.round(ribbonHeight * 0.32));
  const insetX = Math.min(2.5, Math.max(1.5, Math.round(ribbonHeight * 0.08 * 10) / 10));
  const insetY = Math.min(2, Math.max(1.2, Math.round(ribbonHeight * 0.07 * 10) / 10));
  const fullFontSize = Math.max(10, Math.round(ribbonHeight * 0.44 * 10) / 10);

  const outerPoints = [
    `0,0`, `${ribbonWidth},0`,
    `${ribbonWidth - notchDepth},${ribbonHeight / 2}`,
    `${ribbonWidth},${ribbonHeight}`,
    `0,${ribbonHeight}`,
    `${notchDepth},${ribbonHeight / 2}`,
  ].join(' ');

  const innerPoints = [
    `${insetX},${insetY}`, `${ribbonWidth - insetX},${insetY}`,
    `${ribbonWidth - insetX - notchDepth},${ribbonHeight / 2}`,
    `${ribbonWidth - insetX},${ribbonHeight - insetY}`,
    `${insetX},${ribbonHeight - insetY}`,
    `${insetX + notchDepth},${ribbonHeight / 2}`,
  ].join(' ');

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-start shrink-0 select-none print:grayscale print:contrast-125 ${className}`}
      style={{ width: Math.max(size, ribbonWidth), height: totalHeight }}
    >
      {/* Circle Badge */}
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
          unoptimized
          className="w-full h-full object-contain transition-transform group-hover:scale-105"
        />
      </div>

      {/* Swallowtail heraldic ribbon, overlapping bottom of circle by ~16% */}
      <div
        className="absolute z-10 left-1/2 -translate-x-1/2"
        style={{ top: `${size - circleOverlap}px` }}
        aria-hidden="true"
      >
        <div
          className="relative inline-flex items-center justify-center select-none shadow-xs transition-colors forced-colors:outline forced-colors:outline-1 forced-colors:outline-CanvasText"
          style={{ width: ribbonWidth, height: ribbonHeight }}
        >
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-xs"
            viewBox={`0 0 ${ribbonWidth} ${ribbonHeight}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon
              points={outerPoints}
              fill="var(--brand-ribbon-bg, var(--color-primary))"
              stroke="var(--brand-ribbon-border-outer, var(--color-accent-strong))"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            <polygon
              points={innerPoints}
              fill="none"
              stroke="var(--brand-ribbon-border, var(--color-accent))"
              strokeWidth="1"
              strokeOpacity="0.9"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="relative z-10 font-serif uppercase font-semibold text-[var(--brand-ribbon-text,#FBF8F2)] leading-none text-center whitespace-nowrap select-none"
            style={{
              fontSize: `${fullFontSize}px`,
              letterSpacing: '0.15em',
              paddingLeft: '0.15em',
            }}
          >
            {siteConfig.brandSuffix || 'Premium'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BrandLogo;
