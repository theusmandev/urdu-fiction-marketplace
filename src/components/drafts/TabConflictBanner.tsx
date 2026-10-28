'use client';

import React from 'react';
import { Lock, ArrowRightLeft } from 'lucide-react';

interface TabConflictBannerProps {
  isLocked: boolean;
  onTakeOver: () => void;
}

export function TabConflictBanner({ isLocked, onTakeOver }: TabConflictBannerProps) {
  if (!isLocked) return null;

  return (
    <div className="bg-warning/10 border-b border-warning-border/20 px-4 py-2.5 text-xs text-warning-text flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-accent-strong shrink-0" />
        <span>
          <strong>This chapter is open in another tab.</strong> This tab is currently read-only to prevent editing conflicts.
        </span>
      </div>

      <button
        type="button"
        onClick={onTakeOver}
        className="px-3 py-1 rounded-lg bg-warning text-white font-semibold hover:bg-warning transition-colors shadow-sm flex items-center gap-1.5 shrink-0"
      >
        <ArrowRightLeft className="w-3 h-3" />
        <span>Take over editing</span>
      </button>
    </div>
  );
}
