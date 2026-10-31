import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAppOrigin } from '../src/lib/auth/url.ts';

describe('getAppOrigin URL Resolver', () => {
  const originalEnvSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalEnvAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalEnvSiteUrl;
    process.env.NEXT_PUBLIC_APP_URL = originalEnvAppUrl;
  });

  test('returns NEXT_PUBLIC_SITE_URL when set, without trailing slash', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://custom.example.com/';
    const origin = await getAppOrigin();
    assert.equal(origin, 'https://custom.example.com');
  });

  test('falls back to canonical domain or siteConfig when env variables are empty', async () => {
    const origin = await getAppOrigin();
    assert.ok(origin.startsWith('https://'));
    assert.ok(!origin.endsWith('/'));
    assert.ok(origin.includes('urdunovelbanks.com'));
  });
});

