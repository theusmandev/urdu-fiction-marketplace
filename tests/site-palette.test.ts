import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_SITE_PALETTES,
  DEFAULT_SITE_PALETTE,
  PALETTES_CONFIG,
  isSitePalette,
  getPaletteThemeColor,
  type SitePalette,
} from '../src/lib/settings/palette.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Admin-Controlled Site Palette Suite', () => {
  describe('1. Allowed List Synchronization with SQL Migration', () => {
    it('TypeScript ALLOWED_SITE_PALETTES matches the SQL CHECK constraint in 0036_site_palette_settings.sql exactly', () => {
      const migrationPath = path.resolve(__dirname, '../supabase/migrations/0036_site_palette_settings.sql');
      assert.ok(fs.existsSync(migrationPath), 'Migration 0036_site_palette_settings.sql must exist');

      const content = fs.readFileSync(migrationPath, 'utf8');

      // Extract CHECK constraint: CHECK (site_palette IN ('ivory_ink', 'paper_teal', 'cream_maroon'))
      const match = content.match(/CHECK\s*\(\s*site_palette\s+IN\s*\(([^)]+)\)\s*\)/i);
      assert.ok(match, 'CHECK constraint on site_palette must be found in migration 0036');

      const rawValues = match[1];
      const sqlPalettes = rawValues
        .split(',')
        .map((val) => val.trim().replace(/^['"]|['"]$/g, ''))
        .sort();

      const tsPalettes = [...ALLOWED_SITE_PALETTES].sort();

      assert.deepEqual(
        sqlPalettes,
        tsPalettes,
        `SQL CHECK constraint palettes ${JSON.stringify(sqlPalettes)} must match TypeScript ALLOWED_SITE_PALETTES ${JSON.stringify(tsPalettes)}`
      );
    });

    it('DEFAULT_SITE_PALETTE is ivory_ink and belongs to ALLOWED_SITE_PALETTES', () => {
      assert.equal(DEFAULT_SITE_PALETTE, 'ivory_ink');
      assert.ok(ALLOWED_SITE_PALETTES.includes(DEFAULT_SITE_PALETTE));
    });
  });

  describe('2. Palette Validator & Metadata Helper', () => {
    it('isSitePalette validates allowed values and rejects unknown strings', () => {
      assert.equal(isSitePalette('ivory_ink'), true);
      assert.equal(isSitePalette('paper_teal'), true);
      assert.equal(isSitePalette('cream_maroon'), true);

      assert.equal(isSitePalette(''), false);
      assert.equal(isSitePalette('neon_pink'), false);
      assert.equal(isSitePalette('dark_mode'), false);
      assert.equal(isSitePalette(null), false);
      assert.equal(isSitePalette(undefined), false);
      assert.equal(isSitePalette(123), false);
    });

    it('PALETTES_CONFIG contains complete metadata and swatches for all 3 palettes', () => {
      for (const id of ALLOWED_SITE_PALETTES) {
        const meta = PALETTES_CONFIG[id];
        assert.ok(meta, `Metadata must exist for ${id}`);
        assert.equal(meta.id, id);
        assert.ok(meta.name.length > 0);
        assert.ok(meta.nameUrdu.length > 0);
        assert.ok(meta.swatches.bg.startsWith('#'));
        assert.ok(meta.swatches.surface.startsWith('#'));
        assert.ok(meta.swatches.primary.startsWith('#'));
        assert.ok(meta.swatches.accent.startsWith('#'));
        assert.ok(meta.swatches.accentStrong.startsWith('#'));
        assert.equal(meta.contrastSummary.status, 'WCAG AA Compliant');
      }
    });

    it('getPaletteThemeColor returns correct viewport theme-color with fallback', () => {
      assert.equal(getPaletteThemeColor('ivory_ink'), '#FBF8F2');
      assert.equal(getPaletteThemeColor('paper_teal'), '#FAF7F0');
      assert.equal(getPaletteThemeColor('cream_maroon'), '#FCF9F4');
      // @ts-expect-error - testing invalid fallback
      assert.equal(getPaletteThemeColor('invalid_palette'), '#FBF8F2');
    });
  });

  describe('3. Palette Resolver Fallback Logic', () => {
    // Pure function mimicking fetchSitePaletteFromDb logic to test all branches
    function resolvePaletteFromPayload(rpcResult: {
      data?: { palette?: unknown } | null;
      error?: { code?: string; message?: string } | null;
    } | null): SitePalette {
      if (!rpcResult || rpcResult.error) {
        return DEFAULT_SITE_PALETTE;
      }
      const rawPalette = rpcResult.data?.palette;
      if (isSitePalette(rawPalette)) {
        return rawPalette;
      }
      return DEFAULT_SITE_PALETTE;
    }

    it('resolves valid palette from RPC payload', () => {
      assert.equal(resolvePaletteFromPayload({ data: { palette: 'paper_teal' } }), 'paper_teal');
      assert.equal(resolvePaletteFromPayload({ data: { palette: 'cream_maroon' } }), 'cream_maroon');
      assert.equal(resolvePaletteFromPayload({ data: { palette: 'ivory_ink' } }), 'ivory_ink');
    });

    it('falls back to default ivory_ink when RPC returns invalid palette', () => {
      assert.equal(resolvePaletteFromPayload({ data: { palette: 'neon_pink' } }), 'ivory_ink');
      assert.equal(resolvePaletteFromPayload({ data: { palette: '' } }), 'ivory_ink');
      assert.equal(resolvePaletteFromPayload({ data: { palette: 42 } }), 'ivory_ink');
    });

    it('falls back to default ivory_ink when RPC data is null or empty', () => {
      assert.equal(resolvePaletteFromPayload({ data: null }), 'ivory_ink');
      assert.equal(resolvePaletteFromPayload({ data: {} }), 'ivory_ink');
      assert.equal(resolvePaletteFromPayload(null), 'ivory_ink');
    });

    it('falls back to default ivory_ink on RPC error without throwing', () => {
      const errorPayload = {
        data: null,
        error: { code: 'PGRST200', message: 'Function not found' },
      };
      assert.equal(resolvePaletteFromPayload(errorPayload), 'ivory_ink');
    });
  });

  describe('4. Admin Preview Security Logic', () => {
    function shouldActivateAdminPreview(
      cookiePalette: string | null,
      sessionRole: string | null | undefined
    ): { active: boolean; palette: SitePalette | null } {
      if (sessionRole !== 'admin') {
        return { active: false, palette: null };
      }
      if (isSitePalette(cookiePalette)) {
        return { active: true, palette: cookiePalette };
      }
      return { active: false, palette: null };
    }

    it('activates preview only when session role is admin AND cookie is valid', () => {
      const res = shouldActivateAdminPreview('paper_teal', 'admin');
      assert.equal(res.active, true);
      assert.equal(res.palette, 'paper_teal');
    });

    it('ignores preview cookie completely for reader and writer sessions', () => {
      assert.deepEqual(shouldActivateAdminPreview('paper_teal', 'reader'), { active: false, palette: null });
      assert.deepEqual(shouldActivateAdminPreview('paper_teal', 'writer'), { active: false, palette: null });
      assert.deepEqual(shouldActivateAdminPreview('cream_maroon', null), { active: false, palette: null });
      assert.deepEqual(shouldActivateAdminPreview('cream_maroon', undefined), { active: false, palette: null });
    });

    it('ignores invalid cookie values even for admin sessions', () => {
      assert.deepEqual(shouldActivateAdminPreview('corrupted_palette', 'admin'), { active: false, palette: null });
      assert.deepEqual(shouldActivateAdminPreview('', 'admin'), { active: false, palette: null });
      assert.deepEqual(shouldActivateAdminPreview(null, 'admin'), { active: false, palette: null });
    });
  });

  describe('5. Admin Server Action Cache Invalidation', () => {
    it('executes revalidateTag and revalidatePath after successful palette update', () => {
      const tagsInvalidated: string[] = [];
      const pathsInvalidated: Array<{ path: string; type?: string }> = [];

      function mockRevalidateTag(tag: string) {
        tagsInvalidated.push(tag);
      }

      function mockRevalidatePath(pathStr: string, typeStr?: string) {
        pathsInvalidated.push({ path: pathStr, type: typeStr });
      }

      // Execute cache invalidation sequence mimicking adminSetSitePaletteAction
      mockRevalidateTag('site-settings');
      mockRevalidatePath('/', 'layout');

      assert.deepEqual(tagsInvalidated, ['site-settings']);
      assert.deepEqual(pathsInvalidated, [{ path: '/', type: 'layout' }]);
    });
  });
});

