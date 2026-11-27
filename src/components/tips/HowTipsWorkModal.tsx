'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface HowTipsWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowTipsWorkModal({ isOpen, onClose }: HowTipsWorkModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-tips-work-title"
      data-reader-ui="true"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-navy/60 backdrop-blur-xs animate-in fade-in duration-200 reader-ui-chrome"
    >
      {/* Backdrop click dismissal */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal / Mobile Bottom Sheet Card */}
      <div className="relative w-full sm:max-w-md bg-surface border-t sm:border border-border/80 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 max-h-[85dvh] sm:max-h-[90vh] flex flex-col pb-safe">
        {/* Mobile top drag indicator pill */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-border-subtle" aria-hidden="true" />
        </div>

        {/* 1. Non-scrolling sticky/fixed header */}
        <div className="px-5 py-3 sm:py-3.5 border-b border-border/60 flex items-center justify-between bg-warning-soft/30 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-accent-soft text-accent-strong shrink-0">
              <Heart className="w-4 h-4 fill-accent-strong/20" />
            </div>
            <div className="min-w-0">
              <h2
                id="how-tips-work-title"
                className="text-sm sm:text-base font-semibold text-text leading-tight truncate"
              >
                How reader appreciation works
              </h2>
              <p
                dir="rtl"
                lang="ur"
                className="font-urdu text-xs text-text-muted mt-0.5 leading-tight"
              >
                مصنف کے لیے شکریہ کا طریقہ کار
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Independently scrollable body */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 min-h-0 text-sm">
          {/* Point 1: 100% Direct to the author */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="p-1.5 rounded-lg bg-success-soft text-success-text shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text">
                  100% Direct to the author
                </h3>
                <span dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted">
                  ۱۰۰٪ براہِ راست مصنف کو
                </span>
              </div>
              <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
                You transfer funds directly to the author&apos;s own Pakistani account (JazzCash, EasyPaisa, Raast, or Bank). The platform takes 0% fee.
              </p>
              <p dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted/90 leading-normal">
                پوری رقم بغیر کسی کٹوتی کے براہِ راست مصنف کے اکاؤنٹ میں منتقل ہوتی ہے۔
              </p>
            </div>
          </div>

          {/* Point 2: Voluntary gift, unlocks nothing */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="p-1.5 rounded-lg bg-accent-soft text-accent-strong shrink-0 mt-0.5">
              <Heart className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text">
                  Voluntary Gift — Unlocks nothing
                </h3>
                <span dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted">
                  خالصتاً تحفہ
                </span>
              </div>
              <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
                A tip is an optional personal gesture of thanks. It does not unlock novel chapters or grant special reading privileges.
              </p>
              <p dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted/90 leading-normal">
                شکریہ کہنا اختیاری ہے، اس سے کوئی ناول یا باب ان لاک نہیں ہوتا۔
              </p>
            </div>
          </div>

          {/* Point 3: Direct Verification */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-muted/40 border border-border/60">
            <div className="p-1.5 rounded-lg bg-info-soft text-info-text shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text">
                  Direct Verification
                </h3>
                <span dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted">
                  براہِ راست تصدیق
                </span>
              </div>
              <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
                After you submit your payment TID, the author verifies the deposit in their account and sends you an appreciation response.
              </p>
              <p dir="rtl" lang="ur" className="font-urdu text-xs text-text-muted/90 leading-normal">
                مصنف اپنے اکاؤنٹ میں رقم کی تصدیق کے بعد شکریہ کا جوابی پیغام بھیجتے ہیں۔
              </p>
            </div>
          </div>
        </div>

        {/* 3. Sticky footer */}
        <div className="p-4 border-t border-border/60 bg-surface flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-primary-contrast font-semibold hover:bg-primary-hover active:bg-primary-active transition-all text-sm min-h-[44px] shadow-xs cursor-pointer"
          >
            I understand
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
