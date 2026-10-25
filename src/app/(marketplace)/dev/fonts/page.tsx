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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-slate-800 pb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
            <span>DEVELOPMENT ENVIRONMENT ONLY</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Gulzar Typography & Line-Height Tuning Lab
          </h1>
          <p className="text-sm text-slate-400 max-w-3xl">
            Empirical typography verification laboratory for the Google Font <code className="text-amber-300 font-mono">Gulzar</code> (weight 400).
            Use this workbench to inspect ligature shaping, baseline alignment, vertical descender/ascender clipping, Urdu punctuation, bilingual embedding, and compare Quranic harakat in Gulzar vs. Amiri Naskh.
          </p>
        </div>

        {/* Client Workbench with Live Matrix, Theme Switches, and Visual Bounds */}
        <DevFontTesterClient />
      </div>
    </div>
  );
}
