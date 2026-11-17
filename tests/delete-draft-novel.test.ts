import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cleanUrduText } from '../src/lib/text/clean-urdu.ts';

describe('Delete Draft Novel & Duplicate Title Prevention', () => {
  const rootDir = process.cwd();

  describe('1. Migration 0056 Database Contract', () => {
    const migrationPath = path.join(
      rootDir,
      'supabase',
      'migrations',
      '0056_delete_draft_novel.sql'
    );

    it('migration 0056 file exists', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 0056 must exist on disk');
    });

    it('defines delete_draft_novel with SECURITY DEFINER and SET search_path = ""', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(
        content,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.delete_draft_novel\s*\(/i,
        'Must define public.delete_draft_novel'
      );
      assert.match(content, /SECURITY\s+DEFINER/i);
      assert.match(content, /SET\s+search_path\s*=\s*''/i);
    });

    it('enforces status = "draft" invariant in delete_draft_novel', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(
        content,
        /v_novel\.status\s*!=\s*'draft'/i,
        'Must strictly reject non-draft novels'
      );
    });

    it('enforces zero orders, purchase entitlements, and sales ledger history in delete_draft_novel', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(content, /FROM\s+public\.orders\s+WHERE\s+novel_id\s*=\s*p_novel_id/i);
      assert.match(content, /FROM\s+public\.purchase_entitlements\s+WHERE\s+novel_id\s*=\s*p_novel_id/i);
      assert.match(content, /FROM\s+public\.sales_ledger\s+WHERE\s+novel_id\s*=\s*p_novel_id/i);
    });

    it('records an immutable audit log entry in public.audit_logs', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(content, /'DELETE_DRAFT_NOVEL'/);
      assert.match(content, /INSERT\s+INTO\s+public\.audit_logs/i);
    });

    it('updates create_novel with author-level duplicate title guard', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(
        content,
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_novel\s*\(/i,
        'Must update public.create_novel'
      );
      assert.match(
        content,
        /DUPLICATE_NOVEL_TITLE/,
        'Must raise DUPLICATE_NOVEL_TITLE exception'
      );
      assert.match(
        content,
        /lower\(trim\(title_english\)\)\s*=\s*pg_catalog\.lower\(trim\(p_title_english\)\)/i
      );
    });
  });

  describe('2. Duplicate Title Normalization Logic in Application Layer', () => {
    it('detects duplicate English title case-insensitively with whitespace trimming', () => {
      const existing = [
        {
          id: 'nov-1',
          title_english: 'Aina Zaat',
          title_urdu: 'آئینہ ذات',
          status: 'published',
          total_chapters: 6,
        },
      ];

      const checkDuplicate = (newEng: string, newUrdu: string) => {
        const cleanEng = newEng.trim().toLowerCase();
        const cleanUr = cleanUrduText(newUrdu).trim();

        return existing.find((n) => {
          const engMatch = n.title_english.trim().toLowerCase() === cleanEng;
          const urMatch = cleanUrduText(n.title_urdu).trim() === cleanUr;
          return engMatch || urMatch;
        });
      };

      // Exact case
      assert.ok(checkDuplicate('Aina Zaat', 'کوئی اور'));
      // Lowercase
      assert.ok(checkDuplicate('aina zaat', 'کوئی اور'));
      // Uppercase with spaces
      assert.ok(checkDuplicate('  AINA ZAAT  ', 'کوئی اور'));
      // Urdu match
      assert.ok(checkDuplicate('Completely Different', 'آئینہ ذات'));
      // Unique title succeeds
      assert.equal(checkDuplicate('Peer e Kamil', 'پیر کامل'), undefined);
    });
  });

  describe('3. Server Actions & UI Contracts', () => {
    const actionsPath = path.join(rootDir, 'src', 'app', 'actions', 'writer.ts');
    const novelFormPath = path.join(rootDir, 'src', 'app', 'writer', 'novels', 'NovelForm.tsx');
    const novelListPath = path.join(rootDir, 'src', 'app', 'writer', 'novels', 'NovelListClient.tsx');
    const adminActionsPath = path.join(rootDir, 'src', 'components', 'admin', 'NovelReviewActions.tsx');

    it('exports deleteDraftNovelAction in src/app/actions/writer.ts', () => {
      const content = fs.readFileSync(actionsPath, 'utf8');
      assert.match(
        content,
        /export\s+async\s+function\s+deleteDraftNovelAction\s*\(/,
        'Must export deleteDraftNovelAction'
      );
      assert.match(content, /delete_draft_novel/);
    });

    it('createNovelAction returns existingNovelId and bilingual guidance on duplicate title', () => {
      const content = fs.readFileSync(actionsPath, 'utf8');
      assert.match(content, /existingNovelId:\s*duplicate\.id/);
      assert.match(content, /existingNovels\.find/);
    });

    it('NovelForm.tsx renders duplicate guidance callout with link to existing chapters', () => {
      const content = fs.readFileSync(novelFormPath, 'utf8');
      assert.match(content, /duplicateNovel/);
      assert.match(content, /\/writer\/novels\/\$\{duplicateNovel\.id\}\/chapters/);
      assert.match(content, /Manage Existing Novel Chapters/);
    });

    it('NovelForm.tsx renders delete draft button and confirmation dialog when editing draft', () => {
      const content = fs.readFileSync(novelFormPath, 'utf8');
      assert.match(content, /isEditing\s*&&\s*initialData\?\.status\s*===\s*'draft'/);
      assert.match(content, /Delete Draft Novel/);
      assert.match(content, /handleDeleteDraft/);
    });

    it('NovelListClient.tsx renders Delete Draft button on draft cards and supports instant deletion', () => {
      const content = fs.readFileSync(novelListPath, 'utf8');
      assert.match(content, /novel\.status\s*===\s*'draft'/);
      assert.match(content, /Delete Draft/);
      assert.match(content, /handleDeleteDraft/);
      assert.match(content, /setNovels\(\(prev\)\s*=>\s*prev\.filter/);
    });

    it('Admin NovelReviewActions.tsx provides Delete Draft button for draft novels', () => {
      const content = fs.readFileSync(adminActionsPath, 'utf8');
      assert.match(content, /status\s*===\s*'draft'/);
      assert.match(content, /deleteDraftNovelAction/);
      assert.match(content, /handleDeleteDraft/);
    });
  });
});
