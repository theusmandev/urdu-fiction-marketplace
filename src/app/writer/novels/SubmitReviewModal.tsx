'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitNovelForReviewAction } from '@/app/actions/writer';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  Loader2,
  X,
  FileText,
  CreditCard,
  Image as ImageIcon,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';

export interface NovelChecklistData {
  id: string;
  title_urdu: string;
  title_english: string;
  synopsis_urdu: string;
  cover_url: string | null;
  rights_declaration_accepted: boolean;
  price_pkr: number;
  genres_count: number;
  published_chapters_count: number;
  active_payment_methods_count: number;
  status: string;
}

interface SubmitReviewModalProps {
  novel: NovelChecklistData;
  isOpen: boolean;
  onClose: () => void;
}

export function SubmitReviewModal({
  novel,
  isOpen,
  onClose,
}: SubmitReviewModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Evaluate checklist items
  const checks = [
    {
      id: 'title_urdu',
      label: 'Urdu Title provided',
      passed: Boolean(novel.title_urdu && novel.title_urdu.trim().length >= 2),
      icon: FileText,
      fixPath: `/writer/novels/${novel.id}/edit`,
    },
    {
      id: 'title_english',
      label: 'English Title provided',
      passed: Boolean(novel.title_english && novel.title_english.trim().length >= 2),
      icon: FileText,
      fixPath: `/writer/novels/${novel.id}/edit`,
    },
    {
      id: 'synopsis',
      label: 'Urdu Synopsis (at least 10 characters)',
      passed: Boolean(novel.synopsis_urdu && novel.synopsis_urdu.trim().length >= 10),
      icon: FileText,
      fixPath: `/writer/novels/${novel.id}/edit`,
    },
    {
      id: 'cover',
      label: 'Cover Art Image uploaded',
      passed: Boolean(novel.cover_url),
      icon: ImageIcon,
      fixPath: `/writer/novels/${novel.id}/edit`,
    },
    {
      id: 'rights',
      label: 'Copyright & Distribution Declaration accepted',
      passed: Boolean(novel.rights_declaration_accepted),
      icon: ShieldCheck,
      fixPath: `/writer/novels/${novel.id}/edit`,
    },
    {
      id: 'genre',
      label: 'At least one Genre categorized',
      passed: novel.genres_count > 0,
      icon: BookOpen,
      fixPath: `/writer/novels/${novel.id}/edit`,
    },
    {
      id: 'chapter',
      label: 'At least one Chapter marked as Published',
      passed: novel.published_chapters_count > 0,
      icon: BookOpen,
      fixPath: `/writer/novels/${novel.id}/chapters`,
    },
    {
      id: 'payment',
      label: novel.price_pkr > 0
        ? 'At least one active payout account (JazzCash/EasyPaisa/Raast/Bank)'
        : 'Free novel (no payout method required)',
      passed: novel.price_pkr === 0 || novel.active_payment_methods_count > 0,
      icon: CreditCard,
      fixPath: '/writer/payment-methods',
    },
  ];

  const allPassed = checks.every((c) => c.passed);

  const handleSubmit = async () => {
    if (!allPassed) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await submitNovelForReviewAction(novel.id);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to submit novel for review.');
    } else {
      onClose();
      router.refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-surface rounded-2xl border border-border max-w-lg w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
              <Send className="w-4 h-4 text-accent" />
              Submit for Editorial Review
            </h3>
            <p className="text-xs text-secondary mt-0.5 font-urdu text-right" dir="rtl">
              ناول برائے اداری جائزہ: {novel.title_urdu}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-secondary hover:text-navy hover:bg-ivory"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs text-secondary leading-relaxed">
            Please ensure all publishing prerequisites below are satisfied before sending this manuscript to our editorial board:
          </p>

          <div className="rounded-xl border border-border bg-ivory/50 divide-y divide-border overflow-hidden text-xs">
            {checks.map((item) => (
              <div
                key={item.id}
                className="p-3 flex items-center justify-between gap-3"
              >
                  <div className="flex items-center gap-2.5">
                    {item.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span
                      className={
                        item.passed
                          ? 'text-main font-medium'
                          : 'text-rose-700 font-semibold'
                      }
                    >
                      {item.label}
                    </span>
                  </div>

                  {!item.passed && (
                    <a
                      href={item.fixPath}
                      className="text-[11px] font-semibold text-accent hover:underline shrink-0"
                    >
                      Fix Now &rarr;
                    </a>
                  )}
                </div>
              ))}
          </div>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!allPassed || isSubmitting}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Submitting to Admins...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Submit for Review</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
