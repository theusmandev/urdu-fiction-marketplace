import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'Brand Logo & Theme Showcase — Development Only',
  robots: 'noindex,nofollow',
};

const PALETTES = [
  { id: 'ivory_ink', name: 'Palette A: Ivory & Ink (Default)', darkBar: '#1B2A41' },
  { id: 'paper_teal', name: 'Palette B: Paper & Teal', darkBar: '#0F5E5A' },
  { id: 'cream_maroon', name: 'Palette C: Cream & Maroon', darkBar: '#7A2E3A' },
] as const;

export default function DevThemeShowcasePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="min-h-screen bg-bg text-text p-6 sm:p-12 space-y-12 max-w-6xl mx-auto">
      <div className="border-b border-border pb-6 space-y-2">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-strong">
          Development Only
        </span>
        <h1 className="text-3xl font-serif font-bold text-primary">
          Brand Logo &amp; Palette Integration Showcase
        </h1>
        <p className="text-sm text-text-muted">
          Displays the circular badge artwork with the live-text CSS/SVG &ldquo;{siteConfig.brandSuffix}&rdquo; ribbon
          inheriting each curated site palette (data-palette) and verified on light, muted, and dark backgrounds.
        </p>
      </div>

      <div className="space-y-10">
        {PALETTES.map((p) => (
          <section
            key={p.id}
            data-palette={p.id}
            className="rounded-3xl border-2 border-border bg-surface p-6 sm:p-8 space-y-6 shadow-sm transition-colors"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-xl font-bold font-serif text-primary">{p.name}</h2>
                <span className="text-xs font-mono text-text-muted">data-palette=&quot;{p.id}&quot;</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-muted border border-border text-text">
                Live Tokens Active
              </span>
            </div>

            {/* Grid of Variants */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {/* Full Variant */}
              <div className="rounded-2xl border border-border bg-bg p-6 flex flex-col items-center justify-center gap-4 text-center">
                <span className="text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                  variant=&quot;full&quot; (size=104)
                </span>
                <BrandLogo variant="full" size={104} />
                <p className="text-xs text-text-muted max-w-[200px]">
                  About, Auth pages, Footer, Loading &amp; Error screens.
                </p>
              </div>

              {/* Lockup Variant */}
              <div className="rounded-2xl border border-border bg-bg p-6 flex flex-col items-center justify-center gap-4 text-center">
                <span className="text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                  variant=&quot;lockup&quot; (size=48)
                </span>
                <div className="p-3 bg-surface rounded-xl border border-border shadow-xs">
                  <BrandLogo variant="lockup" size={48} />
                </div>
                <p className="text-xs text-text-muted max-w-[200px]">
                  Header &amp; mobile drawer emblem with integrated ribbon.
                </p>
              </div>

              {/* Mark Variant (with plate) on Dark Shell Bar */}
              <div className="rounded-2xl border border-border p-6 flex flex-col items-center justify-center gap-4 text-center" style={{ backgroundColor: p.darkBar }}>
                <span className="text-xs font-mono font-semibold text-white/80 uppercase tracking-wider">
                  variant=&quot;mark&quot; on Dark Bar
                </span>
                <div className="flex items-center gap-3 p-2 rounded-xl bg-white/10 backdrop-blur-xs border border-white/20">
                  <BrandLogo variant="mark" size={36} plate />
                  <div className="text-left">
                    <span className="block font-serif text-sm font-bold text-white leading-none">
                      Writer Studio
                    </span>
                  </div>
                </div>
                <p className="text-xs text-white/70 max-w-[200px]">
                  Studio &amp; Admin shells with light contrast plate.
                </p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
