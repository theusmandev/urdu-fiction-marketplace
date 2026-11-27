"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { ChapterBody } from "@/components/reader/ChapterBody";
import { useReaderNooriFont } from "@/lib/reader/useReaderNooriFont";
import type { ReaderUrduFont } from "@/lib/settings/reader-font";
import { TipCard } from "@/components/tips/TipCard";
import type { PublicFreePreviewChapter, PublicNovel, PublicNovelChapterMeta } from "@/types/database";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  Lock,
  Menu,
  Settings2,
  X,
} from "lucide-react";

interface FreePreviewReaderClientProps {
  novel: PublicNovel;
  chapter: PublicFreePreviewChapter;
  allChapters: PublicNovelChapterMeta[];
  effectiveReaderFont?: ReaderUrduFont;
  nooriFontUrl?: string | null;
}

type ThemeMode = "light" | "sepia" | "dark";
type FontSize = "sm" | "base" | "lg" | "xl" | "2xl";
type LineHeight = "normal" | "relaxed" | "loose";

export function FreePreviewReaderClient({
  novel,
  chapter,
  allChapters,
  effectiveReaderFont = 'gulzar',
  nooriFontUrl = null,
}: FreePreviewReaderClientProps) {
  const activeUrduFont = useReaderNooriFont(effectiveReaderFont, nooriFontUrl);
  // Lazy state initialization from localStorage avoids cascading re-renders in effects
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("unb_reader_theme") as ThemeMode | null;
        if (saved && (saved === "light" || saved === "sepia" || saved === "dark")) return saved;
      } catch {}
    }
    return "sepia";
  });

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("unb_reader_font_size") as FontSize | null;
        if (saved) return saved;
      } catch {}
    }
    return "lg";
  });

  const [lineHeight, setLineHeight] = useState<LineHeight>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("unb_reader_line_height") as LineHeight | null;
        if (saved) return saved;
      } catch {}
    }
    return "normal";
  });

  // Reader UI controls state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCardRef = useRef<HTMLDivElement>(null);

  // Live Reading Progress (0 - 100%)
  const [readingProgress, setReadingProgress] = useState(0);
  const rafId = useRef<number | null>(null);

  // Privacy Shield State (activated on blur / visibility loss / screenshot combo)
  const [isPrivacyShieldActive, setIsPrivacyShieldActive] = useState(false);

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
    updateProgress();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
      }
    };
  }, [novel.slug, chapter.chapter_number, fontSize, lineHeight]);

  // Capture-phase keyboard shortcut interceptor & clipboard/drag protection
  useEffect(() => {
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // 1. Intercept PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        setIsPrivacyShieldActive(true);
        return;
      }

      // 2. Intercept Snipping Tool / Screenshot shortcuts (Win+Shift+S, Cmd+Shift+3/4/5, Ctrl+Shift+S)
      if ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey)) {
        setIsPrivacyShieldActive(true);
        if (key === 's') {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // 3. Block Save (Ctrl+S / Cmd+S)
      if (isCtrlOrMeta && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 4. Block Print (Ctrl+P / Cmd+P)
      if (isCtrlOrMeta && key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 5. Block View Source (Ctrl+U / Cmd+U)
      if (isCtrlOrMeta && key === 'u') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 6. Block Copy / Cut (Ctrl+C, Ctrl+X, Cmd+C, Cmd+X)
      if (isCtrlOrMeta && (key === 'c' || key === 'x')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    const handleKeyUpCapture = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        setIsPrivacyShieldActive(true);
      }
    };

    const preventClipboardOrDrag = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDownCapture, { capture: true });
    window.addEventListener('keyup', handleKeyUpCapture, { capture: true });
    document.addEventListener('copy', preventClipboardOrDrag);
    document.addEventListener('cut', preventClipboardOrDrag);
    document.addEventListener('dragstart', preventClipboardOrDrag);

    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, { capture: true });
      window.removeEventListener('keyup', handleKeyUpCapture, { capture: true });
      document.removeEventListener('copy', preventClipboardOrDrag);
      document.removeEventListener('cut', preventClipboardOrDrag);
      document.removeEventListener('dragstart', preventClipboardOrDrag);
    };
  }, []);

  // Instant Privacy Shield on window blur / tab switch / visibility loss
  useEffect(() => {
    const handleBlur = () => {
      setIsPrivacyShieldActive(true);
    };

    const handleFocus = () => {
      setIsPrivacyShieldActive(false);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPrivacyShieldActive(true);
      } else {
        setIsPrivacyShieldActive(false);
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Keyboard navigation & Escape key dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPrivacyShieldActive) {
          setIsPrivacyShieldActive(false);
          return;
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPrivacyShieldActive]);

  // Track progress locally without mutating state inside effect
  useEffect(() => {
    try {
      localStorage.setItem(
        `unb_progress_${novel.slug}`,
        JSON.stringify({
          chapterNumber: chapter.chapter_number,
          chapterTitle: chapter.title_urdu,
          timestamp: Date.now(),
        })
      );
    } catch {
      // Ignore in private browsing
    }
  }, [novel.slug, chapter.chapter_number, chapter.title_urdu]);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    try {
      localStorage.setItem("unb_reader_theme", newTheme);
    } catch {}
  };

  const handleFontSizeChange = (size: FontSize) => {
    setFontSize(size);
    try {
      localStorage.setItem("unb_reader_font_size", size);
    } catch {}
  };

  const handleLineHeightCycle = () => {
    const cycle: Record<LineHeight, LineHeight> = {
      normal: "relaxed",
      relaxed: "loose",
      loose: "normal",
    };
    const nextLh = cycle[lineHeight];
    setLineHeight(nextLh);
    try {
      localStorage.setItem("unb_reader_line_height", nextLh);
    } catch {}
  };

  // Find previous and next preview chapters
  const freeChapters = allChapters.filter((c) => c.is_free_preview);
  const currentIndex = freeChapters.findIndex(
    (c) => c.chapter_number === chapter.chapter_number
  );
  const prevChapter = currentIndex > 0 ? freeChapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex < freeChapters.length - 1 ? freeChapters[currentIndex + 1] : null;

  // Determine styling classes based on theme
  const themeClasses = {
    light: "bg-[#FAFAF7] text-[#17243A]",
    sepia: "bg-[#F9F4EB] text-[#2D241E]",
    dark: "bg-[#111827] text-[#E2E8F0]",
  }[theme];

  const toolbarThemeClasses = {
    light: "bg-white/90 border-[#E2E8F0] text-[#17243A]",
    sepia: "bg-[#EFE8DA]/90 border-[#D8CEBA] text-[#2D241E]",
    dark: "bg-[#1E293B]/90 border-[#334155] text-[#E2E8F0]",
  }[theme];


  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${themeClasses} pb-24 select-none`}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Sticky Reader Controls Header */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b relative transition-colors ${toolbarThemeClasses} px-3 sm:px-6 py-2.5`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Left: Back Link */}
          <Link
            href={`/novels/${novel.slug}`}
            className="inline-flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            title="Return to Novel Details"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Novel</span>
          </Link>

          {/* Center: Chapter Label + Clean Free Preview Pill (Zero mid-word truncation) */}
          <div className="min-w-0 flex-1 text-center px-1">
            <div className="flex items-center justify-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/20 text-accent-strong dark:text-accent font-semibold text-[10px] tracking-wide shrink-0 uppercase">
                Free Preview
              </span>
              <span className="text-[11px] font-bold text-text-muted truncate">
                Ch {chapter.chapter_number}
              </span>
            </div>
            <p
              dir="rtl"
              lang="ur"
              className="font-urdu text-xs font-semibold truncate leading-tight mt-0.5 text-inherit"
            >
              {chapter.title_urdu}
            </p>
          </div>

          {/* Right Controls: Chapters Drawer & Reader Display Settings */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Chapters / TOC Trigger */}
            <button
              type="button"
              onClick={() => {
                setTocOpen((prev) => !prev);
                setSettingsOpen(false);
              }}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
              title="All Chapters"
              aria-label="Chapters menu"
            >
              <Menu className="w-4 h-4" />
              <span className="hidden sm:inline font-urdu">ابواب</span>
            </button>

            {/* Display Settings Trigger */}
            <div className="relative">
              <button
                ref={settingsButtonRef}
                type="button"
                onClick={() => {
                  setSettingsOpen((prev) => !prev);
                  setTocOpen(false);
                }}
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Reader Display Settings"
                aria-expanded={settingsOpen}
                aria-haspopup="true"
                aria-label="Display settings"
              >
                <Settings2 className="w-4 h-4" />
              </button>

              {/* Invisible Full-Screen Backdrop Overlay for outside click dismissal */}
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
                  ref={settingsCardRef}
                  role="dialog"
                  aria-label="Reader Display Settings"
                  onClick={(e) => e.stopPropagation()}
                  data-reader-ui="true"
                  className={`absolute right-0 top-full mt-2 w-72 rounded-2xl p-4 shadow-2xl border z-50 animate-in fade-in zoom-in-95 duration-150 reader-ui-chrome ${
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
                      className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      aria-label="Close settings"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Theme Selector */}
                  <div className="space-y-1.5 mb-3">
                    <label className="text-[11px] font-semibold opacity-70 block">Theme</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
                      {(['light', 'sepia', 'dark'] as ThemeMode[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleThemeChange(t)}
                          className={`py-1.5 rounded-lg border text-center capitalize transition-all cursor-pointer ${
                            theme === t
                              ? 'border-accent-strong font-bold ring-2 ring-ring/20'
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
                      {(['sm', 'base', 'lg', 'xl', '2xl'] as FontSize[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleFontSizeChange(s)}
                          className={`py-1 rounded-lg border text-center transition-all cursor-pointer ${
                            fontSize === s
                              ? 'border-accent-strong font-bold bg-accent/15'
                              : 'border-current/15 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {s === 'sm' ? 'A-' : s === '2xl' ? 'A+' : s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Height Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold opacity-70 block">Line Spacing</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      {(['normal', 'relaxed', 'loose'] as LineHeight[]).map((lh) => (
                        <button
                          key={lh}
                          type="button"
                          onClick={() => {
                            setLineHeight(lh);
                            try { localStorage.setItem("unb_reader_line_height", lh); } catch {}
                          }}
                          className={`py-1.5 rounded-lg border text-center capitalize transition-all cursor-pointer ${
                            lineHeight === lh
                              ? 'border-accent-strong font-bold bg-accent/15'
                              : 'border-current/15 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {lh}
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

      {/* Privacy Shield Overlay (blur / visibility / screenshot attempt) */}
      {isPrivacyShieldActive && (
        <div
          role="dialog"
          aria-label="Protected Chapter Content"
          onClick={() => setIsPrivacyShieldActive(false)}
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-md cursor-pointer select-none animate-in fade-in duration-100"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsPrivacyShieldActive(false);
            }}
            className={`max-w-md w-full p-6 sm:p-8 rounded-2xl shadow-2xl border text-center space-y-4 animate-in zoom-in-95 duration-150 ${
              theme === "dark"
                ? "bg-[#1E293B] border-[#334155] text-[#E2E8F0]"
                : theme === "sepia"
                ? "bg-[#EFE8DA] border-[#D8CEBA] text-[#2D241E]"
                : "bg-white border-[#E2E8F0] text-[#17243A]"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-accent/15 text-accent-dark flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Protected Chapter Content
              </h3>
              <UrduText size="base" className="py-0 font-bold leading-relaxed text-inherit">
                مطالعہ جاری رکھنے کے لیے اسکرین پر کہیں بھی کلک کریں
              </UrduText>
            </div>
            <p className="text-xs opacity-70">
              Click or tap anywhere on the screen to resume reading.
            </p>
          </div>
        </div>
      )}

      {/* Main Reading Canvas (Comfortable measure for Urdu script) */}
      <main
        data-reader-font={activeUrduFont}
        className={`max-w-2xl lg:max-w-3xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 space-y-10 print:hidden ${
          isPrivacyShieldActive ? "blur-2xl select-none pointer-events-none transition-none" : ""
        }`}
      >
        {/* Chapter Header */}
        <div className="text-center space-y-3 pb-8 border-b border-black/10 dark:border-white/10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-accent/20 text-accent-dark dark:text-accent">
            <Sparkles className="w-3.5 h-3.5" />
            <span>باب {chapter.chapter_number} — مفت پیش منظر</span>
          </div>

          <UrduText
            as="h1"
            size="3xl"
            className="font-bold leading-[var(--reader-title-leading,2.4)] py-1 text-inherit [font-family:var(--reader-font-family,var(--font-urdu))] [font-size:calc(1.875rem*var(--reader-heading-scale,1))]"
          >
            {chapter.title_urdu}
          </UrduText>

          <p className="text-xs opacity-70">
            {novel.title_english || novel.title_urdu} • از {novel.writer_pen_name_urdu}
          </p>
        </div>

        {/* Chapter Text Body */}
        <article className="relative">
          <ChapterBody
            text={chapter.content_urdu}
            fontSize={fontSize}
            lineHeight={lineHeight}
            userSelect="none"
            readerFont={activeUrduFont}
          />
        </article>

        {/* Chapter Navigation Footer */}
        <div data-reader-ui="true" className="pt-12 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4 reader-ui-chrome">
          {prevChapter ? (
            <Link
              href={`/novels/${novel.slug}/read/${prevChapter.chapter_number}`}
              className="inline-flex items-center gap-2 text-sm font-urdu font-semibold px-4 py-2.5 rounded-xl border border-border bg-surface text-text hover:bg-surface-muted transition-colors min-h-[44px]"
            >
              <ChevronRight className="w-4 h-4" />
              <span>پچھلا مفت باب ({prevChapter.chapter_number})</span>
            </Link>
          ) : (
            <div />
          )}

          {nextChapter ? (
            <Link
              href={`/novels/${novel.slug}/read/${nextChapter.chapter_number}`}
              className="inline-flex items-center gap-2 text-sm font-urdu font-semibold px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-navy transition-colors shadow-sm min-h-[44px] ml-auto"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>اگلا مفت باب ({nextChapter.chapter_number})</span>
            </Link>
          ) : (
            <Link
              href={`/novels/${novel.slug}`}
              className="inline-flex items-center gap-2 text-sm font-urdu font-semibold px-5 py-2.5 rounded-xl bg-navy hover:bg-navy-dark text-white transition-colors shadow-sm min-h-[44px] ml-auto"
            >
              <BookOpen className="w-4 h-4" />
              <span>مکمل ناول کی تفصیلات</span>
            </Link>
          )}
        </div>

        {/* End of Preview Purchase Callout (Upsell Card) */}
        <div
          data-reader-ui="true"
          className="w-full max-w-2xl mx-auto mt-10 p-6 sm:p-8 rounded-2xl bg-surface/85 backdrop-blur-xs border border-border/80 text-center space-y-4 shadow-sm reader-ui-chrome"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent-strong flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>

          <h3 className="text-xl sm:text-2xl font-urdu leading-relaxed text-center text-text py-0">
            کیا آپ مزید پڑھنا چاہتے ہیں؟
          </h3>

          <p className="text-base sm:text-lg font-urdu leading-loose text-center text-text max-w-lg mx-auto" dir="rtl">
            باقی کہانی پڑھنے اور تمام ابواب کھولنے کے لیے مصنف کو براہِ راست ادائیگی کریں۔
          </p>

          {/* Payment Methods */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="px-2.5 py-1 rounded-lg bg-surface-muted border border-border/60 text-xs font-medium text-text-muted">
              JazzCash
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface-muted border border-border/60 text-xs font-medium text-text-muted">
              EasyPaisa
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface-muted border border-border/60 text-xs font-medium text-text-muted">
              Raast
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface-muted border border-border/60 text-xs font-medium text-text-muted">
              Bank Transfer
            </span>
          </div>

          <div className="pt-2">
            <Link
              href={`/novels/${novel.slug}`}
              className="inline-flex items-center justify-center gap-2.5 bg-navy hover:bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl text-base font-urdu min-h-[48px] shadow-md transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
              <span>خریداری اور ادائیگی کی تفصیلات</span>
            </Link>
          </div>
        </div>

        {/* Reader Appreciation (Tip Jar) at end of free preview */}
        {!nextChapter && (
          <div className="pt-4 pb-8" data-reader-ui="true">
            <TipCard writerId={novel.writer_id} novelId={novel.id} />
          </div>
        )}
      </main>

      {/* Table of Contents Drawer */}
      {tocOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={() => setTocOpen(false)}
          role="presentation"
        >
          <div
            className={`w-full max-w-xs h-full p-5 overflow-y-auto space-y-4 shadow-2xl transition-colors ${
              theme === 'dark'
                ? 'bg-stone-900 text-stone-100 border-l border-stone-800'
                : theme === 'sepia'
                ? 'bg-[#EFE4CB] text-[#4A3B2C] border-l border-[#D9CAAA]'
                : 'bg-white text-text border-l border-border'
            }`}
            onClick={(e) => e.stopPropagation()}
            data-reader-ui="true"
          >
            <div className="flex items-center justify-between pb-3 border-b border-current/15">
              <h3 className="font-bold text-sm">Table of Contents</h3>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {allChapters.map((ch) => {
                const isCurrent = ch.chapter_number === chapter.chapter_number;
                return (
                  <Link
                    key={ch.id}
                    href={
                      ch.is_free_preview
                        ? `/novels/${novel.slug}/read/${ch.chapter_number}`
                        : `/novels/${novel.slug}`
                    }
                    onClick={() => setTocOpen(false)}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors ${
                      isCurrent
                        ? 'bg-accent/20 font-bold border border-accent/40'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-black/5 dark:bg-white/10 flex items-center justify-center font-bold text-[11px] shrink-0 font-sans tabular-nums">
                        {ch.chapter_number}
                      </span>
                      <span dir="rtl" className="font-urdu truncate text-inherit">
                        {ch.title_urdu}
                      </span>
                    </div>
                    {ch.is_free_preview ? (
                      <span className="text-[10px] uppercase font-semibold text-accent-strong shrink-0 ml-2">
                        Free
                      </span>
                    ) : (
                      <Lock className="w-3.5 h-3.5 opacity-40 shrink-0 ml-2" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
