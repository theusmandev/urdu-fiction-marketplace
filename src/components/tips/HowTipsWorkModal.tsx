'use client';

import React, { useEffect } from 'react';
import { X, Heart, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';
import { HOW_TIPS_WORK } from '@/lib/copy/tips';

interface HowTipsWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowTipsWorkModal({ isOpen, onClose }: HowTipsWorkModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-tips-work-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-navy/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-surface border border-gold-200/60 dark:border-gold-900/40 rounded-2xl shadow-xl overflow-hidden z-10">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/40 flex items-center justify-between bg-warning-soft/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-warning-soft/80 text-warning-text">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h2 id="how-tips-work-title" className="text-base font-semibold text-main">
                {HOW_TIPS_WORK.title}
              </h2>
              <UrduText as="p" size="xs" className="text-secondary py-0">
                {HOW_TIPS_WORK.titleUrdu}
              </UrduText>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-secondary hover:text-main hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
          {/* Honest Disclosure Box */}
          <div className="p-4 rounded-xl bg-warning-soft/70 border border-warning-border/60">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-warning-text dark:text-accent-strong shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-warning-text">
                  {HOW_TIPS_WORK.honestLine}
                </p>
                <UrduText as="p" size="xs" className="text-warning-text/80 py-0">
                  {HOW_TIPS_WORK.honestLineUrdu}
                </UrduText>
              </div>
            </div>
          </div>

          {/* Principle 1: 100% to author */}
          <div className="flex items-start gap-3 pt-2">
            <div className="p-1.5 rounded-lg bg-success-soft/80 text-success-text dark:text-success shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-main">{HOW_TIPS_WORK.points.zeroCommission}</h3>
              <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                {HOW_TIPS_WORK.points.zeroCommissionDesc}
              </p>
            </div>
          </div>

          {/* Principle 2: Voluntary gift, unlocks nothing */}
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-info-soft/80 text-info-text dark:text-info-text shrink-0 mt-0.5">
              <Heart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-main">{HOW_TIPS_WORK.points.giftOnly}</h3>
              <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                {HOW_TIPS_WORK.points.giftOnlyDesc}
              </p>
            </div>
          </div>

          {/* Principle 3: Author confirms directly */}
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-info-soft/80 text-info-text dark:text-info-text shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-medium text-main">{HOW_TIPS_WORK.points.directConfirmation}</h3>
              <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                {HOW_TIPS_WORK.points.directConfirmationDesc}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/40 bg-surface-elevated/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-main text-surface font-medium hover:bg-main/90 transition-colors text-sm min-h-[44px] min-w-[44px]"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
