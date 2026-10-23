'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { importChaptersAction } from '@/app/actions/writer';
import { UrduText } from '@/components/urdu/UrduText';
import { normalizeArabicLetterForms } from '@/lib/text/clean-urdu';
import type { ChapterPreview } from '@/lib/text/manuscript-parser';
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  FileCheck,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';

interface ChapterImportModalProps {
  novelId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ChapterImportModal({
  novelId,
  isOpen,
  onClose,
}: ChapterImportModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedChapters, setParsedChapters] = useState<ChapterPreview[] | null>(null);
  const [normalizeArabicLetters, setNormalizeArabicLetters] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParsedChapters(null);
    setNormalizeArabicLetters(false);
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/writer/parse-manuscript', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse manuscript file.');
      }

      setParsedChapters(data.chapters);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setParseError(msg);
    } finally {
      setIsParsing(false);
    }
  };

  // Derive displayed chapters: applies letter normalization ONLY when explicitly opted-in
  const displayedChapters: ChapterPreview[] = (parsedChapters || []).map((chap) => {
    if (!normalizeArabicLetters) return chap;
    return {
      ...chap,
      content_urdu: normalizeArabicLetterForms(chap.content_urdu),
      title_urdu: normalizeArabicLetterForms(chap.title_urdu),
    };
  });

  const handleConfirmImport = async () => {
    if (displayedChapters.length === 0) return;

    // Verify all chapters satisfy character length limit
    const oversized = displayedChapters.filter((c) => !c.is_valid_length);
    if (oversized.length > 0) {
      setParseError(
        `Chapter "${oversized[0].title_urdu}" exceeds 120,000 characters limit (${oversized[0].char_count.toLocaleString()} chars). Please split this chapter before importing.`
      );
      return;
    }

    setIsImporting(true);
    setParseError(null);

    const payload = displayedChapters.map((c) => ({
      title_urdu: c.title_urdu,
      content_urdu: c.content_urdu,
      is_free_preview: false,
      is_published: true,
    }));

    const res = await importChaptersAction(novelId, payload);
    setIsImporting(false);

    if (!res.success) {
      setParseError(res.error || 'Failed to import chapters.');
    } else {
      setImportSuccess(`Successfully imported ${res.data?.imported_count} chapters!`);
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-surface rounded-2xl border border-border max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-ivory/50">
          <div>
            <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
              <Upload className="w-5 h-5 text-accent" />
              Import Manuscript (.docx / .txt)
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              Upload a manuscript to automatically detect and split chapters with clean Urdu typography.
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {importSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold">{importSuccess}</p>
            </div>
          )}

          {parseError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs">{parseError}</p>
            </div>
          )}

          {/* Upload Zone */}
          {!parsedChapters && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-border bg-ivory/50 p-8 text-center cursor-pointer hover:border-accent hover:bg-ivory transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-white border border-border flex items-center justify-center mx-auto text-secondary group-hover:text-accent group-hover:scale-105 transition-all shadow-sm">
                  {isParsing ? (
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>

                <div className="mt-4 space-y-1">
                  <p className="text-sm font-bold text-navy">
                    {isParsing
                      ? 'Analyzing manuscript & detecting chapters...'
                      : 'Choose .docx or .txt manuscript file'}
                  </p>
                  <p className="text-xs text-secondary">
                    Supports Microsoft Word (.docx) and UTF-8 plain text (.txt). Max 10MB.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-navy">
                  <BookOpen className="w-4 h-4 text-accent" />
                  How Chapter Detection Works:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-secondary text-[11px]">
                  <li>
                    Headings matching <strong className="text-main">باب اول</strong>, <strong className="text-main">باب ۱</strong>, <strong className="text-main">قسط نمبر ۲</strong>, or <strong className="text-main">Chapter 1</strong> are automatically recognized.
                  </li>
                  <li>
                    Markdown headings (<code className="bg-white px-1 rounded border"># باب ۱</code>) and dividers (<code className="bg-white px-1 rounded border">---</code>) are also supported.
                  </li>
                  <li>
                    Files without explicit markers will be placed into a single introductory chapter.
                  </li>
                  <li>
                    Manuscript files are parsed in memory and <strong className="text-navy">never saved to disk or cloud storage</strong>.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Chapters Preview List */}
          {parsedChapters && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-serif font-bold text-navy flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    Detected Chapters Preview ({parsedChapters.length})
                  </h4>
                  <p className="text-xs text-secondary">
                    From: <span className="font-semibold text-main">{selectedFile?.name}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setParsedChapters(null);
                    setSelectedFile(null);
                  }}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  Upload different file
                </button>
              </div>

              {/* Arabic Letter Normalization Opt-In */}
              <div className="p-3.5 rounded-xl border border-border bg-white space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={normalizeArabicLetters}
                    onChange={(e) => setNormalizeArabicLetters(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-semibold text-main block">
                      Convert Arabic letter forms to Urdu forms (ي/ى → ی, ك → ک, ة → ہ)
                    </span>
                    <span className="text-[11px] text-secondary block">
                      Default is off to preserve Arabic Quranic verses and duas. Check this only to normalize Arabic keyboard typing.
                    </span>
                  </div>
                </label>

                {normalizeArabicLetters && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Warning:</strong> Arabic quotations, Quranic verses, and duas may have their orthography altered.
                    </span>
                  </div>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-ivory/30">
                {displayedChapters.map((chap) => (
                  <div
                    key={chap.chapter_number}
                    className="p-3 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-navy text-white">
                          #{chap.chapter_number}
                        </span>
                        <UrduText as="span" size="sm" className="font-bold text-navy py-0" dir="rtl">
                          {chap.title_urdu}
                        </UrduText>
                      </div>

                      <p className="text-[11px] text-secondary line-clamp-2 italic" dir="rtl">
                        &ldquo;{chap.content_urdu.slice(0, 160)}...&rdquo;
                      </p>
                    </div>

                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="text-[11px] font-semibold text-main">
                        {chap.word_count.toLocaleString()} words
                      </div>
                      <div
                        className={`text-[10px] font-mono ${
                          chap.is_valid_length ? 'text-secondary' : 'text-rose-600 font-bold'
                        }`}
                      >
                        {chap.char_count.toLocaleString()} / 120,000 chars
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-ivory/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-main"
          >
            Cancel
          </button>

          {parsedChapters && (
            <button
              type="button"
              disabled={isImporting}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light disabled:opacity-50 shadow-sm"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing into Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm & Import ({displayedChapters.length}) Chapters</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
