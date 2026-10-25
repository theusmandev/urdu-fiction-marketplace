'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Feather,
  ExternalLink,
  BookOpen,
  LayoutDashboard,
  CreditCard,
  Scale,
  Receipt,
  TrendingUp,
  Landmark,
  User,
  FileText,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AccountMenu, NotificationBell } from '../shared';
import type { ProfileRow, WriterProfileRow } from '@/types/database';

export interface StudioShellClientProps {
  children: React.ReactNode;
  profile: ProfileRow;
  writerProfile: WriterProfileRow;
  pendingVerificationCount?: number;
  openDisputesCount?: number;
  unreadNotificationsCount?: number;
}

export function StudioShellClient({
  children,
  profile,
  writerProfile,
  pendingVerificationCount = 0,
  openDisputesCount = 0,
  unreadNotificationsCount = 0,
}: StudioShellClientProps) {
  const pathname = usePathname();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { href: '/writer', label: 'Overview', icon: LayoutDashboard },
    { href: '/writer/novels', label: 'My Novels', icon: BookOpen },
    {
      href: '/writer/orders',
      label: 'Verify Payments',
      icon: CreditCard,
      badge: pendingVerificationCount,
      badgeColor: 'bg-amber-500 text-stone-950 font-bold',
    },
    {
      href: '/writer/disputes',
      label: 'Disputes',
      icon: Scale,
      badge: openDisputesCount,
      badgeColor: 'bg-rose-500 text-white font-bold',
    },
    { href: '/writer/earnings', label: 'Earnings', icon: TrendingUp },
    { href: '/writer/commission', label: 'Commission', icon: Receipt },
    { href: '/writer/payment-methods', label: 'Payment Methods', icon: Landmark },
    { href: '/writer/profile', label: 'Profile', icon: User },
    { href: '/writer/agreement', label: 'Author Agreement', icon: FileText },
  ];

  const isItemActive = (href: string) => {
    if (href === '/writer') {
      return pathname === '/writer';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const getPageTitle = () => {
    for (const item of navItems) {
      if (isItemActive(item.href)) {
        return item.label;
      }
    }
    return 'Studio';
  };

  const accountUser = {
    id: profile.id,
    email: profile.email,
    name: writerProfile.pen_name_english || profile.full_name || 'Author',
    username: profile.username,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    isWriter: true,
    writerStatus: writerProfile.status,
  };

  return (
    <div className="min-h-screen bg-ivory text-main flex flex-col font-sans">
      {/* Skip to Content Link (Accessibility) */}
      <a
        href="#writer-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-navy focus:text-accent focus:font-semibold focus:rounded-xl focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-accent"
      >
        Skip to main content
      </a>

      {/* Top Bar */}
      <header className="bg-navy text-white sticky top-0 z-40 h-16 border-b border-navy-light flex items-center justify-between px-4 sm:px-6 shadow-md">
        <div className="flex items-center gap-3">
          {/* Mobile Drawer Toggle */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40"
            aria-label={mobileDrawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          >
            {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand Logo in Top Bar */}
          <Link href="/writer" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-accent text-navy flex items-center justify-center font-bold shadow-sm group-hover:scale-105 transition-transform">
              <Feather className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-base font-bold tracking-tight text-white leading-none">
                Writer Studio
              </span>
              <span className="text-[10px] text-accent font-medium mt-0.5">
                UNB Premium
              </span>
            </div>
          </Link>

          {/* Breadcrumb / Page Title */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 border-l border-navy-light pl-3 ml-1">
            <span>/</span>
            <span className="font-semibold text-white">{getPageTitle()}</span>
          </div>
        </div>

        {/* Right Top Bar Actions */}
        <div className="flex items-center gap-2 sm:gap-3.5">
          {profile.username && (
            <Link
              href={`/writers/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-accent hover:bg-navy-light/60 px-2.5 py-1.5 rounded-lg border border-navy-light transition-colors"
              title="View your public author profile"
            >
              <User className="w-3.5 h-3.5 text-accent" />
              <span>Public Profile</span>
            </Link>
          )}

          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white hover:bg-navy-light/60 px-2.5 py-1.5 rounded-lg border border-navy-light transition-colors"
            title="Return to Marketplace"
          >
            <ExternalLink className="w-3.5 h-3.5 text-accent" />
            <span>Marketplace</span>
          </Link>

          <NotificationBell
            unreadCount={unreadNotificationsCount}
            variant="writer"
          />

          <AccountMenu
            user={accountUser}
            variant="writer"
          />
        </div>
      </header>

      {/* Main Body Shell (Sidebar + Content) */}
      <div className="flex-1 flex w-full relative">
        {/* Desktop Fixed Left Sidebar */}
        <aside
          className={`hidden lg:flex flex-col border-r border-border bg-surface sticky top-16 h-[calc(100vh-4rem)] transition-all duration-200 z-30 ${
            isCollapsed ? 'w-20' : 'w-64'
          }`}
          aria-label="Studio Navigation"
        >
          {/* Sidebar Collapse Toggle */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            {!isCollapsed && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">
                Author Tools
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="p-1.5 rounded-lg text-secondary hover:text-navy hover:bg-ivory transition-colors ml-auto focus:outline-none focus:ring-2 focus:ring-accent/40"
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

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1 no-scrollbar">
            {navItems.map((item) => {
              const active = isItemActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={isCollapsed ? item.label : undefined}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                    active
                      ? 'bg-navy text-white font-semibold shadow-sm'
                      : 'text-secondary hover:text-navy hover:bg-ivory'
                  } ${isCollapsed ? 'justify-center px-2' : ''}`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      active ? 'text-accent' : 'text-secondary group-hover:text-navy'
                    }`}
                  />
                  {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded-full shadow-xs ${
                        item.badgeColor || 'bg-amber-500 text-navy font-bold'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isCollapsed && typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-surface ${
                        item.href === '/writer/disputes' ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Author Pen Name Footer */}
          <div className="p-3 border-t border-border bg-ivory/60 text-xs">
            {!isCollapsed ? (
              <div className="px-2 py-1 space-y-0.5">
                <span className="text-[10px] uppercase font-semibold text-secondary block">
                  Author Pen Name
                </span>
                <span className="font-semibold text-navy truncate block">
                  {writerProfile.pen_name_english}
                </span>
              </div>
            ) : (
              <div className="flex justify-center" title={writerProfile.pen_name_english}>
                <Feather className="w-4 h-4 text-accent" />
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileDrawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex">
            <div
              className="w-72 max-w-[85vw] bg-surface border-r border-border h-full flex flex-col p-4 shadow-2xl animate-in slide-in-from-left duration-200"
              role="dialog"
              aria-modal="true"
              aria-label="Studio mobile navigation"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-navy text-accent flex items-center justify-center font-bold">
                    <Feather className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-sm text-navy">Writer Studio</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-secondary hover:text-navy hover:bg-ivory"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto py-3 space-y-1">
                {navItems.map((item) => {
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
                          ? 'bg-navy text-white font-semibold'
                          : 'text-secondary hover:text-navy hover:bg-ivory'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`w-4 h-4 ${
                            active ? 'text-accent' : 'text-secondary'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                            item.badgeColor || 'bg-amber-500 text-navy font-bold'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-border space-y-1">
                {profile.username && (
                  <Link
                    href={`/writers/${profile.username}`}
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-secondary hover:text-navy hover:bg-ivory rounded-xl"
                  >
                    <User className="w-4 h-4 text-accent" />
                    <span>My Public Profile</span>
                  </Link>
                )}
                <Link
                  href="/"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-secondary hover:text-navy hover:bg-ivory rounded-xl"
                >
                  <ExternalLink className="w-4 h-4 text-accent" />
                  <span>Marketplace Store</span>
                </Link>
              </div>
            </div>
            <div
              className="flex-1"
              onClick={() => setMobileDrawerOpen(false)}
              aria-hidden="true"
            />
          </div>
        )}

        {/* Content Area */}
        <main
          id="writer-main-content"
          tabIndex={-1}
          className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
