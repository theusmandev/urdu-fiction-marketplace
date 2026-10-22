import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getRoleDashboard } from '../src/lib/auth/getRoleDashboard.ts';

describe('getRoleDashboard Helper', () => {
  it('redirects admin users to /admin regardless of writer status', () => {
    assert.strictEqual(getRoleDashboard('admin'), '/admin');
    assert.strictEqual(getRoleDashboard('admin', 'approved'), '/admin');
    assert.strictEqual(getRoleDashboard('admin', 'pending_approval'), '/admin');
  });

  it('redirects users with role "writer" to /writer', () => {
    assert.strictEqual(getRoleDashboard('writer'), '/writer');
    assert.strictEqual(getRoleDashboard('writer', 'approved'), '/writer');
  });

  it('redirects users with writerProfile status "approved" to /writer even if role is reader', () => {
    assert.strictEqual(getRoleDashboard('reader', 'approved'), '/writer');
  });

  it('redirects users with writerProfile status "pending_approval" to /writer even if role is reader', () => {
    assert.strictEqual(getRoleDashboard('reader', 'pending_approval'), '/writer');
  });

  it('redirects standard readers without writer status to /library', () => {
    assert.strictEqual(getRoleDashboard('reader'), '/library');
    assert.strictEqual(getRoleDashboard('reader', null), '/library');
    assert.strictEqual(getRoleDashboard('reader', 'rejected'), '/library');
  });

  it('safely falls back to /library for null or undefined roles', () => {
    assert.strictEqual(getRoleDashboard(null), '/library');
    assert.strictEqual(getRoleDashboard(undefined), '/library');
  });
});
