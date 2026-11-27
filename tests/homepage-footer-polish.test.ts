import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { siteConfig } from '../src/config/site.ts';

const REPO_ROOT = process.cwd();

describe('Homepage & Global Footer UI/UX Redesign', () => {
  const homePagePath = path.resolve(REPO_ROOT, 'src/app/(marketplace)/page.tsx');
  const footerPath = path.resolve(REPO_ROOT, 'src/components/layout/public-footer.tsx');

  describe('1. Homepage Information Architecture & Smart Fallback', () => {
    it('places Novels showcase before How Direct Payment Works and For Urdu Writers', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      const heroIdx = content.indexOf('1. COMPACT HERO SECTION');
      const trustIdx = content.indexOf('2. CENTERED COMPACT TRUST STRIP');
      const primaryShowcaseIdx = content.indexOf('3. PRIMARY NOVELS SHOWCASE');
      const genreIdx = content.indexOf('4. BROWSE BY GENRE');
      const secondaryNewestIdx = content.indexOf('5. NEW RELEASES');
      const paymentStepsIdx = content.indexOf('6. HOW DIRECT PAYMENT WORKS');
      const writersIdx = content.indexOf('7. RECRUITMENT CALLOUT: FOR URDU WRITERS');

      assert.ok(heroIdx !== -1, 'Hero section must exist');
      assert.ok(trustIdx > heroIdx, 'Trust strip must follow Hero');
      assert.ok(primaryShowcaseIdx > trustIdx, 'Primary Novels Showcase must follow Trust Strip');
      assert.ok(genreIdx > primaryShowcaseIdx, 'Browse by Genre must follow Primary Novels Showcase');
      assert.ok(secondaryNewestIdx > genreIdx, 'Secondary New Releases must follow Browse by Genre');
      assert.ok(paymentStepsIdx > secondaryNewestIdx, 'How Direct Payment Works must follow novels & genres');
      assert.ok(writersIdx > paymentStepsIdx, 'For Urdu Writers must follow How Direct Payment Works');
    });

    it('implements smart fallback when featuredNovels is empty and newestNovels exist', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      // Smart fallback flags
      assert.ok(content.includes('const showFeatured = featuredNovels.length > 0;'));
      assert.ok(content.includes('const showFallbackNewest = !showFeatured && newestNovels.length > 0;'));
      assert.ok(content.includes('const showNoNovelsEmpty = !showFeatured && newestNovels.length === 0;'));

      // Never renders empty Featured box when newest novels exist
      assert.ok(!content.includes('No featured novels yet'));

      // Renders secondary New Releases only when Featured occupied primary slot
      assert.ok(content.includes('{showFeatured && newestNovels.length > 0 && ('));

      // Empty state centers both English and Urdu copy
      assert.ok(content.includes('No novels published yet'));
      assert.ok(content.includes('text-text-muted text-center py-0'));
    });

    it('preserves revalidate = 120 and cookie-free public queries', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      assert.ok(content.includes('export const revalidate = 120;'));
      assert.ok(content.includes('getFeaturedNovels(6)'));
      assert.ok(content.includes('getNewestNovels(8)'));
      assert.ok(content.includes('getPublicGenres()'));
    });
  });

  describe('2. Hero Section & Centered Compact Trust Strip', () => {
    it('eliminates duplicate /novels Search CTA and exposes both primary & writer CTAs on mobile', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      // Duplicate CTA removed
      assert.ok(!content.includes('Browse Catalog'));
      assert.ok(!content.includes('Search Novels'));

      // Clean 2-tier CTAs visible on mobile and desktop
      assert.ok(content.includes('Browse Novels'));
      assert.ok(content.includes('ناولز دریافت کریں'));
      assert.ok(content.includes('Publish as a Writer'));
      assert.ok(content.includes('مصنف بنیں'));
      assert.ok(!content.includes('hidden sm:inline-flex btn-secondary'));

      // Centered Urdu hero subtitle
      assert.ok(content.includes('text-text-muted text-center max-w-xl mx-auto font-normal py-0 leading-[2.2]'));
    });

    it('centers compact trust strip with concise single-line pills', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      assert.ok(content.includes('TRUST_PAYMENT_PILLS = ["JazzCash", "EasyPaisa", "Raast", "Bank"]'));
      assert.ok(content.includes('whitespace-nowrap'));
      assert.ok(content.includes('justify-center'));
    });
  });

  describe('3. How Direct Payment Works (Lining Sans Numerals & Compact Mobile Stepper)', () => {
    it('uses font-sans tabular-nums lining-nums step badges instead of serif prefixes', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      // Dedicated sans lining-nums badge
      assert.ok(content.includes('font-sans font-bold tracking-wider text-text-muted tabular-nums lining-nums'));
      assert.ok(content.includes('number: "01"'));
      assert.ok(content.includes('number: "02"'));
      assert.ok(content.includes('number: "03"'));

      // No baked numbers inside serif headings
      assert.ok(!content.includes('1. Transfer to Author'));
      assert.ok(!content.includes('2. Submit TID'));
      assert.ok(!content.includes('3. Instant Access'));

      // Centered Urdu header subline and concise Urdu micro-labels
      assert.ok(content.includes('text-text-muted text-center py-0'));
      assert.ok(content.includes('مصنف کے اکاؤنٹ میں براہِ راست رقم بھیجیں'));
      assert.ok(content.includes('رسید اور ٹرانزیکشن آئی ڈی جمع کروائیں'));
      assert.ok(content.includes('تصدیق کے فوراً بعد مکمل ناول پڑھیں'));
    });
  });

  describe('4. For Urdu Writers Editorial Highlight Card', () => {
    it('uses approved bg-primary and text-primary-contrast editorial tokens with scannable chips', () => {
      const content = fs.readFileSync(homePagePath, 'utf8');

      assert.ok(content.includes('bg-primary text-primary-contrast'));
      assert.ok(content.includes('border-primary-contrast/15'));
      assert.ok(content.includes('Up to 70% Author Share'));
      assert.ok(content.includes('Direct Payouts'));
      assert.ok(content.includes('100% IP Rights'));
      assert.ok(content.includes('text-primary-contrast text-center md:text-left'));
      assert.ok(!content.includes('commission'));
      assert.ok(!content.includes('کمیشن'));
    });
  });

  describe('5. Global Footer Deduplication & Mobile Polish', () => {
    it('has zero duplicate href values across readers, writers, and legal footer columns', () => {
      const { readers, writers, legal } = siteConfig.navigation.footer;
      const allLinks = [...readers, ...writers, ...legal];
      const hrefs = allLinks.map((item) => item.href);
      const uniqueHrefs = new Set(hrefs);

      assert.equal(
        hrefs.length,
        uniqueHrefs.size,
        `Duplicate footer hrefs found: ${hrefs.filter((h, i) => hrefs.indexOf(h) !== i).join(', ')}`
      );

      // Legal & policy routes live exclusively inside legal ("Trust & Policies")
      const legalRoutes = ['/writer-agreement', '/content-policy', '/terms', '/refund-policy', '/privacy'];
      const legalHrefs = new Set(legal.map((item) => item.href));
      const nonLegalHrefs = new Set([...readers, ...writers].map((item) => item.href));

      for (const route of legalRoutes) {
        assert.ok(legalHrefs.has(route), `${route} must be in footer.legal`);
        assert.ok(!nonLegalHrefs.has(route), `${route} must NOT be duplicated outside footer.legal`);
      }

      // Actionable writer links live in footer.writers
      const writerHrefs = new Set(writers.map((item) => item.href));
      assert.ok(writerHrefs.has('/become-a-writer'));
      assert.ok(writerHrefs.has('/writer'));
    });

    it('renders concise payment pills, 2-column mobile legal grid, aligned Urdu mission, and centered ShieldCheck', () => {
      const content = fs.readFileSync(footerPath, 'utf8');

      // Concise shortName pill support
      assert.ok(content.includes('method.shortName || method.name'));

      // Compact 2-column mobile Trust & Policies grid
      assert.ok(content.includes('grid-cols-2 sm:grid-cols-1'));

      // Urdu mission left-aligned with English brand block
      assert.ok(content.includes('text-text-muted text-left max-w-md'));

      // Inline centered bottom ShieldCheck trust notice
      assert.ok(content.includes('inline-flex items-center justify-center gap-1.5 text-center'));

      // Comfortable mobile clearance above BottomNav
      assert.ok(content.includes('pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-12'));
    });
  });
});
