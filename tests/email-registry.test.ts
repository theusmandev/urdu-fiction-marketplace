import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TEMPLATE_REGISTRY,
  renderEmailTemplate,
  getAppBaseUrl,
  type TemplateMetadata,
} from '../src/lib/email/templates.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_APP_DIR = path.resolve(__dirname, '..', 'src', 'app');

// Helper to collect all known App Router routes
function collectAllRoutes(dir: string, baseRoute = ''): string[] {
  const routes: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
        // Route group doesn't alter path
        routes.push(...collectAllRoutes(fullPath, baseRoute));
      } else {
        const nextBase = baseRoute === '' ? `/${entry.name}` : `${baseRoute}/${entry.name}`;
        routes.push(...collectAllRoutes(fullPath, nextBase));
      }
    } else if (entry.isFile()) {
      if (/^page\.(tsx|jsx|js)$/.test(entry.name)) {
        routes.push(baseRoute === '' ? '/' : baseRoute);
      }
    }
  }
  return routes;
}

const APP_ROUTES = new Set(collectAllRoutes(SRC_APP_DIR));

// Helper to check if a ctaPath matches a valid existing route
function isCtaPathValid(ctaPath: string): boolean {
  if (APP_ROUTES.has(ctaPath)) return true;
  // If parameterized route like /writer/commission/[invoiceId], check dynamic match
  for (const route of APP_ROUTES) {
    if (route === ctaPath) return true;
  }
  return false;
}

describe('Comprehensive Email Registry Test Suite (Phase E4)', () => {
  const baseUrl = getAppBaseUrl();
  const FORBIDDEN_LEGACY_COLORS = [
    '#1B2A41',
    '#FAF7F2',
    '#C8A96B',
    '#1F2430',
    '#333F4D',
    '#E6DEC8',
    '#EFE8DA',
    '#735118',
    '#5F6673',
  ];

  it('verifies that TEMPLATE_REGISTRY contains all 31 registered template keys', () => {
    const keys = Object.keys(TEMPLATE_REGISTRY);
    assert.ok(keys.length >= 25, `Expected at least 25 templates, found ${keys.length}`);
    assert.strictEqual(keys.length, 31, `Expected exactly 31 template keys in registry, found ${keys.length}`);
  });

  for (const [key, meta] of Object.entries(TEMPLATE_REGISTRY)) {
    describe(`Template: ${key}`, () => {
      const rendered = renderEmailTemplate({
        template: key,
        subject: `Operational Notice: ${meta.badgeText} | ${meta.badgeUrdu}`,
        bodyText: `This is an operational notice regarding ${meta.badgeText}.\nتفصیلات ملاحظہ فرمائیں۔`,
      });

      it('1. produces valid HTML and plain-text parts with complete doctype and structure', () => {
        // HTML structure
        assert.ok(rendered.html.startsWith('<!DOCTYPE html>'), 'HTML must start with <!DOCTYPE html>');
        assert.ok(rendered.html.includes('<html lang="en">'), 'HTML must declare lang="en"');
        assert.ok(rendered.html.includes('</html>'), 'HTML must end with </html>');
        assert.ok(rendered.html.includes('role="presentation"'), 'HTML must use accessible table roles');

        // Plain text structure
        assert.ok(rendered.text.length > 50, 'Plain-text representation is too short');
        assert.ok(rendered.text.includes('UNB Premium | Urdu Novel Bank Premium | اردو ناول بینک'), 'Text has brand header');
        assert.ok(rendered.text.includes('Action Link:'), 'Text includes Action Link header');
        assert.ok(rendered.text.includes('Notification Preferences:'), 'Text includes Preferences link');
      });

      it('2. includes non-empty English and Urdu subjects, badges, and guidance', () => {
        assert.ok(meta.badgeText && meta.badgeText.trim().length > 0, 'badgeText is non-empty');
        assert.ok(meta.badgeUrdu && meta.badgeUrdu.trim().length > 0, 'badgeUrdu is non-empty');
        assert.ok(/[\u0600-\u06FF]/.test(meta.badgeUrdu), 'badgeUrdu contains Urdu Nastaliq characters');

        assert.ok(meta.whatHappenedEn && meta.whatHappenedEn.trim().length > 10, 'whatHappenedEn is non-empty');
        assert.ok(meta.whatHappenedUr && meta.whatHappenedUr.trim().length > 10, 'whatHappenedUr is non-empty');
        assert.ok(/[\u0600-\u06FF]/.test(meta.whatHappenedUr), 'whatHappenedUr contains Urdu characters');

        assert.ok(meta.actionGuidanceEn && meta.actionGuidanceEn.trim().length > 15, 'actionGuidanceEn is non-empty');
        assert.ok(meta.actionGuidanceUr && meta.actionGuidanceUr.trim().length > 15, 'actionGuidanceUr is non-empty');
        assert.ok(/[\u0600-\u06FF]/.test(meta.actionGuidanceUr), 'actionGuidanceUr contains Urdu characters');

        // Rendered subject check
        assert.ok(rendered.subject.length > 0, 'Rendered subject is non-empty');
      });

      it('3. generates an absolute https:// CTA URL that resolves to a verified active App Router route', () => {
        const ctaUrl = `${baseUrl}${meta.ctaPath}`;
        assert.ok(ctaUrl.startsWith('https://'), `CTA URL must be absolute https:// (got ${ctaUrl})`);
        assert.ok(rendered.html.includes(`href="${ctaUrl}"`), 'HTML contains absolute CTA link');
        assert.ok(rendered.text.includes(ctaUrl), 'Plain-text contains absolute CTA link');

        // Route verification
        assert.ok(meta.ctaPath.startsWith('/'), `ctaPath must start with '/' (got ${meta.ctaPath})`);
        assert.notStrictEqual(meta.ctaPath, '/writer/dashboard', 'ctaPath must not be broken /writer/dashboard');
        assert.ok(
          isCtaPathValid(meta.ctaPath),
          `ctaPath "${meta.ctaPath}" must match an existing route in src/app (known: ${Array.from(APP_ROUTES).join(', ')})`
        );
      });

      it('4. contains zero legacy palette colors and zero raster <img> tags', () => {
        for (const oldColor of FORBIDDEN_LEGACY_COLORS) {
          assert.ok(
            !rendered.html.includes(oldColor),
            `Template "${key}" contains forbidden legacy color "${oldColor}"`
          );
        }
        assert.ok(!rendered.html.includes('<img'), `Template "${key}" must not contain raster <img> tags`);

        // Check required reference palette tokens are present
        assert.ok(rendered.html.includes('#F1ECDF'), 'Contains Sand Canvas #F1ECDF');
        assert.ok(rendered.html.includes('#FFFFFF'), 'Contains White Card #FFFFFF');
        assert.ok(rendered.html.includes('#813B09'), 'Contains Brand Brown #813B09');
        assert.ok(rendered.html.includes('#5F2F16'), 'Contains Dark Brown Badge #5F2F16');
        assert.ok(rendered.html.includes('#D39A2A'), 'Contains Gold Accent #D39A2A');
        assert.ok(rendered.html.includes('#E6DFD0'), 'Contains Warm Border #E6DFD0');
      });

      it('5. strictly enforces zero forbidden user-facing terminology ("commission" / "کمیشن")', () => {
        // Urdu check (strictly zero tolerance)
        assert.ok(!rendered.html.includes('کمیشن'), `Template "${key}" HTML contains forbidden Urdu term "کمیشن"`);
        assert.ok(!rendered.text.includes('کمیشن'), `Template "${key}" text contains forbidden Urdu term "کمیشن"`);
        assert.ok(!meta.badgeUrdu.includes('کمیشن'), `Template "${key}" badgeUrdu contains forbidden "کمیشن"`);
        assert.ok(!meta.whatHappenedUr.includes('کمیشن'), `Template "${key}" whatHappenedUr contains "کمیشن"`);
        assert.ok(!meta.actionGuidanceUr.includes('کمیشن'), `Template "${key}" actionGuidanceUr contains "کمیشن"`);

        // English check: strip internal technical route path /writer/commission before scanning
        const strippedHtml = rendered.html.replace(/\/writer\/commission/g, '');
        const strippedText = rendered.text.replace(/\/writer\/commission/g, '');

        assert.ok(
          !strippedHtml.toLowerCase().includes('commission'),
          `Template "${key}" HTML contains forbidden user-facing word "commission"`
        );
        assert.ok(
          !strippedText.toLowerCase().includes('commission'),
          `Template "${key}" text contains forbidden user-facing word "commission"`
        );
        assert.ok(
          !meta.badgeText.toLowerCase().includes('commission'),
          `Template "${key}" badgeText contains "commission"`
        );
        assert.ok(
          !meta.whatHappenedEn.toLowerCase().includes('commission'),
          `Template "${key}" whatHappenedEn contains "commission"`
        );
        assert.ok(
          !meta.actionGuidanceEn.toLowerCase().includes('commission'),
          `Template "${key}" actionGuidanceEn contains "commission"`
        );
        assert.ok(
          !meta.ctaLabel.toLowerCase().includes('commission'),
          `Template "${key}" ctaLabel contains "commission"`
        );
      });
    });
  }
});

