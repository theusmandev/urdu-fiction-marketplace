import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

describe('Autosave Architectural Invariants & Safety Verification', () => {
  it('guarantees that src/lib/drafts/ contains zero writes to public.chapters', () => {
    const draftsDir = path.join(REPO_ROOT, 'src', 'lib', 'drafts');
    const files = fs.readdirSync(draftsDir);

    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        const content = fs.readFileSync(path.join(draftsDir, file), 'utf-8');
        // Check for direct Supabase mutation patterns against chapters table
        assert.doesNotMatch(
          content,
          /\.from\(['"]chapters['"]\)\s*\.\s*(?:insert|update|delete|upsert)/,
          `File src/lib/drafts/${file} must never mutate public.chapters directly.`
        );
      }
    }
  });

  it('guarantees that src/app/actions/drafts.ts contains zero mutations on chapters', () => {
    const filePath = path.join(REPO_ROOT, 'src', 'app', 'actions', 'drafts.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Only SELECT queries are permitted for live status checking
    assert.doesNotMatch(
      content,
      /\.from\(['"]chapters['"]\)\s*\.\s*(?:insert|update|delete|upsert)/,
      'src/app/actions/drafts.ts must never mutate chapters directly; all draft state goes to chapter_drafts RPCs.'
    );

    // Draft server action must invoke upsert_chapter_draft RPC
    assert.match(
      content,
      /supabase\.rpc\(['"]upsert_chapter_draft['"]/,
      'Draft sync must call upsert_chapter_draft RPC.'
    );
  });

  it('guarantees migration 0033_chapter_drafts.sql never modifies public.chapters', () => {
    const filePath = path.join(REPO_ROOT, 'supabase', 'migrations', '0033_chapter_drafts.sql');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Migration 0033 must not contain UPDATE public.chapters or INSERT INTO public.chapters
    assert.doesNotMatch(
      content,
      /\bUPDATE\s+(?:public\.)?chapters\b/i,
      'Migration 0033 must not update public.chapters.'
    );
    assert.doesNotMatch(
      content,
      /\bINSERT\s+INTO\s+(?:public\.)?chapters\b/i,
      'Migration 0033 must not insert into public.chapters.'
    );
    assert.doesNotMatch(
      content,
      /\bDELETE\s+FROM\s+(?:public\.)?chapters\b/i,
      'Migration 0033 must not delete from public.chapters.'
    );
  });

  it('guarantees UI status chip and modal components adhere to copy invariants', () => {
    const chipFile = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'components', 'drafts', 'DraftStatusChip.tsx'),
      'utf-8'
    );
    // Must NOT promise "zero data loss" anywhere; must say "saved on this device" and "saved to cloud"
    assert.doesNotMatch(
      chipFile,
      /zero\s+data\s+loss/i,
      'DraftStatusChip must never promise "zero data loss".'
    );
    assert.match(chipFile, /Saved on this device/);
    assert.match(chipFile, /Saved to cloud/);
  });
});
