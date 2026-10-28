import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, LayoutDashboard } from 'lucide-react';

export default function AdminNotFoundPage() {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center text-center px-4 py-12 space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-danger-soft border border-danger-border text-danger-text flex items-center justify-center shadow-xs">
        <ShieldAlert className="w-7 h-7" />
      </div>

      <div className="space-y-2 max-w-md">
        <span className="text-xs font-semibold text-danger-text bg-danger-soft px-2.5 py-0.5 rounded-full border border-danger-border">
          Page Not Found
        </span>
        <h1 className="text-xl font-bold text-navy">
          Admin Page or Record Not Found
        </h1>
        <p className="text-xs text-secondary leading-relaxed">
          The requested administrative resource, moderation ticket, or record could not be found or has been moved.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-accent-admin hover:bg-accent-admin-dark transition-colors shadow-xs"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Admin Overview</span>
        </Link>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-main bg-surface hover:bg-ivory border border-border transition-colors shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Orders Queue</span>
        </Link>
      </div>
    </div>
  );
}
