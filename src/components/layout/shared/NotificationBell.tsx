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
  let defaultStyles = '';
  let badgeStyles = '';

  switch (variant) {
    case 'admin':
      defaultStyles =
        'relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-700';
      badgeStyles =
        'absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm';
      break;
    case 'writer':
      defaultStyles =
        'relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40';
      badgeStyles =
        'absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-navy shadow-sm';
      break;
    case 'marketplace':
    default:
      defaultStyles =
        'relative p-2 rounded-full text-secondary hover:text-navy hover:bg-ivory transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer';
      badgeStyles =
        'absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-stone-950 shadow-sm';
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
