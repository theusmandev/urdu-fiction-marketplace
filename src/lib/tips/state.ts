import type { TipStatus } from '@/types/database';

export interface TipCardVisibilityContext {
  isUserSignedIn: boolean;
  isAuthor: boolean;
  isAdmin: boolean;
  isTipsEnabled: boolean;
  isLockedScreen?: boolean;
  hasReadSomething?: boolean;
}

/**
 * Determines whether <TipCard> should be visible.
 * Product Invariants:
 * - Reader must be signed in
 * - Writer has enabled tips and platform kill-switch is active
 * - NEVER shown for the author themself
 * - NEVER shown for admins viewing as admin
 * - NEVER shown on locked content screens
 * - NEVER shown before the reader has read something (e.g. at least chapter end or novel TOC reached)
 */
export function shouldShowTipCard({
  isUserSignedIn,
  isAuthor,
  isAdmin,
  isTipsEnabled,
  isLockedScreen = false,
  hasReadSomething = true,
}: TipCardVisibilityContext): boolean {
  if (!isUserSignedIn) return false;
  if (!isTipsEnabled) return false;
  if (isAuthor) return false;
  if (isAdmin) return false;
  if (isLockedScreen) return false;
  if (!hasReadSomething) return false;
  return true;
}

export interface TipStatusMeta {
  label: string;
  urduLabel: string;
  badgeClass: string;
  iconName: string;
}

export function getTipStatusMeta(status: TipStatus): TipStatusMeta {
  switch (status) {
    case 'pending_payment':
      return {
        label: 'Awaiting Payment',
        urduLabel: 'ادائیگی کا انتظار',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
        iconName: 'Clock',
      };
    case 'payment_submitted':
      return {
        label: 'Sent — Awaiting Confirmation',
        urduLabel: 'تصدیق کا انتظار',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40',
        iconName: 'Send',
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        urduLabel: 'قبول شدہ',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
        iconName: 'CheckCircle2',
      };
    case 'not_received':
      return {
        label: 'Not Received',
        urduLabel: 'موصول نہیں ہوئی',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40',
        iconName: 'AlertCircle',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        urduLabel: 'منسوخ شدہ',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        iconName: 'XCircle',
      };
    case 'expired':
      return {
        label: 'Expired',
        urduLabel: 'میعاد ختم',
        badgeClass: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        iconName: 'Clock',
      };
  }
}
