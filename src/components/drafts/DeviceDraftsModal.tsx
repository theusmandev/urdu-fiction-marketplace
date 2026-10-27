'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UrduText } from '@/components/urdu/UrduText';
import {
  type LocalDraft,
  listLocalDraftsForNovel,
  deleteLocalDraft,
  getRememberDraftsOnDevice,
  setRememberDraftsOnDevice,
  clearSyncedLocalDrafts,
} from '@/lib/drafts/local-store';
import {
  Trash2,
  RotateCcw,
  Clock,
  ShieldAlert,
  X,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';

interface DeviceDraftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  novelId: string;
  onRestoreDraft?: (draft: LocalDraft) => void;
}

export function DeviceDraftsModal({
  isOpen,
  onClose,
  userId,
  novelId,
  onRestoreDraft,
}: DeviceDraftsModalProps) {
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [rememberDrafts, setRememberDrafts] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLocalDraftsForNovel(userId, novelId);
      setDrafts(list);
    } catch (err) {
      console.error('Failed to load local drafts:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, novelId]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    listLocalDraftsForNovel(userId, novelId)
      .then((list) => {
        if (mounted) {
          setDrafts(list);
          setRememberDrafts(getRememberDraftsOnDevice(userId));
          setActionNotice(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to load local drafts:', err);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, userId, novelId]);

  const handleRememberToggle = (checked: boolean) => {
    setRememberDrafts(checked);
    setRememberDraftsOnDevice(userId, checked);
  };

  const handleDelete = async (clientKey: string) => {
    await deleteLocalDraft(clientKey, userId);
    setActionNotice('Draft removed from this device.');
    refreshDrafts();
  };

  const handleClearSynced = async () => {
    const count = await clearSyncedLocalDrafts(userId);
    setActionNotice(`Cleared ${count} synced draft(s) from this device.`);
    refreshDrafts();
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy/10 border border-navy/20 flex items-center justify-center text-navy shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-serif text-navy">
                Drafts on This Device
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                Local offline copies stored in this browser profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-secondary hover:text-navy hover:bg-ivory transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Notice & Remember on device opt-in */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-2">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <p className="font-semibold">Local Storage Security</p>
              <p className="text-[11px] mt-0.5 text-secondary">
                Unpublished manuscripts are stored unencrypted in this browser profile. Avoid retaining drafts on shared or public computers.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1 text-xs text-navy font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={rememberDrafts}
              onChange={(e) => handleRememberToggle(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>Remember drafts on this device across sessions</span>
          </label>
        </div>

        {actionNotice && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Drafts List */}
        <div className="space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-secondary">Loading drafts from device...</div>
          ) : drafts.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm font-semibold text-navy">No drafts stored on this device</p>
              <p className="text-xs text-secondary">
                As you type in the chapter editor, drafts are saved here automatically.
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 divide-y divide-border/50">
              {drafts.map((draft) => {
                const formattedTime = new Date(draft.updatedAt).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'short',
                });

                return (
                  <div
                    key={draft.client_key}
                    className="pt-2 pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono px-1.5 py-0.5 rounded bg-ivory text-[10px] text-navy font-semibold">
                          {draft.chapterNumber ? `Ch. ${draft.chapterNumber}` : 'New Chapter'}
                        </span>
                        <UrduText as="span" className="font-urdu text-sm font-bold text-navy truncate">
                          {draft.title || 'بلا عنوان مسودہ'}
                        </UrduText>
                        {draft.dirty ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-500 font-medium">
                            Unsynced
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-500 font-medium">
                            Synced
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-secondary font-mono">
                        <span>{draft.content.length.toLocaleString()} chars</span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 font-sans">
                          <Clock className="w-3 h-3" />
                          {formattedTime}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {onRestoreDraft && (
                        <button
                          type="button"
                          onClick={() => {
                            onRestoreDraft(draft);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg border border-border bg-ivory text-xs font-semibold text-navy hover:bg-slate-200 transition-colors flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3 text-accent" />
                          <span>Restore</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(draft.client_key)}
                        className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Delete from this device"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={handleClearSynced}
            className="text-xs text-secondary hover:text-navy underline flex items-center gap-1"
          >
            <span>Clear synced drafts</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-secondary hover:text-navy hover:bg-ivory"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
