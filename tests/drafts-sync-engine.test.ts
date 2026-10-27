import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionSyncState,
  calculateBackoffDelay,
  computeLineDiff,
  type SyncEngineState,
} from '../src/lib/drafts/sync-state-machine.ts';

describe('Offline Chapter Drafts — Sync State Machine', () => {
  const initialEngineState: SyncEngineState = {
    status: 'idle',
    lastSyncedAt: null,
    serverRevision: 1,
    retryAttempt: 0,
    errorMessage: null,
    conflictData: null,
  };

  it('transitions from idle to saved_local on LOCAL_SAVE_COMPLETED', () => {
    const next = transitionSyncState(initialEngineState, { type: 'LOCAL_SAVE_COMPLETED' });
    assert.strictEqual(next.status, 'saved_local');
    assert.strictEqual(next.errorMessage, null);
  });

  it('transitions from saved_local to syncing on SYNC_STARTED', () => {
    const state: SyncEngineState = { ...initialEngineState, status: 'saved_local' };
    const next = transitionSyncState(state, { type: 'SYNC_STARTED' });
    assert.strictEqual(next.status, 'syncing');
  });

  it('transitions from syncing to synced on SYNC_SUCCESS and updates revision', () => {
    const state: SyncEngineState = { ...initialEngineState, status: 'syncing', serverRevision: 1 };
    const next = transitionSyncState(state, {
      type: 'SYNC_SUCCESS',
      payload: {
        serverRevision: 2,
        updatedAt: '2026-10-26T15:30:00Z',
      },
    });

    assert.strictEqual(next.status, 'synced');
    assert.strictEqual(next.serverRevision, 2);
    assert.strictEqual(next.lastSyncedAt, '2026-10-26T15:30:00Z');
    assert.strictEqual(next.retryAttempt, 0);
  });

  it('transitions to conflict on SYNC_CONFLICT and preserves server conflict data', () => {
    const state: SyncEngineState = { ...initialEngineState, status: 'syncing', serverRevision: 1 };
    const conflictPayload = {
      server_revision: 3,
      server_updated_at: '2026-10-26T15:45:00Z',
      device_label: 'Safari on macOS',
      content_urdu: 'سرور پر موجود متن',
      title_urdu: 'سرور عنوان',
    };

    const next = transitionSyncState(state, {
      type: 'SYNC_CONFLICT',
      payload: { conflictData: conflictPayload },
    });

    assert.strictEqual(next.status, 'conflict');
    assert.ok(next.conflictData);
    assert.strictEqual(next.conflictData.server_revision, 3);
    assert.strictEqual(next.conflictData.content_urdu, 'سرور پر موجود متن');

    // Subsequent local typing keeps status in conflict until explicit resolution
    const typingWhileConflict = transitionSyncState(next, { type: 'LOCAL_SAVE_COMPLETED' });
    assert.strictEqual(typingWhileConflict.status, 'conflict');
  });

  it('transitions from conflict to synced on CONFLICT_RESOLVED', () => {
    const state: SyncEngineState = {
      ...initialEngineState,
      status: 'conflict',
      conflictData: {
        server_revision: 3,
        server_updated_at: '2026-10-26T15:45:00Z',
        device_label: null,
        content_urdu: 'سرور متن',
        title_urdu: null,
      },
    };

    const next = transitionSyncState(state, {
      type: 'CONFLICT_RESOLVED',
      payload: { serverRevision: 4, updatedAt: '2026-10-26T16:00:00Z' },
    });

    assert.strictEqual(next.status, 'synced');
    assert.strictEqual(next.serverRevision, 4);
    assert.strictEqual(next.conflictData, null);
  });

  it('transitions to offline on SYNC_OFFLINE and increments retryAttempt', () => {
    const state: SyncEngineState = { ...initialEngineState, status: 'syncing', retryAttempt: 0 };
    const next1 = transitionSyncState(state, {
      type: 'SYNC_OFFLINE',
      payload: { error: 'Network unavailable' },
    });

    assert.strictEqual(next1.status, 'offline');
    assert.strictEqual(next1.retryAttempt, 1);
    assert.strictEqual(next1.errorMessage, 'Network unavailable');

    const next2 = transitionSyncState(next1, {
      type: 'SYNC_OFFLINE',
      payload: { error: 'Still offline' },
    });
    assert.strictEqual(next2.retryAttempt, 2);
  });

  it('transitions from offline to saved_local on NETWORK_ONLINE with reset retry count', () => {
    const state: SyncEngineState = {
      ...initialEngineState,
      status: 'offline',
      retryAttempt: 4,
      errorMessage: 'Network unavailable',
    };

    const next = transitionSyncState(state, { type: 'NETWORK_ONLINE' });
    assert.strictEqual(next.status, 'saved_local');
    assert.strictEqual(next.retryAttempt, 0);
    assert.strictEqual(next.errorMessage, null);
  });

  it('transitions to auth_expired and retains local editing without data loss', () => {
    const state: SyncEngineState = { ...initialEngineState, status: 'syncing' };
    const next = transitionSyncState(state, { type: 'SYNC_AUTH_EXPIRED' });

    assert.strictEqual(next.status, 'auth_expired');
    assert.ok(next.errorMessage?.includes('sign in again'));

    // Local changes while auth_expired do not crash or leave auth_expired
    const localEdit = transitionSyncState(next, { type: 'LOCAL_SAVE_COMPLETED' });
    assert.strictEqual(localEdit.status, 'auth_expired');

    // Once re-authenticated, transitions back to saved_local ready to sync
    const restored = transitionSyncState(localEdit, { type: 'AUTH_RESTORED' });
    assert.strictEqual(restored.status, 'saved_local');
  });

  it('calculates exponential backoff capped at 60s + jitter', () => {
    const delay0 = calculateBackoffDelay(0);
    assert.ok(delay0 >= 1000 && delay0 <= 2000, `Delay 0: ${delay0}`);

    const delay1 = calculateBackoffDelay(1);
    assert.ok(delay1 >= 2000 && delay1 <= 3000, `Delay 1: ${delay1}`);

    const delay2 = calculateBackoffDelay(2);
    assert.ok(delay2 >= 4000 && delay2 <= 5000, `Delay 2: ${delay2}`);

    // High attempt capped around 60,000 + 1,000 jitter
    const delay10 = calculateBackoffDelay(10);
    assert.ok(delay10 >= 60000 && delay10 <= 61000, `Delay 10: ${delay10}`);
  });

  it('computes line-based visual diff accurately', () => {
    const textA = 'لائن اول\nلائن دوم\nلائن سوم';
    const textB = 'لائن اول\nلائن دوم تبدیل شدہ\nلائن سوم\nلائن چہارم';

    const diff = computeLineDiff(textA, textB);
    assert.ok(diff.length >= 3);

    const sameLines = diff.filter((d) => d.type === 'same');
    const addedLines = diff.filter((d) => d.type === 'added');

    assert.ok(sameLines.some((l) => l.text === 'لائن اول'));
    assert.ok(addedLines.some((l) => l.text.includes('تبدیل شدہ') || l.text.includes('چہارم')));
  });
});
