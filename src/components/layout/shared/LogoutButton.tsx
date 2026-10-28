'use client';

import React, { useTransition } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { logoutUser } from '@/app/actions/auth';

export interface LogoutButtonProps {
  onLoggedOut?: () => void;
  className?: string;
  variant?: 'admin' | 'writer' | 'marketplace' | 'dropdown' | 'icon';
  showLabel?: boolean;
  isMobile?: boolean;
}

export function LogoutButton({
  onLoggedOut,
  className,
  variant = 'marketplace',
  showLabel = true,
}: LogoutButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    startTransition(async () => {
      onLoggedOut?.();
      await logoutUser();
    });
  };

  let defaultStyles = '';

  switch (variant) {
    case 'admin':
    case 'writer':
    case 'dropdown':
      defaultStyles =
        'flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-danger-text hover:bg-danger-soft border border-transparent hover:border-danger-border rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
    case 'icon':
      defaultStyles =
        'p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-danger-soft transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
    case 'marketplace':
    default:
      defaultStyles =
        'flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-danger-text bg-danger-soft hover:bg-danger-soft/80 border border-danger-border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className={className || defaultStyles}
      title="Sign Out"
      aria-label="Sign Out"
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-current" />
          {showLabel && <span>Signing out...</span>}
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4 shrink-0 text-current" />
          {showLabel && <span>Sign Out</span>}
        </>
      )}
    </button>
  );
}
