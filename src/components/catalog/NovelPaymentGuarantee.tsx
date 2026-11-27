'use client';

import React from 'react';
import { useNovelAccess } from './NovelAccessContext';
import { ShieldCheck } from 'lucide-react';

interface NovelPaymentGuaranteeProps {
  compact?: boolean;
}

export function NovelPaymentGuarantee({ compact = false }: NovelPaymentGuaranteeProps) {
  const { state, isLoading } = useNovelAccess();

  // Strictly hidden for owners, authors, and admins
  if (!isLoading && state !== 'visitor') {
    return null;
  }

  if (compact) {
    return (
      <div className="md:hidden bg-accent/10 border border-accent/20 px-4 py-3 rounded-xl space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-navy text-xs">
          <ShieldCheck className="w-4 h-4 text-accent-strong shrink-0" />
          <span>Direct Writer Payment Guarantee</span>
        </div>
        <p className="text-secondary text-[11px] leading-relaxed">
          Pay the author directly via JazzCash, EasyPaisa, or Raast — zero platform fee.
        </p>
        <p
          dir="rtl"
          lang="ur"
          className="font-urdu text-xs text-navy/90 leading-normal pt-0.5"
        >
          ادائیگی براہِ راست مصنف کو — کوئی پلیٹ فارم فیس نہیں۔
        </p>
      </div>
    );
  }

  return (
    <div className="hidden md:block w-full max-w-[280px] mx-auto bg-accent/10 border border-accent/20 px-4 py-3 rounded-xl text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold text-navy">
        <ShieldCheck className="w-4 h-4 text-accent-strong shrink-0" />
        <span>Direct Writer Payment Guarantee</span>
      </div>
      <p className="text-secondary text-[11px] leading-relaxed">
        Pay the author directly via JazzCash, EasyPaisa, or Raast — zero platform fee. Access unlocks once verified by the author.
      </p>
      <p
        dir="rtl"
        lang="ur"
        className="font-urdu text-xs text-navy/90 leading-normal pt-0.5"
      >
        ادائیگی براہِ راست مصنف کو — کوئی پلیٹ فارم فیس نہیں۔
      </p>
    </div>
  );
}
