'use client';

import React, { useState } from 'react';
import { UrduText } from '@/components/urdu/UrduText';
import { History, Trash2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { computeLineDiff, type DiffLine } from '@/lib/drafts/sync-state-machine';


interface DraftRestoreModalProps {
  isOpen: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  localUpdatedAt: string;
  localCharCount: number;
  liveCharCount: number;
  localTitle?: string | null;
  localContent: string;
  liveContent: string;
}

export function DraftRestoreModal({
  isOpen,
  onRestore,
  onDiscard,
  localUpdatedAt,
  localCharCount,
  liveCharCount,
  localTitle,
  localContent,
  liveContent,
}: DraftRestoreModalProps) {
  const [showComparison, setShowComparison] = useState(false);

  if (!isOpen) return null;

  const formattedTime = new Date(localUpdatedAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const diff = showComparison ? computeLineDiff(liveContent, localContent) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border pb-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold font-serif text-navy">
              Unsynced Changes Found on This Device
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              A newer draft was saved locally on this computer from {formattedTime}.
            </p>
          </div>
        </div>

        {/* Comparison Summary Card */}
        <div className="bg-ivory/50 rounded-xl p-4 border border-border space-y-2">
          {localTitle && (
            <div className="text-xs font-semibold text-navy flex items-center justify-between">
              <span>Draft Title:</span>
              <UrduText as="span" className="font-urdu text-sm">
                {localTitle}
              </UrduText>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div className="bg-surface p-2.5 rounded-lg border border-border">
              <span className="text-secondary block text-[11px]">Saved on This Device</span>
              <span className="font-mono font-bold text-navy mt-0.5 block">
                {localCharCount.toLocaleString()} chars
              </span>
            </div>
            <div className="bg-surface p-2.5 rounded-lg border border-border">
              <span className="text-secondary block text-[11px]">Server / Live Version</span>
              <span className="font-mono font-bold text-navy mt-0.5 block">
                {liveCharCount.toLocaleString()} chars
              </span>
            </div>
          </div>
        </div>

        {/* Optional Line Comparison Toggle */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowComparison(!showComparison)}
            className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
          >
            {showComparison ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{showComparison ? 'Hide text difference' : 'Compare draft with live text'}</span>
          </button>

          {showComparison && (
            <div
              className="max-h-48 overflow-y-auto rounded-xl border border-border bg-surface-muted p-3 font-mono text-xs space-y-1 select-text"
              dir="rtl"
            >
              {diff.slice(0, 40).map((line: DiffLine, idx: number) => (
                <div
                  key={idx}
                  className={`py-0.5 px-2 rounded leading-relaxed text-right font-urdu text-sm ${
                    line.type === 'added'
                      ? 'bg-success-soft text-success-text'
                      : line.type === 'removed'
                      ? 'bg-danger-soft text-danger-text line-through opacity-80'
                      : 'text-text-muted'
                  }`}
                >
                  <UrduText as="span">{line.text || ' '}</UrduText>
                </div>
              ))}
              {diff.length > 40 && (
                <div className="text-center text-[10px] text-text-muted pt-1 font-sans" dir="ltr">
                  ... and {diff.length - 40} more lines
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 rounded-xl border border-danger-border/30 text-xs font-semibold text-danger-text hover:bg-danger/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard Local Draft</span>
          </button>

          <button
            type="button"
            onClick={onRestore}
            className="px-4 py-2 rounded-xl bg-navy text-white text-xs font-semibold hover:bg-navy-light shadow-sm transition-colors flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Restore Unsynced Text</span>
          </button>
        </div>
      </div>
    </div>
  );
}
