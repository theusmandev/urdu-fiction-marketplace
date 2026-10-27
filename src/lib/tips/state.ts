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

export type TipCardState =
  | { status: 'loading' }
  | { status: 'author_own_profile'; message: string; messageUrdu: string; settingsHref: string }
  | { status: 'admin_hidden'; message: string }
  | { status: 'sign_in_required'; message: string; messageUrdu: string; loginUrl: string }
  | { status: 'kill_switch_active'; message: string; messageUrdu: string }
  | { status: 'disabled_by_writer'; message: string; messageUrdu: string }
  | { status: 'writer_ineligible'; message: string; messageUrdu: string }
  | { status: 'no_payment_methods'; message: string; messageUrdu: string }
  | { status: 'rate_limited'; message: string; messageUrdu: string }
  | { status: 'daily_cap_exceeded'; message: string; messageUrdu: string }
  | { status: 'error'; message: string; messageUrdu: string; code?: string }
  | { status: 'ready'; options: import('@/types/database').TipOptionsPayload };

export interface ResolveTipCardStateParams {
  isUserSignedIn: boolean;
  currentUserId?: string | null;
  userRole?: string | null;
  targetWriterId?: string | null;
  payload?: import('@/types/database').TipOptionsPayload | null;
  queryError?: { code?: string; message?: string } | null;
  currentPath?: string;
}

export function resolveTipCardState({
  isUserSignedIn,
  currentUserId,
  userRole,
  targetWriterId,
  payload,
  queryError,
  currentPath = '/tips/new',
}: ResolveTipCardStateParams): TipCardState {
  // 1. Author viewing own content / profile
  if (currentUserId && targetWriterId && currentUserId === targetWriterId) {
    return {
      status: 'author_own_profile',
      message: "Readers see a 'Say thanks' button here.",
      messageUrdu: 'قارئین کو یہاں شکریہ کا بٹن نظر آتا ہے۔',
      settingsHref: '/writer/tips',
    };
  }

  // 2. Admin viewing as admin
  if (userRole === 'admin') {
    return {
      status: 'admin_hidden',
      message: 'Appreciation tipping is not available when browsing as admin.',
    };
  }

  // 3. Database / RPC query error
  if (queryError) {
    return {
      status: 'error',
      message: queryError.message || 'Unable to load appreciation options.',
      messageUrdu: 'شکریہ کے اختیارات لوڈ نہیں ہو سکے۔ برائے مہربانی دوبارہ کوشش کریں۔',
      code: queryError.code,
    };
  }

  // 4. Signed out reader
  if (!isUserSignedIn) {
    return {
      status: 'sign_in_required',
      message: 'Sign in to say thanks to the author.',
      messageUrdu: 'مصنف کو شکریہ کہنے کے لیے لاگ ان کریں۔',
      loginUrl: `/auth/login?next=${encodeURIComponent(currentPath)}`,
    };
  }

  // If no payload received yet
  if (!payload) {
    return {
      status: 'error',
      message: 'Appreciation options unavailable.',
      messageUrdu: 'شکریہ کے اختیارات فی الوقت دستیاب نہیں ہیں۔',
    };
  }

  // 5. Global kill switch off
  if (!payload.tips_enabled) {
    return {
      status: 'kill_switch_active',
      message: 'Reader appreciation tips are temporarily paused platform-wide.',
      messageUrdu: 'پلیٹ فارم پر شکریہ کے تحائف فی الوقت عارضی طور پر موقوف ہیں۔',
    };
  }

  // 6. Writer disabled tips
  if (payload.writer_enabled === false) {
    return {
      status: 'disabled_by_writer',
      message: 'The author has currently turned off appreciation tips.',
      messageUrdu: 'مصنف نے فی الوقت شکریہ کا آپشن بند کر رکھا ہے۔',
    };
  }

  // 7. Writer not eligible (e.g. suspended or pending)
  if (!payload.can_tip && payload.reason?.includes('not eligible')) {
    return {
      status: 'writer_ineligible',
      message: 'This author is not currently eligible to receive appreciation gifts.',
      messageUrdu: 'یہ مصنف فی الوقت تحائف وصول کرنے کے اہل نہیں ہیں۔',
    };
  }

  // 8. No active payment methods
  if (!payload.can_tip && (payload.reason?.includes('no active payment') || !payload.payment_methods || payload.payment_methods.length === 0)) {
    return {
      status: 'no_payment_methods',
      message: 'The author has not yet configured active payment accounts for appreciation.',
      messageUrdu: 'مصنف نے ابھی تک کوئی فعال ادائیگی اکاؤنٹ ترتیب نہیں دیا۔',
    };
  }

  // 9. Specific business limits in reason
  if (!payload.can_tip && payload.reason) {
    if (payload.reason.includes('Hourly tip limit') || payload.reason.includes('rate limit')) {
      return {
        status: 'rate_limited',
        message: 'Hourly tip limit reached. Please wait before sending another tip.',
        messageUrdu: 'فی گھنٹہ شکریہ بھیجنے کی حد مکمل ہو چکی ہے۔ برائے مہربانی کچھ دیر بعد کوشش کریں۔',
      };
    }
    if (payload.reason.includes('Daily tipping cap') || payload.reason.includes('daily')) {
      return {
        status: 'daily_cap_exceeded',
        message: 'Daily appreciation limit reached for your account. Please try again tomorrow.',
        messageUrdu: 'روزانہ شکریہ بھیجنے کی حد مکمل ہو چکی ہے۔ برائے مہربانی کل دوبارہ تشریف لائیں۔',
      };
    }
    return {
      status: 'error',
      message: payload.reason,
      messageUrdu: 'شکریہ کا عمل شروع نہیں ہو سکا۔',
    };
  }

  // 10. Ready
  return {
    status: 'ready',
    options: payload,
  };
}
