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
});
