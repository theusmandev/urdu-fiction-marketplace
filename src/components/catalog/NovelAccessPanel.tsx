'use client';

import React from 'react';
import Link from 'next/link';
import { formatPKR } from '@/lib/utils';
import { useNovelAccess } from './NovelAccessContext';
import { getContinueReadingInfo } from '@/lib/catalog/access-helpers';
import { UrduText } from '@/components/urdu/UrduText';
import {
  ShoppingBag,
  Lock,
  AlertCircle,
  Clock,
  BookOpen,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Feather,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

export interface NovelAccessPanelProps {
  novelId: string;
  novelSlug: string;
  pricePkr: number;
  freePreviewChapterNumber?: number | null;
  compact?: boolean;
}

export function NovelAccessPanel({
  novelId,
  novelSlug,
  pricePkr,
  freePreviewChapterNumber,
  compact = false,
}: NovelAccessPanelProps) {
  const { state, signedIn, orderNumber, lastReadChapterNumber, isLoading } = useNovelAccess();
  const isUnavailable = pricePkr < 50;

  const continueInfo = getContinueReadingInfo(lastReadChapterNumber);

  // 1. Loading Skeleton: prevents any flash of wrong state
  if (isLoading) {
    if (compact) {
      return (
        <div className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-surface-muted text-secondary rounded-xl border border-border animate-pulse px-3 py-2 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold" />
          <span>Loading access...</span>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-4 bg-slate-200 rounded w-16" />
          <div className="h-6 bg-slate-200 rounded w-24" />
        </div>
        <div className="h-11 bg-slate-200 rounded-xl w-full" />
        <div className="h-9 bg-slate-100 rounded-xl w-full" />
      </div>
    );
  }

  // 2. Compact Mode (Mobile Sticky Bottom Bar)
  if (compact) {
    if (isUnavailable) {
      return (
        <button
          type="button"
          disabled
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-slate-100 text-slate-400 font-semibold py-2 px-3 rounded-xl cursor-not-allowed text-xs border border-slate-200"
        >
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span>Unavailable</span>
        </button>
      );
    }

    if (state === 'owner_buyer') {
      return (
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">You own this novel</span>
            </div>
            <div className="text-[10px] text-secondary truncate">Full access unlocked</div>
          </div>
          <Link
            href={`/read/${novelSlug}/${continueInfo.chapterNumber}`}
            className="shrink-0 min-h-[44px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl shadow-xs text-xs"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{continueInfo.isContinue ? `Continue (Ch ${continueInfo.chapterNumber})` : 'Start Reading'}</span>
          </Link>
        </div>
      );
    }

    if (state === 'author') {
      return (
        <div className="flex items-center justify-between gap-2 w-full">
          <Link
            href="/writer/novels"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 bg-navy text-accent font-semibold py-2 px-2.5 rounded-xl text-xs"
          >
            <Feather className="w-3.5 h-3.5 shrink-0" />
            <span>Studio</span>
          </Link>
          <Link
            href={`/read/${novelSlug}/${lastReadChapterNumber ?? 1}`}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2 px-2.5 rounded-xl text-xs"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Read as Author</span>
          </Link>
        </div>
      );
    }

    if (state === 'admin') {
      return (
        <div className="flex items-center justify-between gap-2 w-full">
          <Link
            href={`/admin/novels/${novelId}`}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 bg-navy text-accent font-semibold py-2 px-2.5 rounded-xl text-xs"
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Review</span>
          </Link>
          <Link
            href={`/read/${novelSlug}/${lastReadChapterNumber ?? 1}`}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2 px-2.5 rounded-xl text-xs"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Read</span>
          </Link>
        </div>
      );
    }

    if (state === 'pending_verification' || state === 'rejected' || state === 'disputed') {
      return (
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-brand-gold truncate">
              {state === 'pending_verification'
                ? 'Payment Pending'
                : state === 'rejected'
                ? 'Payment Rejected'
                : 'Order Disputed'}
            </div>
            <div className="text-[10px] text-secondary truncate">
              {orderNumber ? `Order #${orderNumber}` : 'Tap to inspect'}
            </div>
          </div>
          <Link
            href={orderNumber ? `/orders/${orderNumber}` : '/orders'}
            className="shrink-0 min-h-[44px] flex items-center justify-center gap-1.5 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2 px-4 rounded-xl text-xs"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>View Order</span>
          </Link>
        </div>
      );
    }

    // Default visitor in compact mode
    return (
      <div className="flex items-center justify-between gap-3 w-full">
        <div>
          <div className="text-[10px] text-secondary font-medium">Price / قیمت</div>
          <div className="font-serif text-lg font-bold text-navy leading-tight">
            {formatPKR(pricePkr)}
          </div>
        </div>
        <Link
          href={
            signedIn
              ? `/checkout/${novelSlug}`
              : `/login?next=${encodeURIComponent(`/novels/${novelSlug}`)}`
          }
          className="flex-1 max-w-[210px] min-h-[44px] flex items-center justify-center gap-1.5 bg-navy hover:bg-navy-light text-accent font-semibold py-2 px-4 rounded-xl shadow-xs text-xs"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-accent" />
          <span>{signedIn ? 'Buy Now' : 'Sign In to Buy'}</span>
          <ArrowRight className="w-3.5 h-3.5 text-accent" />
        </Link>
      </div>
    );
  }

  // 3. Desktop Card Mode: State-by-State Rendering

  // A. Unavailable Novel
  if (isUnavailable) {
    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-secondary">Price / قیمت:</span>
          <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
            Unavailable
          </span>
        </div>
        <button
          type="button"
          disabled
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-slate-100 text-slate-400 font-semibold py-3 px-4 rounded-xl cursor-not-allowed text-sm border border-slate-200"
        >
          <Lock className="w-4 h-4 text-slate-400" />
          <span>Unavailable / دستیاب نہیں</span>
        </button>
        <p className="text-[11px] text-secondary text-center">
          This novel is currently unavailable for purchase.
        </p>
      </div>
    );
  }

  // B. Owner Buyer State (NO price, NO payment-guarantee card)
  if (state === 'owner_buyer') {
    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-emerald-800 bg-emerald-100/70 p-2.5 rounded-xl border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <span className="font-bold text-xs block">You own this novel</span>
            <UrduText as="span" size="xs" className="text-emerald-900 block py-0 leading-tight font-normal">
              آپ کے پاس مکمل رسائی ہے
            </UrduText>
          </div>
        </div>

        <Link
          href={`/read/${novelSlug}/${continueInfo.chapterNumber}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all text-sm cursor-pointer"
        >
          <BookOpen className="w-4 h-4" />
          <span>{continueInfo.labelEn}</span>
        </Link>

        <div className="pt-1 text-center">
          <Link
            href="/library"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-navy hover:text-accent-dark transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-secondary" />
            <span>Open in My Library</span>
          </Link>
        </div>
      </div>
    );
  }

  // C. Author State
  if (state === 'author') {
    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-amber-900 bg-amber-100/70 p-2.5 rounded-xl border border-amber-200">
          <Feather className="w-4 h-4 text-amber-700 shrink-0" />
          <span className="font-bold text-xs">Author View / مصنف</span>
        </div>

        <Link
          href="/writer/novels"
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all text-sm"
        >
          <Feather className="w-4 h-4" />
          <span>Edit in Writer Studio</span>
        </Link>

        <Link
          href={`/read/${novelSlug}/${lastReadChapterNumber ?? 1}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2.5 px-4 rounded-xl transition-all text-xs"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Read as Author</span>
        </Link>
      </div>
    );
  }

  // D. Admin State
  if (state === 'admin') {
    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-rose-900 bg-rose-100/70 p-2.5 rounded-xl border border-rose-200">
          <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
          <span className="font-bold text-xs">Admin View / منتظم</span>
        </div>

        <Link
          href={`/admin/novels/${novelId}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all text-sm"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Review in Admin</span>
        </Link>

        <Link
          href={`/read/${novelSlug}/${lastReadChapterNumber ?? 1}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2.5 px-4 rounded-xl transition-all text-xs"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Read as Admin</span>
        </Link>
      </div>
    );
  }

  // E. Pending Verification State
  if (state === 'pending_verification') {
    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-sm space-y-4">
        <div className="space-y-1.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <Clock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Waiting for writer verification</span>
          </div>
          <UrduText as="p" size="xs" className="text-amber-800 leading-tight py-0 font-normal">
            مصنف کی جانب سے ادائیگی کی تصدیق کا انتظار ہے۔
          </UrduText>
        </div>

        <Link
          href={orderNumber ? `/orders/${orderNumber}` : '/orders'}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all text-sm"
        >
          <Clock className="w-4 h-4" />
          <span>View your order</span>
        </Link>

        {freePreviewChapterNumber != null && (
          <Link
            href={`/novels/${novelSlug}/read/${freePreviewChapterNumber}`}
            className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-accent/20 hover:bg-accent/30 text-navy font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Read free sample (Ch {freePreviewChapterNumber})</span>
          </Link>
        )}
      </div>
    );
  }

  // F. Rejected / Disputed State
  if (state === 'rejected' || state === 'disputed') {
    return (
      <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-sm space-y-4">
        <div className="space-y-1.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>
              {state === 'rejected'
                ? 'Payment proof was rejected'
                : 'Order is under dispute review'}
            </span>
          </div>
          <p className="text-[11px] text-rose-800 leading-normal">
            {state === 'rejected'
              ? 'The author was unable to verify your bank deposit. Please check remarks.'
              : 'Our mediation team is actively reviewing payment evidence.'}
          </p>
        </div>

        <Link
          href={orderNumber ? `/orders/${orderNumber}` : '/orders'}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all text-sm"
        >
          <span>View your order</span>
        </Link>

        {freePreviewChapterNumber != null && (
          <Link
            href={`/novels/${novelSlug}/read/${freePreviewChapterNumber}`}
            className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-accent/20 hover:bg-accent/30 text-navy font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Read free sample (Ch {freePreviewChapterNumber})</span>
          </Link>
        )}
      </div>
    );
  }

  // G. Visitor State (Prospective Buyer)
  return (
    <div className="w-full max-w-[280px] mx-auto bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-secondary">Price / قیمت:</span>
        <span className="font-serif text-2xl font-bold text-navy">
          {formatPKR(pricePkr)}
        </span>
      </div>

      <Link
        href={
          signedIn
            ? `/checkout/${novelSlug}`
            : `/login?next=${encodeURIComponent(`/novels/${novelSlug}`)}`
        }
        className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-semibold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm group cursor-pointer"
      >
        <ShoppingBag className="w-4 h-4 text-accent" />
        <span>{signedIn ? 'Buy Now' : 'Sign In to Buy'}</span>
        <ArrowRight className="w-4 h-4 text-accent transition-transform group-hover:translate-x-1" />
      </Link>

      {freePreviewChapterNumber != null && (
        <div className="pt-1">
          <Link
            href={`/novels/${novelSlug}/read/${freePreviewChapterNumber}`}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-accent/20 hover:bg-accent/30 text-navy font-semibold py-2.5 px-4 rounded-xl transition-colors text-xs text-center"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Read free sample (Chapter {freePreviewChapterNumber})</span>
          </Link>
        </div>
      )}
    </div>
  );
}
