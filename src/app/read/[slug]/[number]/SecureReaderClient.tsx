'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import {
  type ChapterReaderPayload,
  type PublicNovelChapterMeta,
} from '@/types/database';
import {
  type ReaderTheme,
  type ReaderFontSize,
  type ReaderLineHeight,
  type ReaderParagraphSpacing,
  DEFAULT_READER_PREFERENCES,
  buildWatermarkPattern,
} from '@/lib/reader/schemas';
import { ChapterBody } from '@/components/reader/ChapterBody';
import { TipCard } from '@/components/tips/TipCard';
import { saveReadingProgressAction } from '@/app/actions/reader';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Lock,
  Menu,
  Settings2,
  Sparkles,
  X,
  Check,
} from 'lucide-react';

interface SecureReaderClientProps {
  chapter: ChapterReaderPayload;
  readerId: string;
  tableOfContents: PublicNovelChapterMeta[];
  novelSlug: string;
}

export function SecureReaderClient({
  chapter,
  readerId,
  tableOfContents,
  novelSlug,
}: SecureReaderClientProps) {
  const router = useRouter();

  // Reader Preferences State (persisted in localStorage)
  const [theme, setTheme] = useState<ReaderTheme>(DEFAULT_READER_PREFERENCES.theme);
  const [fontSize, setFontSize] = useState<ReaderFontSize>(DEFAULT_READER_PREFERENCES.fontSize);
  const [lineHeight, setLineHeight] = useState<ReaderLineHeight>(DEFAULT_READER_PREFERENCES.lineHeight);
  const [paragraphSpacing, setParagraphSpacing] = useState<ReaderParagraphSpacing>(DEFAULT_READER_PREFERENCES.paragraphSpacing);

  // UI Drawer / Overlay States
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Live Reading Progress (0 - 100%)
  const [readingProgress, setReadingProgress] = useState(0);
  const rafId = useRef<number | null>(null);

  // Touch Swipe coordinates
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Load preferences from localStorage on mount (deferred to avoid cascading render lint)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('unb_reader_prefs');
      if (stored) {
        const parsed = JSON.parse(stored);
        setTimeout(() => {
          if (['light', 'dark', 'sepia'].includes(parsed.theme)) setTheme(parsed.theme);
          if (['sm', 'base', 'lg', 'xl', '2xl'].includes(parsed.fontSize)) setFontSize(parsed.fontSize);
          if (['normal', 'relaxed', 'loose'].includes(parsed.lineHeight)) setLineHeight(parsed.lineHeight);
          if (['compact', 'normal', 'wide'].includes(parsed.paragraphSpacing)) setParagraphSpacing(parsed.paragraphSpacing);
        }, 0);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  // Save preferences to localStorage on change
  const updatePreference = (
    key: 'theme' | 'fontSize' | 'lineHeight' | 'paragraphSpacing',
    val: string
  ) => {
    if (key === 'theme') setTheme(val as ReaderTheme);
    if (key === 'fontSize') setFontSize(val as ReaderFontSize);
    if (key === 'lineHeight') setLineHeight(val as ReaderLineHeight);
    if (key === 'paragraphSpacing') setParagraphSpacing(val as ReaderParagraphSpacing);

    try {
      const current = {
        theme: key === 'theme' ? val : theme,
        fontSize: key === 'fontSize' ? val : fontSize,
        lineHeight: key === 'lineHeight' ? val : lineHeight,
        paragraphSpacing: key === 'paragraphSpacing' ? val : paragraphSpacing,
      };
      localStorage.setItem('unb_reader_prefs', JSON.stringify(current));
    } catch {
      // Ignore localStorage write errors
    }
  };

  // Auto-bookmark progress on chapter open
  useEffect(() => {
    saveReadingProgressAction(chapter.novel_id, chapter.chapter_number).catch(() => {});
  }, [chapter.novel_id, chapter.chapter_number]);

  // Live scroll listener for reading progress bar (60fps requestAnimationFrame)
  useEffect(() => {
    const updateProgress = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setReadingProgress(100);
        return;
      }
      const currentY = window.scrollY;
      const pct = Math.min(100, Math.max(0, (currentY / docHeight) * 100));
      setReadingProgress(pct);
    };

    const handleScroll = () => {
      if (rafId.current !== null) return;
      rafId.current = window.requestAnimationFrame(() => {
        updateProgress();
        rafId.current = null;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    // Initial calculation
    updateProgress();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
      }
    };
  }, [chapter.novel_id, chapter.chapter_number, fontSize, lineHeight, paragraphSpacing]);

  // Keyboard navigation (Arrow keys)
  const navigateToChapter = useCallback(
    (chapterNum: number | null) => {
      if (chapterNum !== null && chapterNum > 0) {
        router.push(`/read/${novelSlug}/${chapterNum}`);
      }
    },
    [router, novelSlug]
  );

  // Close settings popover on outside click / tap
  useEffect(() => {
    if (!settingsOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [settingsOpen]);

  // Keyboard navigation (Arrow keys & Escape key dismissal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close popover / drawer on Escape key
      if (e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (tocOpen) {
          setTocOpen(false);
          return;
        }
      }

      // Ignore navigation if user is inside an input/modal
      if (tocOpen || settingsOpen) return;
      if (e.key === 'ArrowRight' && chapter.next_chapter_number) {
        navigateToChapter(chapter.next_chapter_number);
      } else if (e.key === 'ArrowLeft' && chapter.previous_chapter_number) {
        navigateToChapter(chapter.previous_chapter_number);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tocOpen, settingsOpen, chapter.next_chapter_number, chapter.previous_chapter_number, navigateToChapter]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    if (touchStartX.current === null || touchEndX.current === null) return;

    const deltaX = touchStartX.current - touchEndX.current;
    // Swipe left (next chapter)
    if (deltaX > 75 && chapter.next_chapter_number) {
      navigateToChapter(chapter.next_chapter_number);
    }
    // Swipe right (previous chapter)
    else if (deltaX < -75 && chapter.previous_chapter_number) {
      navigateToChapter(chapter.previous_chapter_number);
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Theme style classes
  const themeContainerClasses = {
    light: 'bg-[#FAF8F5] text-text border-border selection:bg-warning-soft/50',
    dark: 'bg-[#121214] text-stone-100 border-stone-800 selection:bg-warning/30',
    sepia: 'bg-[#F4ECD8] text-[#4A3B2C] border-[#E2D5BA] selection:bg-[#E0CEAA]',
  }[theme];

  const headerBgClasses = {
    light: 'bg-[#FAF8F5]/90 border-border/80 backdrop-blur-md text-text',
    dark: 'bg-[#121214]/90 border-stone-800/80 backdrop-blur-md text-stone-100',
    sepia: 'bg-[#F4ECD8]/90 border-[#E2D5BA]/80 backdrop-blur-md text-[#4A3B2C]',
  }[theme];


  // Watermark pattern
  const watermarkText = buildWatermarkPattern(chapter.watermark_code, readerId);

  return (
    <div
      className={`min-h-screen transition-colors duration-200 flex flex-col relative select-none ${themeContainerClasses}`}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ------------------------------------------------------------------ */}
      {/* 1. STICKY SLIM READER HEADER                                       */}
      {/* ------------------------------------------------------------------ */}
      <header
        className={`sticky top-0 z-40 border-b relative transition-colors duration-200 ${headerBgClasses}`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-2.5">
          {/* Left: Back Link & Novel Slug */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/novels/${novelSlug}`}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="Return to Novel Details"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0 flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 truncate">
                Chapter {chapter.chapter_number} of {chapter.total_chapters}
              </span>
              <span className="text-xs font-semibold truncate leading-tight">
                {chapter.novel_title_english || chapter.novel_title}
              </span>
            </div>
          </div>

          {/* Right Controls: Table of Contents & Settings */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Table of Contents Drawer Trigger */}
            <button
              type="button"
              onClick={() => {
                setTocOpen(true);
                setSettingsOpen(false);
              }}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Chapters List"
            >
              <Menu className="w-4 h-4" />
              <span className="hidden sm:inline">ابواب</span>
            </button>

            {/* Display Settings Trigger */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((prev) => !prev)}
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Reader Display Settings"
                aria-expanded={settingsOpen}
                aria-haspopup="true"
              >
                <Settings2 className="w-4 h-4" />
              </button>

              {/* Invisible Full-Screen Backdrop Overlay for outside click/tap dismissal */}
              {settingsOpen && (
                <div
                  className="fixed inset-0 z-40 bg-transparent cursor-default"
                  aria-hidden="true"
                  onClick={() => setSettingsOpen(false)}
                />
              )}

              {/* Settings Dropdown Popover */}
              {settingsOpen && (
                <div
                  role="dialog"
                  aria-label="Reader Display Settings"
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute right-0 top-full mt-2 w-72 rounded-2xl p-4 shadow-2xl border z-50 animate-in fade-in zoom-in-95 duration-150 ${
                    theme === 'dark'
                      ? 'bg-stone-900 border-stone-800 text-stone-100'
                      : theme === 'sepia'
                      ? 'bg-[#EFE4CB] border-[#D9CAAA] text-[#4A3B2C]'
                      : 'bg-white border-border text-text'
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-2 mb-3 border-current/10">
                    <h4 className="text-xs font-bold uppercase tracking-wider">Reader Settings</h4>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Theme Selector */}
                  <div className="space-y-1.5 mb-3">
                    <label className="text-[11px] font-semibold opacity-70 block">Theme</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                      {(['light', 'sepia', 'dark'] as ReaderTheme[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updatePreference('theme', t)}
                          className={`py-1.5 rounded-lg border text-center capitalize transition-all ${
                            theme === t
                              ? 'border-warning-border font-bold ring-2 ring-ring/20'
                              : 'border-current/15 opacity-70 hover:opacity-100'
                          } ${
                            t === 'light'
                              ? 'bg-[#FAF8F5] text-text'
                              : t === 'sepia'
                              ? 'bg-[#F4ECD8] text-[#4A3B2C]'
                              : 'bg-[#121214] text-stone-100'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size Selector */}
                  <div className="space-y-1.5 mb-3">
                    <label className="text-[11px] font-semibold opacity-70 block">Font Size</label>
                    <div className="grid grid-cols-5 gap-1 text-xs">
                      {(['sm', 'base', 'lg', 'xl', '2xl'] as ReaderFontSize[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => updatePreference('fontSize', s)}
                          className={`py-1 rounded-lg border text-center transition-all ${
                            fontSize === s
                              ? 'border-warning-border font-bold bg-warning/10'
                              : 'border-current/15 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {s === 'sm' ? 'A-' : s === '2xl' ? 'A+' : s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Height Selector */}
                  <div className="space-y-1.5 mb-3">
                    <label className="text-[11px] font-semibold opacity-70 block">Line Spacing</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                      {(['normal', 'relaxed', 'loose'] as ReaderLineHeight[]).map((lh) => (
                        <button
                          key={lh}
                          type="button"
                          onClick={() => updatePreference('lineHeight', lh)}
                          className={`py-1.5 rounded-lg border text-center capitalize transition-all ${
                            lineHeight === lh
                              ? 'border-warning-border font-bold bg-warning/10'
                              : 'border-current/15 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {lh}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paragraph Spacing Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold opacity-70 block">Paragraph Spacing</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                      {(['compact', 'normal', 'wide'] as ReaderParagraphSpacing[]).map((ps) => (
                        <button
                          key={ps}
                          type="button"
                          onClick={() => updatePreference('paragraphSpacing', ps)}
                          className={`py-1.5 rounded-lg border text-center capitalize transition-all ${
                            paragraphSpacing === ps
                              ? 'border-warning-border font-bold bg-warning/10'
                              : 'border-current/15 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {ps}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Reading Progress Bar along bottom edge of sticky header */}
        <div
          role="progressbar"
          aria-label="Reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(readingProgress)}
          dir="ltr"
          className="absolute -bottom-[1px] inset-x-0 h-[2.5px] bg-current/10 overflow-hidden"
        >
          <div
            className="h-full bg-accent transition-[width] duration-150 ease-out origin-left"
            style={{ width: `${readingProgress}%` }}
          />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 2. PROTECTIVE WATERMARK OVERLAY                                    */}
      {/* ------------------------------------------------------------------ */}
      {watermarkText && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-20 overflow-hidden select-none opacity-[0.06] dark:opacity-[0.04] print:hidden"
        >
          <div className="w-[180%] h-[180%] -ml-[40%] -mt-[40%] rotate-[-25deg] flex flex-wrap content-start gap-16 font-mono text-xs tracking-wider text-current">
            {Array.from({ length: 60 }).map((_, i) => (
              <span key={i} className="inline-block whitespace-nowrap">
                {watermarkText}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. CHAPTER MANUSCRIPT READING CANVAS                               */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 w-full max-w-[65ch] mx-auto px-5 sm:px-6 py-8 sm:py-12 relative z-10 print:hidden">
        {/* Chapter Header */}
        <div className="text-center space-y-2 mb-8 pb-6 border-b border-current/10">
          <div className="flex items-center justify-center gap-1.5 text-xs opacity-70">
            <span className="font-urdu">باب نمبر</span>
            <span className="font-mono font-semibold">{chapter.chapter_number}</span>
          </div>
          <UrduText
            size="2xl"
            className="text-center leading-tight py-1 text-inherit"
          >
            {chapter.chapter_title}
          </UrduText>
          <div className="flex items-center justify-center gap-3 text-[11px] opacity-60 font-mono">
            <span>{chapter.word_count.toLocaleString()} الفاظ</span>
            <span>•</span>
            <span className="capitalize">{chapter.access_reason.replace('_', ' ')}</span>
          </div>
        </div>

        {/* Chapter Body Content (RTL Urdu Nastaliq) */}
        <article className="relative">
          <ChapterBody
            text={chapter.content_urdu}
            fontSize={fontSize}
            lineHeight={lineHeight}
            paragraphSpacing={paragraphSpacing}
            userSelect="none"
          />
        </article>

        {/* Reader Appreciation (Tip Jar) */}
        <div className="mt-12 mb-6">
          <TipCard novelId={chapter.novel_id} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 4. CHAPTER END / BOTTOM NAVIGATION                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-12 pt-8 border-t border-current/10 space-y-8">
          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-4 w-full">
            {chapter.previous_chapter_number ? (
              <button
                type="button"
                onClick={() => navigateToChapter(chapter.previous_chapter_number)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-current/20 hover:border-warning-border font-semibold text-xs transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>پچھلا باب ({chapter.previous_chapter_number})</span>
              </button>
            ) : (
              <div />
            )}

            {chapter.next_chapter_number ? (
              <button
                type="button"
                onClick={() => navigateToChapter(chapter.next_chapter_number)}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-warning hover:bg-amber-400 text-stone-950 font-bold text-xs transition-colors shadow-md shadow-amber-500/10 cursor-pointer ml-auto"
              >
                <span>اگلا باب ({chapter.next_chapter_number})</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div />
            )}
          </div>

          {/* End of Novel State (Decoupled & Centered Completion Card) */}
          {!chapter.next_chapter_number && (
            <div className="w-full max-w-2xl mx-auto mt-10">
              <div className="w-full p-6 sm:p-8 rounded-2xl bg-warning/10 border border-warning-border/30 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-warning/20 text-accent-strong flex items-center justify-center mx-auto">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <UrduText size="xl" className="text-accent-strong">
                    پڑھنے کا شکریہ!
                  </UrduText>
                  <p className="text-xs opacity-80 max-w-sm mx-auto">
                    You have reached the final published chapter of this novel. Explore other Urdu masterworks or return to your library.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href={`/novels/${novelSlug}`}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 transition-colors"
                  >
                    Novel Details
                  </Link>
                  <Link
                    href="/library"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-warning text-stone-950 hover:bg-amber-400 transition-colors"
                  >
                    My Library
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* 5. TABLE OF CONTENTS SLIDE-OVER DRAWER                             */}
      {/* ------------------------------------------------------------------ */}
      {tocOpen && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex justify-end"
          onClick={() => setTocOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md h-full flex flex-col shadow-2xl p-5 overflow-hidden animate-in slide-in-from-right duration-200 ${
              theme === 'dark'
                ? 'bg-stone-900 border-l border-stone-800 text-stone-100'
                : theme === 'sepia'
                ? 'bg-[#EFE4CB] border-l border-[#D9CAAA] text-[#4A3B2C]'
                : 'bg-white border-l border-border text-text'
            }`}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b pb-3 border-current/10">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-accent-strong" />
                  <span>فہرست ابواب / Table of Contents</span>
                </h3>
                <p className="text-[11px] opacity-60 mt-0.5">
                  {tableOfContents.length} Published Chapters
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chapters List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-1.5 divide-y divide-current/5">
              {tableOfContents.map((item) => {
                const isCurrent = item.chapter_number === chapter.chapter_number;
                const isAccessible =
                  chapter.access_reason !== 'free_preview' || item.is_free_preview;

                if (!isAccessible) {
                  return (
                    <div
                      key={item.chapter_number}
                      className="p-3 rounded-xl opacity-40 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Lock className="w-3.5 h-3.5 text-accent-strong shrink-0" />
                        <span className="font-mono text-[11px] font-bold">
                          Ch {item.chapter_number}:
                        </span>
                        <UrduText size="sm" className="truncate py-0">
                          {item.title_urdu}
                        </UrduText>
                      </div>
                      <span className="text-[10px] text-accent-strong font-semibold shrink-0">
                        Paid
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.chapter_number}
                    type="button"
                    onClick={() => {
                      setTocOpen(false);
                      navigateToChapter(item.chapter_number);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-colors flex items-center justify-between text-xs cursor-pointer ${
                      isCurrent
                        ? 'bg-warning/15 border border-warning-border/30 font-bold'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[11px] font-semibold opacity-70">
                        {item.chapter_number}.
                      </span>
                      <UrduText size="sm" className="truncate py-0">
                        {item.title_urdu}
                      </UrduText>
                    </div>

                    {isCurrent && (
                      <span className="text-[10px] font-bold text-accent-strong uppercase tracking-wider shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Reading</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
