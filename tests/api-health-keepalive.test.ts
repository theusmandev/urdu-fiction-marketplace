import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkSupabaseHealth,
  CACHE_CONTROL_HEADERS,
  type MinimalSupabaseClient,
} from '../src/lib/health/health-check.ts';

describe('Stateless Supabase Keep-Alive Health Endpoint (/api/health)', () => {
  const rootDir = process.cwd();
  const routePath = path.join(rootDir, 'src', 'app', 'api', 'health', 'route.ts');

  describe('1. Route Configuration & Architectural Contracts', () => {
    it('route file exists on disk', () => {
      assert.ok(fs.existsSync(routePath), 'src/app/api/health/route.ts must exist');
    });

    it('enforces dynamic = "force-dynamic" and revalidate = 0', () => {
      const content = fs.readFileSync(routePath, 'utf8');
      assert.match(
        content,
        /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/,
        'Must export dynamic = "force-dynamic"'
      );
      assert.match(
        content,
        /export\s+const\s+revalidate\s*=\s*0/,
        'Must export revalidate = 0'
      );
    });

    it('uses stateless getPublicSupabase and strictly avoids @/lib/supabase/server (no cookies)', () => {
      const content = fs.readFileSync(routePath, 'utf8');
      assert.match(
        content,
        /import\s+.*getPublicSupabase.*from\s+['"]@\/lib\/supabase\/public['"]/,
        'Must import getPublicSupabase from @/lib/supabase/public'
      );
      assert.ok(
        !content.includes('@/lib/supabase/server'),
        'Must NEVER import from @/lib/supabase/server to prevent touching cookies() during headless pings'
      );
      assert.ok(
        !content.includes('next/headers'),
        'Must NEVER import cookies from next/headers'
      );
    });

    it('exports both GET and HEAD handler functions', () => {
      const content = fs.readFileSync(routePath, 'utf8');
      assert.match(
        content,
        /export\s+async\s+function\s+GET\s*\(/,
        'Must export async function GET'
      );
      assert.match(
        content,
        /export\s+async\s+function\s+HEAD\s*\(/,
        'Must export async function HEAD'
      );
    });

    it('HEAD delegates directly to GET to genuinely execute the Supabase query', () => {
      const content = fs.readFileSync(routePath, 'utf8');
      const headFunctionMatch = content.match(/export\s+async\s+function\s+HEAD[\s\S]*?\{([\s\S]*?)\}/);
      assert.ok(headFunctionMatch, 'HEAD function definition must be present');
      assert.match(
        headFunctionMatch[1],
        /return\s+GET\s*\(/,
        'HEAD must delegate to GET so UptimeRobot HEAD requests genuinely query Supabase'
      );
    });
  });

  describe('2. Query Execution & Success Contract (HTTP 200)', () => {
    it('executes .from("genres").select("id").limit(1) via the client', async () => {
      let queriedTable = '';
      let selectedCols = '';
      let limitValue = 0;

      const mockClient: MinimalSupabaseClient = {
        from: (table: string) => {
          queriedTable = table;
          return {
            select: (cols: string) => {
              selectedCols = cols;
              return {
                limit: async (n: number) => {
                  limitValue = n;
                  return { data: [{ id: 1 }], error: null };
                },
              };
            },
          };
        },
      };

      const result = await checkSupabaseHealth(mockClient);

      assert.equal(queriedTable, 'genres', 'Must query public.genres table');
      assert.equal(selectedCols, 'id', 'Must select only id column for minimal payload');
      assert.equal(limitValue, 1, 'Must limit query to 1 row');
      assert.equal(result.status, 200, 'Must return HTTP 200 on success');
      assert.equal(result.body.status, 'healthy');
      if (result.body.status === 'healthy') {
        assert.ok(typeof result.body.latency_ms === 'number', 'Must include latency_ms');
        assert.ok(result.body.latency_ms >= 0, 'latency_ms must be non-negative');
        assert.ok(typeof result.body.timestamp === 'string', 'Must include ISO timestamp');
      }
    });

    it('returns strict cache-busting headers', async () => {
      const mockClient: MinimalSupabaseClient = {
        from: () => ({
          select: () => ({
            limit: async () => ({ data: [{ id: 1 }], error: null }),
          }),
        }),
      };

      const result = await checkSupabaseHealth(mockClient);

      assert.equal(
        result.headers['Cache-Control'],
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      );
      assert.equal(result.headers['Pragma'], 'no-cache');
      assert.equal(result.headers['Expires'], '0');
      assert.deepEqual(result.headers, CACHE_CONTROL_HEADERS);
    });
  });

  describe('3. Error Resilience & Sanitized Output (HTTP 503)', () => {
    it('returns HTTP 503 with status: "degraded" and sanitized error when Supabase returns an error', async () => {
      const mockClient: MinimalSupabaseClient = {
        from: () => ({
          select: () => ({
            limit: async () => ({
              data: null,
              error: {
                message: 'connection refused to postgres:5432 at secret-host.internal',
                code: 'PGRST000',
              },
            }),
          }),
        }),
      };

      const result = await checkSupabaseHealth(mockClient);

      assert.equal(result.status, 503, 'Must return HTTP 503 on database error');
      assert.equal(result.body.status, 'degraded');
      if (result.body.status === 'degraded') {
        assert.equal(
          result.body.error,
          'Database unreachable',
          'Must sanitize error message to "Database unreachable"'
        );
        // Ensure no leakage of raw SQL or connection strings
        const jsonString = JSON.stringify(result.body);
        assert.ok(!jsonString.includes('postgres'), 'Must never leak raw DB host/port');
        assert.ok(!jsonString.includes('secret-host'), 'Must never leak connection strings');
      }
      assert.equal(
        result.headers['Cache-Control'],
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      );
    });

    it('returns HTTP 503 with status: "degraded" and sanitized error when Supabase throws an exception', async () => {
      const mockClient: MinimalSupabaseClient = {
        from: () => {
          throw new Error('ETIMEDOUT: Connection reset by peer');
        },
      };

      const result = await checkSupabaseHealth(mockClient);

      assert.equal(result.status, 503, 'Must return HTTP 503 when query throws');
      assert.equal(result.body.status, 'degraded');
      if (result.body.status === 'degraded') {
        assert.equal(result.body.error, 'Database unreachable');
        const jsonString = JSON.stringify(result.body);
        assert.ok(!jsonString.includes('ETIMEDOUT'), 'Must never leak raw exception messages');
      }
      assert.equal(
        result.headers['Cache-Control'],
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      );
    });
  });
});

