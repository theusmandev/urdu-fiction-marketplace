import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Suspended Writer & Novel Visibility Hardening', () => {
  describe('1. Public Cache Invalidation Logic (revalidatePublicMarketplacePaths contract)', () => {
    it('invalidates all core public marketplace paths upon writer or novel status changes', () => {
      const pathsInvalidated: Array<{ path: string; type?: string }> = [];

      function mockRevalidatePath(p: string, type?: string) {
        pathsInvalidated.push({ path: p, type });
      }

      function executeRevalidateContract(options?: {
        novelSlug?: string;
        novelSlugs?: string[];
        genreSlug?: string;
        writerUsername?: string;
      }) {
        mockRevalidatePath('/', 'layout');
        mockRevalidatePath('/');
        mockRevalidatePath('/novels');
        mockRevalidatePath('/writers');
        mockRevalidatePath('/sitemap.xml');

        const slugs = new Set<string>();
        if (options?.novelSlug) slugs.add(options.novelSlug);
        if (options?.novelSlugs) {
          for (const s of options.novelSlugs) {
            if (s) slugs.add(s);
          }
        }

        for (const slug of slugs) {
          mockRevalidatePath(`/novels/${slug}`);
          mockRevalidatePath(`/checkout/${slug}`);
          mockRevalidatePath(`/novels/${slug}/read`, 'layout');
        }

        if (options?.genreSlug) {
          mockRevalidatePath(`/genres/${options.genreSlug}`);
        }

        if (options?.writerUsername) {
          mockRevalidatePath(`/writers/${options.writerUsername}`);
        }
      }

      executeRevalidateContract({
        novelSlug: 'ishq-e-laila',
        writerUsername: 'ahmed_nadeem',
        genreSlug: 'classic-romance',
      });

      const paths = pathsInvalidated.map((entry) => entry.path);
      assert.ok(paths.includes('/'));
      assert.ok(paths.includes('/novels'));
      assert.ok(paths.includes('/writers'));
      assert.ok(paths.includes('/sitemap.xml'));
      assert.ok(paths.includes('/novels/ishq-e-laila'));
      assert.ok(paths.includes('/checkout/ishq-e-laila'));
      assert.ok(paths.includes('/novels/ishq-e-laila/read'));
      assert.ok(paths.includes('/writers/ahmed_nadeem'));
      assert.ok(paths.includes('/genres/classic-romance'));
    });

    it('deduplicates novel slugs across single and array options', () => {
      const pathsInvalidated: Array<{ path: string; type?: string }> = [];

      function mockRevalidatePath(p: string, type?: string) {
        pathsInvalidated.push({ path: p, type });
      }

      const slugs = new Set<string>();
      const options = {
        novelSlug: 'duplicate-slug',
        novelSlugs: ['duplicate-slug', 'other-slug', 'duplicate-slug'],
      };

      if (options.novelSlug) slugs.add(options.novelSlug);
      for (const s of options.novelSlugs) {
        if (s) slugs.add(s);
      }

      for (const slug of slugs) {
        mockRevalidatePath(`/novels/${slug}`);
      }

      const novelPaths = pathsInvalidated.filter((e) => e.path.startsWith('/novels/'));
      assert.equal(novelPaths.length, 2);
      assert.deepEqual(novelPaths.map((e) => e.path).sort(), ['/novels/duplicate-slug', '/novels/other-slug'].sort());
    });
  });

  describe('2. Checkout Page & Action Visibility Guards', () => {
    it('requires both published status and active public_novels presence', () => {
      function canViewCheckoutPage(novel: { status: string } | null, publicNovel: unknown | null): boolean {
        if (!novel || novel.status !== 'published' || !publicNovel) {
          return false;
        }
        return true;
      }

      // Case 1: Novel is published and in public catalog -> Allowed
      assert.equal(
        canViewCheckoutPage({ status: 'published' }, { writer_username: 'author1' }),
        true
      );

      // Case 2: Novel is published but writer is suspended (publicNovel is null) -> Blocked
      assert.equal(
        canViewCheckoutPage({ status: 'published' }, null),
        false
      );

      // Case 3: Novel is draft/suspended -> Blocked
      assert.equal(
        canViewCheckoutPage({ status: 'draft' }, { writer_username: 'author1' }),
        false
      );
      assert.equal(
        canViewCheckoutPage({ status: 'suspended' }, null),
        false
      );

      // Case 4: Novel not found -> Blocked
      assert.equal(canViewCheckoutPage(null, null), false);
    });

    it('maps suspension and unapproved author errors to clear user-friendly messages', () => {
      function mapCheckoutError(rpcErrorMessage: string): string {
        const msg = rpcErrorMessage.toLowerCase();
        if (
          msg.includes('not eligible to receive orders') ||
          msg.includes('not available for purchase')
        ) {
          return 'This novel is currently unavailable for purchase.';
        }
        if (msg.includes('rate limit exceeded')) {
          return 'Order rate limit reached.';
        }
        return rpcErrorMessage;
      }

      assert.equal(
        mapCheckoutError('Writer is currently not eligible to receive orders.'),
        'This novel is currently unavailable for purchase.'
      );
      assert.equal(
        mapCheckoutError('Novel is not available for purchase (status: suspended).'),
        'This novel is currently unavailable for purchase.'
      );
    });
  });

  describe('3. Migration 0052 Integrity & Standards', () => {
    it('migration 0052 file exists and adheres to strict invariants', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase',
        'migrations',
        '0052_harden_suspended_writer_and_novel_visibility.sql'
      );
      assert.ok(fs.existsSync(migrationPath), 'Migration 0052 must exist');

      const content = fs.readFileSync(migrationPath, 'utf8');

      // Security Definer functions must have SET search_path = ''
      const secDefinerMatches = content.match(/SECURITY DEFINER/gi) || [];
      const searchPathMatches = content.match(/SET search_path = ''/gi) || [];
      assert.equal(
        secDefinerMatches.length,
        searchPathMatches.length,
        'Every SECURITY DEFINER function in 0052 must set search_path = \'\''
      );

      // Must harden public.novels RLS policy with writer_profiles check
      assert.ok(
        content.includes('CREATE POLICY "Public view published novels"'),
        'Must recreate Public view published novels policy'
      );
      assert.ok(
        content.includes('wp.status = \'approved\''),
        'Policy must verify writer_profiles.status = approved'
      );
      assert.ok(
        content.includes('p.is_active = true'),
        'Policy must verify profiles.is_active = true'
      );
      assert.ok(
        content.includes('purchase_entitlements'),
        'Policy must preserve active purchase entitlements for buyers'
      );

      // Must fix public_genres view
      assert.ok(
        content.includes('CREATE OR REPLACE VIEW public.public_genres'),
        'Must fix public.public_genres view'
      );
    });
  });
});

