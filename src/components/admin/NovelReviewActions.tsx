'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminApproveNovelAction,
  adminRejectNovelAction,
  adminSuspendNovelAction,
  adminUnsuspendNovelAction,
  adminSetNovelFeaturedAction,
} from '@/app/actions/admin';
import { deleteDraftNovelAction } from '@/app/actions/writer';
import { ReasonConfirmDialog } from './ReasonConfirmDialog';
import {
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Star,
  RefreshCw,
  CheckSquare,
  Square,
  ShieldCheck,
  Trash2,
  Loader2,
} from 'lucide-react';

interface NovelReviewActionsProps {
  novelId: string;
  status: string;
  isFeatured: boolean;
  rightsDeclared: boolean;
}

export function NovelReviewActions({
  novelId,
  status,
  isFeatured,
  rightsDeclared,
}: NovelReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal dialog states
  const [activeDialog, setActiveDialog] = useState<
    'approve' | 'reject' | 'suspend' | 'unsuspend' | null
  >(null);

  // Admin delete draft state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Moderation Checklist State
  const [checklist, setChecklist] = useState({
    rights: rightsDeclared,
    content_policy: true,
    quality: true,
    price: true,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApproveNovelAction(novelId, checklist);
      if (!res.success) {
        setError(res.error || 'Failed to approve novel');
      } else {
        setSuccessMsg('Novel successfully approved and published to the marketplace!');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleReject = async (reason: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminRejectNovelAction(novelId, reason);
      if (!res.success) {
        setError(res.error || 'Failed to reject novel');
      } else {
        setSuccessMsg('Novel submission rejected. Editorial feedback sent to author.');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleSuspend = async (reason: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminSuspendNovelAction(novelId, reason);
      if (!res.success) {
        setError(res.error || 'Failed to suspend novel');
      } else {
        setSuccessMsg('Novel suspended. Catalog visibility and new purchases paused.');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleUnsuspend = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUnsuspendNovelAction(novelId);
      if (!res.success) {
        setError(res.error || 'Failed to unsuspend novel');
      } else {
        setSuccessMsg('Novel successfully restored to published catalog.');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleToggleFeatured = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminSetNovelFeaturedAction(novelId, !isFeatured);
      if (!res.success) {
        setError(res.error || 'Failed to toggle featured status');
      } else {
        setSuccessMsg(
          !isFeatured ? 'Novel featured on homepage!' : 'Novel un-featured.'
        );
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await deleteDraftNovelAction(novelId);
      if (!res.success) {
        setError(res.error || 'Failed to delete draft novel');
        setIsDeleteModalOpen(false);
      } else {
        router.push('/admin/novels');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-success-soft border border-success-border text-success-text text-xs">
          {successMsg}
        </div>
      )}

      {/* Moderation Checklist (Under Review or Reviewing) */}
      {(status === 'under_review' || status === 'draft') && (
        <div className="bg-surface-muted/60 border border-border rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-main uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-accent-admin" />
            <span>Moderation Pre-Approval Checklist</span>
          </div>
          <div className="space-y-1.5 text-xs text-main">
            <button
              type="button"
              onClick={() => toggleCheck('rights')}
              className="flex items-center gap-2 w-full text-left hover:text-accent-admin transition-colors py-0.5"
            >
              {checklist.rights ? (
                <CheckSquare className="w-4 h-4 text-success shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-muted shrink-0" />
              )}
              <span>Original copyright & author rights declaration verified</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCheck('content_policy')}
              className="flex items-center gap-2 w-full text-left hover:text-accent-admin transition-colors py-0.5"
            >
              {checklist.content_policy ? (
                <CheckSquare className="w-4 h-4 text-success shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-muted shrink-0" />
              )}
              <span>Adheres to platform guidelines (no copyright infringement or illegal text)</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCheck('quality')}
              className="flex items-center gap-2 w-full text-left hover:text-accent-admin transition-colors py-0.5"
            >
              {checklist.quality ? (
                <CheckSquare className="w-4 h-4 text-success shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-muted shrink-0" />
              )}
              <span>Urdu typography formatting & chapter sequence inspected</span>
            </button>

            <button
              type="button"
              onClick={() => toggleCheck('price')}
              className="flex items-center gap-2 w-full text-left hover:text-accent-admin transition-colors py-0.5"
            >
              {checklist.price ? (
                <CheckSquare className="w-4 h-4 text-success shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-muted shrink-0" />
              )}
              <span>Pricing is reasonable and adheres to platform limits</span>
            </button>
          </div>
          <p className="text-[10px] text-muted italic">
            All checklist items are logged to the audit log upon approval.
          </p>
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center gap-2.5">
        {(status === 'under_review' || status === 'draft') && (
          <>
            <button
              type="button"
              onClick={() => setActiveDialog('approve')}
              disabled={loading || !allChecked}
              title={!allChecked ? 'Complete all checklist items above before approving' : undefined}
              className="px-4 py-2 rounded-xl bg-success hover:bg-success text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve & Publish</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveDialog('reject')}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-danger hover:bg-danger text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <XCircle className="w-4 h-4" />
              <span>Reject Submission</span>
            </button>
            {status === 'draft' && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                disabled={loading || isDeleting}
                className="px-4 py-2 rounded-xl border border-danger-border bg-danger-soft hover:bg-danger-soft/80 text-danger-text text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Draft</span>
              </button>
            )}
          </>
        )}

        {status === 'published' && (
          <>
            <button
              type="button"
              onClick={() => setActiveDialog('suspend')}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-warning hover:bg-warning text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>Suspend Novel</span>
            </button>

            <button
              type="button"
              onClick={handleToggleFeatured}
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm ${
                isFeatured
                  ? 'bg-warning-soft text-warning-text border border-warning-border hover:bg-warning-soft'
                  : 'bg-surface-muted hover:bg-surface text-main border border-border'
              }`}
            >
              <Star className={`w-4 h-4 ${isFeatured ? 'fill-accent-strong/20 text-accent-strong' : 'text-muted'}`} />
              <span>{isFeatured ? 'Un-Feature Novel' : 'Feature on Marketplace'}</span>
            </button>
          </>
        )}

        {status === 'suspended' && (
          <button
            type="button"
            onClick={() => setActiveDialog('unsuspend')}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-success hover:bg-success text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Unsuspend Novel</span>
          </button>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ReasonConfirmDialog
        isOpen={activeDialog === 'approve'}
        title="Approve & Publish Novel"
        description="This will transition the novel to 'published' status, make it live on the marketplace, and notify the author."
        confirmText="Confirm & Publish"
        confirmVariant="primary"
        requireReason={false}
        isLoading={loading}
        onConfirm={handleApprove}
        onCancel={() => setActiveDialog(null)}
      />

      <ReasonConfirmDialog
        isOpen={activeDialog === 'reject'}
        title="Reject Novel Submission"
        description="Provide a clear editorial explanation for why this manuscript submission was rejected. This feedback will be displayed to the author."
        reasonLabel="Rejection Reason"
        reasonPlaceholder="e.g. Manuscript contains unformatted chapters, low resolution cover..."
        confirmText="Reject Novel"
        confirmVariant="destructive"
        requireReason={true}
        isLoading={loading}
        onConfirm={handleReject}
        onCancel={() => setActiveDialog(null)}
      />

      <ReasonConfirmDialog
        isOpen={activeDialog === 'suspend'}
        title="Suspend Published Novel"
        description="Suspending this novel hides it from the marketplace catalog and prevents NEW orders. Existing reader entitlements remain unaffected. Mandatory reason required."
        reasonLabel="Suspension Reason"
        reasonPlaceholder="e.g. Copyright claim investigation or policy infringement..."
        confirmText="Suspend Novel"
        confirmVariant="destructive"
        requireReason={true}
        isLoading={loading}
        onConfirm={handleSuspend}
        onCancel={() => setActiveDialog(null)}
      />

      <ReasonConfirmDialog
        isOpen={activeDialog === 'unsuspend'}
        title="Unsuspend Novel"
        description="This will return the novel to published status and make it available in the public catalog again."
        confirmText="Unsuspend Novel"
        confirmVariant="primary"
        requireReason={false}
        isLoading={loading}
        onConfirm={handleUnsuspend}
        onCancel={() => setActiveDialog(null)}
      />

      {/* Confirmation Dialog: Admin Delete Draft Novel */}
      {isDeleteModalOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setIsDeleteModalOpen(false);
          }}
        >
          <div className="bg-surface rounded-2xl border border-border max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-soft border border-danger-border text-danger-text flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-serif font-bold text-base text-navy">
                Delete Draft Novel?
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                As an administrator, you are about to permanently delete this draft novel. All unpublished chapters and metadata will be permanently removed. This action cannot be undone.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white text-xs font-semibold hover:bg-danger-hover disabled:opacity-50 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Draft</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
