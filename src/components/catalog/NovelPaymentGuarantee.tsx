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
      <div className="md:hidden bg-ivory/60 p-4 rounded-xl border border-border text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-navy">
          <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
          <span>Direct Writer Payment Guarantee</span>
        </div>
        <p className="text-secondary leading-relaxed text-[11px]">
          You pay the writer directly via JazzCash, EasyPaisa, or Raast. Access unlocks once verified by the author. Zero platform fees.
        </p>
      </div>
    );
  }

  return (
    <div className="hidden md:block w-full max-w-[280px] mx-auto bg-ivory/60 p-4 rounded-xl border border-border text-xs space-y-2">
      <div className="flex items-center gap-1.5 font-semibold text-navy">
        <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
        <span>Direct Writer Payment Guarantee</span>
      </div>
      <p className="text-secondary leading-relaxed text-[11px]">
        You pay the writer directly into their verified JazzCash, EasyPaisa,
        Raast, or Bank IBAN. Access to all locked chapters is granted as soon
        as the author verifies receipt. The platform holds zero customer funds.
      </p>
    </div>
  );
}
