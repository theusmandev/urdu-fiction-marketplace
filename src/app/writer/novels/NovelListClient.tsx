'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { SubmitReviewModal, type NovelChecklistData } from './SubmitReviewModal';
import {
  withdrawNovelSubmissionAction,
  unpublishNovelAction,
} from '@/app/actions/writer';
import {
  BookOpen,
  Plus,
  Edit3,
  Layers,
  Send,
  RotateCcw,
  EyeOff,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export interface NovelCardItem extends NovelChecklistData {
  created_at: string;
  updated_at: string;
  moderation_reason: string | null;
  slug: string;
  total_chapters: number;
  genres_labels: string[];
}

interface NovelListClientProps {
  initialNovels: NovelCardItem[];
}

export function NovelListClient({ initialNovels }: NovelListClientProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedNovelForModal, setSelectedNovelForModal] = useState<NovelChecklistData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // State for Withdraw Confirmation
  const [withdrawNovelId, setWithdrawNovelId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // State for Unpublish Confirmation
  const [unpublishNovelId, setUnpublishNovelId] = useState<string | null>(null);
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredNovels = initialNovels.filter((novel) => {
    if (activeTab === 'all') return true;
    return novel.status === activeTab;
  });

  const counts = {
    all: initialNovels.length,
    draft: initialNovels.filter((n) => n.status === 'draft').length,
    under_review: initialNovels.filter((n) => n.status === 'under_review').length,
    published: initialNovels.filter((n) => n.status === 'published').length,
    rejected: initialNovels.filter((n) => n.status === 'rejected').length,
    suspended: initialNovels.filter((n) => n.status === 'suspended').length,
  };

  const handleOpenReviewModal = (novel: NovelCardItem) => {
    setSelectedNovelForModal(novel);
    setIsModalOpen(true);
  };

  const handleWithdraw = async (novelId: string) => {
    setIsWithdrawing(true);
    setErrorMessage(null);
    const res = await withdrawNovelSubmissionAction(novelId);
    setIsWithdrawing(false);
    setWithdrawNovelId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to withdraw submission.');
    } else {
      setSuccessMessage('Novel submission withdrawn to draft.');
      router.refresh();
    }
  };

  const handleUnpublish = async (novelId: string) => {
    setIsUnpublishing(true);
    setErrorMessage(null);
    const res = await unpublishNovelAction(novelId);
    setIsUnpublishing(false);
    setUnpublishNovelId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to unpublish novel.');
    } else {
      setSuccessMessage('Novel unpublished and reverted to draft.');
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
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

      {/* Header and Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-navy">
            Author Manuscripts & Novels
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Manage your authored titles, upload chapter contents, and submit manuscripts for editorial review.
          </p>
        </div>

        <Link
          href="/writer/novels/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Novel</span>
        </Link>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-border text-xs scrollbar-none">
        {[
          { key: 'all', label: 'All Novels', count: counts.all },
          { key: 'draft', label: 'Drafts', count: counts.draft },
          { key: 'under_review', label: 'Under Review', count: counts.under_review },
          { key: 'published', label: 'Published', count: counts.published },
          { key: 'rejected', label: 'Revision Required', count: counts.rejected },
          { key: 'suspended', label: 'Suspended', count: counts.suspended },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-navy text-white font-semibold'
                  : 'text-secondary hover:text-navy hover:bg-ivory'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-secondary'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Novel Cards Grid */}
      {filteredNovels.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-navy">
              No novels found in this category
            </h3>
            <p className="text-xs text-secondary max-w-sm mx-auto">
              {activeTab === 'all'
                ? 'You have not registered any novels yet. Begin by drafting your first title.'
                : `No manuscripts are currently in ${activeTab.replace('_', ' ')} status.`}
            </p>
          </div>
          {activeTab === 'all' && (
            <Link
              href="/writer/novels/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-navy text-xs font-semibold hover:bg-accent/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Novel</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredNovels.map((novel) => {
            const isDraftOrRejected = novel.status === 'draft' || novel.status === 'rejected';
            const isUnderReview = novel.status === 'under_review';
            const isPublished = novel.status === 'published';

            return (
              <div
                key={novel.id}
                className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm flex flex-col justify-between hover:border-slate-300 transition-all"
              >
                <div>
                  {/* Top Bar: Status + Actions */}
                  <div className="p-4 border-b border-border/80 flex items-center justify-between gap-2 bg-ivory/30">
                    <StatusBadge status={novel.status} size="sm" showUrduLabel />

                    <div className="flex items-center gap-1.5 text-xs text-secondary font-mono">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{novel.price_pkr === 0 ? 'Free' : `PKR ${novel.price_pkr.toLocaleString()}`}</span>
                    </div>
                  </div>

                  {/* Body with Cover + Titles */}
                  <div className="p-5 flex gap-4">
                    {/* Cover Image */}
                    <div className="w-20 h-28 rounded-lg bg-ivory border border-border overflow-hidden shrink-0 shadow-inner">
                      {novel.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={novel.cover_url}
                          alt={novel.title_english}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-2 text-center text-[10px]">
                          <BookOpen className="w-5 h-5 mb-1" />
                          <span>No Cover</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata & Urdu Text */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div dir="rtl" className="text-right">
                        <UrduText as="h3" size="lg" className="text-navy font-bold line-clamp-1 py-0">
                          {novel.title_urdu}
                        </UrduText>
                      </div>

                      <div className="text-xs font-semibold text-main line-clamp-1">
                        {novel.title_english}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-accent" />
                          <span>{novel.total_chapters} Chapter{novel.total_chapters === 1 ? '' : 's'}</span>
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(novel.created_at).toLocaleDateString()}</span>
                        </span>
                      </div>

                      {/* Genre Tags */}
                      {novel.genres_labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {novel.genres_labels.map((genre, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-ivory border border-border text-secondary font-medium"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Editorial Rejection Notice if rejected */}
                  {novel.status === 'rejected' && novel.moderation_reason && (
                    <div className="mx-5 mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-800">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Editorial Revision Requested:</span>
                      </div>
                      <p className="leading-relaxed pl-5">
                        &ldquo;{novel.moderation_reason}&rdquo;
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Quick Actions */}
                <div className="p-4 bg-ivory/50 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/writer/novels/${novel.id}/chapters`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy text-white text-[11px] font-semibold hover:bg-navy-light shadow-sm"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Chapters ({novel.total_chapters})</span>
                    </Link>

                    <Link
                      href={`/writer/novels/${novel.id}/edit`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface text-secondary hover:text-navy hover:bg-ivory text-[11px] font-semibold"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Submit Review CTA for Draft & Rejected */}
                    {isDraftOrRejected && (
                      <button
                        type="button"
                        onClick={() => handleOpenReviewModal(novel)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-navy text-[11px] font-semibold hover:bg-accent/90 shadow-sm transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit for Review</span>
                      </button>
                    )}

                    {/* Withdraw CTA for Under Review */}
                    {isUnderReview && (
                      <button
                        type="button"
                        onClick={() => setWithdrawNovelId(novel.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface text-amber-800 hover:bg-amber-50 text-[11px] font-semibold"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Withdraw</span>
                      </button>
                    )}

                    {/* Unpublish CTA for Published */}
                    {isPublished && (
                      <>
                        <button
                          type="button"
                          onClick={() => setUnpublishNovelId(novel.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface text-secondary hover:text-rose-600 hover:bg-rose-50 text-[11px] font-semibold"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Unpublish</span>
                        </button>

                        <a
                          href={`/novels/${novel.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 p-1.5 rounded-lg text-secondary hover:text-navy"
                          title="View public novel page"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit for Review Modal */}
      {selectedNovelForModal && (
        <SubmitReviewModal
          novel={selectedNovelForModal}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedNovelForModal(null);
          }}
        />
      )}

      {/* Confirmation Dialog: Withdraw Submission */}
      {withdrawNovelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl border border-border max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-base text-navy">
                Withdraw Manuscript Submission?
              </h3>
              <p className="text-xs text-secondary">
                This novel will return to draft status. You can edit manuscript chapters and resubmit whenever ready.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setWithdrawNovelId(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isWithdrawing}
                onClick={() => handleWithdraw(withdrawNovelId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light disabled:opacity-50"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Withdrawing...</span>
                  </>
                ) : (
                  <span>Yes, Return to Draft</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Unpublish Novel */}
      {unpublishNovelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl border border-border max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <EyeOff className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-base text-navy">
                Unpublish Novel?
              </h3>
              <p className="text-xs text-secondary">
                The novel will return to draft and new readers will no longer be able to purchase it.
                <strong className="text-main block mt-1">Existing buyers who purchased this novel will retain their library access.</strong>
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setUnpublishNovelId(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUnpublishing}
                onClick={() => handleUnpublish(unpublishNovelId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {isUnpublishing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Unpublishing...</span>
                  </>
                ) : (
                  <span>Yes, Unpublish</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
