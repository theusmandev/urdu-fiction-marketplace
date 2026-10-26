'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { PublicNovelChapterMeta } from '@/types/database';
import { useNovelAccess } from './NovelAccessContext';
import { getChapterRowType } from '@/lib/catalog/access-helpers';
import { UrduText } from '@/components/urdu/UrduText';
import { formatPKR } from '@/lib/utils';
import {
  BookOpen,
  Lock,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Check,
  Bookmark,
  X,
  ShoppingBag,
  Clock,
  AlertCircle,
} from 'lucide-react';

export interface NovelTocProps {
  novelSlug: string;
  pricePkr: number;
  chapters: PublicNovelChapterMeta[];
}

export function NovelToc({ novelSlug, pricePkr, chapters }: NovelTocProps) {
  const { state, signedIn, orderNumber, lastReadChapterNumber } = useNovelAccess();
  const [selectedLockedChapter, setSelectedLockedChapter] =
    useState<PublicNovelChapterMeta | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenLockedModal = (
    chapter: PublicNovelChapterMeta,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    triggerRef.current = e.currentTarget;
    setSelectedLockedChapter(chapter);
  };

  const handleCloseModal = useCallback(() => {
    setSelectedLockedChapter(null);
    // Restore focus to triggering chapter button
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 50);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!selectedLockedChapter) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLockedChapter, handleCloseModal]);

  // Focus modal primary action when opened
  useEffect(() => {
    if (selectedLockedChapter && modalRef.current) {
      const focusable = modalRef.current.querySelector<HTMLElement>(
        'button, [href], input'
      );
      focusable?.focus();
    }
  }, [selectedLockedChapter]);

  return (
    <>
      <details
        className="group bg-surface rounded-2xl border border-border overflow-hidden"
        open
      >
        <summary className="p-4 sm:p-5 flex items-center justify-between cursor-pointer list-none select-none hover:bg-ivory/40 transition-colors min-h-[44px]">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-lg sm:text-xl font-bold text-navy">
              Table of Contents / ابواب کی فہرست
            </h2>
            <span className="text-[11px] bg-ivory text-secondary px-2.5 py-0.5 rounded-full font-semibold border border-border">
              {chapters.length} {chapters.length === 1 ? 'Chapter' : 'Chapters'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-secondary transition-transform duration-200 group-open:rotate-180" />
        </summary>

        {chapters.length > 0 ? (
          <div className="border-t border-border divide-y divide-border">
            {chapters.map((ch) => {
              const rowType = getChapterRowType(
                ch.chapter_number,
                ch.is_free_preview,
                state,
                lastReadChapterNumber
              );

              // 1. Unlocked Chapter Link (Owner, Author, Admin)
              if (rowType.kind === 'unlocked_link') {
                return (
                  <Link
                    key={ch.id}
                    href={`/read/${novelSlug}/${ch.chapter_number}`}
                    className={`group/row p-3.5 sm:p-4 flex items-center justify-between gap-3 min-h-[44px] transition-colors ${
                      rowType.isCurrent
                        ? 'bg-brand-gold/10 hover:bg-brand-gold/15'
                        : 'hover:bg-ivory/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-serif text-xs font-semibold shrink-0 ${
                          rowType.isCurrent
                            ? 'bg-brand-gold text-navy shadow-xs font-bold'
                            : 'bg-ivory text-secondary border border-border/80'
                        }`}
                      >
                        {ch.chapter_number}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <UrduText
                            as="span"
                            size="sm"
                            className="text-navy group-hover/row:text-accent-dark transition-colors leading-[2.2] py-0 line-clamp-2 font-normal"
                          >
                            {ch.title_urdu}
                          </UrduText>
                        </div>
                        <span className="text-[10px] sm:text-[11px] text-secondary">
                          {ch.word_count} words
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {rowType.isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-brand-gold text-navy px-2.5 py-1 rounded-lg shadow-xs">
                          <Bookmark className="w-3 h-3 fill-navy" />
                          <span>Continue</span>
                        </span>
                      ) : rowType.isRead ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="hidden sm:inline">Read</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-navy font-semibold group-hover/row:text-accent-dark transition-colors">
                          <BookOpen className="w-3.5 h-3.5 text-secondary group-hover/row:text-accent" />
                          <span className="hidden sm:inline">Read</span>
                          <ChevronRight className="w-3 h-3 text-secondary group-hover/row:text-accent transition-transform group-hover/row:translate-x-0.5" />
                        </span>
                      )}
                    </div>
                  </Link>
                );
              }

              // 2. Free Preview Link (Visitor & Pending states)
              if (rowType.kind === 'free_preview_link') {
                return (
                  <div
                    key={ch.id}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 min-h-[44px] hover:bg-ivory/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ivory text-secondary flex items-center justify-center font-serif text-xs font-semibold shrink-0 border border-border/80">
                        {ch.chapter_number}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <UrduText
                            as="span"
                            size="sm"
                            className="text-navy leading-[2.2] py-0 line-clamp-2 font-normal"
                          >
                            {ch.title_urdu}
                          </UrduText>
                        </div>
                        <span className="text-[10px] sm:text-[11px] text-secondary">
                          {ch.word_count} words
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <Link
                        href={`/novels/${novelSlug}/read/${ch.chapter_number}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[36px]"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden sm:inline">Read Free Preview</span>
                        <span className="sm:hidden">Preview</span>
                      </Link>
                    </div>
                  </div>
                );
              }

              // 3. Locked Chapter Button (Visitor & Pending states)
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={(e) => handleOpenLockedModal(ch, e)}
                  aria-haspopup="dialog"
                  aria-expanded={selectedLockedChapter?.chapter_number === ch.chapter_number}
                  aria-disabled="true"
                  aria-label={`Chapter ${ch.chapter_number}: ${ch.title_urdu}. Paid chapter, click for unlock details.`}
                  className="w-full text-left p-3.5 sm:p-4 flex items-center justify-between gap-3 min-h-[44px] bg-slate-50/50 hover:bg-slate-100/70 transition-colors cursor-pointer group/locked"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-serif text-xs font-semibold shrink-0 border border-slate-200">
                      {ch.chapter_number}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <UrduText
                          as="span"
                          size="sm"
                          className="text-slate-700 group-hover/locked:text-navy transition-colors leading-[2.2] py-0 line-clamp-2 font-normal"
                        >
                          {ch.title_urdu}
                        </UrduText>
                      </div>
                      <span className="text-[10px] sm:text-[11px] text-slate-500">
                        {ch.word_count} words
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-secondary bg-slate-100 group-hover/locked:bg-white px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span className="hidden sm:inline">Paid Chapter</span>
                      <span className="sm:hidden">Paid</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-ivory/30 border-t border-dashed border-border text-xs text-secondary">
            No published chapters available yet.
          </div>
        )}
      </details>

      {/* Accessible Chapter Unlock Sheet / Popover Modal */}
      {selectedLockedChapter && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={handleCloseModal}
          role="presentation"
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="locked-chapter-title"
            aria-describedby="locked-chapter-desc"
            className="w-full max-w-sm bg-surface rounded-2xl border border-border shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-brand-gold/20 text-brand-gold flex items-center justify-center font-bold text-xs">
                  {selectedLockedChapter.chapter_number}
                </div>
                <h3
                  id="locked-chapter-title"
                  className="font-serif text-sm font-bold text-navy truncate"
                >
                  Chapter {selectedLockedChapter.chapter_number} is Locked
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-secondary hover:text-navy hover:bg-ivory cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-brand-gold/15 text-navy mx-auto flex items-center justify-center border border-brand-gold/30">
                <Lock className="w-6 h-6 text-brand-gold" />
              </div>

              <div className="space-y-1">
                <UrduText
                  as="p"
                  size="base"
                  className="text-navy font-normal leading-[2.2] py-0"
                >
                  {selectedLockedChapter.title_urdu}
                </UrduText>
                <p id="locked-chapter-desc" className="text-xs text-secondary leading-relaxed">
                  This chapter unlocks after you buy the novel with direct writer payment.
                </p>
                <UrduText as="p" size="xs" className="text-secondary leading-normal py-0 font-normal">
                  یہ باب ناول خریدنے کے بعد مکمل طور پر دستیاب ہوگا۔
                </UrduText>
              </div>

              {/* State-Adaptive Actions */}
              {state === 'pending_verification' ? (
                <div className="pt-2 space-y-2">
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2 text-left">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Your payment is awaiting author verification.</span>
                  </div>
                  <Link
                    href={orderNumber ? `/orders/${orderNumber}` : '/orders'}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-xs"
                  >
                    <span>View your order</span>
                  </Link>
                </div>
              ) : state === 'rejected' || state === 'disputed' ? (
                <div className="pt-2 space-y-2">
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 text-left">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>
                      {state === 'rejected'
                        ? 'Payment proof was rejected.'
                        : 'Order is under dispute review.'}
                    </span>
                  </div>
                  <Link
                    href={orderNumber ? `/orders/${orderNumber}` : '/orders'}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-xs"
                  >
                    <span>View your order</span>
                  </Link>
                </div>
              ) : (
                <div className="pt-2 space-y-2">
                  <div className="text-xs text-secondary">
                    Full Novel Price: <span className="font-bold text-navy font-serif text-sm">{formatPKR(pricePkr)}</span>
                  </div>
                  <Link
                    href={
                      signedIn
                        ? `/checkout/${novelSlug}`
                        : `/login?next=${encodeURIComponent(`/novels/${novelSlug}`)}`
                    }
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-navy hover:bg-navy-light text-accent font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm"
                  >
                    <ShoppingBag className="w-4 h-4 text-accent" />
                    <span>{signedIn ? 'Buy Novel Now' : 'Sign In to Buy'}</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={handleCloseModal}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy hover:bg-ivory cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
