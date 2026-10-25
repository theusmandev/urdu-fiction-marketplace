'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldAlert,
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
  Scale,
  RotateCcw,
  LifeBuoy,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AccountMenu, NotificationBell } from '../shared';
import type { ProfileRow } from '@/types/database';

export interface AdminBadgeCounts {
  openDisputesCount: number;
  pendingRefundsCount: number;
  pendingReportsCount: number;
  pendingWritersCount: number;
  underReviewNovelsCount: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export interface AdminShellClientProps {
  children: React.ReactNode;
  profile: ProfileRow;
  counts: AdminBadgeCounts;
  unreadNotificationsCount?: number;
}

export function AdminShellClient({
  children,
  profile,
  counts,
  unreadNotificationsCount = 0,
}: AdminShellClientProps) {
  const pathname = usePathname();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navSections: NavSection[] = [
    {
      title: 'Operations',
      items: [
        { href: '/admin', label: 'Overview', icon: LayoutDashboard },
        { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
        {
          href: '/admin/disputes',
          label: 'Disputes',
          icon: Scale,
          badge: counts.openDisputesCount,
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        },
        {
          href: '/admin/refunds',
          label: 'Refunds',
          icon: RotateCcw,
          badge: counts.pendingRefundsCount,
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        },
        { href: '/admin/support', label: 'Support', icon: LifeBuoy },
      ],
    },
    {
      title: 'Finance',
      items: [
        {
          href: '/admin/commission',
          label: 'Commission',
          icon: DollarSign,
          badge: counts.pendingReportsCount,
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        },
        { href: '/admin/invoices', label: 'Invoices', icon: Receipt },
      ],
    },
    {
      title: 'Content',
      items: [
        {
          href: '/admin/writers',
          label: 'Writers',
          icon: Feather,
          badge: counts.pendingWritersCount,
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        },
        {
          href: '/admin/novels',
          label: 'Novels',
          icon: BookOpen,
          badge: counts.underReviewNovelsCount,
          badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        },
        { href: '/admin/genres', label: 'Genres', icon: Tags },
      ],
    },
    {
      title: 'System',
      items: [
        { href: '/admin/users', label: 'Users', icon: Users },
        { href: '/admin/settings', label: 'Settings', icon: Settings },
        { href: '/admin/audit', label: 'Audit Trail', icon: Activity },
      ],
    },
  ];

  const isItemActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Derive current page title from active navigation item
  const getPageTitle = () => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (isItemActive(item.href)) {
          return item.label;
        }
      }
    }
    return 'Admin';
  };

  const accountUser = {
    id: profile.id,
    email: profile.email,
    name: profile.full_name || profile.username || 'Administrator',
    username: profile.username,
    avatarUrl: profile.avatar_url,
    role: profile.role,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Skip to Content Link (Accessibility) */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-rose-600 focus:text-white focus:font-semibold focus:rounded-xl focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 h-16 flex items-center justify-between px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Mobile Drawer Toggle */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            aria-label={mobileDrawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          >
            {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand Logo in Top Bar */}
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 group-hover:bg-rose-500/30 transition-colors">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-sm">
                UNB Control
              </span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded font-mono font-semibold">
                ADMIN
              </span>
            </div>
          </Link>

          {/* Breadcrumb / Page Title */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 border-l border-slate-800 pl-3 ml-1">
            <span>/</span>
            <span className="font-semibold text-slate-200">{getPageTitle()}</span>
          </div>
        </div>

        {/* Right Top Bar Actions */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-800 transition-colors"
            title="Open Public Marketplace in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-accent" />
            <span>View Site</span>
          </Link>

          <NotificationBell
            unreadCount={unreadNotificationsCount}
            variant="admin"
          />

          <AccountMenu
            user={accountUser}
            variant="admin"
          />
        </div>
      </header>

      {/* Main Body Shell (Sidebar + Content) */}
      <div className="flex-1 flex w-full relative">
        {/* Desktop Fixed Left Sidebar */}
        <aside
          className={`hidden lg:flex flex-col border-r border-slate-800 bg-slate-900/95 sticky top-16 h-[calc(100vh-4rem)] transition-all duration-200 z-30 ${
            isCollapsed ? 'w-20' : 'w-64'
          }`}
          aria-label="Admin Navigation"
        >
          {/* Sidebar Collapse Toggle Button */}
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            {!isCollapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                System Navigation
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-auto focus:outline-none focus:ring-2 focus:ring-slate-700"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Grouped Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-5 no-scrollbar">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1.5">
                    {section.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isItemActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={isCollapsed ? item.label : undefined}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                          active
                            ? 'bg-rose-500/15 text-rose-300 font-semibold border border-rose-500/30 shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        } ${isCollapsed ? 'justify-center px-2' : ''}`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? 'text-rose-400'
                              : 'text-slate-500 group-hover:text-slate-300'
                          }`}
                        />
                        {!isCollapsed && (
                          <span className="flex-1 truncate">{item.label}</span>
                        )}
                        {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${
                              item.badgeColor || 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Bottom Footer */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 text-xs">
            <Link
              href="/"
              className={`flex items-center gap-2.5 text-slate-400 hover:text-white px-3 py-2 rounded-xl transition-colors ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title="Return to Marketplace"
            >
              <ExternalLink className="w-4 h-4 text-accent shrink-0" />
              {!isCollapsed && <span>Marketplace</span>}
            </Link>
          </div>
        </aside>

        {/* Main Admin Content Container */}
        <main
          id="admin-main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-x-auto focus:outline-none"
        >
          {children}
        </main>
      </div>

      {/* Mobile Drawer (Overlay Sheet) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 h-full flex flex-col p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <span className="font-bold text-sm text-white">Admin Navigation</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 space-y-4 no-scrollbar">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    {section.title}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isItemActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileDrawerOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                            active
                              ? 'bg-rose-500/15 text-rose-300 font-semibold border border-rose-500/30'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon
                              className={`w-4 h-4 ${
                                active ? 'text-rose-400' : 'text-slate-500'
                              }`}
                            />
                            <span>{item.label}</span>
                          </div>
                          {typeof item.badge === 'number' && item.badge > 0 && (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${
                                item.badgeColor || 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="pt-3 border-t border-slate-800">
              <Link
                href="/"
                onClick={() => setMobileDrawerOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                <ExternalLink className="w-4 h-4 text-accent" />
                <span>View Public Marketplace</span>
              </Link>
            </div>
          </div>
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
