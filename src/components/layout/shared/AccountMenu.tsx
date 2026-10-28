'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ShieldAlert,
  Feather,
  BookOpen,
  ShoppingBag,
  User as UserIcon,
  Settings,
  ExternalLink,
  Activity,
  Heart,
} from 'lucide-react';
import { LogoutButton } from './LogoutButton';
import type { UserRole, WriterStatus } from '@/types/database';

export interface AccountMenuUser {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  isWriter?: boolean;
  writerStatus?: WriterStatus | null;
}

export interface AccountMenuProps {
  user: AccountMenuUser;
  variant?: 'admin' | 'writer' | 'marketplace';
  className?: string;
}

export function AccountMenu({
  user,
  variant = 'marketplace',
  className,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const initials = (user.name || user.email || 'U').charAt(0).toUpperCase();

  // Role badge label & color using semantic tokens
  const getRoleBadge = () => {
    if (user.role === 'admin') {
      return {
        label: 'Platform Admin',
        classes: 'bg-accent-admin-soft text-accent-admin border-accent-admin-border font-bold',
      };
    }
    if (user.writerStatus === 'pending_approval') {
      return {
        label: 'Author (Pending)',
        classes: 'bg-warning-soft text-warning-text border-warning-border font-semibold',
      };
    }
    if (user.isWriter || user.role === 'writer') {
      return {
        label: 'Approved author',
        classes: 'bg-accent-soft text-accent-strong border-border font-semibold',
      };
    }
    return {
      label: 'Reader',
      classes: 'bg-success-soft text-success-text border-success-border font-semibold',
    };
  };

  const roleMeta = getRoleBadge();

  const triggerButtonStyles =
    'flex items-center gap-2.5 py-1.5 px-2.5 rounded-xl border border-border bg-surface hover:bg-surface-muted transition-all text-left focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer';
  const dropdownPanelStyles =
    'absolute right-0 top-full mt-2 w-64 bg-surface rounded-2xl shadow-xl border border-border p-2 z-50 animate-in fade-in zoom-in-95 duration-150 text-text';
  const headerBoxStyles =
    'px-3 py-2.5 bg-surface-muted rounded-xl mb-1.5 border border-border';
  const linkItemStyles =
    'flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-muted hover:text-text hover:bg-surface-muted rounded-xl transition-colors';

  return (
    <div className={`relative ${className || ''}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={triggerButtonStyles}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover border border-border shrink-0"
          />
        ) : (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-inner ${
              variant === 'admin'
                ? 'bg-accent-admin-soft text-accent-admin border border-accent-admin-border'
                : variant === 'writer'
                ? 'bg-accent-soft text-accent-strong border border-border'
                : 'bg-primary text-primary-contrast border border-border'
            }`}
          >
            {initials}
          </div>
        )}

        <div className="hidden sm:flex flex-col text-left max-w-[120px]">
          <span className="text-xs font-semibold truncate leading-tight text-text">
            {user.name}
          </span>
          <span className="text-[10px] capitalize leading-tight text-text-muted">
            {user.role === 'admin'
              ? 'Admin'
              : user.isWriter
              ? 'Author'
              : 'Reader'}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className={dropdownPanelStyles}>
          {/* User Info Header */}
          <div className={headerBoxStyles}>
            <div className="flex items-center gap-2.5">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    variant === 'admin'
                      ? 'bg-accent-admin-soft text-accent-admin border border-accent-admin-border'
                      : variant === 'writer'
                      ? 'bg-accent-soft text-accent-strong border border-border'
                      : 'bg-primary text-primary-contrast'
                  }`}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate text-text">
                  {user.name}
                </p>
                <p className="text-[11px] truncate text-text-muted">
                  {user.email}
                </p>
                <div className="mt-1">
                  <span
                    className={`inline-block text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleMeta.classes}`}
                  >
                    {roleMeta.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contextual Links */}
          <div className="space-y-0.5 border-b border-border pb-1 mb-1">
            {variant === 'admin' ? (
              <>
                <Link
                  href="/admin"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <ShieldAlert className="w-4 h-4 text-accent-admin shrink-0" />
                  <span>Admin Overview</span>
                </Link>
                <Link
                  href="/admin/settings"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <Settings className="w-4 h-4 text-text-muted shrink-0" />
                  <span>Platform Settings</span>
                </Link>
                <Link
                  href="/admin/audit"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <Activity className="w-4 h-4 text-text-muted shrink-0" />
                  <span>Audit Trail</span>
                </Link>
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <ExternalLink className="w-4 h-4 text-accent-strong shrink-0" />
                  <span>View Public Marketplace</span>
                </Link>
              </>
            ) : variant === 'writer' ? (
              <>
                <Link
                  href="/writer"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <Feather className="w-4 h-4 text-accent-strong shrink-0" />
                  <span>Writer Studio</span>
                </Link>
                {user.username && (
                  <Link
                    href={`/writers/${user.username}`}
                    onClick={() => setIsOpen(false)}
                    className={linkItemStyles}
                  >
                    <UserIcon className="w-4 h-4 text-text-muted shrink-0" />
                    <span>My Public Profile</span>
                  </Link>
                )}
                <Link
                  href="/library"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <BookOpen className="w-4 h-4 text-text-muted shrink-0" />
                  <span>My Library</span>
                </Link>
                <Link
                  href="/orders"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <ShoppingBag className="w-4 h-4 text-text-muted shrink-0" />
                  <span>My Orders</span>
                </Link>
                <Link
                  href="/writer/tips"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <Heart className="w-4 h-4 text-accent-strong shrink-0" />
                  <span>Thanks received</span>
                </Link>
                <Link
                  href="/account"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <Settings className="w-4 h-4 text-text-muted shrink-0" />
                  <span>Account Settings</span>
                </Link>
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <ExternalLink className="w-4 h-4 text-accent-strong shrink-0" />
                  <span>View Marketplace</span>
                </Link>
              </>
            ) : (
              <>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-accent-admin hover:bg-accent-admin-soft rounded-xl transition-colors"
                  >
                    <ShieldAlert className="w-4 h-4 text-accent-admin shrink-0" />
                    <span>Admin Panel</span>
                  </Link>
                )}
                {(user.isWriter || user.role === 'admin') && (
                  <Link
                    href="/writer"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-accent-strong hover:bg-surface-muted rounded-xl transition-colors"
                  >
                    <Feather className="w-4 h-4 text-accent-strong shrink-0" />
                    <span>Writer Studio</span>
                  </Link>
                )}
                <Link
                  href="/library"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <BookOpen className="w-4 h-4 text-text-muted shrink-0" />
                  <span>My Library</span>
                </Link>
                <Link
                  href="/orders"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <ShoppingBag className="w-4 h-4 text-text-muted shrink-0" />
                  <span>My Orders</span>
                </Link>
                <Link
                  href="/tips"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <Heart className="w-4 h-4 text-accent-strong shrink-0" />
                  <span>My Thanks</span>
                </Link>
                <Link
                  href="/account"
                  onClick={() => setIsOpen(false)}
                  className={linkItemStyles}
                >
                  <UserIcon className="w-4 h-4 text-text-muted shrink-0" />
                  <span>Account Settings</span>
                </Link>
              </>
            )}
          </div>

          {/* Logout Action */}
          <div className="pt-1">
            <LogoutButton
              onLoggedOut={() => setIsOpen(false)}
              variant="dropdown"
            />
          </div>
        </div>
      )}
    </div>
  );
}
