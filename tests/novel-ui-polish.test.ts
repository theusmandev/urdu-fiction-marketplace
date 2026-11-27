import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatLanguage } from '../src/lib/utils.ts';

const REPO_ROOT = process.cwd();

describe('Novel UI/UX Polish: Language Formatter, Price Numerals, Locked Modal & Preview Reader', () => {
  describe('1. Language Code Formatter (formatLanguage)', () => {
    it('formats raw "ur" code to readable Urdu label', () => {
      assert.equal(formatLanguage('ur'), 'Urdu · اردو');
    });

    it('formats "urdu" code to readable Urdu label', () => {
      assert.equal(formatLanguage('urdu'), 'Urdu · اردو');
      assert.equal(formatLanguage('URDU'), 'Urdu · اردو');
    });

    it('formats "en" and "english" to "English"', () => {
      assert.equal(formatLanguage('en'), 'English');
      assert.equal(formatLanguage('EN'), 'English');
      assert.equal(formatLanguage('english'), 'English');
    });

    it('defaults null, undefined, or empty code to "Urdu · اردو"', () => {
      assert.equal(formatLanguage(null), 'Urdu · اردو');
      assert.equal(formatLanguage(undefined), 'Urdu · اردو');
      assert.equal(formatLanguage(''), 'Urdu · اردو');
      assert.equal(formatLanguage('   '), 'Urdu · اردو');
    });

    it('capitalizes other ISO language codes gracefully', () => {
      assert.equal(formatLanguage('fr'), 'Fr');
      assert.equal(formatLanguage('arabic'), 'Arabic');
    });
  });

  describe('2. Crisp Lining Sans Price Numeral Styling Across Marketplace', () => {
    it('NovelAccessPanel uses font-sans, tabular-nums, and lining-nums for prices', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelAccessPanel.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Desktop price display
      assert.ok(content.includes('font-sans text-2xl sm:text-3xl font-bold tracking-tight text-navy tabular-nums lining-nums'));
      // Compact mobile price display
      assert.ok(content.includes('font-sans text-lg font-bold tracking-tight text-navy tabular-nums lining-nums'));
      // Bidi label cleanly separated without colon jump
      assert.ok(content.includes('<span>Price</span>'));
      assert.ok(content.includes('قیمت</span>'));
      assert.ok(!content.includes('Price / :قیمت'));
    });

    it('NovelCard uses font-sans, tabular-nums, and lining-nums for price', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelCard.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('font-sans text-xs sm:text-sm font-bold tracking-tight text-primary tabular-nums lining-nums'));
      assert.ok(!content.includes('font-serif text-xs sm:text-sm font-bold text-primary'));
    });

    it('Home novel-card uses font-sans, tabular-nums, and lining-nums for price', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/home/novel-card.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('font-sans text-xs sm:text-sm font-bold tracking-tight text-navy tabular-nums lining-nums'));
      assert.ok(!content.includes('font-serif text-xs sm:text-sm font-bold text-navy'));
    });

    it('NovelToc locked chapter modal presents price in subtle pill with lining-nums', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelToc.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('Full Novel Price'));
      assert.ok(content.includes('font-sans font-bold text-navy text-sm tabular-nums lining-nums'));
    });
  });

  describe('3. Locked Chapter Modal Polish in NovelToc.tsx', () => {
    it('implements portal, high stacking context z-[100], and scroll lock', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelToc.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('createPortal('));
      assert.ok(content.includes('document.body'));
      assert.ok(content.includes('z-[100]'));
      assert.ok(content.includes("document.body.style.overflow = 'hidden'"));
      assert.ok(content.includes('data-reader-ui="true"'));
    });

    it('center-aligns Urdu title and description with generous breathing room', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelToc.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('text-xl font-urdu leading-relaxed text-navy text-center font-normal'));
      assert.ok(content.includes('text-base font-urdu leading-loose text-text text-center font-normal'));
      assert.ok(content.includes('space-y-2.5 text-center'));
    });

    it('uses high-contrast white text on dark navy/maroon for primary CTA', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelToc.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('bg-navy hover:bg-navy-dark text-white font-semibold py-3 px-5 rounded-xl text-base'));
      assert.ok(content.includes('min-h-[48px]'));
    });

    it('removes redundant bottom footer close button', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/NovelToc.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(!content.includes('{/* Modal Footer */}'));
      assert.ok(!content.includes('min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy hover:bg-ivory cursor-pointer transition-colors'));
    });
  });

  describe('4. Novel Details Page Polish (src/app/(marketplace)/novels/[slug]/page.tsx)', () => {
    it('center-aligns main Urdu title on mobile and preserves desktop alignment', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/app/(marketplace)/novels/[slug]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('text-center md:text-left'));
    });

    it('cleans author byline with feather icon first and no bidi colon', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/app/(marketplace)/novels/[slug]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('<Feather className="w-4 h-4 text-accent shrink-0" />'));
      assert.ok(!content.includes('By / مصنف:'));
    });

    it('uses formatLanguage and tighter vertical padding in key specifications grid', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/app/(marketplace)/novels/[slug]/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('formatLanguage(novel.language)'));
      assert.ok(content.includes('px-3.5 py-2.5 rounded-xl border border-border/80'));
    });
  });

  describe('5. Free Preview Reader Polish (FreePreviewReaderClient.tsx)', () => {
    it('unifies mobile top bar with clean Back, Free Preview pill, TOC and settings popover', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/FreePreviewReaderClient.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Free Preview clean pill badge
      assert.ok(content.includes('Free Preview'));
      // Chapters drawer and settings buttons
      assert.ok(content.includes('<Menu className="w-4 h-4" />'));
      assert.ok(content.includes('<Settings2 className="w-4 h-4" />'));
      assert.ok(content.includes('setSettingsOpen'));
      assert.ok(content.includes('setTocOpen'));
    });

    it('redesigns upsell card with data-reader-ui isolation and readable natural Urdu', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/FreePreviewReaderClient.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Data reader UI isolation
      assert.ok(content.includes('data-reader-ui="true"'));
      // Centered heading
      assert.ok(content.includes('text-xl sm:text-2xl font-urdu leading-relaxed text-center text-text'));
      // Natural Urdu without inline (unlock)
      assert.ok(content.includes('باقی کہانی پڑھنے اور تمام ابواب کھولنے کے لیے مصنف کو براہِ راست ادائیگی کریں۔'));
      assert.ok(!content.includes('(unlock)'));
      // Payment method pills
      assert.ok(content.includes('JazzCash'));
      assert.ok(content.includes('EasyPaisa'));
      assert.ok(content.includes('Raast'));
      assert.ok(content.includes('Bank Transfer'));
      // High contrast CTA
      assert.ok(content.includes('bg-navy hover:bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl text-base font-urdu min-h-[48px]'));
    });

    it('uses proper RTL directional icon (ChevronLeft) for next chapter button', () => {
      const filePath = path.resolve(REPO_ROOT, 'src/components/catalog/FreePreviewReaderClient.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // In RTL, "Next" (اگلا مفت باب) points leftwards (<)
      assert.ok(content.includes('<ChevronLeft className="w-4 h-4" />'));
      assert.ok(content.includes('<span>اگلا مفت باب ({nextChapter.chapter_number})</span>'));
    });
  });
});
