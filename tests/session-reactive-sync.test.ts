import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setMarketplaceSessionState,
  setMarketplaceSessionUser,
  updateMarketplaceSessionUser,
  clearMarketplaceSessionCache,
  refreshMarketplaceSession,
  SESSION_REFRESH_EVENT,
  STORAGE_HINT_KEY,
  STORAGE_USER_KEY,
} from '../src/components/layout/useMarketplaceSession.ts';
import type { HeaderSessionUser } from '../src/components/layout/public-header-client.ts';

const mockUser: HeaderSessionUser = {
  id: 'u-123',
  email: 'author@unbpremium.pk',
  name: 'Noor Fatima',
  username: 'noorfatima',
  avatarUrl: 'https://storage.unbpremium.pk/avatars/old-avatar.webp',
  role: 'writer',
  isWriter: true,
  writerStatus: 'approved',
  unreadNotificationsCount: 3,
};

test('Reactive Marketplace Session & Avatar Synchronization', async (t) => {
  await t.test('Constants are correctly exported for cross-component signaling', () => {
    assert.equal(SESSION_REFRESH_EVENT, 'unb_session_refresh');
    assert.equal(STORAGE_HINT_KEY, 'unb_has_session');
    assert.equal(STORAGE_USER_KEY, 'unb_user_display');
  });

  await t.test('clearMarketplaceSessionCache resets state to anonymous', () => {
    setMarketplaceSessionState(mockUser, 'authenticated');
    clearMarketplaceSessionCache();

    // After clearing, updateMarketplaceSessionUser should return null because user is null
    const updated = updateMarketplaceSessionUser({ avatarUrl: 'new.webp' });
    assert.equal(updated, null);
  });

  await t.test('setMarketplaceSessionUser sets authenticated user state', () => {
    setMarketplaceSessionUser(mockUser);
    const result = updateMarketplaceSessionUser({ avatarUrl: 'https://storage.unbpremium.pk/avatars/updated.webp' });
    assert.ok(result);
    assert.equal(result.id, 'u-123');
    assert.equal(result.avatarUrl, 'https://storage.unbpremium.pk/avatars/updated.webp');
    assert.equal(result.name, 'Noor Fatima'); // Preserves name
    assert.equal(result.role, 'writer'); // Preserves role
  });

  await t.test('updateMarketplaceSessionUser supports partial updates (name, username, avatarUrl)', () => {
    setMarketplaceSessionUser(mockUser);

    // Update avatar only
    const res1 = updateMarketplaceSessionUser({ avatarUrl: 'https://storage.unbpremium.pk/avatars/new-photo.webp' });
    assert.equal(res1?.avatarUrl, 'https://storage.unbpremium.pk/avatars/new-photo.webp');
    assert.equal(res1?.name, 'Noor Fatima');

    // Update name and username
    const res2 = updateMarketplaceSessionUser({ name: 'Noor Fatima (Updated)', username: 'noor_updated' });
    assert.equal(res2?.name, 'Noor Fatima (Updated)');
    assert.equal(res2?.username, 'noor_updated');
    assert.equal(res2?.avatarUrl, 'https://storage.unbpremium.pk/avatars/new-photo.webp'); // Preserves updated avatar
  });

  await t.test('refreshMarketplaceSession fetches /api/auth/session and transitions state', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock /api/auth/session returning authenticated user with fresh avatar
      const updatedUser: HeaderSessionUser = {
        ...mockUser,
        avatarUrl: 'https://storage.unbpremium.pk/avatars/author-fresh-uuid.webp',
      };

      globalThis.fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: updatedUser }),
        } as unknown as Response;
      };

      const resolved = await refreshMarketplaceSession();
      assert.ok(resolved);
      assert.equal(resolved.avatarUrl, 'https://storage.unbpremium.pk/avatars/author-fresh-uuid.webp');

      // Now verify that updateMarketplaceSessionUser sees the newly fetched user
      const partial = updateMarketplaceSessionUser({ unreadNotificationsCount: 10 });
      assert.equal(partial?.unreadNotificationsCount, 10);
      assert.equal(partial?.avatarUrl, 'https://storage.unbpremium.pk/avatars/author-fresh-uuid.webp');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('refreshMarketplaceSession transitions to anonymous when API returns null user', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: null }),
        } as unknown as Response;
      };

      const resolved = await refreshMarketplaceSession();
      assert.equal(resolved, null);

      // Verify state is anonymous: updateMarketplaceSessionUser returns null
      assert.equal(updateMarketplaceSessionUser({ avatarUrl: 'fail.webp' }), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

