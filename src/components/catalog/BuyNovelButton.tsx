"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatPKR } from "@/lib/utils";
import type { HeaderSessionUser } from "@/components/layout/public-header-client";
import { ShoppingBag, Lock, Sparkles, AlertCircle } from "lucide-react";

interface BuyNovelButtonProps {
  novelId: string;
  novelSlug: string;
  pricePkr: number;
}

export function BuyNovelButton({
  novelId,
  novelSlug,
  pricePkr,
}: BuyNovelButtonProps) {
  const [user, setUser] = useState<HeaderSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted) {
          setUser(data?.user ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const isFree = pricePkr === 0;

  // Signed out state: Link to login with return redirect
  if (!loading && !user) {
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <Link
          href={`/login?next=${encodeURIComponent(`/novels/${novelSlug}`)}`}
          className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-semibold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm group"
        >
          <ShoppingBag className="w-4 h-4 text-accent" />
          <span>
            {isFree ? "Sign In to Read Free" : `Sign In to Buy (${formatPKR(pricePkr)})`}
          </span>
        </Link>
        <p className="text-[11px] text-center text-secondary">
          You need a reader account to save this novel in your library.
        </p>
      </div>
    );
  }

  // Free novel state
  if (isFree) {
    return (
      <div className="space-y-2" data-novel-id={novelId}>
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3.5 px-6 rounded-xl shadow-md opacity-90 cursor-default text-sm"
        >
          <Sparkles className="w-4 h-4" />
          <span>Free Novel — 1-Click Enrollment in Step 4.2</span>
        </button>
        <p className="text-[11px] text-center text-secondary">
          Instant library enrollment for free novels will be active in release 4.2.
          You can read free preview chapters immediately below.
        </p>
      </div>
    );
  }

  // Signed in paid novel state (Disabled until Step 4.1 checkout is built)
  return (
    <div className="space-y-2" data-novel-id={novelId}>
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-2 bg-slate-200 text-slate-500 font-semibold py-3.5 px-6 rounded-xl cursor-not-allowed text-sm border border-slate-300"
      >
        <Lock className="w-4 h-4" />
        <span>Checkout opens in release 4.1</span>
      </button>

      <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <span>
          Direct JazzCash / EasyPaisa / Bank checkout opens in Step 4.1. No orders
          are taken until the direct payment verification pipeline is connected.
        </span>
      </div>
    </div>
  );
}
