'use client';

import React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

export interface NotificationBellProps {
  unreadCount?: number;
  href?: string;
  variant?: 'admin' | 'writer' | 'marketplace';
  className?: string;
}

export function NotificationBell({
  unreadCount = 0,
  href = '/notifications',
  variant = 'marketplace',
  className,
}: NotificationBellProps) {
  const defaultStyles =
    'relative p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer';

  let badgeStyles = '';
  switch (variant) {
    case 'admin':
      badgeStyles =
        'absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-accent-admin text-[10px] font-bold text-white shadow-xs';
      break;
    case 'writer':
    case 'marketplace':
    default:
      badgeStyles =
        'absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-accent-soft text-accent-strong border border-border text-[10px] font-bold shadow-xs';
      break;
  }

  return (
    <Link
      href={href}
      className={className || defaultStyles}
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications'
      }
      title="Notifications"
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className={badgeStyles}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
