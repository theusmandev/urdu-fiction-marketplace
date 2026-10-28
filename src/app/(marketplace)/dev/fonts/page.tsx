import React from 'react';
import { notFound } from 'next/navigation';
import { DevFontTesterClient } from './DevFontTesterClient';

export const metadata = {
  title: 'Gulzar Typography Lab (Dev Only)',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DevFontsPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="min-h-screen bg-ivory text-main p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-border pb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warning-soft border border-warning-border text-warning-text text-xs font-mono font-medium">
            <span>DEVELOPMENT ENVIRONMENT ONLY</span>
          </div>
          <h1 className="text-3xl font-bold font-serif tracking-tight text-navy">
            Gulzar Typography & Line-Height Tuning Lab
          </h1>
          <p className="text-sm text-secondary max-w-3xl">
            Empirical typography verification laboratory for the Google Font <code className="text-accent-strong font-mono font-bold">Gulzar</code> (weight 400).
            Use this workbench to inspect ligature shaping, baseline alignment, vertical descender/ascender clipping, Urdu punctuation, bilingual embedding, and compare Quranic harakat in Gulzar vs. Amiri Naskh.
          </p>
        </div>

        {/* Client Workbench with Live Matrix, Theme Switches, and Visual Bounds */}
        <DevFontTesterClient />
      </div>
    </div>
  );
}
