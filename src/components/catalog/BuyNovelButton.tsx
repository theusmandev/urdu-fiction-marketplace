'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatPKR } from '@/lib/utils';
import { getNovelPurchaseStatusAction } from '@/app/actions/checkout';
import {
  ShoppingBag,
  Lock,
  AlertCircle,
  Clock,
  BookOpen,
  ArrowRight,
  Loader2,
} from 'lucide-react';

interface BuyNovelButtonProps {
  novelId: string;
  novelSlug: string;
  pricePkr: number;
  compact?: boolean;
}

export function BuyNovelButton({
  novelId,
  novelSlug,
  pricePkr,
  compact = false,
}: BuyNovelButtonProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    signedIn: boolean;
    isOwnNovel: boolean;
    isOwned: boolean;
    openOrderNumber: string | null;
  }>({
    signedIn: false,
    isOwnNovel: false,
    isOwned: false,
    openOrderNumber: null,
  });

  useEffect(() => {
    let isMounted = true;
    getNovelPurchaseStatusAction(novelId)
      .then((res) => {
        if (isMounted) {
          setStatus(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [novelId]);

  const isUnavailable = pricePkr < 50;

  // 1. Unavailable state if price is below platform minimum (PKR 50)
  if (isUnavailable) {
    if (compact) {
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
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-400 font-semibold py-3.5 px-6 rounded-xl cursor-not-allowed text-sm border border-slate-200 min-h-[44px]"
        >
          <Lock className="w-4 h-4 text-slate-400" />
          <span>Unavailable / دستیاب نہیں</span>
        </button>
        <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>
            This novel is currently unavailable for purchase (pending pricing adjustment by author).
          </span>
        </div>
      </div>
    );
  }

  // 2. Loading Skeleton state
  if (loading) {
    if (compact) {
      return (
        <button
          type="button"
          disabled
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-surface-muted text-secondary font-semibold py-2 px-3 rounded-xl text-xs border border-border animate-pulse"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold" />
          <span>Loading...</span>
        </button>
      );
    }
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <button
          type="button"
          disabled
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-surface-muted text-secondary font-semibold py-3.5 px-6 rounded-xl text-sm border border-border animate-pulse"
        >
          <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
          <span>Checking availability...</span>
        </button>
      </div>
    );
  }

  // 3. Signed-out state
  if (!status.signedIn) {
    if (compact) {
      return (
        <Link
          href={`/login?next=${encodeURIComponent(`/novels/${novelSlug}`)}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-navy hover:bg-navy-light text-accent font-semibold py-2 px-3 rounded-xl shadow-xs transition-all text-xs"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-accent" />
          <span>Sign In to Buy</span>
        </Link>
      );
    }
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <Link
          href={`/login?next=${encodeURIComponent(`/novels/${novelSlug}`)}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-semibold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm group cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 text-accent" />
          <span>Sign In to Buy ({formatPKR(pricePkr)})</span>
        </Link>
        <p className="text-[11px] text-center text-secondary">
          You need a reader account to save this novel in your library.
        </p>
      </div>
    );
  }

  // 4. Author of their own novel
  if (status.isOwnNovel) {
    if (compact) {
      return (
        <Link
          href={`/read/${novelSlug}/1`}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2 px-3 rounded-xl text-xs shadow-xs"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Read (Author)</span>
        </Link>
      );
    }
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <Link
          href={`/read/${novelSlug}/1`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-3.5 px-6 rounded-xl text-sm transition-all shadow-md cursor-pointer"
        >
          <BookOpen className="w-4 h-4" />
          <span>Read Novel (Author View)</span>
        </Link>
        <p className="text-[11px] text-center text-secondary">
          Manage this book in your{' '}
          <Link href="/writer/novels" className="text-navy font-semibold underline">
            Writer Studio
          </Link>
          .
        </p>
      </div>
    );
  }

  // 5. Already owns the novel
  if (status.isOwned) {
    if (compact) {
      return (
        <Link
          href={`/read/${novelSlug}/1`}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-xl shadow-xs text-xs"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Read Novel</span>
        </Link>
      );
    }
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <Link
          href={`/read/${novelSlug}/1`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm cursor-pointer"
        >
          <BookOpen className="w-4 h-4" />
          <span>Read Novel / ناول پڑھیں</span>
        </Link>
        <p className="text-[11px] text-center text-emerald-700 font-medium">
          Full novel access unlocked. Access anytime in your{' '}
          <Link href="/library" className="underline font-bold">
            library
          </Link>
          .
        </p>
      </div>
    );
  }

  // 6. Open order in progress
  if (status.openOrderNumber) {
    if (compact) {
      return (
        <Link
          href={`/orders/${status.openOrderNumber}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2 px-3 rounded-xl shadow-xs text-xs"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>View Order</span>
        </Link>
      );
    }
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <Link
          href={`/orders/${status.openOrderNumber}`}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm cursor-pointer"
        >
          <Clock className="w-4 h-4" />
          <span>View Your Order ({status.openOrderNumber})</span>
        </Link>
        <p className="text-[11px] text-center text-secondary">
          You have an active or pending order for this novel. Click to view instructions.
        </p>
      </div>
    );
  }

  // 7. Ready to Checkout
  if (compact) {
    return (
      <Link
        href={`/checkout/${novelSlug}`}
        className="w-full min-h-[44px] flex items-center justify-center gap-1.5 bg-navy hover:bg-navy-light text-accent font-semibold py-2 px-3 rounded-xl shadow-xs text-xs"
      >
        <ShoppingBag className="w-3.5 h-3.5 text-accent" />
        <span>Buy Now</span>
        <ArrowRight className="w-3.5 h-3.5 text-accent" />
      </Link>
    );
  }

  return (
    <div className="space-y-2" data-novel-id={novelId}>
      <Link
        href={`/checkout/${novelSlug}`}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-semibold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm group cursor-pointer"
      >
        <ShoppingBag className="w-4 h-4 text-accent" />
        <span>Buy Now ({formatPKR(pricePkr)})</span>
        <ArrowRight className="w-4 h-4 text-accent transition-transform group-hover:translate-x-1" />
      </Link>
      <p className="text-[11px] text-center text-secondary">
        Direct writer bank/wallet transfer with receipt verification.
      </p>
    </div>
  );
}
