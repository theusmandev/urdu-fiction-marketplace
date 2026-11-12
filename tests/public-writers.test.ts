import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Public Writers Zero Novels & Status Isolation Contract', () => {
  const rootDir = process.cwd();

  describe('1. Migration 0055 SQL Contract', () => {
    const migrationPath = path.join(
      rootDir,
      'supabase',
      'migrations',
      '0055_fix_public_writers_zero_novels.sql'
    );

    it('migration 0055 exists', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 0055 must exist on disk');
    });

    it('recreates public.public_writers with security_invoker = false', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(
        content,
        /CREATE\s+VIEW\s+public\.public_writers\s+WITH\s*\(\s*security_invoker\s*=\s*false\s*\)\s+AS/i,
        'public.public_writers must specify security_invoker = false'
      );
    });

    it('does NOT contain exclusionary > 0 novel filter in WHERE clause', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.ok(
        !content.includes(') > 0;'),
        'Migration 0055 must not exclude writers with 0 published novels'
      );
    });

    it('preserves status hardening (approved writer and active profile)', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(content, /wp\.status\s*=\s*'approved'/i);
      assert.match(content, /p\.is_active\s*=\s*true/i);
    });

    it('grants SELECT permissions to anon and authenticated', () => {
      const content = fs.readFileSync(migrationPath, 'utf8');
      assert.match(
        content,
        /GRANT\s+SELECT\s+ON\s+public\.public_writers\s+TO\s+.*anon/i
      );
    });
  });

  describe('2. Public Catalog Helpers Contract (src/lib/supabase/public.ts)', () => {
    const publicPath = path.join(rootDir, 'src', 'lib', 'supabase', 'public.ts');

    it('getPublicWriters filters for published_novels_count > 0', () => {
      const content = fs.readFileSync(publicPath, 'utf8');
      const funcBody = content.slice(
        content.indexOf('export async function getPublicWriters'),
        content.indexOf('export async function getFeaturedWriters')
      );
      assert.match(
        funcBody,
        /\.gt\(\s*["']published_novels_count["']\s*,\s*0\s*\)/,
        'getPublicWriters must filter by published_novels_count > 0'
      );
    });

    it('getFeaturedWriters filters for published_novels_count > 0', () => {
      const content = fs.readFileSync(publicPath, 'utf8');
      const funcBody = content.slice(
        content.indexOf('export async function getFeaturedWriters'),
        content.indexOf('export async function getPublicWriterByUsername')
      );
      assert.match(
        funcBody,
        /\.gt\(\s*["']published_novels_count["']\s*,\s*0\s*\)/,
        'getFeaturedWriters must filter by published_novels_count > 0'
      );
    });

    it('getPublicWriterByUsername does NOT filter by published_novels_count > 0', () => {
      const content = fs.readFileSync(publicPath, 'utf8');
      const funcBody = content.slice(
        content.indexOf('export async function getPublicWriterByUsername'),
        content.indexOf('export async function getNovelsByWriter')
      );
      assert.ok(
        !funcBody.includes('.gt("published_novels_count"'),
        'getPublicWriterByUsername must NOT filter out authors with 0 novels'
      );
    });
  });

  describe('3. Public Writer Profile Page Empty State Contract', () => {
    const pagePath = path.join(
      rootDir,
      'src',
      'app',
      '(marketplace)',
      'writers',
      '[username]',
      'page.tsx'
    );

    it('handles novels empty state gracefully with message', () => {
      const content = fs.readFileSync(pagePath, 'utf8');
      assert.ok(
        content.includes('No novels currently listed for this author.'),
        'Page must render empty-state message when author has 0 novels'
      );
    });

    it('includes tipping button for writer support', () => {
      const content = fs.readFileSync(pagePath, 'utf8');
      assert.ok(
        content.includes('<WriterProfileTipButton'),
        'Page must render WriterProfileTipButton for author tipping'
      );
    });
  });
});

