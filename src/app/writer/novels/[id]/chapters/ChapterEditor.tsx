'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import {
  cleanUrduText,
  countUrduWords,
  hasArabicLetterForms,
} from '@/lib/text/clean-urdu';
import { MAX_CHAPTER_CHARACTERS } from '@/lib/text/manuscript-parser';
import { saveChapterAction } from '@/app/actions/writer';
import type { ChapterFormInput } from '@/lib/writer/schemas';
import {
  ArrowLeft,
  Save,
  Sparkles,
  ClipboardPaste,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wand2,
  AlertTriangle,
  X,
} from 'lucide-react';

interface ChapterEditorProps {
  novelId: string;
  novelTitleEnglish: string;
  novelTitleUrdu: string;
  novelStatus: string;
  chapterId?: string;
  initialData?: {
    chapter_number: number;
    title_urdu: string;
    content_urdu: string;
    is_free_preview: boolean;
    is_published: boolean;
  };
  suggestedChapterNumber: number;
}

export function ChapterEditor({
  novelId,
  novelTitleEnglish,
  novelTitleUrdu,
  novelStatus,
  chapterId,
  initialData,
  suggestedChapterNumber,
}: ChapterEditorProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [formData, setFormData] = useState<ChapterFormInput>({
    chapter_number: initialData?.chapter_number ?? suggestedChapterNumber,
    title_urdu: initialData?.title_urdu || '',
    content_urdu: initialData?.content_urdu || '',
    is_free_preview: initialData?.is_free_preview ?? false,
    is_published: initialData?.is_published ?? true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [helperNotice, setHelperNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isCleanerModalOpen, setIsCleanerModalOpen] = useState(false);
  const [optInArabicLetters, setOptInArabicLetters] = useState(false);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const charCount = formData.content_urdu.length;
  const wordCount = countUrduWords(formData.content_urdu);
  const isOverLimit = charCount > MAX_CHAPTER_CHARACTERS;
  const limitPercentage = Math.min(100, Math.round((charCount / MAX_CHAPTER_CHARACTERS) * 100));

  const handleChange = <K extends keyof ChapterFormInput>(field: K, value: ChapterFormInput[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setHelperNotice(null);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  /**
   * Reads clipboard text, runs safe cleanUrduText, and pastes into content area.
   * Safe only: never converts Arabic letters silently.
   */
  const handlePasteCleanedText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length === 0) {
        setHelperNotice('Clipboard is empty or contains no readable text.');
        return;
      }

      // Safe clean only (never converts Arabic letters silently)
      const cleaned = cleanUrduText(text, { normalizeArabicLetters: false });

      setFormData((prev) => {
        const existing = prev.content_urdu;
        const newContent = existing ? `${existing}\n\n${cleaned}` : cleaned;
        return { ...prev, content_urdu: newContent };
      });

      setIsDirty(true);
      if (hasArabicLetterForms(text)) {
        setHelperNotice(
          'Pasted with safe cleaning. Arabic orthography preserved. To convert Arabic letters (ي, ك, ة) to Urdu forms, open Clean Text Assistant.'
        );
      } else {
        setHelperNotice('Cleaned Urdu text successfully pasted from clipboard!');
      }
      setTimeout(() => setHelperNotice(null), 4000);
    } catch {
      setHelperNotice('Unable to access clipboard. Please paste manually into the editor.');
    }
  };

  /**
   * Opens the Clean Text Assistant modal to review before/after and opt-in to letter normalization
   */
  const handleOpenCleanerModal = () => {
    if (!formData.content_urdu || formData.content_urdu.trim().length === 0) {
      setHelperNotice('Please enter or paste manuscript text before opening the cleaner.');
      setTimeout(() => setHelperNotice(null), 3000);
      return;
    }
    setOptInArabicLetters(false);
    setIsCleanerModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOverLimit) {
      setErrorMessage(`Chapter exceeds the 120,000 character limit (${charCount.toLocaleString()} chars). Please split this chapter.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const res = await saveChapterAction(novelId, {
      ...formData,
      chapterId,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to save chapter.');
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
    } else {
      setIsDirty(false);
      setSuccessMessage('Chapter saved successfully.');
      setTimeout(() => {
        router.push(`/writer/novels/${novelId}/chapters`);
      }, 700);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/writer/novels/${novelId}/chapters`}
            className="p-2 rounded-lg border border-border text-secondary hover:text-navy hover:bg-ivory transition-colors"
            title="Back to Chapters List"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy">
                {chapterId ? `Editing Chapter #${formData.chapter_number}` : 'New Chapter Draft'}
              </span>
              <span className="text-xs text-secondary">
                {novelTitleEnglish}
              </span>
              {novelTitleUrdu && (
                <UrduText className="text-xs text-secondary border-l border-border pl-2">
                  {novelTitleUrdu}
                </UrduText>
              )}
              {novelStatus && (
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-secondary">
                  {novelStatus.replace('_', ' ')}
                </span>
              )}
            </div>
            <h1 className="text-xl font-serif font-bold text-navy mt-0.5">
              Urdu Manuscript Editor
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/writer/novels/${novelId}/chapters`}
            className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-navy hover:bg-ivory"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSubmitting || isOverLimit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Chapter...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Chapter</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-xs font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-xs font-medium">{errorMessage}</p>
        </div>
      )}

      {helperNotice && (
        <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 flex items-center gap-2 text-xs">
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
          <span>{helperNotice}</span>
        </div>
      )}

      {/* Chapter Number & Title Settings */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Chapter Number */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-main">
              Chapter Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={formData.chapter_number}
              onChange={(e) => handleChange('chapter_number', Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-bold text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
            {fieldErrors.chapter_number && (
              <p className="text-xs text-rose-600">{fieldErrors.chapter_number[0]}</p>
            )}
          </div>

          {/* Urdu Chapter Title */}
          <div className="sm:col-span-3 space-y-1.5" dir="rtl">
            <label className="block text-xs font-semibold text-main text-right">
              باب کا عنوان (اردو میں) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              dir="rtl"
              value={formData.title_urdu}
              onChange={(e) => handleChange('title_urdu', e.target.value)}
              placeholder="مثال: باب اول — اندھیری رات کا سفر"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-ivory text-main font-urdu text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
            {fieldErrors.title_urdu && (
              <p className="text-xs text-rose-600 text-right">{fieldErrors.title_urdu[0]}</p>
            )}
          </div>
        </div>

        {/* Toggles */}
        <div className="pt-3 border-t border-border flex flex-wrap items-center gap-6 text-xs">
          {/* Free Preview Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_free_preview}
              onChange={(e) => handleChange('is_free_preview', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent"
            />
            <div className="space-y-0.5">
              <span className="font-semibold text-main block">
                Free Sample Preview
              </span>
              <span className="text-[11px] text-secondary">
                Readers can read this chapter without purchasing the full novel.
              </span>
            </div>
          </label>

          {/* Published Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_published}
              onChange={(e) => handleChange('is_published', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent"
            />
            <div className="space-y-0.5">
              <span className="font-semibold text-main block">
                Published to Readers
              </span>
              <span className="text-[11px] text-secondary">
                Visible to entitled buyers once novel is published.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Urdu Editor Container */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden space-y-0">
        {/* Editor Toolbar */}
        <div className="p-4 border-b border-border bg-ivory/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteCleanedText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-navy text-xs font-semibold hover:bg-white transition-colors shadow-xs"
              title="Clean & Paste text from clipboard"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-accent" />
              <span>Paste Cleaned Text</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCleanerModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-secondary hover:text-navy text-xs font-semibold hover:bg-white transition-colors shadow-xs"
              title="Open text cleaning assistant with preview"
            >
              <Wand2 className="w-3.5 h-3.5 text-accent" />
              <span>Clean Text Assistant</span>
            </button>
          </div>

          {/* Live Metrics */}
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="text-secondary">
              <strong className="text-navy">{wordCount.toLocaleString()}</strong> words
            </div>

            <div className="flex items-center gap-2">
              <span className={isOverLimit ? 'text-rose-600 font-bold' : 'text-secondary'}>
                <strong className={isOverLimit ? 'text-rose-600' : 'text-navy'}>
                  {charCount.toLocaleString()}
                </strong>{' '}
                / 120,000 chars
              </span>

              {/* Progress pill */}
              <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isOverLimit
                      ? 'bg-rose-600'
                      : limitPercentage > 90
                      ? 'bg-amber-500'
                      : 'bg-accent'
                  }`}
                  style={{ width: `${limitPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Textarea Area */}
        <div className="p-4" dir="rtl">
          <textarea
            ref={textareaRef}
            dir="rtl"
            rows={18}
            value={formData.content_urdu}
            onChange={(e) => handleChange('content_urdu', e.target.value)}
            placeholder="باب کا مکمل متن یہاں تحریر کریں یا 'Paste Cleaned Text' پر کلک کریں..."
            className="w-full p-4 rounded-xl border border-border bg-ivory text-main font-urdu text-lg leading-[2.2] focus:outline-none focus:ring-2 focus:ring-accent resize-y transition-colors min-h-[420px]"
            required
          />
        </div>

        {fieldErrors.content_urdu && (
          <div className="px-4 pb-4">
            <p className="text-xs text-rose-600 text-right">{fieldErrors.content_urdu[0]}</p>
          </div>
        )}

        {isOverLimit && (
          <div className="p-4 bg-rose-50 border-t border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              This chapter exceeds the platform limit of 120,000 characters. Please split this text into multiple chapters.
            </span>
          </div>
        )}
      </div>

      {/* Bottom Save Bar */}
      <div className="flex items-center justify-between bg-surface rounded-xl border border-border p-4 shadow-sm">
        <div className="text-xs text-secondary">
          {isDirty ? (
            <span className="text-amber-700 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </span>
          ) : (
            <span className="text-emerald-700 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              All changes saved
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isOverLimit}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 shadow-sm"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Chapter</span>
            </>
          )}
        </button>
      </div>
      {/* Clean Text Assistant Modal */}
      {isCleanerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl border border-border max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-ivory/50">
              <div>
                <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-accent" />
                  Urdu Manuscript Text Cleaner
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Safe default normalization preserves Quranic verses, duas, and Arabic orthography.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCleanerModalOpen(false)}
                className="p-1 rounded-lg text-secondary hover:text-navy hover:bg-ivory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Feature Highlights */}
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Safe Cleaning Features (Always Applied):
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-emerald-800 text-[11px]">
                  <li>Unicode NFC normalization and invisible bidi control character removal (preserves ZWNJ/ZWJ).</li>
                  <li>Collapses redundant horizontal whitespace and excess blank lines.</li>
                  <li>Converts Western numbers and non-Quranic digits to Urdu digits.</li>
                </ul>
              </div>

              {/* Opt-in Arabic Letters Checkbox */}
              <div className="p-4 rounded-xl border border-border bg-white space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={optInArabicLetters}
                    onChange={(e) => setOptInArabicLetters(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-semibold text-main block">
                      Convert Arabic letter forms to Urdu forms (ي/ى → ی, ك → ک, ة → ہ)
                    </span>
                    <span className="text-[11px] text-secondary block mt-0.5">
                      Standardizes Arabic keyboard input into Urdu calligraphy characters.
                    </span>
                  </div>
                </label>

                {optInArabicLetters && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block">Warning:</strong>
                      <span>Arabic quotations, Quranic verses, and duas may have their orthography altered if this option is selected.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Before / After Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-main">
                  <span>Live Preview (First 400 characters)</span>
                  <span className="text-[11px] text-secondary font-normal">
                    {optInArabicLetters ? 'Arabic Letter Forms Converted' : 'Safe Normalization Only'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Before */}
                  <div className="p-3.5 rounded-xl border border-border bg-ivory/50 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                      Before (Original Text):
                    </span>
                    <UrduText as="p" size="sm" className="text-main leading-[2.2] py-0 line-clamp-6" dir="rtl">
                      {formData.content_urdu.slice(0, 400) || 'کوئی متن موجود نہیں۔'}
                    </UrduText>
                  </div>

                  {/* After */}
                  <div className="p-3.5 rounded-xl border border-accent/30 bg-accent/5 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent block">
                      After (Cleaned Output):
                    </span>
                    <UrduText as="p" size="sm" className="text-navy leading-[2.2] py-0 line-clamp-6" dir="rtl">
                      {cleanUrduText(formData.content_urdu.slice(0, 400), {
                        normalizeArabicLetters: optInArabicLetters,
                      }) || 'کوئی متن موجود نہیں۔'}
                    </UrduText>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-ivory/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsCleanerModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  const cleaned = cleanUrduText(formData.content_urdu, {
                    normalizeArabicLetters: optInArabicLetters,
                  });
                  setFormData((prev) => ({ ...prev, content_urdu: cleaned }));
                  setIsDirty(true);
                  setIsCleanerModalOpen(false);
                  setHelperNotice(
                    optInArabicLetters
                      ? 'Manuscript text normalized (Arabic letter forms converted to Urdu).'
                      : 'Manuscript text safely normalized (Quranic & Arabic orthography preserved).'
                  );
                  setTimeout(() => setHelperNotice(null), 3500);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Apply Cleaned Text to Chapter</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
