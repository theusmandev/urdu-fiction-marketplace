import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowTipCard, getTipStatusMeta } from '../src/lib/tips/state.ts';
import type { TipStatus } from '../src/types/database.ts';

test('Tip Jar UI State & Visibility Helpers', async (t) => {
  await t.test('shouldShowTipCard respects all product rules and invariants', () => {
    const baseContext = {
      isUserSignedIn: true,
      isAuthor: false,
      isAdmin: false,
      isTipsEnabled: true,
      isLockedScreen: false,
      hasReadSomething: true,
    };

    // Valid normal case
    assert.equal(shouldShowTipCard(baseContext), true);

    // Rule: Reader must be signed in
    assert.equal(shouldShowTipCard({ ...baseContext, isUserSignedIn: false }), false);

    // Rule: Tips must be enabled (platform kill switch / writer opt-in)
    assert.equal(shouldShowTipCard({ ...baseContext, isTipsEnabled: false }), false);

    // Rule: Never shown for the author themself (no self-tipping UI)
    assert.equal(shouldShowTipCard({ ...baseContext, isAuthor: true }), false);

    // Rule: Never shown for admins viewing as admin
    assert.equal(shouldShowTipCard({ ...baseContext, isAdmin: true }), false);

    // Rule: Never shown on locked content screens
    assert.equal(shouldShowTipCard({ ...baseContext, isLockedScreen: true }), false);

    // Rule: Never shown before the reader has read something
    assert.equal(shouldShowTipCard({ ...baseContext, hasReadSomething: false }), false);
  });

  await t.test('getTipStatusMeta returns appropriate labels and styling for all statuses', () => {
    const statuses: TipStatus[] = [
      'pending_payment',
      'payment_submitted',
      'confirmed',
      'not_received',
      'cancelled',
      'expired',
    ];

    for (const status of statuses) {
      const meta = getTipStatusMeta(status);
      assert.ok(meta.label.length > 0, `Status ${status} missing English label`);
      assert.ok(meta.urduLabel.length > 0, `Status ${status} missing Urdu label`);
      assert.ok(meta.badgeClass.length > 0, `Status ${status} missing badge classes`);
      assert.ok(meta.iconName.length > 0, `Status ${status} missing icon name`);
    }
  });

  await t.test('Anonymous reader display logic', () => {
    const formatSenderName = (name: string | null | undefined, isAnonymous: boolean) => {
      if (isAnonymous) return 'Anonymous';
      return name?.trim() || 'Reader';
    };

    assert.equal(formatSenderName('Usman Ali', false), 'Usman Ali');
    assert.equal(formatSenderName('Usman Ali', true), 'Anonymous');
    assert.equal(formatSenderName(null, false), 'Reader');
    assert.equal(formatSenderName(null, true), 'Anonymous');
  });
});
