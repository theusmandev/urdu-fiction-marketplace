'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import {
  cleanUrduText,
  countUrduWords,
  hasArabicLetterForms,
  joinBrokenLines,
  countLinesAndParagraphs,
} from '@/lib/text/clean-urdu';
import { ChapterBody } from '@/components/reader/ChapterBody';
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
  Scissors,
  RotateCcw,
} from 'lucide-react';
import { ChapterSplitterWizard } from './ChapterSplitterWizard';
import { useDraftSync } from '@/lib/drafts/sync-engine';
import {
  getLocalDraft,
  deleteLocalDraft,
  type LocalDraft,
} from '@/lib/drafts/local-store';
import {
  acquireDraftTabLock,
  type TabLockHandle,
} from '@/lib/drafts/tab-lock';
import { DraftStatusChip } from '@/components/drafts/DraftStatusChip';
import { DraftConflictModal } from '@/components/drafts/DraftConflictModal';
import { DraftRestoreModal } from '@/components/drafts/DraftRestoreModal';
import { DeviceDraftsModal } from '@/components/drafts/DeviceDraftsModal';
import { TabConflictBanner } from '@/components/drafts/TabConflictBanner';
import {
  discardDraftAction,
  getLiveChapterStatusAction,
} from '@/app/actions/drafts';

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
    updated_at?: string;
  };
  suggestedChapterNumber: number;
  userId?: string;
}

export function ChapterEditor({
  novelId,
  novelTitleEnglish,
  novelTitleUrdu,
  novelStatus,
  chapterId,
  initialData,
  suggestedChapterNumber,
  userId,
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
  const [optInJoinLines, setOptInJoinLines] = useState(false);
  const [undoState, setUndoState] = useState<{ content: string; label: string } | null>(null);
  const [isSplitterModalOpen, setIsSplitterModalOpen] = useState(false);

  // Draft Sync, Tab Lock & Modals
  const activeUserId = userId || 'writer_session';
  const draftSync = useDraftSync({
    userId: activeUserId,
    novelId,
    chapterId: chapterId ?? null,
    initialTitle: formData.title_urdu,
    initialContent: formData.content_urdu,
    initialChapterNumber: formData.chapter_number,
    baseChapterUpdatedAt: initialData?.updated_at ?? null,
    enabled: true,
  });

  const [isLockedByOtherTab, setIsLockedByOtherTab] = useState(false);
  const tabLockRef = useRef<TabLockHandle | null>(null);

  const [dismissedConflictRevision, setDismissedConflictRevision] = useState<number | null>(null);
  const isConflictModalOpen =
    draftSync.syncStatus === 'conflict' &&
    draftSync.conflictData !== null &&
    dismissedConflictRevision !== draftSync.conflictData.server_revision;

  const [isDeviceDraftsModalOpen, setIsDeviceDraftsModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [localDraftToRestore, setLocalDraftToRestore] = useState<LocalDraft | null>(null);

  // Tab lock lifecycle
  useEffect(() => {
    let mounted = true;
    acquireDraftTabLock(draftSync.clientKey, () => {
      if (mounted) setIsLockedByOtherTab(true);
    }).then((handle) => {
      if (!mounted) {
        handle.release();
        return;
      }
      tabLockRef.current = handle;
      setIsLockedByOtherTab(!handle.isHolder);
    });

    return () => {
      mounted = false;
      tabLockRef.current?.release();
    };
  }, [draftSync.clientKey]);

  const handleTakeOver = () => {
    tabLockRef.current?.takeOver();
    setIsLockedByOtherTab(false);
  };

  // Restore on open: compare local draft with server live data
  useEffect(() => {
    if (!userId) return;
    getLocalDraft(draftSync.clientKey, userId).then((local) => {
      if (!local) return;
      const initialText = initialData?.content_urdu || '';
      const initialTitle = initialData?.title_urdu || '';
      // If local draft has content differing from live initial data
      if (local.content !== initialText || local.title !== initialTitle) {
        setLocalDraftToRestore(local);
        setIsRestoreModalOpen(true);
      }
    });
  }, [draftSync.clientKey, userId, initialData]);


  // Debounced word count for 200,000+ characters silky responsiveness
  const [debouncedWordCount, setDebouncedWordCount] = useState(() => countUrduWords(formData.content_urdu));
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedWordCount(countUrduWords(formData.content_urdu));
    }, 200);
    return () => clearTimeout(handler);
  }, [formData.content_urdu]);

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
  const wordCount = debouncedWordCount;
  const { lines: lineCount, paragraphs: paragraphCount } = countLinesAndParagraphs(formData.content_urdu);
  const isNearingLimit = charCount >= 96000 && charCount <= MAX_CHAPTER_CHARACTERS;
  const isOverLimit = charCount > MAX_CHAPTER_CHARACTERS;
  const limitPercentage = Math.min(100, Math.round((charCount / MAX_CHAPTER_CHARACTERS) * 100));

  const handleChange = <K extends keyof ChapterFormInput>(field: K, value: ChapterFormInput[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      draftSync.notifyChange(next.title_urdu, next.content_urdu, next.chapter_number);
      return next;
    });
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
   * Reverts previous text alteration
   */
  const handleUndo = () => {
    if (!undoState) return;
    setFormData((prev) => {
      const next = { ...prev, content_urdu: undoState.content };
      draftSync.notifyChange(next.title_urdu, next.content_urdu, next.chapter_number);
      return next;
    });
    setIsDirty(true);
    setHelperNotice(`Reverted: ${undoState.label}`);
    setUndoState(null);
    setTimeout(() => setHelperNotice(null), 3500);
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

      const beforeLines = text.split('\n').length;
      // Safe clean only (never converts Arabic letters silently)
      const cleaned = cleanUrduText(text, { normalizeArabicLetters: false });
      const afterLines = cleaned.split('\n').length;

      setUndoState({
        content: formData.content_urdu,
        label: 'Paste Cleaned Text',
      });

      setFormData((prev) => {
        const existing = prev.content_urdu;
        const newContent = existing ? `${existing}\n\n${cleaned}` : cleaned;
        draftSync.notifyChange(prev.title_urdu, newContent, prev.chapter_number);
        return { ...prev, content_urdu: newContent };
      });

      setIsDirty(true);
      if (hasArabicLetterForms(text)) {
        setHelperNotice(
          `Cleaned Urdu text pasted (${beforeLines} lines -> ${afterLines} lines). Arabic letters preserved. To convert Arabic forms (ي, ك, ة), use Clean Text Assistant.`
        );
      } else {
        setHelperNotice(`Cleaned Urdu text pasted (${beforeLines} lines -> ${afterLines} lines).`);
      }
      setTimeout(() => setHelperNotice(null), 4500);
    } catch {
      setHelperNotice('Unable to access clipboard. Please paste manually into the editor.');
    }
  };

  /**
   * Opens the Clean Text Assistant modal to review before/after and opt-in to letter normalization / line joining
   */
  const handleOpenCleanerModal = () => {
    if (!formData.content_urdu || formData.content_urdu.trim().length === 0) {
      setHelperNotice('Please enter or paste manuscript text before opening the cleaner.');
      setTimeout(() => setHelperNotice(null), 3000);
      return;
    }
    setOptInArabicLetters(false);
    setOptInJoinLines(false);
    setIsCleanerModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOverLimit) {
      setErrorMessage(`Chapter exceeds the 120,000 character limit (${charCount.toLocaleString()} chars). Please split this chapter.`);
      return;
    }

    if (isLockedByOtherTab) {
      setErrorMessage('This chapter is currently open and being edited in another tab. Please take over editing before saving.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    // Warn if live chapter changed since base
    if (chapterId && initialData?.updated_at) {
      const checkRes = await getLiveChapterStatusAction(chapterId);
      if (checkRes.success && checkRes.data && checkRes.data.updated_at !== initialData.updated_at) {
        const proceed = window.confirm(
          'This chapter was edited elsewhere since you started. Saving now will overwrite those changes. Do you want to proceed?'
        );
        if (!proceed) {
          setIsSubmitting(false);
          return;
        }
      }
    }

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

      // Discard cloud draft and clear local draft on successful live save
      try {
        await discardDraftAction(draftSync.clientKey);
        if (userId) {
          await deleteLocalDraft(draftSync.clientKey, userId);
        }
      } catch (err) {
        console.error('Draft cleanup error:', err);
      }

      setTimeout(() => {
        router.push(`/writer/novels/${novelId}/chapters`);
      }, 700);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
      {/* Multi-Tab Lock Warning Banner */}
      <TabConflictBanner isLocked={isLockedByOtherTab} onTakeOver={handleTakeOver} />

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

            <button
              type="button"
              onClick={() => setIsSplitterModalOpen(true)}
              disabled={!formData.content_urdu.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-navy text-xs font-semibold hover:bg-white transition-colors shadow-xs disabled:opacity-50"
              title="Divide long episode into discrete chapters"
            >
              <Scissors className="w-3.5 h-3.5 text-accent" />
              <span>Split into Chapters</span>
            </button>
          </div>

          {/* Live Metrics & Draft Sync Status Chip */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            <DraftStatusChip
              status={draftSync.syncStatus}
              lastSyncedAt={draftSync.lastSyncedAt}
              onSyncNow={draftSync.forceSyncNow}
              onOpenDeviceDrafts={() => setIsDeviceDraftsModalOpen(true)}
              onOpenConflictModal={() => setDismissedConflictRevision(null)}
              isLockedByOtherTab={isLockedByOtherTab}
            />

            <div className="text-secondary">
              <strong className="text-navy">{wordCount.toLocaleString()}</strong> words
            </div>

            <div className="text-secondary hidden sm:block">
              Lines: <strong className="text-navy">{lineCount.toLocaleString()}</strong>, paragraphs: <strong className="text-navy">{paragraphCount.toLocaleString()}</strong>
            </div>

            <div className="flex items-center gap-2">
              <span className={isOverLimit ? 'text-rose-600 font-bold' : isNearingLimit ? 'text-amber-700 font-semibold' : 'text-secondary'}>
                <strong className={isOverLimit ? 'text-rose-600' : isNearingLimit ? 'text-amber-800' : 'text-navy'}>
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
                      : limitPercentage >= 80
                      ? 'bg-amber-500'
                      : 'bg-accent'
                  }`}
                  style={{ width: `${limitPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Undo notification bar */}
        {undoState && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between text-xs text-slate-800 animate-in fade-in">
            <span>Action completed: <strong>{undoState.label}</strong></span>
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-slate-300 font-semibold text-navy hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Undo</span>
            </button>
          </div>
        )}

        {/* Textarea Area */}
        <div className="p-4" dir="rtl">
          <textarea
            ref={textareaRef}
            dir="rtl"
            rows={18}
            value={formData.content_urdu}
            readOnly={isLockedByOtherTab}
            onChange={(e) => handleChange('content_urdu', e.target.value)}
            placeholder="باب کا مکمل متن یہاں تحریر کریں یا 'Paste Cleaned Text' پر کلک کریں..."
            className={`w-full p-4 rounded-xl border border-border bg-ivory text-main font-urdu text-lg leading-[2.2] focus:outline-none focus:ring-2 focus:ring-accent resize-y transition-colors min-h-[420px] ${
              isLockedByOtherTab ? 'opacity-60 bg-slate-100 cursor-not-allowed' : ''
            }`}
            required
          />
        </div>

        {fieldErrors.content_urdu && (
          <div className="px-4 pb-4">
            <p className="text-xs text-rose-600 text-right">{fieldErrors.content_urdu[0]}</p>
          </div>
        )}

        {/* Amber Banner when between 80% and 100% (96,000 - 120,000 chars) */}
        {isNearingLimit && !isOverLimit && (
          <div className="p-4 bg-amber-50 border-t border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Approaching Limit:</strong> This chapter is at {limitPercentage}% of the 120,000-character limit ({charCount.toLocaleString()} chars). You can split it into smaller chapter parts for a better reading experience.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSplitterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-xs"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Split into Chapters</span>
            </button>
          </div>
        )}

        {/* Red Banner when over 100% (>120,000 chars, save blocked) */}
        {isOverLimit && (
          <div className="p-4 bg-rose-50 border-t border-rose-200 text-rose-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Limit Exceeded:</strong> This chapter exceeds the platform limit of 120,000 characters ({charCount.toLocaleString()} chars). Saving is blocked until the content is divided.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSplitterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 shadow-xs"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Split into Chapters</span>
            </button>
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
                  <li>Preserves every line break (\n) and blank line. Clamps runs of 3+ blank lines to 2.</li>
                  <li>Collapses repeated horizontal whitespace (spaces & tabs) inside a line without joining lines.</li>
                  <li>Converts Western numbers and non-Quranic digits to Urdu digits.</li>
                </ul>
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Opt-in Arabic Letters Checkbox */}
                <div className="p-3.5 rounded-xl border border-border bg-white space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optInArabicLetters}
                      onChange={(e) => setOptInArabicLetters(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-semibold text-main block">
                        Normalize Arabic letter forms (ي/ى → ی, ك → ک, ة → ہ)
                      </span>
                      <span className="text-[11px] text-secondary block mt-0.5">
                        Standardizes Arabic keyboard layout characters into Urdu forms.
                      </span>
                    </div>
                  </label>

                  {optInArabicLetters && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>Warning: Quranic verses and Arabic quotations will have their orthography altered.</span>
                    </div>
                  )}
                </div>

                {/* Opt-in Join Broken Lines Checkbox */}
                <div className="p-3.5 rounded-xl border border-border bg-white space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optInJoinLines}
                      onChange={(e) => setOptInJoinLines(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-semibold text-main block">
                        Join broken lines (PDF / hard-wrap repair)
                      </span>
                      <span className="text-[11px] text-secondary block mt-0.5">
                        Joins lines broken mid-sentence. Strictly preserves lines ending in punctuation (۔ ؟ ! &ldquo; &rdquo;), headings, scene breaks (****), and blank lines.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Live Before / After Preview */}
              {(() => {
                let transformed = cleanUrduText(formData.content_urdu, {
                  normalizeArabicLetters: optInArabicLetters,
                });
                if (optInJoinLines) {
                  transformed = joinBrokenLines(transformed);
                }
                const beforeStats = countLinesAndParagraphs(formData.content_urdu);
                const afterStats = countLinesAndParagraphs(transformed);

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-main">
                      <span>Live Preview (Line Count & Formatting Comparison)</span>
                      <span className="text-[11px] font-mono text-navy font-bold px-2 py-0.5 rounded bg-accent/20">
                        {beforeStats.lines} lines → {afterStats.lines} lines ({afterStats.paragraphs} paras)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Before */}
                      <div className="p-3.5 rounded-xl border border-border bg-ivory/50 space-y-2 flex flex-col">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                            Before (Current Text):
                          </span>
                          <span className="text-[10px] font-mono text-secondary">
                            {beforeStats.lines} lines • {beforeStats.paragraphs} paras
                          </span>
                        </div>
                        <div className="h-56 overflow-y-auto p-3 bg-white/80 rounded-lg border border-border/60">
                          <ChapterBody
                            text={formData.content_urdu.slice(0, 1200) || 'کوئی متن موجود نہیں۔'}
                            fontSize="sm"
                            lineHeight="relaxed"
                            paragraphSpacing="compact"
                            userSelect="text"
                          />
                        </div>
                      </div>

                      {/* After */}
                      <div className="p-3.5 rounded-xl border border-accent/40 bg-accent/5 space-y-2 flex flex-col">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-accent block">
                            After (Cleaned Output):
                          </span>
                          <span className="text-[10px] font-mono text-accent font-bold">
                            {afterStats.lines} lines • {afterStats.paragraphs} paras
                          </span>
                        </div>
                        <div className="h-56 overflow-y-auto p-3 bg-white/90 rounded-lg border border-accent/20">
                          <ChapterBody
                            text={transformed.slice(0, 1200) || 'کوئی متن موجود نہیں۔'}
                            fontSize="sm"
                            lineHeight="relaxed"
                            paragraphSpacing="compact"
                            userSelect="text"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
                  let cleaned = cleanUrduText(formData.content_urdu, {
                    normalizeArabicLetters: optInArabicLetters,
                  });
                  if (optInJoinLines) {
                    cleaned = joinBrokenLines(cleaned);
                  }
                  const beforeStats = countLinesAndParagraphs(formData.content_urdu);
                  const afterStats = countLinesAndParagraphs(cleaned);

                  setUndoState({
                    content: formData.content_urdu,
                    label: optInJoinLines ? 'Clean Text + Join Lines' : 'Clean Text',
                  });

                  setFormData((prev) => ({ ...prev, content_urdu: cleaned }));
                  setIsDirty(true);
                  setIsCleanerModalOpen(false);
                  setHelperNotice(
                    `Applied text cleaning (${beforeStats.lines} lines -> ${afterStats.lines} lines).`
                  );
                  setTimeout(() => setHelperNotice(null), 4000);
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

      {/* Chapter Splitter Wizard */}
      {isSplitterModalOpen && (
        <ChapterSplitterWizard
          novelId={novelId}
          novelTitleUrdu={novelTitleUrdu}
          novelTitleEnglish={novelTitleEnglish}
          isOpen={isSplitterModalOpen}
          onClose={() => setIsSplitterModalOpen(false)}
          mode={chapterId ? 'split-existing' : 'import'}
          existingChapterId={chapterId}
          existingChapterNumber={formData.chapter_number}
          initialText={formData.content_urdu}
          suggestedStartNumber={formData.chapter_number}
          onSuccess={() => {
            setIsSplitterModalOpen(false);
            router.push(`/writer/novels/${novelId}/chapters`);
            router.refresh();
          }}
        />
      )}

      {/* Draft Restore Modal */}
      {isRestoreModalOpen && localDraftToRestore && (
        <DraftRestoreModal
          isOpen={isRestoreModalOpen}
          onRestore={() => {
            setFormData((prev) => ({
              ...prev,
              title_urdu: localDraftToRestore.title,
              content_urdu: localDraftToRestore.content,
            }));
            draftSync.notifyChange(
              localDraftToRestore.title,
              localDraftToRestore.content,
              formData.chapter_number
            );
            setIsDirty(true);
            setIsRestoreModalOpen(false);
            setHelperNotice('Restored unsynced draft from this device.');
          }}
          onDiscard={async () => {
            if (userId) {
              await deleteLocalDraft(draftSync.clientKey, userId);
            }
            setIsRestoreModalOpen(false);
            setHelperNotice('Discarded unsynced local draft.');
          }}
          localUpdatedAt={localDraftToRestore.updatedAt}
          localCharCount={localDraftToRestore.content.length}
          liveCharCount={formData.content_urdu.length}
          localTitle={localDraftToRestore.title}
          localContent={localDraftToRestore.content}
          liveContent={formData.content_urdu}
        />
      )}

      {/* Draft Conflict Modal */}
      {isConflictModalOpen && draftSync.conflictData && (
        <DraftConflictModal
          isOpen={isConflictModalOpen}
          onClose={() => setDismissedConflictRevision(draftSync.conflictData?.server_revision ?? null)}
          localContent={formData.content_urdu}
          localTitle={formData.title_urdu}
          serverContent={draftSync.conflictData.content_urdu}
          serverTitle={draftSync.conflictData.title_urdu || ''}
          serverRevision={draftSync.conflictData.server_revision}
          serverUpdatedAt={draftSync.conflictData.server_updated_at}
          serverDeviceLabel={draftSync.conflictData.device_label}
          onKeepMine={async () => {
            await draftSync.resolveKeepMine();
            setDismissedConflictRevision(null);
            setHelperNotice('Overwrote cloud draft with this device version.');
          }}
          onKeepServer={async () => {
            const serverRes = await draftSync.resolveKeepServer();
            if (serverRes) {
              setFormData((prev) => ({
                ...prev,
                title_urdu: serverRes.title,
                content_urdu: serverRes.content,
              }));
            }
            setDismissedConflictRevision(null);
            setHelperNotice('Loaded server version. Your local copy was safely archived.');
          }}
          onCopyToNewDraft={async () => {
            await draftSync.copyMineToNewDraft();
            setDismissedConflictRevision(null);
            setHelperNotice('Local copy saved to a new draft slot.');
          }}
        />
      )}

      {/* Device Drafts List Modal */}
      {isDeviceDraftsModalOpen && userId && (
        <DeviceDraftsModal
          isOpen={isDeviceDraftsModalOpen}
          onClose={() => setIsDeviceDraftsModalOpen(false)}
          userId={userId}
          novelId={novelId}
          onRestoreDraft={(draft) => {
            setFormData((prev) => ({
              ...prev,
              title_urdu: draft.title,
              content_urdu: draft.content,
            }));
            draftSync.notifyChange(draft.title, draft.content, formData.chapter_number);
            setIsDirty(true);
            setHelperNotice(`Restored draft from ${new Date(draft.updatedAt).toLocaleTimeString()}`);
          }}
        />
      )}
    </form>
  );
}
