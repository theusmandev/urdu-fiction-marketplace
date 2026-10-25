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
      defaultStyles =
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800/60 border border-slate-700/80 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
    case 'writer':
      defaultStyles =
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-navy-light/60 hover:bg-rose-950/40 hover:text-rose-300 border border-navy-light hover:border-rose-900/50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
    case 'dropdown':
      defaultStyles =
        'flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
    case 'icon':
      defaultStyles =
        'p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
      break;
    case 'marketplace':
    default:
      defaultStyles =
        'flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
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
