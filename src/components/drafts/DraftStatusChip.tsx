'use client';

import React from 'react';
import type { SyncStatus } from '@/lib/drafts/sync-engine';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  AlertTriangle,
  RotateCw,
  HardDrive,
  Lock,
  Layers,
} from 'lucide-react';

interface DraftStatusChipProps {
  status: SyncStatus;
  lastSyncedAt: string | null;
  onSyncNow: () => void;
  onOpenDeviceDrafts?: () => void;
  onOpenConflictModal?: () => void;
  isLockedByOtherTab?: boolean;
}

export function DraftStatusChip({
  status,
  lastSyncedAt,
  onSyncNow,
  onOpenDeviceDrafts,
  onOpenConflictModal,
  isLockedByOtherTab = false,
}: DraftStatusChipProps) {
  // Format cloud sync time e.g. "14:25"
  const formattedSyncTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (isLockedByOtherTab) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-warning/10 text-accent-strong border border-warning-border/20"
        aria-live="polite"
      >
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[130px] sm:max-w-none">Open in another tab</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Main Status Badge */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          status === 'syncing'
            ? 'bg-info/10 text-info-text border-info-border/30'
            : status === 'synced'
            ? 'bg-success/10 text-success border-success-border/20'
            : status === 'saved_local'
            ? 'bg-surface-muted text-text-muted border-border'
            : status === 'offline'
            ? 'bg-warning/10 text-accent-strong border-warning-border/20'
            : status === 'conflict'
            ? 'bg-danger/10 text-danger-text border-danger-border/20 animate-pulse cursor-pointer'
            : status === 'auth_expired'
            ? 'bg-info-soft text-info-text border-info-border/30'
            : 'bg-surface/60 text-secondary border-border'
        }`}
        aria-live="polite"
        onClick={status === 'conflict' ? onOpenConflictModal : undefined}
        role={status === 'conflict' ? 'button' : undefined}
      >
        {status === 'syncing' && <RotateCw className="w-3.5 h-3.5 animate-spin shrink-0 text-info-text" />}
        {status === 'synced' && <Cloud className="w-3.5 h-3.5 shrink-0 text-success" />}
        {status === 'saved_local' && <HardDrive className="w-3.5 h-3.5 shrink-0 text-text-muted" />}
        {status === 'offline' && <CloudOff className="w-3.5 h-3.5 shrink-0 text-accent-strong" />}
        {status === 'conflict' && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-danger-text" />}
        {status === 'auth_expired' && <Lock className="w-3.5 h-3.5 shrink-0 text-info-text" />}
        {status === 'idle' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-secondary" />}

        <span className="text-[11px] sm:text-xs font-sans whitespace-nowrap">
          {status === 'syncing' && 'Syncing…'}
          {status === 'synced' && (formattedSyncTime ? `Saved to cloud ${formattedSyncTime}` : 'Saved to cloud')}
          {status === 'saved_local' && 'Saved on this device'}
          {status === 'offline' && 'Offline — saved on this device'}
          {status === 'conflict' && 'Conflict — action needed'}
          {status === 'auth_expired' && 'Sign in to sync'}
          {status === 'error' && 'Saved on this device'}
          {status === 'idle' && 'Saved on this device'}
        </span>
      </div>

      {/* Sync Now Button (when not syncing or in conflict) */}
      {status !== 'syncing' && status !== 'conflict' && (
        <button
          type="button"
          onClick={onSyncNow}
          className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-secondary hover:text-navy hover:bg-ivory border border-border transition-colors"
          title="Force sync draft to cloud"
        >
          <RotateCw className="w-3 h-3" />
          <span>Sync now</span>
        </button>
      )}

      {/* Drafts on device list launcher */}
      {onOpenDeviceDrafts && (
        <button
          type="button"
          onClick={onOpenDeviceDrafts}
          className="inline-flex items-center gap-1 p-1 sm:px-2 sm:py-1 rounded-md text-[11px] font-medium text-secondary hover:text-navy hover:bg-ivory border border-border transition-colors"
          title="View all drafts stored on this device"
        >
          <Layers className="w-3 h-3" />
          <span className="hidden md:inline">Drafts on device</span>
        </button>
      )}
    </div>
  );
}
