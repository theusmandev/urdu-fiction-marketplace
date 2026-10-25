import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, LayoutDashboard } from 'lucide-react';

export default function AdminNotFoundPage() {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center text-center px-4 py-12 space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shadow-lg">
        <ShieldAlert className="w-7 h-7" />
      </div>

      <div className="space-y-2 max-w-md">
        <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
          404 Admin Resource Not Found
        </span>
        <h1 className="text-xl font-bold text-white">
          Admin Page or Record Not Found
        </h1>
        <p className="text-xs text-slate-400 leading-relaxed">
          The requested administrative resource, moderation ticket, or record could not be found or has been moved.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-sm"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Admin Overview</span>
        </Link>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Orders Queue</span>
        </Link>
      </div>
    </div>
  );
}
