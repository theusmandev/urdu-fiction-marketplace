'use client';

import React from 'react';
import { UrduText } from '@/components/urdu/UrduText';
import { computeLineDiff } from '@/lib/drafts/sync-engine';
import { AlertTriangle, Copy, ArrowRight, X, Clock, Laptop } from 'lucide-react';

interface DraftConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  localContent: string;
  localTitle: string;
  serverContent: string;
  serverTitle: string;
  serverRevision: number;
  serverUpdatedAt: string;
  serverDeviceLabel?: string | null;
  onKeepMine: () => Promise<void>;
  onKeepServer: () => Promise<void>;
  onCopyToNewDraft: () => Promise<void>;
}

export function DraftConflictModal({
  isOpen,
  onClose,
  localContent,
  localTitle,
  serverContent,
  serverTitle,
  serverRevision,
  serverUpdatedAt,
  serverDeviceLabel,
  onKeepMine,
  onKeepServer,
  onCopyToNewDraft,
}: DraftConflictModalProps) {
  if (!isOpen) return null;

  const diff = computeLineDiff(serverContent, localContent);
  const formattedServerTime = new Date(serverUpdatedAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-serif text-navy">Draft Version Conflict</h2>
              <p className="text-xs text-secondary mt-0.5">
                This chapter was modified in the cloud from another session (Revision #{serverRevision}).
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

        {/* Server metadata banner */}
        <div className="bg-ivory/60 rounded-xl p-3 border border-border flex flex-wrap items-center gap-4 text-xs text-secondary">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-accent" />
            <span>Server updated: {formattedServerTime}</span>
          </div>
          {serverDeviceLabel && (
            <div className="flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-accent" />
              <span>Device: {serverDeviceLabel}</span>
            </div>
          )}
          {serverTitle && serverTitle !== localTitle && (
            <div className="w-full pt-1 border-t border-border/50 text-right font-urdu text-sm">
              <span className="text-secondary text-xs font-sans">کلاؤڈ عنوان: </span>
              <span className="font-bold text-navy">{serverTitle}</span>
              {localTitle && (
                <>
                  <span className="text-secondary text-xs font-sans mx-2">مقامی: </span>
                  <span className="text-accent">{localTitle}</span>
                </>
              )}
            </div>
          )}
        </div>


        {/* Difference View */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-secondary">
            <span>Visual Difference (Red: Server / Green: This Device)</span>
            <span className="font-mono">
              Local: {localContent.length} chars | Server: {serverContent.length} chars
            </span>
          </div>

          <div
            className="max-h-60 overflow-y-auto rounded-xl border border-border bg-slate-950 p-4 font-mono text-xs space-y-1 select-text"
            dir="rtl"
          >
            {diff.slice(0, 50).map((line, idx) => (
              <div
                key={idx}
                className={`py-0.5 px-2 rounded leading-relaxed text-right font-urdu text-sm ${
                  line.type === 'added'
                    ? 'bg-emerald-950/60 text-emerald-300'
                    : line.type === 'removed'
                    ? 'bg-rose-950/60 text-rose-300 line-through opacity-80'
                    : 'text-slate-300'
                }`}
              >
                <UrduText as="span">{line.text || ' '}</UrduText>
              </div>
            ))}
            {diff.length > 50 && (
              <div className="text-center text-[11px] text-slate-500 pt-2 font-sans" dir="ltr">
                ... and {diff.length - 50} more lines
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onKeepServer}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-secondary hover:text-navy hover:bg-ivory transition-colors flex items-center justify-center gap-2"
          >
            <span>Keep Server Version</span>
            <span className="text-[10px] text-secondary/70">(Local copy safely archived)</span>
          </button>

          <button
            type="button"
            onClick={onCopyToNewDraft}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-navy bg-ivory hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
          >
            <Copy className="w-3.5 h-3.5 text-accent" />
            <span>Copy Mine to New Draft</span>
          </button>

          <button
            type="button"
            onClick={onKeepMine}
            className="px-4 py-2.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-light shadow-sm transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Keep Mine (Overwrite Cloud)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
