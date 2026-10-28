import React from 'react';
import Link from 'next/link';
import { Feather, ArrowLeft, LayoutDashboard } from 'lucide-react';

export default function WriterNotFoundPage() {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center text-center px-4 py-12 space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-warning-soft border border-warning-border text-accent-strong flex items-center justify-center shadow-md">
        <Feather className="w-7 h-7" />
      </div>

      <div className="space-y-2 max-w-md">
        <span className="text-[10px] font-mono uppercase tracking-wider text-warning-text bg-warning-soft px-2 py-0.5 rounded border border-warning-border">
          404 Studio Resource Not Found
        </span>
        <h1 className="text-xl font-serif font-bold text-navy">
          Studio Page or Novel Draft Not Found
        </h1>
        <p className="text-xs text-secondary leading-relaxed">
          The requested novel chapter, draft, or writer record could not be found or has been moved.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href="/writer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-navy hover:bg-navy-light transition-colors shadow-sm"
        >
          <LayoutDashboard className="w-4 h-4 text-accent" />
          <span>Writer Studio Overview</span>
        </Link>
        <Link
          href="/writer/novels"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-main bg-surface hover:bg-ivory border border-border transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-secondary" />
          <span>My Novels</span>
        </Link>
      </div>
    </div>
  );
}
