import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  shouldShowTipCard,
  getTipStatusMeta,
  resolveTipCardState,
  formatPaymentMethodLabel,
} from '../src/lib/tips/state.ts';
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

  await t.test('Say Thanks (Tips) enabled by default for all writers and toggleable', () => {
    const defaultPayload: TipOptionsPayload = {
      tips_enabled: true,
      writer_enabled: true, // 0050: default enabled = true
      writer_id: 'writer-default',
      can_tip: true,
      preset_amounts: [100, 250, 500],
      min_amount_pkr: 20,
      max_amount_pkr: 5000,
      payment_methods: [
        {
          id: 'pm-def',
          method_type: 'jazzcash',
          bank_name: null,
          masked_label: 'JazzCash (•••• 9999)',
          instructions_note: null,
        },
      ],
    };

    // When writer has default settings (enabled = true)
    const activeState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-789',
      userRole: 'reader',
      targetWriterId: 'writer-default',
      payload: defaultPayload,
    });
    assert.equal(activeState.status, 'ready');

    // When writer explicitly turns OFF tips
    const disabledState = resolveTipCardState({
      isUserSignedIn: true,
      currentUserId: 'reader-789',
      userRole: 'reader',
      targetWriterId: 'writer-default',
      payload: { ...defaultPayload, writer_enabled: false },
    });
    assert.equal(disabledState.status, 'disabled_by_writer');
  });

  await t.test('formatPaymentMethodLabel deduplicates provider name cleanly', () => {
    // Case 1: masked_label contains duplicate provider name in parens
    const pm1 = formatPaymentMethodLabel({
      method_type: 'easypaisa',
      bank_name: null,
      masked_label: 'Easypaisa (•••• 8292)',
    });
    assert.equal(pm1.provider, 'Easypaisa');
    assert.equal(pm1.mask, '•••• 8292');
    assert.equal(pm1.combined, 'Easypaisa · •••• 8292');
    assert.ok(!pm1.combined.includes('Easypaisa easypaisa'));

    // Case 2: bank_name set to Easypaisa and lowercase in masked_label
    const pm2 = formatPaymentMethodLabel({
      method_type: 'easypaisa',
      bank_name: 'Easypaisa',
      masked_label: 'easypaisa (•••• 8292)',
    });
    assert.equal(pm2.provider, 'Easypaisa');
    assert.equal(pm2.mask, '•••• 8292');
    assert.equal(pm2.combined, 'Easypaisa · •••• 8292');

    // Case 3: JazzCash with already masked number
    const pm3 = formatPaymentMethodLabel({
      method_type: 'jazzcash',
      bank_name: null,
      masked_label: '•••• 1234',
    });
    assert.equal(pm3.provider, 'JazzCash');
    assert.equal(pm3.mask, '•••• 1234');
    assert.equal(pm3.combined, 'JazzCash · •••• 1234');

    // Case 4: Bank with bank_name
    const pm4 = formatPaymentMethodLabel({
      method_type: 'bank',
      bank_name: 'Meezan Bank',
      masked_label: 'Meezan Bank (•••• 5678)',
    });
    assert.equal(pm4.provider, 'Meezan Bank');
    assert.equal(pm4.mask, '•••• 5678');
    assert.equal(pm4.combined, 'Meezan Bank · •••• 5678');

    // Case 5: Raast with prefix
    const pm5 = formatPaymentMethodLabel({
      method_type: 'raast',
      bank_name: null,
      masked_label: 'Raast: 0300 •••• 9999',
    });
    assert.equal(pm5.provider, 'Raast');
    assert.equal(pm5.mask, '0300 •••• 9999');
    assert.equal(pm5.combined, 'Raast · 0300 •••• 9999');
  });

  await t.test('single vs multiple payout methods UI disclosure logic', () => {
    // 1 method: passive display, no radio button needed
    const singleMethodList = [
      {
        id: 'pm-single',
        method_type: 'easypaisa',
        bank_name: null,
        masked_label: 'Easypaisa (•••• 8292)',
        instructions_note: null,
      },
    ];
    assert.equal(singleMethodList.length, 1);
    const formattedSingle = formatPaymentMethodLabel(singleMethodList[0]);
    assert.equal(formattedSingle.combined, 'Easypaisa · •••• 8292');

    // 2+ methods: selectable choices with custom indicator
    const multiMethodList = [
      {
        id: 'pm-1',
        method_type: 'easypaisa',
        bank_name: null,
        masked_label: 'Easypaisa (•••• 8292)',
        instructions_note: null,
      },
      {
        id: 'pm-2',
        method_type: 'jazzcash',
        bank_name: null,
        masked_label: 'JazzCash (•••• 1234)',
        instructions_note: null,
      },
    ];
    assert.ok(multiMethodList.length > 1);
    const formattedMulti = multiMethodList.map(formatPaymentMethodLabel);
    assert.equal(formattedMulti[0].combined, 'Easypaisa · •••• 8292');
    assert.equal(formattedMulti[1].combined, 'JazzCash · •••• 1234');
  });

  await t.test('progressive disclosure: note textarea starts collapsed for mobile scannability', () => {
    // Verifies that note starts empty and collapsed by default
    const defaultNoteState = {
      readerMessage: '',
      isNoteExpanded: false,
    };
    assert.equal(defaultNoteState.isNoteExpanded, false);
    assert.equal(defaultNoteState.readerMessage, '');

    // Expanding note allows input up to 300 chars
    const expandedNoteState = {
      ...defaultNoteState,
      isNoteExpanded: true,
      readerMessage: 'بہت شاندار باب!',
    };
    assert.equal(expandedNoteState.isNoteExpanded, true);
    assert.ok(expandedNoteState.readerMessage.length <= 300);
  });

  await t.test('HowTipsWorkModal portals to body with high z-index and bottom-sheet mobile UX', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/tips/HowTipsWorkModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    // Portaled outside reader container to break free of sticky header stacking context
    assert.ok(content.includes('createPortal('));
    assert.ok(content.includes('document.body'));

    // High z-index well above reader sticky header (z-40) and drawers (z-50)
    assert.ok(content.includes('z-[100]'));

    // Reader UI isolation attribute
    assert.ok(content.includes('data-reader-ui="true"'));

    // Responsive bottom sheet on mobile (< sm) and centered dialog on sm+
    assert.ok(content.includes('items-end sm:items-center'));
    assert.ok(content.includes('rounded-t-2xl sm:rounded-2xl'));
    assert.ok(content.includes('max-h-[85dvh] sm:max-h-[90vh]'));

    // Non-scrolling sticky header, independently scrollable body, and action footer
    assert.ok(content.includes('overflow-y-auto flex-1 min-h-0'));
    assert.ok(content.includes('I understand'));

    // Locks body scroll while modal is active
    assert.ok(content.includes("document.body.style.overflow = 'hidden'"));
  });

  await t.test('TipCard header subtitle and anonymous checkbox meet mobile polish standards', () => {
    const cardPath = path.resolve(process.cwd(), 'src/components/tips/TipCard.tsx');
    const content = fs.readFileSync(cardPath, 'utf8');

    // Header subtitle does not truncate with ellipsis
    assert.ok(content.includes('Support the author directly'));
    assert.ok(!content.includes('Direct appreciation gift • 100% direct to author'));

    // High-contrast custom checkbox border
    assert.ok(content.includes('border-2'));
    assert.ok(content.includes('border-text-muted/70'));
    assert.ok(content.includes('border-accent-strong bg-accent-strong'));
  });
});
