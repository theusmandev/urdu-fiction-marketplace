import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_READER_URDU_FONTS,
  DEFAULT_READER_URDU_FONT,
  isReaderUrduFont,
  parseReaderUrduFont,
  parseValidNooriFontUrl,
  resolveEffectiveReaderFont,
  shouldSkipNooriDownload,
} from '../src/lib/settings/reader-font-constants.ts';
import {
  isNooriFontLoaded,
  _resetInFlightNooriPromiseForTesting,
} from '../src/lib/reader/useReaderNooriFont.ts';
import { fontSizeBaseRem } from '../src/lib/reader/chapter-body-model.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

describe('Admin-Switchable Reader Urdu Font Suite', () => {
  describe('1. Allowed List Synchronization with SQL Migration', () => {
    it('TypeScript ALLOWED_READER_URDU_FONTS matches SQL CHECK constraint in 0060_reader_urdu_font_setting.sql', () => {
      const migrationPath = path.resolve(REPO_ROOT, 'supabase/migrations/0060_reader_urdu_font_setting.sql');
      assert.ok(fs.existsSync(migrationPath), 'Migration 0060_reader_urdu_font_setting.sql must exist');

      const content = fs.readFileSync(migrationPath, 'utf8');

      // Match: CHECK (reader_urdu_font IN ('gulzar', 'noori'))
      const match = content.match(/CHECK\s*\(\s*reader_urdu_font\s+IN\s*\(([^)]+)\)\s*\)/i);
      assert.ok(match, 'CHECK constraint on reader_urdu_font must be found in migration 0060');

      const rawValues = match[1];
      const sqlFonts = rawValues
        .split(',')
        .map((val) => val.trim().replace(/^['"]|['"]$/g, ''))
        .sort();

      const tsFonts = [...ALLOWED_READER_URDU_FONTS].sort();

      assert.deepEqual(
        sqlFonts,
        tsFonts,
        `SQL CHECK constraint fonts ${JSON.stringify(sqlFonts)} must match TypeScript ALLOWED_READER_URDU_FONTS ${JSON.stringify(tsFonts)}`
      );
    });

    it('DEFAULT_READER_URDU_FONT is gulzar and belongs to ALLOWED_READER_URDU_FONTS', () => {
      assert.equal(DEFAULT_READER_URDU_FONT, 'gulzar');
      assert.ok(ALLOWED_READER_URDU_FONTS.includes(DEFAULT_READER_URDU_FONT));
    });
  });

  describe('2. Reader Font Value Parser & Validator', () => {
    it('isReaderUrduFont validates allowed values and rejects unknown strings', () => {
      assert.equal(isReaderUrduFont('gulzar'), true);
      assert.equal(isReaderUrduFont('noori'), true);

      assert.equal(isReaderUrduFont(''), false);
      assert.equal(isReaderUrduFont('arial'), false);
      assert.equal(isReaderUrduFont('times'), false);
      assert.equal(isReaderUrduFont(null), false);
      assert.equal(isReaderUrduFont(undefined), false);
      assert.equal(isReaderUrduFont(123), false);
      assert.equal(isReaderUrduFont({}), false);
    });

    it('parseReaderUrduFont returns valid font or safely falls back to gulzar', () => {
      assert.equal(parseReaderUrduFont('gulzar'), 'gulzar');
      assert.equal(parseReaderUrduFont('noori'), 'noori');

      assert.equal(parseReaderUrduFont('unknown_font'), 'gulzar');
      assert.equal(parseReaderUrduFont(''), 'gulzar');
      assert.equal(parseReaderUrduFont(null), 'gulzar');
      assert.equal(parseReaderUrduFont(undefined), 'gulzar');
      assert.equal(parseReaderUrduFont(42), 'gulzar');
    });
  });

  describe('3. Font URL Validation & CSS Injection Guard', () => {
    it('accepts valid HTTPS font URLs', () => {
      const valid1 = 'https://assets.urdunovelbanks.com/fonts/JameelNooriNastaleeq-subset.v1.woff2';
      assert.equal(parseValidNooriFontUrl(valid1), valid1);

      const valid2 = 'https://pub-abcdef123456.r2.dev/fonts/noori.woff2';
      assert.equal(parseValidNooriFontUrl(valid2), valid2);
    });

    it('rejects HTTP, ftp, relative, and non-https schemes', () => {
      assert.equal(parseValidNooriFontUrl('http://assets.urdunovelbanks.com/font.woff2'), null);
      assert.equal(parseValidNooriFontUrl('ftp://example.com/font.woff2'), null);
      assert.equal(parseValidNooriFontUrl('/fonts/noori.woff2'), null);
      assert.equal(parseValidNooriFontUrl('file:///C:/font.woff2'), null);
      assert.equal(parseValidNooriFontUrl('data:font/woff2;base64,AAAA'), null);
      assert.equal(parseValidNooriFontUrl('javascript:alert(1)'), null);
    });

    it('strictly rejects CSS injection attempts (quotes, semicolons, brackets, newlines)', () => {
      assert.equal(parseValidNooriFontUrl('https://example.com/font.woff2"); } body { color: red; }'), null);
      assert.equal(parseValidNooriFontUrl("https://example.com/font.woff2'); }"), null);
      assert.equal(parseValidNooriFontUrl('https://example.com/font.woff2; background: red'), null);
      assert.equal(parseValidNooriFontUrl('https://example.com/font\n.woff2'), null);
      assert.equal(parseValidNooriFontUrl('https://example.com/font\r.woff2'), null);
      assert.equal(parseValidNooriFontUrl('https://example.com/font url("bad")'), null);
    });

    it('rejects embedded credentials in URL', () => {
      assert.equal(parseValidNooriFontUrl('https://user:pass@assets.urdunovelbanks.com/font.woff2'), null);
    });

    it('handles empty or non-string inputs gracefully', () => {
      assert.equal(parseValidNooriFontUrl(''), null);
      assert.equal(parseValidNooriFontUrl('   '), null);
      assert.equal(parseValidNooriFontUrl(null), null);
      assert.equal(parseValidNooriFontUrl(undefined), null);
      assert.equal(parseValidNooriFontUrl(123), null);
    });
  });

  describe('4. Effective Reader Font Resolution Logic', () => {
    it('resolves noori ONLY when DB setting is noori AND valid HTTPS URL is present', () => {
      const validUrl = 'https://assets.urdunovelbanks.com/font.woff2';
      const res = resolveEffectiveReaderFont('noori', validUrl);
      assert.deepEqual(res, { effectiveFont: 'noori', fontUrl: validUrl });
    });

    it('falls back safely to gulzar when DB setting is noori but URL is missing or empty', () => {
      assert.deepEqual(resolveEffectiveReaderFont('noori', null), { effectiveFont: 'gulzar', fontUrl: null });
      assert.deepEqual(resolveEffectiveReaderFont('noori', ''), { effectiveFont: 'gulzar', fontUrl: null });
    });

    it('returns gulzar when DB setting is gulzar regardless of URL', () => {
      const validUrl = 'https://assets.urdunovelbanks.com/font.woff2';
      assert.deepEqual(resolveEffectiveReaderFont('gulzar', validUrl), { effectiveFont: 'gulzar', fontUrl: null });
      assert.deepEqual(resolveEffectiveReaderFont('gulzar', null), { effectiveFont: 'gulzar', fontUrl: null });
    });
  });

  describe('5. Public Repository Binary Protection Guard', () => {
    it('guarantees ZERO .woff2, .ttf, or .otf font binaries matching Noori are tracked by git', () => {
      try {
        const trackedFiles = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' })
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean);

        const trackedFontBinaries = trackedFiles.filter((file) => {
          // If file is inside public/fonts-private/
          if (/^public\/fonts-private\//i.test(file)) return true;
          // If file is a font binary matching Noori
          if (/\.(woff2|ttf|otf)$/i.test(file) && /noori/i.test(file)) return true;
          return false;
        });

        assert.deepEqual(
          trackedFontBinaries,
          [],
          `FORBIDDEN: Proprietary font binaries must NEVER be committed to the public repo! Found: ${trackedFontBinaries.join(', ')}`
        );
      } catch {
        // If git is unavailable in environment, fallback to scanning filesystem
        const scanDir = (dir: string): string[] => {
          const files: string[] = [];
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.next') {
              files.push(...scanDir(full));
            } else if (entry.isFile() && /noori/i.test(entry.name) && /\.(woff2|ttf|otf)$/i.test(entry.name)) {
              files.push(full);
            }
          }
          return files;
        };

        const found = scanDir(REPO_ROOT);
        assert.deepEqual(found, [], `Found uncommitted Noori font binaries in workspace: ${found.join(', ')}`);
      }
    });

    it('.gitignore contains rules to ignore Noori font files and private fonts folder', () => {
      const gitignoreContent = fs.readFileSync(path.resolve(REPO_ROOT, '.gitignore'), 'utf8');
      assert.ok(gitignoreContent.includes('*Noori*.woff2') || gitignoreContent.includes('*noori*.woff2'));
      assert.ok(gitignoreContent.includes('public/fonts-private/'));
    });
  });

  describe('6. SQL Migration and Test Invariants', () => {
    it('migration 0060 adheres to security definer, search_path, and proper grants', () => {
      const migrationContent = fs.readFileSync(
        path.resolve(REPO_ROOT, 'supabase/migrations/0060_reader_urdu_font_setting.sql'),
        'utf8'
      );

      assert.ok(migrationContent.includes('SECURITY DEFINER'));
      assert.ok(migrationContent.includes("SET search_path = ''"));
      assert.ok(migrationContent.includes("action_type,\n        entity_type,\n        entity_id,\n        previous_state,\n        new_state,\n        created_at\n    ) VALUES (\n        v_caller_id,\n        'admin',\n        'SET_READER_URDU_FONT'"));
      assert.ok(migrationContent.includes('GRANT EXECUTE ON FUNCTION public.get_public_site_settings() TO anon, authenticated;'));
      assert.ok(migrationContent.includes('GRANT EXECUTE ON FUNCTION public.set_reader_urdu_font(text, text) TO authenticated;'));
    });

    it('test 28_reader_urdu_font_tests.sql exists and covers all required test cases', () => {
      const testContent = fs.readFileSync(
        path.resolve(REPO_ROOT, 'supabase/tests/28_reader_urdu_font_tests.sql'),
        'utf8'
      );

      assert.ok(testContent.includes('get_public_site_settings'));
      assert.ok(testContent.includes('set_reader_urdu_font'));
      assert.ok(testContent.includes('chk_platform_settings_reader_urdu_font'));
      assert.ok(testContent.includes('SET_READER_URDU_FONT'));
    });
  });

  describe('7. Data-Saver and Slow Network Guard (shouldSkipNooriDownload)', () => {
    it('returns false when connection is null, undefined, or empty', () => {
      assert.equal(shouldSkipNooriDownload(null), false);
      assert.equal(shouldSkipNooriDownload(undefined), false);
      assert.equal(shouldSkipNooriDownload({}), false);
    });

    it('returns true when saveData is true', () => {
      assert.equal(shouldSkipNooriDownload({ saveData: true }), true);
      assert.equal(shouldSkipNooriDownload({ saveData: true, effectiveType: '4g' }), true);
    });

    it('returns false when saveData is false and connection is fast', () => {
      assert.equal(shouldSkipNooriDownload({ saveData: false }), false);
      assert.equal(shouldSkipNooriDownload({ saveData: false, effectiveType: '4g' }), false);
      assert.equal(shouldSkipNooriDownload({ saveData: false, effectiveType: '5g' }), false);
    });

    it('returns true on slow connection types (slow-2g, 2g, 3g)', () => {
      assert.equal(shouldSkipNooriDownload({ effectiveType: 'slow-2g' }), true);
      assert.equal(shouldSkipNooriDownload({ effectiveType: '2g' }), true);
      assert.equal(shouldSkipNooriDownload({ effectiveType: '3g' }), true);
    });

    it('handles case-insensitivity and whitespace in effectiveType', () => {
      assert.equal(shouldSkipNooriDownload({ effectiveType: '3G' }), true);
      assert.equal(shouldSkipNooriDownload({ effectiveType: ' 2g ' }), true);
      assert.equal(shouldSkipNooriDownload({ effectiveType: 'SLOW-2G' }), true);
    });

    it('returns false on fast connection types (4g, 5g, wifi/unknown)', () => {
      assert.equal(shouldSkipNooriDownload({ effectiveType: '4g' }), false);
      assert.equal(shouldSkipNooriDownload({ effectiveType: '5g' }), false);
      assert.equal(shouldSkipNooriDownload({ effectiveType: 'wifi' }), false);
    });
  });

  describe('8. Font Loader State & Cache Detection (isNooriFontLoaded)', () => {
    const originalDocument = (globalThis as unknown as { document?: unknown }).document;

    it('returns false when document is undefined (SSR environment)', () => {
      delete (globalThis as unknown as { document?: unknown }).document;
      assert.equal(isNooriFontLoaded(), false);
    });

    it('returns false when document has no fonts property', () => {
      (globalThis as unknown as { document?: unknown }).document = {};
      assert.equal(isNooriFontLoaded(), false);
    });

    it('returns false when document.fonts has zero entries', () => {
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set(),
      };
      assert.equal(isNooriFontLoaded(), false);
    });

    it('returns false when document.fonts contains other loaded fonts but not Jameel Noori', () => {
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set([
          { family: 'Gulzar', status: 'loaded' },
          { family: 'Plus Jakarta Sans', status: 'loaded' },
        ]),
      };
      assert.equal(isNooriFontLoaded(), false);
    });

    it('returns false when JameelNooriNastaleeq is present but still in loading or unloaded state', () => {
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set([
          { family: 'JameelNooriNastaleeq', status: 'loading' },
        ]),
      };
      assert.equal(isNooriFontLoaded(), false);

      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set([
          { family: 'JameelNooriNastaleeq', status: 'unloaded' },
        ]),
      };
      assert.equal(isNooriFontLoaded(), false);
    });

    it('returns true when JameelNooriNastaleeq is registered with status loaded', () => {
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set([
          { family: 'JameelNooriNastaleeq', status: 'loaded' },
        ]),
      };
      assert.equal(isNooriFontLoaded(), true);
    });

    it('handles quoted font family names safely (e.g. "JameelNooriNastaleeq")', () => {
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set([
          { family: '"JameelNooriNastaleeq"', status: 'loaded' },
        ]),
      };
      assert.equal(isNooriFontLoaded(), true);

      (globalThis as unknown as { document?: unknown }).document = {
        fonts: new Set([
          { family: "'JameelNooriNastaleeq'", status: 'loaded' },
        ]),
      };
      assert.equal(isNooriFontLoaded(), true);
    });

    // Cleanup mock document
    it('restores original document environment', () => {
      if (originalDocument === undefined) {
        delete (globalThis as unknown as { document?: unknown }).document;
      } else {
        (globalThis as unknown as { document?: unknown }).document = originalDocument;
      }
      assert.ok(true);
    });
  });

  describe('9. Regression Guard: W3C document.fonts.check() False-Positive Prevention', () => {
    it('guarantees useReaderNooriFont.ts does NOT call document.fonts.check() for loading decisions', () => {
      const hookPath = path.resolve(REPO_ROOT, 'src/lib/reader/useReaderNooriFont.ts');
      assert.ok(fs.existsSync(hookPath), 'useReaderNooriFont.ts must exist');
      const content = fs.readFileSync(hookPath, 'utf8');

      // Strip comments so docstrings explaining the bug don't trigger false positives
      const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

      // document.fonts.check() returns TRUE for unregistered fonts (W3C CSS Font Loading Level 3),
      // which previously caused the hook to mistakenly assume the font was loaded before downloading it.
      assert.ok(
        !codeWithoutComments.includes('document.fonts.check'),
        'FORBIDDEN: useReaderNooriFont.ts must never call document.fonts.check() in executable code to detect if Noori is available'
      );
      assert.ok(
        codeWithoutComments.includes('isNooriFontLoaded'),
        'useReaderNooriFont.ts must use isNooriFontLoaded() to inspect document.fonts entries directly'
      );
    });
  });

  describe('10. CSS Hierarchy & Specificity Invariants in globals.css', () => {
    it('globals.css applies font-family: var(--reader-font-family) to [data-reader-font="noori"] and paragraphs', () => {
      const cssPath = path.resolve(REPO_ROOT, 'src/app/globals.css');
      assert.ok(fs.existsSync(cssPath), 'globals.css must exist');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Verify noori definition and token assignment
      assert.ok(
        cssContent.includes('[data-reader-font="noori"]'),
        'globals.css must define [data-reader-font="noori"]'
      );
      assert.ok(
        cssContent.includes("--reader-font-family: 'JameelNooriNastaleeq', var(--font-urdu), \"Noto Nastaliq Urdu\", serif;"),
        'globals.css must set JameelNooriNastaleeq as leading family in --reader-font-family'
      );

      // Verify direct font-family application on container and descendants
      assert.ok(
        cssContent.includes('[data-reader-font="noori"] p'),
        'globals.css must target [data-reader-font="noori"] p'
      );
      assert.ok(
        cssContent.includes('[data-reader-font="noori"] .font-urdu'),
        'globals.css must override .font-urdu inside [data-reader-font="noori"] to prevent Gulzar lock-in'
      );
      assert.ok(
        cssContent.includes('[data-reader-font="noori"] .reader-canvas'),
        'globals.css must apply to .reader-canvas inside [data-reader-font="noori"]'
      );

      // Verify gulzar definition
      assert.ok(
        cssContent.includes('[data-reader-font="gulzar"]'),
        'globals.css must define [data-reader-font="gulzar"]'
      );
      assert.ok(
        cssContent.includes('[data-reader-font="gulzar"] p'),
        'globals.css must target [data-reader-font="gulzar"] p'
      );
    });
  });

  describe('11. CSP font-src & connect-src Synchronization in next.config.ts', () => {
    it('next.config.ts appends fontSrcExtra to BOTH font-src and connect-src', () => {
      const configPath = path.resolve(REPO_ROOT, 'next.config.ts');
      assert.ok(fs.existsSync(configPath), 'next.config.ts must exist');
      const content = fs.readFileSync(configPath, 'utf8');

      // font-src must include fontSrcExtra
      assert.ok(
        content.includes('font-src \'self\' https://fonts.gstatic.com data:${fontSrcExtra};'),
        'next.config.ts must include fontSrcExtra in font-src'
      );

      // connect-src must include fontSrcExtra
      assert.ok(
        content.includes('connect-src ${connectSrc};'),
        'next.config.ts must use connectSrc in CSP'
      );
      assert.ok(
        content.includes('${prodSupabaseConnect}${fontSrcExtra}'),
        'next.config.ts must include fontSrcExtra in prod connect-src'
      );
    });
  });

  describe('12. Optical Font-Size Scaling for Jameel Noori Nastaleeq', () => {
    it('globals.css sets optical scale tokens: --reader-font-scale 1 for gulzar and 1.26 for noori', () => {
      const cssPath = path.resolve(REPO_ROOT, 'src/app/globals.css');
      assert.ok(fs.existsSync(cssPath), 'globals.css must exist');
      const content = fs.readFileSync(cssPath, 'utf8');

      // Gulzar: scale 1 (no magnification)
      assert.ok(
        content.includes('--reader-font-scale: 1;'),
        'globals.css must set --reader-font-scale: 1 for [data-reader-font="gulzar"]'
      );
      assert.ok(
        content.includes('--reader-heading-scale: 1;'),
        'globals.css must set --reader-heading-scale: 1 for [data-reader-font="gulzar"]'
      );

      // Noori: optical scale boost 1.26 to match Gulzar perceived stroke weight at LG and other sizes
      assert.ok(
        content.includes('--reader-font-scale: 1.26;'),
        'globals.css must set --reader-font-scale: 1.26 for [data-reader-font="noori"]'
      );
      assert.ok(
        content.includes('--reader-heading-scale: 1.20;'),
        'globals.css must set --reader-heading-scale: 1.20 for [data-reader-font="noori"]'
      );
    });

    it('globals.css applies optical calc formula for prose paragraphs and headings', () => {
      const cssPath = path.resolve(REPO_ROOT, 'src/app/globals.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      assert.ok(
        content.includes('font-size: calc(var(--reader-base-font-size, 1.125rem) * var(--reader-font-scale, 1.26));') ||
        content.includes('font-size: calc(var(--reader-base-font-size, 1.125rem) * var(--reader-font-scale, 1));'),
        'globals.css must apply calc formula with base font size and scale multiplier'
      );

      assert.ok(
        content.includes('[data-reader-font="noori"] h1'),
        'globals.css must target [data-reader-font="noori"] h1 for optical heading scale'
      );
    });

    it('fontSizeBaseRem maps all 5 ReaderFontSize presets correctly', () => {
      assert.equal(fontSizeBaseRem.sm, '0.875rem');
      assert.equal(fontSizeBaseRem.base, '1rem');
      assert.equal(fontSizeBaseRem.lg, '1.125rem');
      assert.equal(fontSizeBaseRem.xl, '1.25rem');
      assert.equal(fontSizeBaseRem['2xl'], '1.5rem');
    });

    it('client readers apply optical heading scale without mutating user settings', () => {
      const secureReaderPath = path.resolve(REPO_ROOT, 'src/app/read/[slug]/[number]/SecureReaderClient.tsx');
      const secureContent = fs.readFileSync(secureReaderPath, 'utf8');

      assert.ok(
        secureContent.includes('[font-size:calc(1.5rem*var(--reader-heading-scale,1))]'),
        'SecureReaderClient must apply optical heading scale formula'
      );
      assert.ok(
        secureContent.includes('leading-[var(--reader-title-leading,2.2)]'),
        'SecureReaderClient must respect calibrated title line-height token'
      );

      const freePreviewPath = path.resolve(REPO_ROOT, 'src/components/catalog/FreePreviewReaderClient.tsx');
      const freeContent = fs.readFileSync(freePreviewPath, 'utf8');

      assert.ok(
        freeContent.includes('[font-size:calc(1.875rem*var(--reader-heading-scale,1))]'),
        'FreePreviewReaderClient must apply optical heading scale formula'
      );
      assert.ok(
        freeContent.includes('leading-[var(--reader-title-leading,2.4)]'),
        'FreePreviewReaderClient must respect calibrated title line-height token'
      );
    });
  });

  describe('13. Noori Typography Spacing & Default Preferences Calibration', () => {
    it('DEFAULT_READER_PREFERENCES specifies sepia, lg, normal line spacing, compact paragraph spacing', async () => {
      const { DEFAULT_READER_PREFERENCES, readerPreferencesSchema } = await import(
        '../src/lib/reader/schemas.ts'
      );

      assert.equal(DEFAULT_READER_PREFERENCES.theme, 'sepia');
      assert.equal(DEFAULT_READER_PREFERENCES.fontSize, 'lg');
      assert.equal(DEFAULT_READER_PREFERENCES.lineHeight, 'normal');
      assert.equal(DEFAULT_READER_PREFERENCES.paragraphSpacing, 'compact');

      const parsed = readerPreferencesSchema.parse({});
      assert.deepEqual(parsed, DEFAULT_READER_PREFERENCES);
    });

    it('globals.css defines Noori-scoped tighter line-height presets while keeping Gulzar unchanged', () => {
      const cssPath = path.resolve(REPO_ROOT, 'src/app/globals.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      // Gulzar line heights: normal=2.2, relaxed=2.6, loose=3.0
      assert.ok(content.includes('--reader-line-height-normal: 2.2;'));
      assert.ok(content.includes('--reader-line-height-relaxed: 2.6;'));
      assert.ok(content.includes('--reader-line-height-loose: 3.0;'));

      // Noori line heights: noticeably tighter: normal=1.95, relaxed=2.2, loose=2.45
      assert.ok(content.includes('--reader-line-height-normal: 1.95;'));
      assert.ok(content.includes('--reader-line-height-relaxed: 2.2;'));
      assert.ok(content.includes('--reader-line-height-loose: 2.45;'));

      // Scoped line-height rules for Noori
      assert.ok(content.includes('[data-reader-font="noori"].leading-\\[2\\.2\\]'));
      assert.ok(content.includes('[data-reader-font="noori"].leading-\\[2\\.6\\]'));
      assert.ok(content.includes('[data-reader-font="noori"].leading-\\[3\\.0\\]'));
    });

    it('globals.css defines Noori-scoped tighter paragraph-spacing presets while keeping Gulzar unchanged', () => {
      const cssPath = path.resolve(REPO_ROOT, 'src/app/globals.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      // Gulzar paragraph gaps: compact=0.875rem, normal=1.5rem, wide=2.25rem
      assert.ok(content.includes('--reader-para-gap-compact: 0.875rem;'));
      assert.ok(content.includes('--reader-para-gap-normal: 1.5rem;'));
      assert.ok(content.includes('--reader-para-gap-wide: 2.25rem;'));

      // Noori paragraph gaps: ~65-75% of Gulzar: compact=0.55rem, normal=1rem, wide=1.45rem
      assert.ok(content.includes('--reader-para-gap-compact: 0.55rem;'));
      assert.ok(content.includes('--reader-para-gap-normal: 1rem;'));
      assert.ok(content.includes('--reader-para-gap-wide: 1.45rem;'));

      // Scoped paragraph spacing rules for Noori
      assert.ok(content.includes('[data-reader-font="noori"] p.mb-3\\.5'));
      assert.ok(content.includes('[data-reader-font="noori"] p.mb-6'));
      assert.ok(content.includes('[data-reader-font="noori"] p.mb-9'));
    });

    it('globals.css configures mobile inline padding and crisp text-rendering for Noori', () => {
      const cssPath = path.resolve(REPO_ROOT, 'src/app/globals.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      // Mobile side padding: 0.6em (safe breathing room without excessive wrap)
      assert.ok(content.includes('--reader-padding-inline: 0.6em;'));
      assert.ok(content.includes('--reader-padding-inline: 0.75em;'));

      // Crisp rendering
      assert.ok(content.includes('text-rendering: optimizeLegibility;'));
    });
  });
});
