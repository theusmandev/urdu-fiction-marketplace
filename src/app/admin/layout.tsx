import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { ShieldAlert, LogOut, ExternalLink } from 'lucide-react';
import { logoutUser } from '@/app/actions/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole('admin', '/admin');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Admin Control Bar */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/admin" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                    <span>UNB Admin Control</span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono">
                      ROOT
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Security Level: SuperAdmin
                  </div>
                </div>
              </Link>

              <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
                <Link
                  href="/admin"
                  className="px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Overview
                </Link>
                <Link
                  href="/"
                  target="_blank"
                  className="px-3 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                >
                  <span>Public Store</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-200">
                  {profile.full_name || 'Administrator'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {profile.email}
                </span>
              </div>

              <form action={logoutUser}>
                <button
                  type="submit"
                  className="text-xs bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Admin Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        UNB Premium Platform Admin System • Row Level Security & Audit Enforced
      </footer>
    </div>
  );
}
