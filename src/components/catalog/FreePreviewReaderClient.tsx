"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import { ChapterBody } from "@/components/reader/ChapterBody";
import { TipCard } from "@/components/tips/TipCard";
import type { PublicFreePreviewChapter, PublicNovel, PublicNovelChapterMeta } from "@/types/database";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Coffee,
  BookOpen,
  Sparkles,
  AlignJustify,
} from "lucide-react";

interface FreePreviewReaderClientProps {
  novel: PublicNovel;
  chapter: PublicFreePreviewChapter;
  allChapters: PublicNovelChapterMeta[];
}

type ThemeMode = "light" | "sepia" | "dark";
type FontSize = "sm" | "base" | "lg" | "xl" | "2xl";
type LineHeight = "normal" | "relaxed" | "loose";

export function FreePreviewReaderClient({
  novel,
  chapter,
  allChapters,
}: FreePreviewReaderClientProps) {
  // Lazy state initialization from localStorage avoids cascading re-renders in effects
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("unb_reader_theme") as ThemeMode | null;
        if (saved) return saved;
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
    return "relaxed";
  });

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
    <div className={`min-h-screen transition-colors duration-200 ${themeClasses} pb-24`}>
      {/* Sticky Reader Controls Header */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${toolbarThemeClasses} px-4 sm:px-6 py-3`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Back to Novel */}
          <Link
            href={`/novels/${novel.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Novel Details</span>
            <span className="sm:hidden">Back</span>
          </Link>

          {/* Center Chapter Identifier */}
          <div className="text-center truncate px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent block">
              Free Preview Chapter {chapter.chapter_number}
            </span>
            <UrduText
              as="h2"
              size="xs"
              className="font-bold py-0 leading-tight truncate"
            >
              {chapter.title_urdu}
            </UrduText>
          </div>

          {/* Reader Preferences (Theme & Typography Controls) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Theme Toggles */}
            <div className="flex items-center bg-black/5 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                aria-label="Light theme"
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  theme === "light" ? "bg-white shadow-sm text-navy" : "opacity-60 hover:opacity-100"
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("sepia")}
                aria-label="Sepia parchment theme"
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  theme === "sepia" ? "bg-[#DFD3BE] text-[#3C2A1E] shadow-sm" : "opacity-60 hover:opacity-100"
                }`}
              >
                <Coffee className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                aria-label="Dark mode"
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  theme === "dark" ? "bg-primary text-white shadow-sm" : "opacity-60 hover:opacity-100"
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Font Size Adjuster */}
            <div className="flex items-center bg-black/5 rounded-lg p-0.5 text-xs font-serif font-bold">
              <button
                type="button"
                onClick={() => handleFontSizeChange("base")}
                className={`px-1.5 py-0.5 rounded ${fontSize === "base" ? "bg-white/90 text-navy" : "opacity-60"}`}
                title="Default font size"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => handleFontSizeChange("lg")}
                className={`px-1.5 py-0.5 rounded text-sm ${fontSize === "lg" ? "bg-white/90 text-navy" : "opacity-60"}`}
                title="Larger font size"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => handleFontSizeChange("xl")}
                className={`px-1.5 py-0.5 rounded text-base ${fontSize === "xl" ? "bg-white/90 text-navy" : "opacity-60"}`}
                title="Extra large font size"
              >
                A++
              </button>
            </div>

            {/* Line Height Toggle */}
            <button
              type="button"
              onClick={handleLineHeightCycle}
              className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
              title={`Line spacing: ${lineHeight} (click to toggle)`}
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Reading Canvas (Comfortable measure for Urdu script) */}
      <main className="max-w-2xl lg:max-w-3xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 space-y-10">
        {/* Chapter Header */}
        <div className="text-center space-y-3 pb-8 border-b border-black/10 dark:border-white/10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-accent/20 text-accent-dark dark:text-accent">
            <Sparkles className="w-3.5 h-3.5" />
            <span>باب {chapter.chapter_number} — مفت پیش منظر</span>
          </div>

          <UrduText
            as="h1"
            size="3xl"
            className="font-bold leading-[2.4] py-1"
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
            userSelect="text"
          />
        </article>

        {/* Chapter Navigation Footer */}
        <div className="pt-12 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
          {prevChapter ? (
            <Link
              href={`/novels/${novel.slug}/read/${prevChapter.chapter_number}`}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>پچھلا مفت باب ({prevChapter.chapter_number})</span>
            </Link>
          ) : (
            <div />
          )}

          {nextChapter ? (
            <Link
              href={`/novels/${novel.slug}/read/${nextChapter.chapter_number}`}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-accent text-navy hover:bg-accent-light transition-colors shadow-sm ml-auto"
            >
              <span>اگلا مفت باب ({nextChapter.chapter_number})</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href={`/novels/${novel.slug}`}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-navy text-accent hover:bg-navy-light transition-colors shadow-sm ml-auto"
            >
              <BookOpen className="w-4 h-4" />
              <span>مکمل ناول کی تفصیلات</span>
            </Link>
          )}
        </div>

        {/* End of Preview Support Author Callout */}
        <div className="w-full max-w-2xl mx-auto mt-10 p-6 sm:p-8 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-center space-y-4">
          <UrduText as="h3" size="xl" className="py-0 text-inherit">
            کیا آپ کو یہ پیش منظر پسند آیا؟
          </UrduText>
          <p className="text-xs max-w-md mx-auto leading-relaxed opacity-80">
            مکمل ناول کے تمام ابواب پڑھنے کے لیے مصنف کو براہ راست JazzCash، EasyPaisa،
            یا بینک کے ذریعے سپورٹ کریں۔
          </p>
          <div className="pt-2">
            <Link
              href={`/novels/${novel.slug}`}
              className="inline-flex items-center gap-2 bg-navy text-accent font-semibold px-6 py-3 rounded-xl text-xs hover:bg-navy-light shadow-md transition-colors"
            >
              <span>خریداری اور ادائیگی کی تفصیلات</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Reader Appreciation (Tip Jar) at end of free preview */}
        {!nextChapter && (
          <div className="pt-4 pb-8">
            <TipCard writerId={novel.writer_id} novelId={novel.id} />
          </div>
        )}
      </main>
    </div>
  );
}
