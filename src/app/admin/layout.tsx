import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import {
  ShieldAlert,
  LogOut,
  ExternalLink,
  Users,
  Feather,
  BookOpen,
  Tags,
  Settings,
  Activity,
  LayoutDashboard,
  ShoppingBag,
  Receipt,
  DollarSign,
} from 'lucide-react';
import { logoutUser } from '@/app/actions/auth';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/commission', label: 'Commission', icon: DollarSign },
  { href: '/admin/invoices', label: 'Invoices', icon: Receipt },
  { href: '/admin/writers', label: 'Writers', icon: Feather },
  { href: '/admin/novels', label: 'Novels', icon: BookOpen },
  { href: '/admin/genres', label: 'Genres', icon: Tags },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/audit', label: 'Audit Trail', icon: Activity },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole('admin', '/admin');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Admin Control Bar */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/admin" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 group-hover:bg-rose-500/30 transition-colors">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                    <span>UNB Control</span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono">
                      ADMIN
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono hidden sm:block">
                    SuperAdmin Session
                  </div>
                </div>
              </Link>

              {/* Desktop Nav */}
              <nav className="hidden lg:flex items-center gap-1 text-xs font-medium">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center gap-1.5"
                    >
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                <Link
                  href="/"
                  target="_blank"
                  className="px-2.5 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center gap-1 ml-2 border-l border-slate-800 pl-3"
                >
                  <span>Public Store</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
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

          {/* Mobile Horizontal Scrollable Subnav */}
          <div className="flex lg:hidden overflow-x-auto py-2 border-t border-slate-800/80 no-scrollbar gap-1 text-xs font-medium">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1 rounded-full whitespace-nowrap bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 text-[11px]"
                >
                  <Icon className="w-3 h-3 text-slate-400" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Admin Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        UNB Premium Platform Admin System • Row Level Security & Audit Log Enforced
      </footer>
    </div>
  );
}
