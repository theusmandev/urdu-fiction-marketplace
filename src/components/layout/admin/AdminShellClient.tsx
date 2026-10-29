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
  Heart,
} from 'lucide-react';
import { AccountMenu, NotificationBell } from '../shared';
import { AdminPalettePreview } from '@/components/admin/AdminPalettePreview';
import { BrandLogo } from '@/components/brand/BrandLogo';
import type { ProfileRow } from '@/types/database';

export interface AdminBadgeCounts {
  openDisputesCount: number;
  pendingRefundsCount: number;
  pendingReportsCount: number;
  pendingWritersCount: number;
  underReviewNovelsCount: number;
  flaggedTipsCount?: number;
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
          href: '/admin/tips',
          label: 'Tips (Say Thanks)',
          icon: Heart,
          badge: counts.flaggedTipsCount,
          badgeColor: 'bg-warning-soft text-warning-text border-warning-border',
        },
        {
          href: '/admin/disputes',
          label: 'Disputes',
          icon: Scale,
          badge: counts.openDisputesCount,
          badgeColor: 'bg-danger-soft text-danger-text border-danger-border',
        },
        {
          href: '/admin/refunds',
          label: 'Refunds',
          icon: RotateCcw,
          badge: counts.pendingRefundsCount,
          badgeColor: 'bg-warning-soft text-warning-text border-warning-border',
        },
        { href: '/admin/support', label: 'Support', icon: LifeBuoy },
      ],
    },
    {
      title: 'Finance',
      items: [
        {
          href: '/admin/commission',
          label: 'Platform Fee',
          icon: DollarSign,
          badge: counts.pendingReportsCount,
          badgeColor: 'bg-success-soft text-success-text border-success-border',
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
          badgeColor: 'bg-warning-soft text-warning-text border-warning-border',
        },
        {
          href: '/admin/novels',
          label: 'Novels',
          icon: BookOpen,
          badge: counts.underReviewNovelsCount,
          badgeColor: 'bg-info-soft text-info-text border-info-border',
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
    <div
      data-area="admin"
      className="h-screen w-full overflow-hidden bg-bg text-text flex flex-col font-sans"
    >
      {/* Skip to Content Link (Accessibility) */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent-admin focus:text-white focus:font-semibold focus:rounded-xl focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Top Bar (Fixed at top, zero scroll) */}
      <header className="bg-surface text-text shrink-0 z-30 h-14 sm:h-16 border-b border-border flex items-center justify-between px-4 sm:px-6 shadow-xs">
        <div className="flex items-center gap-3">
          {/* Mobile Drawer Toggle */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={mobileDrawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          >
            {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand Logo in Top Bar */}
          <Link href="/admin" className="flex items-center gap-2.5 group rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface" aria-label="Admin Control — UNB Premium">
            <BrandLogo variant="mark" size={36} plate priority className="group-hover:scale-105 transition-transform" />
            <div className="flex items-center gap-2">
              <span className="font-serif text-base font-bold tracking-tight text-text leading-none">
                Admin Control
              </span>
              <span className="text-[10px] bg-accent-admin-soft text-accent-admin border border-accent-admin-border px-1.5 py-0.5 rounded font-bold tracking-wider">
                ADMIN
              </span>
            </div>
          </Link>

          {/* Breadcrumb / Page Title */}
          <div className="hidden sm:flex items-center text-xs border-l border-border pl-3 ml-1">
            <span className="font-semibold text-text">{getPageTitle()}</span>
          </div>
        </div>

        {/* Right Top Bar Actions */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-muted px-2.5 py-1.5 rounded-lg border border-border transition-colors"
            title="Open Public Marketplace in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-accent-strong" />
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

      {/* Main Body Shell (Flush Sidebar + Scrollable Content) */}
      <div className="flex-1 min-h-0 w-full flex overflow-hidden">
        {/* Desktop Fixed Left Sidebar */}
        <aside
          className={`hidden lg:flex flex-col border-r border-border bg-surface h-full shrink-0 transition-all duration-200 z-20 ${
            isCollapsed ? 'w-20' : 'w-64'
          }`}
          aria-label="Admin Navigation"
        >
          {/* Sidebar Collapse Toggle Button */}
          <div className="p-2.5 sm:p-3 border-b border-border flex items-center justify-between shrink-0">
            {!isCollapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Navigation
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors ml-auto focus:outline-none focus:ring-2 focus:ring-ring"
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

          {/* Grouped Navigation Links (Compact padding so all 11 items fit comfortably) */}
          <nav className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-0.5">
                {!isCollapsed && (
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-text-muted mt-3 mb-1 first:mt-0">
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
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all group ${
                          active
                            ? 'bg-accent-admin text-white font-semibold shadow-sm'
                            : 'text-text-muted hover:text-text hover:bg-surface-muted'
                        } ${isCollapsed ? 'justify-center px-2' : ''}`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? 'text-white'
                              : 'text-text-muted group-hover:text-text'
                          }`}
                        />
                        {!isCollapsed && (
                          <span className="flex-1 truncate">{item.label}</span>
                        )}
                        {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                          <span
                            className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full border ${
                              active
                                ? 'bg-white/20 text-white border-white/30'
                                : item.badgeColor || 'bg-warning-soft text-warning-text border-warning-border'
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
          <div className="p-2.5 sm:p-3 border-t border-border bg-surface-muted/60 text-xs shrink-0">
            <Link
              href="/"
              className={`flex items-center gap-2.5 text-text-muted hover:text-text px-3 py-1.5 rounded-xl transition-colors ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title="Return to Marketplace"
            >
              <ExternalLink className="w-4 h-4 text-accent-strong shrink-0" />
              {!isCollapsed && <span>Marketplace</span>}
            </Link>
          </div>
        </aside>

        {/* Main Admin Content Container (Sole scrollable container on desktop) */}
        <main
          id="admin-main-content"
          tabIndex={-1}
          className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 focus:outline-none"
        >
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Drawer (Overlay Sheet) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] bg-surface border-r border-border h-full flex flex-col p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent-admin text-white flex items-center justify-center font-bold">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm text-text">Admin Navigation</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 space-y-4 no-scrollbar">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
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
                              ? 'bg-accent-admin text-white font-semibold'
                              : 'text-text-muted hover:text-text hover:bg-surface-muted'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon
                              className={`w-4 h-4 ${
                                active ? 'text-white' : 'text-text-muted'
                              }`}
                            />
                            <span>{item.label}</span>
                          </div>
                          {typeof item.badge === 'number' && item.badge > 0 && (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${
                                active
                                  ? 'bg-white/20 text-white border-white/30'
                                  : item.badgeColor || 'bg-warning-soft text-warning-text border-warning-border'
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

            <div className="pt-3 border-t border-border">
              <Link
                href="/"
                onClick={() => setMobileDrawerOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-text-muted hover:text-text hover:bg-surface-muted"
              >
                <ExternalLink className="w-4 h-4 text-accent-strong" />
                <span>View Public Marketplace</span>
              </Link>
            </div>
          </div>
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}
      <AdminPalettePreview role="admin" />
    </div>
  );
}
