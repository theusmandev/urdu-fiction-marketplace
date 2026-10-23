'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { ChapterImportModal } from './ChapterImportModal';
import { SubmitReviewModal, type NovelChecklistData } from '../../SubmitReviewModal';
import {
  deleteChapterAction,
  reorderChaptersAction,
  saveChapterAction,
} from '@/app/actions/writer';
import type { ChapterRow } from '@/types/database';
import {
  ArrowLeft,
  Plus,
  Upload,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  Send,
  BookOpen,
  Sparkles,
} from 'lucide-react';

interface ChapterListManagerProps {
  novel: NovelChecklistData;
  initialChapters: ChapterRow[];
}

export function ChapterListManager({
  novel,
  initialChapters,
}: ChapterListManagerProps) {
  const router = useRouter();

  const [chapters, setChapters] = useState<ChapterRow[]>(initialChapters);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Deletion modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reorder loading state
  const [isReordering, setIsReordering] = useState(false);
  const [togglingChapterId, setTogglingChapterId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isDraft = novel.status === 'draft';
  const isEditable = novel.status === 'draft' || novel.status === 'rejected' || novel.status === 'published';

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (isReordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    const newOrder = [...chapters];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    // Optimistically update UI
    setChapters(newOrder);
    setIsReordering(true);
    setErrorMessage(null);

    const chapterIds = newOrder.map((c) => c.id);
    const res = await reorderChaptersAction(novel.id, chapterIds);
    setIsReordering(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to reorder chapters.');
      setChapters(initialChapters); // Revert on failure
    } else {
      router.refresh();
    }
  };

  const handleTogglePublished = async (chapter: ChapterRow) => {
    setTogglingChapterId(chapter.id);
    setErrorMessage(null);

    const res = await saveChapterAction(novel.id, {
      chapterId: chapter.id,
      chapter_number: chapter.chapter_number,
      title_urdu: chapter.title_urdu,
      content_urdu: chapter.content_urdu,
      is_free_preview: chapter.is_free_preview,
      is_published: !chapter.is_published,
    });

    setTogglingChapterId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to toggle publication status.');
    } else {
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapter.id ? { ...c, is_published: !c.is_published } : c
        )
      );
      router.refresh();
    }
  };

  const handleTogglePreview = async (chapter: ChapterRow) => {
    setTogglingChapterId(chapter.id);
    setErrorMessage(null);

    const res = await saveChapterAction(novel.id, {
      chapterId: chapter.id,
      chapter_number: chapter.chapter_number,
      title_urdu: chapter.title_urdu,
      content_urdu: chapter.content_urdu,
      is_free_preview: !chapter.is_free_preview,
      is_published: chapter.is_published,
    });

    setTogglingChapterId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to toggle preview status.');
    } else {
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapter.id ? { ...c, is_free_preview: !c.is_free_preview } : c
        )
      );
      router.refresh();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    setErrorMessage(null);

    const res = await deleteChapterAction(novel.id, deleteTargetId);
    setIsDeleting(false);
    setDeleteTargetId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to delete chapter.');
    } else {
      setSuccessMessage('Chapter permanently deleted.');
      setChapters((prev) => prev.filter((c) => c.id !== deleteTargetId));
      router.refresh();
    }
  };

  const publishedCount = chapters.filter((c) => c.is_published).length;
  const totalWordCount = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Novel Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/writer/novels"
            className="p-2 rounded-lg border border-border text-secondary hover:text-navy hover:bg-ivory transition-colors"
            title="Back to Novels List"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy">
                {novel.status.toUpperCase()}
              </span>
              <span className="text-xs text-secondary font-mono">
                {publishedCount} / {chapters.length} Chapters Published
              </span>
            </div>
            <h1 className="text-xl font-serif font-bold text-navy flex items-center gap-2 mt-0.5">
              <span>{novel.title_english}</span>
              <span className="text-secondary">&mdash;</span>
              <UrduText as="span" size="base" className="text-accent py-0" dir="rtl">
                {novel.title_urdu}
              </UrduText>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Submit for Review CTA */}
          {(novel.status === 'draft' || novel.status === 'rejected') && (
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-navy text-xs font-semibold hover:bg-accent/90 shadow-sm transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit for Review</span>
            </button>
          )}

          {/* Import Button */}
          {isEditable && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-surface text-secondary hover:text-navy hover:bg-ivory text-xs font-semibold shadow-sm transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-accent" />
              <span>Import Manuscript</span>
            </button>
          )}

          {/* Add Chapter Button */}
          {isEditable && (
            <Link
              href={`/writer/novels/${novel.id}/chapters/new`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chapter</span>
            </Link>
          )}
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

      {/* Novel Manuscript Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block">
            Total Chapters
          </span>
          <span className="text-2xl font-bold text-navy mt-1 block">
            {chapters.length}
          </span>
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block">
            Published Chapters
          </span>
          <span className="text-2xl font-bold text-emerald-700 mt-1 block">
            {publishedCount}
          </span>
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block">
            Total Words
          </span>
          <span className="text-2xl font-bold text-navy mt-1 block">
            {totalWordCount.toLocaleString()}
          </span>
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block">
            Pricing
          </span>
          <span className="text-2xl font-bold text-accent mt-1 block">
            {novel.price_pkr === 0 ? 'Free' : `PKR ${novel.price_pkr}`}
          </span>
        </div>
      </div>

      {/* Chapters Ordered List */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between bg-ivory/30">
          <div>
            <h2 className="text-sm font-serif font-bold text-navy flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              Chapter Sequence
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Chapters are rendered sequentially. Use the move arrows to renumber without breaking database constraints.
            </p>
          </div>

          {isReordering && (
            <div className="flex items-center gap-2 text-xs text-accent font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving chapter order...</span>
            </div>
          )}
        </div>

        {chapters.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-bold text-base text-navy">
                No chapters created yet
              </h3>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                Add chapters individually with our Urdu Nastaliq editor or upload your complete manuscript file (.docx / .txt) to split chapters automatically.
              </p>
            </div>
            {isEditable && (
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-navy hover:bg-ivory"
                >
                  <Upload className="w-3.5 h-3.5 text-accent" />
                  <span>Import Manuscript</span>
                </button>
                <Link
                  href={`/writer/novels/${novel.id}/chapters/new`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Write Chapter 1</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {chapters.map((chapter, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === chapters.length - 1;
              const isBusy = togglingChapterId === chapter.id || isReordering;

              return (
                <div
                  key={chapter.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-ivory/40 transition-colors"
                >
                  {/* Left: Reorder arrows + Chapter details */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Reorder Buttons */}
                    {isEditable && chapters.length > 1 && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={isFirst || isReordering}
                          onClick={() => handleMove(idx, 'up')}
                          className="p-1 rounded hover:bg-slate-200 text-secondary hover:text-navy disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast || isReordering}
                          onClick={() => handleMove(idx, 'down')}
                          className="p-1 rounded hover:bg-slate-200 text-secondary hover:text-navy disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="w-8 h-8 rounded-lg bg-ivory border border-border flex items-center justify-center font-mono font-bold text-xs text-navy shrink-0">
                      #{idx + 1}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <UrduText as="span" size="base" className="font-bold text-navy py-0" dir="rtl">
                          {chapter.title_urdu}
                        </UrduText>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-secondary">
                        <span>{(chapter.word_count || 0).toLocaleString()} words</span>
                        <span>&bull;</span>
                        <span className="font-mono">
                          {chapter.content_urdu.length.toLocaleString()} / 120,000 chars
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Badges & Actions */}
                  <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                    {/* Free Preview Toggle */}
                    {isEditable && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTogglePreview(chapter)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-colors flex items-center gap-1 ${
                          chapter.is_free_preview
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-ivory text-secondary border-border hover:bg-slate-100'
                        }`}
                        title="Toggle Free Preview for readers"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{chapter.is_free_preview ? 'Free Preview' : 'Locked'}</span>
                      </button>
                    )}

                    {/* Published Toggle */}
                    {isEditable && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTogglePublished(chapter)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-colors flex items-center gap-1 ${
                          chapter.is_published
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                        title="Toggle Chapter Published state"
                      >
                        {chapter.is_published ? (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>Published</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>Unpublished</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Edit Button */}
                    <Link
                      href={`/writer/novels/${novel.id}/chapters/${chapter.id}`}
                      className="p-1.5 rounded-lg border border-border text-secondary hover:text-navy hover:bg-ivory text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Edit Chapter Content"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Link>

                    {/* Delete Button (hard delete allowed only while novel is draft) */}
                    {isDraft ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(chapter.id)}
                        className="p-1.5 rounded-lg text-secondary hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                        title="Delete Chapter"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span
                        className="p-1.5 text-slate-300 cursor-not-allowed"
                        title="Published/Submitted novel chapters cannot be hard-deleted. Use 'Unpublished' toggle instead."
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import Modal */}
      <ChapterImportModal
        novelId={novel.id}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Review Submission Checklist Modal */}
      <SubmitReviewModal
        novel={novel}
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl border border-border max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-base text-navy">
                Delete Draft Chapter?
              </h3>
              <p className="text-xs text-secondary">
                Are you sure you want to permanently delete this chapter? This action is irreversible.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
