'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  analyzeManuscript,
  derivePatternFromExample,
  splitBySize,
  splitAtMarkers,
  buildParts,
  type ManuscriptAnalysis,
  DEFAULT_TARGET_WORDS,
  MIN_TARGET_WORDS,
  MAX_TARGET_WORDS,
  HARD_MAX_CHAPTER_CHARACTERS,
  MIN_CHAPTER_WORDS,
} from '@/lib/text/split-chapters';
import { normalizeArabicLetterForms } from '@/lib/text/clean-urdu';
import { importChaptersAction, splitChapterAction } from '@/app/actions/writer';
import {
  Upload,
  Scissors,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
  ArrowRight,
  ArrowLeft,
  Merge,
  Sparkles,
  Info,
} from 'lucide-react';

export interface ChapterSplitterWizardProps {
  novelId: string;
  novelTitleUrdu?: string;
  novelTitleEnglish?: string;
  isOpen: boolean;
  onClose: () => void;
  // If splitting an existing chapter from ChapterEditor:
  mode?: 'import' | 'split-existing';
  existingChapterId?: string;
  existingChapterNumber?: number;
  initialText?: string;
  suggestedStartNumber?: number;
  onSuccess?: () => void;
}

type WizardStep =
  | 'upload'
  | 'strategy'
  | 'structure'
  | 'blocks'
  | 'size'
  | 'preview'
  | 'numbering';

type SplittingStrategy = 'size' | 'headings' | 'manual';

export function ChapterSplitterWizard({
  novelId,
  novelTitleUrdu,
  novelTitleEnglish,
  isOpen,
  onClose,
  mode = 'import',
  existingChapterId,
  existingChapterNumber,
  initialText,
  suggestedStartNumber = 1,
  onSuccess,
}: ChapterSplitterWizardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core Text & Analysis State
  const [rawText, setRawText] = useState<string>(initialText || '');
  const [fileName, setFileName] = useState<string | null>(null);
  const [normalizeArabic, setNormalizeArabic] = useState<boolean>(false);

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialText ? 'strategy' : 'upload'
  );

  // Strategy State
  const [strategy, setStrategy] = useState<SplittingStrategy>('size');

  // Manual & Heading Markers
  const [manualSplitLines, setManualSplitLines] = useState<number[]>([]);
  const [activePatternDesc, setActivePatternDesc] = useState<string | null>(() => {
    if (typeof window === 'undefined' || !novelId) return null;
    try {
      return localStorage.getItem(`unb_splitter_pattern_${novelId}`);
    } catch {
      return null;
    }
  });

  // Front-Matter & End-Note Decisions
  const [removeFrontMatter, setRemoveFrontMatter] = useState<boolean>(true);
  const [removeEndNote, setRemoveEndNote] = useState<boolean>(true);

  // Size Configuration
  const [targetWords, setTargetWords] = useState<number>(DEFAULT_TARGET_WORDS);
  const [prioritizeSceneBreaks, setPrioritizeSceneBreaks] = useState<boolean>(true);

  // Preview & Final Parts State
  const [titleStyle, setTitleStyle] = useState<'urdu' | 'english'>('urdu');
  const [firstPartFree, setFirstPartFree] = useState<boolean>(false);
  const [editedTitles, setEditedTitles] = useState<Record<number, string>>({});
  const [startChapterNumber, setStartChapterNumber] = useState<number>(
    existingChapterNumber ?? suggestedStartNumber
  );

  // Loading & Error States
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Derive analysis whenever rawText changes
  const analysis: ManuscriptAnalysis = useMemo(() => {
    if (!rawText.trim()) {
      return {
        paragraphs: [],
        allLines: [],
        frontMatter: null,
        endNote: null,
        headingCandidates: [],
        sceneBreaks: [],
        totalWords: 0,
        totalChars: 0,
      };
    }
    const processedText = normalizeArabic
      ? normalizeArabicLetterForms(rawText)
      : rawText;
    return analyzeManuscript(processedText);
  }, [rawText, normalizeArabic]);

  // Derive effective body text based on front-matter / end-note removal choices
  const effectiveBodyText = useMemo(() => {
    if (!rawText.trim()) return '';
    const text = rawText;
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let startLine = 0;
    let endLine = lines.length;

    if (removeFrontMatter && analysis.frontMatter) {
      startLine = analysis.frontMatter.endLine;
    }
    if (removeEndNote && analysis.endNote) {
      endLine = analysis.endNote.startLine - 1;
    }

    return lines.slice(startLine, endLine).join('\n').trim();
  }, [rawText, removeFrontMatter, removeEndNote, analysis.frontMatter, analysis.endNote]);

  // Compute raw parts based on chosen strategy
  const computedRawParts = useMemo(() => {
    if (!effectiveBodyText.trim()) return [];

    if (strategy === 'size') {
      return splitBySize(effectiveBodyText, {
        targetWords,
        minWords: MIN_CHAPTER_WORDS,
        hardMaxChars: HARD_MAX_CHAPTER_CHARACTERS,
        prioritizeSceneBreaks,
      });
    }

    if (strategy === 'manual') {
      return splitAtMarkers(effectiveBodyText, manualSplitLines);
    }

    // 'headings' strategy: split before every heading candidate line
    if (strategy === 'headings') {
      const headingLines = analysis.headingCandidates.map((h) => h.lineNumber);
      if (headingLines.length > 0) {
        return splitAtMarkers(effectiveBodyText, headingLines);
      }
      // Fallback to size if no headings found
      return splitBySize(effectiveBodyText, {
        targetWords,
        minWords: MIN_CHAPTER_WORDS,
        hardMaxChars: HARD_MAX_CHAPTER_CHARACTERS,
      });
    }

    return [effectiveBodyText];
  }, [
    effectiveBodyText,
    strategy,
    targetWords,
    prioritizeSceneBreaks,
    manualSplitLines,
    analysis.headingCandidates,
  ]);

  // Build structured parts with titles, word counts, and preservation checks
  const buildResult = useMemo(() => {
    if (computedRawParts.length === 0) {
      return {
        parts: [],
        textPreserved: true,
        originalNormalizedLength: 0,
        preservedNormalizedLength: 0,
        warnings: [],
      };
    }

    const rawPartsWithCustomTitles = computedRawParts.map((content, idx) => ({
      content,
      title: editedTitles[idx],
    }));

    const frontMatterRemovedText =
      removeFrontMatter && analysis.frontMatter ? analysis.frontMatter.text : '';
    const endNoteRemovedText =
      removeEndNote && analysis.endNote ? analysis.endNote.text : '';

    return buildParts({
      rawParts: rawPartsWithCustomTitles,
      baseTitle: novelTitleUrdu || novelTitleEnglish || 'باب',
      titleStyle,
      startChapterNumber,
      firstPartIsFreePreview: firstPartFree,
      frontMatterRemoved: frontMatterRemovedText,
      endNoteRemoved: endNoteRemovedText,
      originalText: rawText,
    });
  }, [
    computedRawParts,
    editedTitles,
    novelTitleUrdu,
    novelTitleEnglish,
    titleStyle,
    startChapterNumber,
    firstPartFree,
    removeFrontMatter,
    removeEndNote,
    analysis.frontMatter,
    analysis.endNote,
    rawText,
  ]);

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsUploading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/writer/parse-manuscript', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload and parse manuscript.');
      }

      const extracted = data.rawText || (data.chapters || []).map((c: { content_urdu: string }) => c.content_urdu).join('\n\n');
      setRawText(extracted);
      setCurrentStep('strategy');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleLineClickForPattern = (line: string) => {
    const patternResult = derivePatternFromExample(line, analysis.allLines);
    setActivePatternDesc(patternResult.patternDescription);
    setManualSplitLines(patternResult.matchingLineNumbers);

    try {
      localStorage.setItem(`unb_splitter_pattern_${novelId}`, patternResult.patternDescription);
    } catch {
      // Ignore localStorage errors
    }
  };

  const toggleManualSplitLine = (lineNum: number) => {
    setManualSplitLines((prev) =>
      prev.includes(lineNum)
        ? prev.filter((n) => n !== lineNum)
        : [...prev, lineNum].sort((a, b) => a - b)
    );
  };

  const handleTitleChange = (index: number, newTitle: string) => {
    setEditedTitles((prev) => ({
      ...prev,
      [index]: newTitle,
    }));
  };

  const handleMergeWithPrevious = (index: number) => {
    if (index <= 0 || computedRawParts.length <= 1) return;
    const prevText = computedRawParts[index - 1];
    const currText = computedRawParts[index];
    const merged = `${prevText}\n\n${currText}`;

    // Update raw parts
    const updated = [...computedRawParts];
    updated[index - 1] = merged;
    updated.splice(index, 1);

    // We can switch strategy to manual to maintain custom merged slices
    setStrategy('manual');
  };

  const handleSave = async () => {
    if (buildResult.parts.length === 0) return;

    // Verify hard character limit
    const overLimit = buildResult.parts.find((p) => p.charCount > HARD_MAX_CHAPTER_CHARACTERS);
    if (overLimit) {
      setErrorMessage(
        `Chapter "${overLimit.title}" exceeds the 120,000 character limit (${overLimit.charCount.toLocaleString()} chars). Please split this part further before saving.`
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const payload = buildResult.parts.map((p) => ({
      title_urdu: p.title,
      content_urdu: p.content,
      is_free_preview: p.isFreePreview,
      is_published: false, // Imported/split chapters are saved as DRAFT
    }));

    try {
      if (mode === 'split-existing' && existingChapterId) {
        const res = await splitChapterAction(novelId, existingChapterId, payload);
        if (!res.success) {
          throw new Error(res.error || 'Failed to split chapter.');
        }
        setSuccessMessage(`Chapter successfully split into ${res.data?.parts_count} parts!`);
      } else {
        const res = await importChaptersAction(novelId, payload, startChapterNumber);
        if (!res.success) {
          throw new Error(res.error || 'Failed to import chapters.');
        }
        setSuccessMessage(`Successfully imported ${res.data?.imported_count} chapters!`);
      }

      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
        router.push(`/writer/novels/${novelId}/chapters`);
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render Steps
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface rounded-2xl border border-border max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Top Bar */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-ivory/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-navy border border-accent/40">
                {mode === 'split-existing' ? 'Split Chapter' : 'Import Manuscript'}
              </span>
              <span className="text-xs text-secondary">
                {mode === 'split-existing'
                  ? `Dividing Chapter #${existingChapterNumber}`
                  : novelTitleUrdu || novelTitleEnglish || 'Novel Chapters'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-serif font-bold text-navy flex items-center gap-2 mt-0.5">
              <Scissors className="w-5 h-5 text-accent" />
              <span>Writer-Controlled Chapter Splitter</span>
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-secondary hover:text-navy hover:bg-ivory transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="px-5 py-2.5 bg-ivory/30 border-b border-border flex items-center justify-between text-xs overflow-x-auto gap-2">
          {!initialText && (
            <button
              type="button"
              onClick={() => setCurrentStep('upload')}
              className={`font-semibold pb-1 border-b-2 transition-colors ${
                currentStep === 'upload'
                  ? 'border-accent text-navy'
                  : 'border-transparent text-secondary hover:text-navy'
              }`}
            >
              1. Upload
            </button>
          )}

          <button
            type="button"
            onClick={() => setCurrentStep('strategy')}
            disabled={!rawText.trim()}
            className={`font-semibold pb-1 border-b-2 transition-colors ${
              currentStep === 'strategy'
                ? 'border-accent text-navy'
                : 'border-transparent text-secondary hover:text-navy disabled:opacity-40'
            }`}
          >
            {initialText ? '1.' : '2.'} Strategy
          </button>

          <button
            type="button"
            onClick={() => setCurrentStep('structure')}
            disabled={!rawText.trim()}
            className={`font-semibold pb-1 border-b-2 transition-colors ${
              currentStep === 'structure'
                ? 'border-accent text-navy'
                : 'border-transparent text-secondary hover:text-navy disabled:opacity-40'
            }`}
          >
            {initialText ? '2.' : '3.'} Structure Review
          </button>

          {(analysis.frontMatter || analysis.endNote) && (
            <button
              type="button"
              onClick={() => setCurrentStep('blocks')}
              disabled={!rawText.trim()}
              className={`font-semibold pb-1 border-b-2 transition-colors ${
                currentStep === 'blocks'
                  ? 'border-accent text-navy'
                  : 'border-transparent text-secondary hover:text-navy disabled:opacity-40'
              }`}
            >
              {initialText ? '3.' : '4.'} Header/Footer
            </button>
          )}

          {strategy === 'size' && (
            <button
              type="button"
              onClick={() => setCurrentStep('size')}
              disabled={!rawText.trim()}
              className={`font-semibold pb-1 border-b-2 transition-colors ${
                currentStep === 'size'
                  ? 'border-accent text-navy'
                  : 'border-transparent text-secondary hover:text-navy disabled:opacity-40'
              }`}
            >
              Size Settings
            </button>
          )}

          <button
            type="button"
            onClick={() => setCurrentStep('preview')}
            disabled={!rawText.trim()}
            className={`font-semibold pb-1 border-b-2 transition-colors ${
              currentStep === 'preview'
                ? 'border-accent text-navy'
                : 'border-transparent text-secondary hover:text-navy disabled:opacity-40'
            }`}
          >
            Preview & Edit ({buildResult.parts.length})
          </button>

          <button
            type="button"
            onClick={() => setCurrentStep('numbering')}
            disabled={!rawText.trim() || buildResult.parts.length === 0}
            className={`font-semibold pb-1 border-b-2 transition-colors ${
              currentStep === 'numbering'
                ? 'border-accent text-navy'
                : 'border-transparent text-secondary hover:text-navy disabled:opacity-40'
            }`}
          >
            Save & Numbers
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-ivory/20">
          {successMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold">{successMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs">{errorMessage}</p>
            </div>
          )}

          {/* ---------------- STEP 0: UPLOAD ---------------- */}
          {currentStep === 'upload' && (
            <div className="space-y-5">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-border bg-white p-8 sm:p-10 text-center cursor-pointer hover:border-accent hover:bg-ivory/50 transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary group-hover:text-accent group-hover:scale-105 transition-all shadow-xs">
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>

                <div className="mt-4 space-y-1">
                  <p className="text-sm font-bold text-navy">
                    {isUploading
                      ? 'Analyzing manuscript & validating ZIP bytes...'
                      : fileName
                      ? `Selected: ${fileName}`
                      : 'Choose .docx or .txt manuscript file'}
                  </p>
                  <p className="text-xs text-secondary">
                    Microsoft Word (.docx) or UTF-8 text (.txt). Max 5 MB. Parsed in memory only.
                  </p>
                </div>
              </div>

              {/* Arabic Letter Normalization Opt-In */}
              <div className="p-4 rounded-xl border border-border bg-white space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={normalizeArabic}
                    onChange={(e) => setNormalizeArabic(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-accent mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-semibold text-main block">
                      Convert Arabic letter forms to Urdu forms (ي/ى → ی, ك → ک, ة → ہ)
                    </span>
                    <span className="text-[11px] text-secondary block">
                      Off by default to preserve Arabic quotations and Quranic verses. Check only to fix Arabic keyboard typing.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ---------------- STEP 1: STRATEGY ---------------- */}
          {currentStep === 'strategy' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-serif font-bold text-navy">
                  What is in this text?
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Choose how you would like to split this manuscript. You can adjust the results in the next steps.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Option 1: Size */}
                <div
                  onClick={() => setStrategy('size')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    strategy === 'size'
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-border bg-white hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-navy">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                    <span>Split by Size (Recommended)</span>
                  </div>
                  <p className="text-xs text-secondary mt-2 leading-relaxed">
                    Ideal for a single long chapter or episode. Splits into comfortable 5,000–8,000 word parts without breaking mid-sentence.
                  </p>
                </div>

                {/* Option 2: Headings */}
                <div
                  onClick={() => setStrategy('headings')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    strategy === 'headings'
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-border bg-white hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-navy">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span>Split by Headings</span>
                  </div>
                  <p className="text-xs text-secondary mt-2 leading-relaxed">
                    Uses detected headings (باب اول, قسط ۲, Chapter 1). Suggested candidates are isolated for your confirmation.
                  </p>
                </div>

                {/* Option 3: Manual */}
                <div
                  onClick={() => setStrategy('manual')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    strategy === 'manual'
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-border bg-white hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-navy">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    <span>Split Manually</span>
                  </div>
                  <p className="text-xs text-secondary mt-2 leading-relaxed">
                    Review lines and click anywhere you wish to insert a chapter divide. Full writer control.
                  </p>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="p-4 rounded-xl bg-white border border-border flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="text-secondary font-medium block">Total Manuscript Words:</span>
                  <strong className="text-sm text-navy">{analysis.totalWords.toLocaleString()} words</strong>
                </div>
                <div className="space-y-0.5">
                  <span className="text-secondary font-medium block">Characters:</span>
                  <strong className="text-sm text-navy">{analysis.totalChars.toLocaleString()} chars</strong>
                </div>
                <div className="space-y-0.5 text-right">
                  <span className="text-secondary font-medium block">Suggested Strategy:</span>
                  <span className="font-bold text-accent">
                    {analysis.headingCandidates.length > 1
                      ? `Headings (${analysis.headingCandidates.length} detected)`
                      : 'Size Splitting (~6k words)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 2: STRUCTURE REVIEW ---------------- */}
          {currentStep === 'structure' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-serif font-bold text-navy">
                    Manuscript Structure Review
                  </h3>
                  <p className="text-xs text-secondary">
                    Click any line to mark/unmark a split point, or click a heading to match all similar patterns.
                  </p>
                </div>

                {activePatternDesc && (
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Pattern: {activePatternDesc}
                  </span>
                )}
              </div>

              {/* Lines Viewer */}
              <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-white divide-y divide-slate-100 font-urdu text-sm leading-[2.2]">
                {analysis.allLines.map((line, idx) => {
                  const lineNum = idx + 1;
                  const isFrontMatter = Boolean(
                    analysis.frontMatter &&
                      lineNum >= analysis.frontMatter.startLine &&
                      lineNum <= analysis.frontMatter.endLine
                  );
                  const isEndNote = Boolean(
                    analysis.endNote && lineNum >= analysis.endNote.startLine
                  );
                  const isSceneBreak = analysis.sceneBreaks.some((s) => s.lineNumber === lineNum);
                  const isHeadingCandidate = analysis.headingCandidates.some(
                    (h) => h.lineNumber === lineNum
                  );
                  const isMarked = manualSplitLines.includes(lineNum);

                  return (
                    <div
                      key={lineNum}
                      onClick={() => toggleManualSplitLine(lineNum)}
                      className={`p-2 sm:px-3 flex items-start gap-3 cursor-pointer transition-colors group ${
                        isMarked
                          ? 'bg-amber-100/70 border-l-4 border-l-accent'
                          : isFrontMatter
                          ? 'bg-indigo-50/50'
                          : isEndNote
                          ? 'bg-rose-50/50'
                          : 'hover:bg-ivory'
                      }`}
                    >
                      <span className="font-mono text-[10px] text-slate-400 select-none w-8 shrink-0 text-right pt-1">
                        {lineNum}
                      </span>

                      <div className="flex-1 min-w-0" dir="rtl">
                        <span className="text-main">{line || <span className="opacity-20">¶</span>}</span>
                      </div>

                      {/* Tag badges */}
                      <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                        {isFrontMatter && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono">
                            Header
                          </span>
                        )}
                        {isEndNote && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-mono">
                            Footer
                          </span>
                        )}
                        {isSceneBreak && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono">
                            Break
                          </span>
                        )}
                        {isHeadingCandidate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLineClickForPattern(line);
                            }}
                            className="text-[9px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-semibold"
                            title="Split before all lines like this one"
                          >
                            Use as Heading Pattern
                          </button>
                        )}
                        {isMarked && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent text-navy font-bold">
                            Split Point
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---------------- STEP 3: BLOCKS (FRONT-MATTER & END-NOTE) ---------------- */}
          {currentStep === 'blocks' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-serif font-bold text-navy">
                  Header & Footer Notes
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Decide whether to exclude front-matter attribution or closing announcements from the chapter contents.
                </p>
              </div>

              {analysis.frontMatter && (
                <div className="p-4 rounded-xl border border-border bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      Front-Matter Attribution Detected ({analysis.frontMatter.lines.length} lines)
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={removeFrontMatter}
                        onChange={(e) => setRemoveFrontMatter(e.target.checked)}
                        className="w-4 h-4 rounded text-navy focus:ring-accent"
                      />
                      <span className="font-semibold text-main">Remove from Chapter 1</span>
                    </label>
                  </div>

                  <div className="p-3 rounded-lg bg-ivory text-xs font-urdu leading-relaxed" dir="rtl">
                    {analysis.frontMatter.text}
                  </div>
                </div>
              )}

              {analysis.endNote && (
                <div className="p-4 rounded-xl border border-border bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                      End-of-Episode Announcement Detected ({analysis.endNote.lines.length} lines)
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={removeEndNote}
                        onChange={(e) => setRemoveEndNote(e.target.checked)}
                        className="w-4 h-4 rounded text-navy focus:ring-accent"
                      />
                      <span className="font-semibold text-main">Remove from Final Chapter</span>
                    </label>
                  </div>

                  <div className="p-3 rounded-lg bg-ivory text-xs font-urdu leading-relaxed" dir="rtl">
                    {analysis.endNote.text}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------- STEP 4: SIZE CONFIGURATION ---------------- */}
          {currentStep === 'size' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-serif font-bold text-navy">
                  Target Chapter Size
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Set your desired target size. The algorithm prioritizes scene breaks and paragraph boundaries without splitting inside sentences.
                </p>
              </div>

              {/* Target Words Slider & Presets */}
              <div className="p-5 rounded-xl border border-border bg-white space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-navy">
                    Target Words per Part: <strong className="text-accent text-sm font-mono">{targetWords.toLocaleString()}</strong> words
                  </label>

                  <div className="flex items-center gap-1.5">
                    {[3000, 5000, 6000, 8000].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setTargetWords(w)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-colors ${
                          targetWords === w
                            ? 'bg-navy text-white border-navy font-bold'
                            : 'bg-ivory border-border text-secondary hover:text-navy'
                        }`}
                      >
                        {w.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="range"
                  min={MIN_TARGET_WORDS}
                  max={MAX_TARGET_WORDS}
                  step={500}
                  value={targetWords}
                  onChange={(e) => setTargetWords(Number(e.target.value))}
                  className="w-full accent-navy cursor-pointer"
                />

                <div className="flex items-center justify-between text-[11px] text-secondary font-mono">
                  <span>2,000 words</span>
                  <span>Default (6,000 words)</span>
                  <span>8,000 words</span>
                </div>

                <div className="pt-3 border-t border-border">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={prioritizeSceneBreaks}
                      onChange={(e) => setPrioritizeSceneBreaks(e.target.checked)}
                      className="w-4 h-4 rounded text-navy focus:ring-accent"
                    />
                    <span className="font-semibold text-main">
                      Prioritize scene-break dividers (***, ---, ❖) nearest the target
                    </span>
                  </label>
                </div>
              </div>

              {/* Result Preview Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-secondary block">Estimated Result:</span>
                  <strong className="text-sm text-navy">
                    {computedRawParts.length} chapter parts
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-secondary block">Average Size:</span>
                  <span className="font-mono text-sm text-slate-700">
                    ~{Math.round(analysis.totalWords / (computedRawParts.length || 1)).toLocaleString()} words / part
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 5: PREVIEW & ROW EDITING ---------------- */}
          {currentStep === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-serif font-bold text-navy">
                    Final Chapters Preview ({buildResult.parts.length} Parts)
                  </h3>
                  <p className="text-xs text-secondary">
                    Review and edit titles, words, and preview settings. All chapters will be created as DRAFT.
                  </p>
                </div>

                {/* Title Style Toggle */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-secondary text-[11px]">Naming Style:</span>
                  <button
                    type="button"
                    onClick={() => setTitleStyle('urdu')}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                      titleStyle === 'urdu'
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white border-border text-secondary'
                    }`}
                  >
                    حصہ ۱ (اردو)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTitleStyle('english')}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                      titleStyle === 'english'
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white border-border text-secondary'
                    }`}
                  >
                    (Part 1)
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              <div className="p-3.5 rounded-xl bg-white border border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-secondary text-[11px] block">Total Parts:</span>
                    <strong className="text-navy">{buildResult.parts.length}</strong>
                  </div>
                  <div>
                    <span className="text-secondary text-[11px] block">Total Words:</span>
                    <strong className="text-navy">
                      {buildResult.parts.reduce((acc, p) => acc + p.wordCount, 0).toLocaleString()}
                    </strong>
                  </div>
                </div>

                {/* Preservation Check Badge */}
                <div className="flex items-center gap-1.5">
                  {buildResult.textPreserved ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Text Preserved: 100% Lossless Match</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Whitespace difference detected</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Warnings List */}
              {buildResult.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <strong className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Review Warnings:
                  </strong>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {buildResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Chapters Table */}
              <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border">
                {buildResult.parts.map((part, idx) => (
                  <div key={idx} className="p-3.5 space-y-2.5 hover:bg-ivory/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-navy text-white shrink-0">
                          #{part.number}
                        </span>

                        <input
                          type="text"
                          dir="rtl"
                          value={part.title}
                          onChange={(e) => handleTitleChange(idx, e.target.value)}
                          className="px-2.5 py-1 rounded border border-border bg-ivory font-urdu text-sm focus:outline-none focus:ring-1 focus:ring-accent flex-1 max-w-md"
                        />
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <span className="font-semibold text-main">
                          {part.wordCount.toLocaleString()} words
                        </span>
                        <span
                          className={`font-mono text-[11px] ${
                            part.charCount > HARD_MAX_CHAPTER_CHARACTERS
                              ? 'text-rose-600 font-bold'
                              : 'text-secondary'
                          }`}
                        >
                          {part.charCount.toLocaleString()} / 120,000 chars
                        </span>

                        {/* Free preview checkbox: Only part 0 */}
                        {idx === 0 && (
                          <label className="flex items-center gap-1.5 cursor-pointer ml-2">
                            <input
                              type="checkbox"
                              checked={firstPartFree}
                              onChange={(e) => setFirstPartFree(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-navy focus:ring-accent"
                            />
                            <span className="text-[11px] text-secondary font-medium">Free Preview</span>
                          </label>
                        )}

                        {/* Merge with previous action */}
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMergeWithPrevious(idx)}
                            className="p-1 text-secondary hover:text-navy hover:bg-ivory rounded"
                            title="Merge with previous chapter part"
                          >
                            <Merge className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Preview first and last lines */}
                    <div className="text-[11px] text-secondary font-urdu space-y-0.5 bg-ivory/60 p-2 rounded-lg" dir="rtl">
                      <p className="line-clamp-1">
                        <strong>شروع:</strong> &ldquo;{part.firstLine}&rdquo;
                      </p>
                      <p className="line-clamp-1">
                        <strong>اختتام:</strong> &ldquo;{part.lastLine}&rdquo;
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------------- STEP 6: NUMBERING & ATOMIC SAVE ---------------- */}
          {currentStep === 'numbering' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-serif font-bold text-navy">
                  Chapter Numbering & Confirmation
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Confirm starting chapter numbers and review atomic save details.
                </p>
              </div>

              {mode === 'split-existing' ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2 text-xs">
                  <div className="font-bold flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-600" />
                    <span>Existing Chapter Replacement Confirmation</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    Original Chapter #{existingChapterNumber ?? 1} will be replaced by the newly created {buildResult.parts.length} parts (taking numbers {existingChapterNumber ?? 1} to {(existingChapterNumber ?? 1) + buildResult.parts.length - 1}).
                    Subsequent chapters will be safely shifted by the database with zero gaps.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-border bg-white space-y-3">
                  <label className="text-xs font-bold text-navy block">
                    Starting Chapter Number
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={startChapterNumber}
                      onChange={(e) => setStartChapterNumber(Math.max(1, Number(e.target.value)))}
                      className="w-28 px-3 py-2 rounded-lg border border-border bg-ivory font-mono font-bold text-sm"
                    />
                    <span className="text-xs text-secondary">
                      Resulting chapter numbers: #{startChapterNumber} to #{startChapterNumber + buildResult.parts.length - 1}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-navy">Database Safeguards:</div>
                <ul className="list-disc pl-5 space-y-1 text-secondary text-[11px]">
                  <li>All chapters will be saved atomically as <strong>DRAFT</strong> (unpublished).</li>
                  <li>Original content snapshot is saved to historical revisions.</li>
                  <li>If the novel has active buyer entitlements, published middle chapters are strictly protected.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Controls */}
        <div className="p-4 border-t border-border bg-ivory/60 flex items-center justify-between">
          <div>
            {currentStep !== 'upload' && currentStep !== 'strategy' && (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 'structure') setCurrentStep('strategy');
                  else if (currentStep === 'blocks') setCurrentStep('structure');
                  else if (currentStep === 'size') setCurrentStep(analysis.frontMatter || analysis.endNote ? 'blocks' : 'structure');
                  else if (currentStep === 'preview') setCurrentStep(strategy === 'size' ? 'size' : 'structure');
                  else if (currentStep === 'numbering') setCurrentStep('preview');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-navy"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-secondary hover:text-navy"
            >
              Cancel
            </button>

            {currentStep !== 'numbering' ? (
              <button
                type="button"
                disabled={!rawText.trim()}
                onClick={() => {
                  if (currentStep === 'upload') setCurrentStep('strategy');
                  else if (currentStep === 'strategy') setCurrentStep('structure');
                  else if (currentStep === 'structure') {
                    if (analysis.frontMatter || analysis.endNote) {
                      setCurrentStep('blocks');
                    } else if (strategy === 'size') {
                      setCurrentStep('size');
                    } else {
                      setCurrentStep('preview');
                    }
                  } else if (currentStep === 'blocks') {
                    if (strategy === 'size') setCurrentStep('size');
                    else setCurrentStep('preview');
                  } else if (currentStep === 'size') {
                    setCurrentStep('preview');
                  } else if (currentStep === 'preview') {
                    setCurrentStep('numbering');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy/90 transition-colors disabled:opacity-40"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSaving || buildResult.parts.length === 0}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy/90 transition-colors disabled:opacity-40 shadow-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing Atomic Transaction...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Save ({buildResult.parts.length}) Chapters</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
