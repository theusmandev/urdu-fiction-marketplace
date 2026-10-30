'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { BrandLogo } from '@/components/brand/BrandLogo';

const SIZES = [16, 24, 32, 44, 64, 96, 140, 220] as const;

const PALETTES = [
  { id: 'ivory_ink', name: 'Palette A: Ivory & Ink (Default)' },
  { id: 'paper_teal', name: 'Palette B: Paper & Teal' },
  { id: 'cream_maroon', name: 'Palette C: Cream & Maroon' },
] as const;

const BACKGROUND_SWATCHES = [
  { id: 'white', label: 'White', color: '#FFFFFF', isDark: false },
  { id: 'ivory', label: 'Ivory (Site BG)', color: '#FBF8F2', isDark: false },
  { id: 'muted', label: 'Muted Surface', color: '#F4ECD8', isDark: false },
  { id: 'navy', label: 'Studio Navy', color: '#1B2A41', isDark: true },
  { id: 'dark', label: 'Dark Charcoal', color: '#111827', isDark: true },
] as const;

export function DevBrandClient() {
  const [activePalette, setActivePalette] = useState<(typeof PALETTES)[number]['id']>('ivory_ink');
  const [selectedSize, setSelectedSize] = useState<number>(44);

  return (
    <div
      data-palette={activePalette}
      className="min-h-screen bg-bg text-text p-4 sm:p-8 lg:p-12 space-y-10 transition-colors"
    >
      {/* Page Header */}
      <div className="border-b border-border pb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-strong">
              Development Only • Vector Logo Inspection Lab
            </span>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-primary">
              UNB Premium Vector Logo &amp; Legibility Matrix
            </h1>
          </div>

          {/* Palette Selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface border border-border shadow-xs">
            {PALETTES.map((pal) => (
              <button
                key={pal.id}
                type="button"
                onClick={() => setActivePalette(pal.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activePalette === pal.id
                    ? 'bg-primary text-primary-contrast shadow-xs font-semibold'
                    : 'text-text-muted hover:text-text hover:bg-surface-muted'
                }`}
              >
                {pal.name.split(':')[0]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-text-muted max-w-3xl">
          Visual test bench verifying all generated vector variants (full, roundel, mark, wordmark, flat tag, and composed header lockup)
          across standard responsive sizes and background hues.
        </p>
      </div>

      {/* Legibility Checklist Card */}
      <section className="bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-sm space-y-3">
        <h2 className="text-base font-bold font-serif text-primary flex items-center gap-2">
          <span>✓</span>
          <span>Legibility &amp; Quality Checklist</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-text-muted">
          <div className="p-3 rounded-xl bg-surface-muted border border-border space-y-1">
            <span className="font-semibold text-text block">1. Favicon (16/32/48)</span>
            <p>Quill and open book inside circle ring read clearly in browser tab and bookmark bars.</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-muted border border-border space-y-1">
            <span className="font-semibold text-text block">2. Header Lockup</span>
            <p>Mark (44-48px) + Urdu wordmark + flat tag sit optically balanced. Collapses to mark below 360px.</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-muted border border-border space-y-1">
            <span className="font-semibold text-text block">3. Shell Top Bars</span>
            <p>Light backing plate prop ensures high contrast on Writer Studio &amp; Admin top bars.</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-muted border border-border space-y-1">
            <span className="font-semibold text-text block">4. SVG IDs Collision-Free</span>
            <p>SVGO prefixIds isolates gradients (lf_, lr_, lm_, lw_, tp_) when multiple logos appear on one page.</p>
          </div>
        </div>
      </section>

      {/* Interactive Size Switcher for Background Comparison */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs font-semibold text-text-muted mr-2">Compare at size:</span>
        {SIZES.map((sz) => (
          <button
            key={sz}
            type="button"
            onClick={() => setSelectedSize(sz)}
            className={`px-3 py-1 text-xs font-mono rounded-lg border transition-colors cursor-pointer ${
              selectedSize === sz
                ? 'bg-accent-strong text-surface font-bold border-accent-strong'
                : 'bg-surface text-text-muted border-border hover:bg-surface-muted'
            }`}
          >
            {sz}px
          </button>
        ))}
      </div>

      {/* Background Matrix: Selected Size Across 5 Backgrounds */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold font-serif text-primary">
          Background Contrast Matrix (at {selectedSize}px)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {BACKGROUND_SWATCHES.map((swatch) => (
            <div
              key={swatch.id}
              className="rounded-2xl border border-border p-4 shadow-sm flex flex-col items-center justify-between gap-4"
              style={{ backgroundColor: swatch.color }}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: swatch.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
                    color: swatch.isDark ? '#FFFFFF' : '#1F2430',
                  }}
                >
                  {swatch.label}
                </span>
              </div>

              {/* Logo Presentation on Swatch */}
              <div className="py-4 flex flex-col items-center gap-3">
                <BrandLogo
                  variant="mark"
                  size={selectedSize}
                  plate={swatch.isDark}
                />
                <BrandLogo
                  variant="lockup"
                  size={Math.min(selectedSize, 48)}
                  plate={swatch.isDark}
                />
              </div>

              <span
                className="text-[10px] font-mono opacity-60"
                style={{ color: swatch.isDark ? '#FFFFFF' : '#1F2430' }}
              >
                {swatch.color}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Multi-Size Scaling Ladder for Every Variant */}
      <section className="space-y-8">
        <h2 className="text-lg font-bold font-serif text-primary">
          Multi-Scale Resolution Ladder (All Variants)
        </h2>

        {/* 1. Logo Full (Roundel + Ribbon) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <span className="font-serif font-bold text-sm text-primary">variant=&quot;full&quot; (logo-full.svg)</span>
            <span className="text-xs text-text-muted font-mono">Footer, About, Login, Register, Error</span>
          </div>
          <div className="flex flex-wrap items-end gap-6 overflow-x-auto py-2">
            {[44, 64, 88, 120, 180].map((sz) => (
              <div key={sz} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="p-2 rounded-xl bg-surface-muted border border-border">
                  <BrandLogo variant="full" size={sz} />
                </div>
                <span className="text-[11px] font-mono text-text-muted">{sz}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Logo Mark (Quill + Book in Ring) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <span className="font-serif font-bold text-sm text-primary">variant=&quot;mark&quot; (logo-mark.svg)</span>
            <span className="text-xs text-text-muted font-mono">Favicon, Tiny Avatars, Studio &amp; Admin Shells</span>
          </div>
          <div className="flex flex-wrap items-end gap-6 overflow-x-auto py-2">
            {[16, 24, 32, 44, 48, 64].map((sz) => (
              <div key={sz} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="p-2 rounded-xl bg-surface-muted border border-border">
                  <BrandLogo variant="mark" size={sz} />
                </div>
                <span className="text-[11px] font-mono text-text-muted">{sz}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Logo Wordmark (Urdu Calligraphy + Ink Swoosh) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <span className="font-serif font-bold text-sm text-primary">variant=&quot;wordmark&quot; (logo-wordmark.svg)</span>
            <span className="text-xs text-text-muted font-mono">Urdu calligraphy + ink swoosh underline</span>
          </div>
          <div className="flex flex-wrap items-end gap-6 overflow-x-auto py-2">
            {[24, 32, 40, 56, 80].map((h) => (
              <div key={h} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="p-2 rounded-xl bg-surface-muted border border-border">
                  <BrandLogo variant="wordmark" height={h} />
                </div>
                <span className="text-[11px] font-mono text-text-muted">h: {h}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Tag Premium (Flat Ribbon) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <span className="font-serif font-bold text-sm text-primary">variant=&quot;tag&quot; (tag-premium.svg)</span>
            <span className="text-xs text-text-muted font-mono">Flat vector ribbon, 18-22px height</span>
          </div>
          <div className="flex flex-wrap items-end gap-6 overflow-x-auto py-2">
            {[14, 18, 22, 28, 36].map((h) => (
              <div key={h} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="p-2 rounded-xl bg-surface-muted border border-border">
                  <BrandLogo variant="tag" height={h} />
                </div>
                <span className="text-[11px] font-mono text-text-muted">h: {h}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Header Lockup (Composed) */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <span className="font-serif font-bold text-sm text-primary">variant=&quot;lockup&quot; (Composed Header Identity)</span>
            <span className="text-xs text-text-muted font-mono">Marketplace Header &amp; Mobile Drawer</span>
          </div>
          <div className="flex flex-wrap items-end gap-6 overflow-x-auto py-2">
            {[90, 110, 130, 150].map((w) => (
              <div key={w} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="p-3 rounded-xl bg-surface-muted border border-border">
                  <BrandLogo variant="lockup" width={w} />
                </div>
                <span className="text-[11px] font-mono text-text-muted">width: {w}px</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Static Rasters Preview (OG & Email) */}
      <section className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold font-serif text-primary">Pre-rendered Raster Derivatives (Email &amp; Open Graph)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-muted">Open Graph Card (og-image.png - 1200x630)</span>
            <div className="rounded-xl overflow-hidden border border-border bg-surface-muted">
              <Image
                src="/brand/og-image.png"
                alt="UNB Premium Open Graph Card"
                width={1200}
                height={630}
                unoptimized
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-muted">Email Logo (logo-email.png - 2x for email clients)</span>
            <div className="rounded-xl p-6 border border-border bg-surface-muted flex items-center justify-center">
              <Image
                src="/brand/logo-email.png"
                alt="UNB Premium Email Logo"
                width={140}
                height={151}
                unoptimized
                className="h-auto object-contain"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DevBrandClient;

