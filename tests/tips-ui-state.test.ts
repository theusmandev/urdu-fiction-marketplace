import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowTipCard, getTipStatusMeta, resolveTipCardState } from '../src/lib/tips/state.ts';
import type { TipStatus, TipOptionsPayload } from '../src/types/database.ts';

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

  await t.test('resolveTipCardState maps all 8 required visibility and error states accurately', () => {
    const validPayload: TipOptionsPayload = {
      tips_enabled: true,
      writer_enabled: true,
      writer_id: 'writer-123',
      can_tip: true,
      preset_amounts: [100, 250, 500],
      min_amount_pkr: 20,
      max_amount_pkr: 5000,
      payment_methods: [
        {
          id: 'pm-1',
          method_type: 'easypaisa',
          bank_name: null,
          masked_label: 'Easypaisa (•••• 1234)',
          instructions_note: null,
        },
      ],
    };

    // State 1: Signed-out user
    const signedOutState = resolveTipCardState({
      isUserSignedIn: false,
      currentUserId: null,
      targetWriterId: 'writer-123',
      payload: validPayload,
      currentPath: '/writers/nimra-ahmed',
    });
    assert.equal(signedOutState.status, 'sign_in_required');
    if (signedOutState.status === 'sign_in_required') {
      assert.ok(signedOutState.loginUrl.includes('/login?next='));
      assert.equal(
        signedOutState.loginUrl,
        `/login?next=${encodeURIComponent('/writers/nimra-ahmed')}`
      );
    }

    // State 2: Valid reader
    const readerState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-456',
      userRole: 'reader',
      targetWriterId: 'writer-123',
      payload: validPayload,
    });
    assert.equal(readerState.status, 'ready');

    // State 3: Author on own profile (self-tipping blocked, private settings note shown)
    const authorOwnState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'writer-123',
      userRole: 'writer',
      targetWriterId: 'writer-123',
      payload: validPayload,
    });
    assert.equal(authorOwnState.status, 'author_own_profile');
    if (authorOwnState.status === 'author_own_profile') {
      assert.equal(authorOwnState.settingsHref, '/writer/tips');
    }

    // State 4: Admin viewing profile as admin
    const adminState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'admin-999',
      userRole: 'admin',
      targetWriterId: 'writer-123',
      payload: validPayload,
    });
    assert.equal(adminState.status, 'admin_hidden');

    // State 5: Tips disabled by writer
    const writerDisabledState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-456',
      userRole: 'reader',
      targetWriterId: 'writer-123',
      payload: { ...validPayload, writer_enabled: false },
    });
    assert.equal(writerDisabledState.status, 'disabled_by_writer');

    // State 6: Platform kill switch active
    const killSwitchState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-456',
      userRole: 'reader',
      targetWriterId: 'writer-123',
      payload: { ...validPayload, tips_enabled: false },
    });
    assert.equal(killSwitchState.status, 'kill_switch_active');

    // State 7: Rate-limited
    const rateLimitedState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-456',
      userRole: 'reader',
      targetWriterId: 'writer-123',
      payload: { ...validPayload, can_tip: false, reason: 'Hourly tip limit reached. Please wait before sending another tip.' },
    });
    assert.equal(rateLimitedState.status, 'rate_limited');

    // State 8: Network / Database error
    const errorState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-456',
      userRole: 'reader',
      targetWriterId: 'writer-123',
      queryError: { code: 'PGRST500', message: 'Database connection failed' },
    });
    assert.equal(errorState.status, 'error');
    if (errorState.status === 'error') {
      assert.equal(errorState.code, 'PGRST500');
    }
  });
});
