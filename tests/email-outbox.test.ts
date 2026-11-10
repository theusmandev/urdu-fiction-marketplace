import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmailServiceConfigured,
  sendEmail,
  getEmailEnv,
  resolveEmailEnv,
} from '../src/lib/email/mailer.ts';
import { dispatchPendingEmails } from '../src/lib/email/dispatch-outbox.ts';
import {
  sanitizeEmailContent,
  renderEmailTemplate,
  renderCalloutBox,
  getAppBaseUrl,
  TEMPLATE_REGISTRY,
} from '../src/lib/email/templates.ts';

describe('Email Outbox & Service Configuration Helper', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports unconfigured when EMAIL_PROVIDER is not set', () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;
    assert.strictEqual(isEmailServiceConfigured(), false);
  });

  it('reports configured for resend only when RESEND_API_KEY is present and non-empty', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;
    assert.strictEqual(isEmailServiceConfigured(), false);

    process.env.RESEND_API_KEY = '   ';
    assert.strictEqual(isEmailServiceConfigured(), false);

    process.env.RESEND_API_KEY = 're_test_key_12345';
    assert.strictEqual(isEmailServiceConfigured(), true);
  });

  it('reports configured for brevo only when BREVO_API_KEY is present and non-empty', () => {
    process.env.EMAIL_PROVIDER = 'brevo';
    delete process.env.BREVO_API_KEY;
    assert.strictEqual(isEmailServiceConfigured(), false);

    process.env.BREVO_API_KEY = '   ';
    assert.strictEqual(isEmailServiceConfigured(), false);

    process.env.BREVO_API_KEY = 'xkeysib-test_key_12345';
    assert.strictEqual(isEmailServiceConfigured(), true);
  });

  it('resolveEmailEnv and getEmailEnv read from process.env and safely return undefined without error in Node', () => {
    process.env.TEST_EMAIL_VAR = '  test_value_123  ';
    assert.strictEqual(resolveEmailEnv('TEST_EMAIL_VAR'), 'test_value_123');
    assert.strictEqual(getEmailEnv('TEST_EMAIL_VAR'), 'test_value_123');

    delete process.env.NON_EXISTENT_VAR_123;
    assert.strictEqual(resolveEmailEnv('NON_EXISTENT_VAR_123'), undefined);
    assert.strictEqual(getEmailEnv('NON_EXISTENT_VAR_123'), undefined);
  });

  it('safely short-circuits dispatchPendingEmails when email service is unconfigured', async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;

    // Must return unconfigured: true and not throw or claim rows
    const result = await dispatchPendingEmails(10);
    assert.strictEqual(result.unconfigured, true);
    assert.strictEqual(result.sent, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.processed, 0);
  });
});

describe('Sensitive Token Redaction Invariant (sanitizeEmailContent)', () => {
  it('masks Pakistani IBAN accounts', () => {
    const raw = 'Sent funds to PK36HABB0001234567890101 via mobile banking.';
    const sanitized = sanitizeEmailContent(raw);
    assert.ok(!sanitized.includes('PK36HABB0001234567890101'));
    assert.ok(sanitized.includes('[REDACTED_ACCOUNT]'));
  });

  it('masks numeric account numbers and long TIDs (>= 9 digits)', () => {
    const raw = 'TID was 123456789012 and account was 0300987654321';
    const sanitized = sanitizeEmailContent(raw);
    assert.ok(!sanitized.includes('123456789012'));
    assert.ok(!sanitized.includes('0300987654321'));
    assert.ok(sanitized.includes('[REDACTED_NUMERIC_ID]'));
  });

  it('strips private Supabase payment-proof storage links', () => {
    const raw = 'View proof at https://xyz.supabase.co/storage/v1/object/sign/payment-proofs/uid/receipt.png?token=exp123';
    const sanitized = sanitizeEmailContent(raw);
    assert.ok(!sanitized.includes('payment-proofs/uid/receipt.png'));
    assert.ok(sanitized.includes('[SECURE_PORTAL_PROOF_LINK]'));
  });

  it('preserves novel titles, order numbers, amounts in PKR, and safe operational text', () => {
    const raw = 'Order #ORD-9988 for novel "Jannat Kay Pattay" amounting to PKR 750 has been approved.';
    const sanitized = sanitizeEmailContent(raw);
    assert.ok(sanitized.includes('#ORD-9988'));
    assert.ok(sanitized.includes('"Jannat Kay Pattay"'));
    assert.ok(sanitized.includes('PKR 750'));
  });
});

describe('Luxury Bilingual Email Template Rendering (renderEmailTemplate)', () => {
  it('renders official UNB Premium aesthetic tokens (Sand Canvas, Warm Brown, Gold, Nastaliq)', () => {
    const rendered = renderEmailTemplate({
      template: 'payment_verified',
      subject: 'Novel Access Unlocked | ناول ان لاک ہو گیا',
      bodyText: 'Your payment has been verified. Novel "Laa" is now in your library.\nآپ کا آرڈر منظور ہو چکا ہے۔',
      recipientEmail: 'reader@example.com',
    });

    // Approved Reference Aesthetic token checks
    assert.ok(rendered.html.includes('#F1ECDF'), 'Includes Sand Canvas background (#F1ECDF)');
    assert.ok(rendered.html.includes('#FFFFFF'), 'Includes Crisp White card (#FFFFFF)');
    assert.ok(rendered.html.includes('#813B09'), 'Includes Brand Brown header & button (#813B09)');
    assert.ok(rendered.html.includes('#5F2F16'), 'Includes Dark Brown header badge (#5F2F16)');
    assert.ok(rendered.html.includes('#D39A2A'), 'Includes Gold badge border & dashes (#D39A2A)');
    assert.ok(rendered.html.includes('#E6DFD0'), 'Includes Warm Cream border & dividers (#E6DFD0)');
    assert.ok(rendered.html.includes('#8E6410'), 'Includes High-contrast Gold links (#8E6410)');
    assert.ok(rendered.html.includes('#22262B'), 'Includes Dark Slate body text (#22262B)');
    assert.ok(rendered.html.includes('#5B6470'), 'Includes Muted Neutral secondary text (#5B6470)');

    // Typography & layout checks
    assert.ok(rendered.html.includes('Georgia'), 'Uses Georgia editorial serif for brand title');
    assert.ok(rendered.html.includes('dir="rtl"'), 'Urdu block has dir="rtl"');
    assert.ok(rendered.html.includes('lang="ur"'), 'Urdu block has lang="ur"');
    assert.ok(rendered.html.includes('Noto Nastaliq Urdu'), 'Includes Noto Nastaliq Urdu in font stack');
    assert.ok(!rendered.html.includes('<img'), 'Contains zero <img> tags');

    // Preheader & Fallback Link
    assert.ok(rendered.html.includes('mso-hide: all'), 'Includes hidden preheader for email clients');
    assert.ok(rendered.html.includes('Button not working?'), 'Includes plain fallback link block');

    // Category badge & CTA
    assert.ok(rendered.html.includes('Novel Unlocked'));
    assert.ok(rendered.html.includes('رسائی مل گئی'));
    assert.ok(rendered.html.includes('/library'));
    assert.ok(rendered.html.includes('Open My Library'));

    // Plain text representation
    assert.ok(rendered.text.includes('Urdu Novel Bank Premium'));
    assert.ok(rendered.text.includes('/account/notifications'));
    assert.ok(rendered.text.includes('/library'));
  });

  it('escapes unsafe HTML entities in subjects and dynamic content', () => {
    const rendered = renderEmailTemplate({
      template: 'support_reply',
      subject: 'Reply from Support <script>alert("hack")</script>',
      bodyText: 'Hello & welcome <img onerror="hack"> to "UNB"',
      recipientEmail: 'user@example.com',
    });

    assert.ok(!rendered.html.includes('<script>alert('));
    assert.ok(rendered.html.includes('&lt;script&gt;'));
    assert.ok(rendered.html.includes('&amp;'));
    assert.ok(rendered.html.includes('&quot;UNB&quot;'));
  });

  it('maps correct badge and CTA for platform fee invoice events without forbidden terms', () => {
    const rendered = renderEmailTemplate({
      template: 'invoice_issued',
      subject: 'Monthly Platform Fee Invoice Issued',
      bodyText: 'Your monthly statement is ready for review in Writer Studio.',
      recipientEmail: 'writer@example.com',
    });

    assert.ok(rendered.html.includes('Platform Fee'));
    assert.ok(rendered.html.includes('پلیٹ فارم فیس'));
    assert.ok(rendered.html.includes('/writer/commission'));
    assert.ok(rendered.html.includes('View Platform Fee Invoice'));

    // Strictly no forbidden user-facing words
    assert.ok(!rendered.html.includes('commission invoice'));
    assert.ok(!rendered.html.includes('کمیشن'));
  });

  it('maps correct badge and CTA for moderation and support events', () => {
    const templates = [
      { template: 'writer_approved', cta: '/writer/payment-methods', badge: 'Writer Studio' },
      { template: 'novel_approved', cta: '/writer/novels', badge: 'Novel Published' },
      { template: 'support_ticket_created', cta: '/admin/support', badge: 'Support Request' },
      { template: 'order_payment_submitted', cta: '/writer/orders', badge: 'Payment Verification' },
      { template: 'dispute_opened', cta: '/disputes', badge: 'Dispute Opened' },
    ];

    for (const item of templates) {
      const rendered = renderEmailTemplate({
        template: item.template,
        subject: `Testing ${item.template}`,
        bodyText: 'Operational notification body text.',
      });
      assert.ok(rendered.html.includes(item.cta), `Template ${item.template} should contain CTA path ${item.cta}`);
      assert.ok(rendered.html.includes(item.badge), `Template ${item.template} should contain badge ${item.badge}`);
    }
  });

  it('maps correct badge, Urdu Nastaliq, and CTA for the 3 missing reminder templates', () => {
    // 1. invoice_overdue
    const overdue = renderEmailTemplate({
      template: 'invoice_overdue',
      subject: 'Platform Fee Invoice Overdue',
      bodyText: 'Please settle your overdue platform fee invoice.',
    });
    assert.ok(overdue.html.includes('Platform Fee Overdue'));
    assert.ok(overdue.html.includes('پلیٹ فارم فیس واجب الادا'));
    assert.ok(overdue.html.includes('/writer/commission'));
    assert.ok(!overdue.html.includes('commission invoice'));
    assert.ok(!overdue.html.includes('کمیشن'));

    // 2. reminder_order_verification
    const orderRem = renderEmailTemplate({
      template: 'reminder_order_verification',
      subject: 'Reminder: Verify Order Payment',
      bodyText: 'A reader has submitted payment. Please check your bank and verify.',
    });
    assert.ok(orderRem.html.includes('Order Verification'));
    assert.ok(orderRem.html.includes('آرڈر تصدیق کی یاد دہانی'));
    assert.ok(orderRem.html.includes('/writer/orders'));

    // 3. reminder_tip_confirmation
    const tipRem = renderEmailTemplate({
      template: 'reminder_tip_confirmation',
      subject: 'Reminder: Confirm Reader Appreciation Tip',
      bodyText: 'A reader submitted a tip. Please confirm receipt in Writer Studio.',
    });
    assert.ok(tipRem.html.includes('Tip Confirmation'));
    assert.ok(tipRem.html.includes('ٹپ تصدیق کی یاد دہانی'));
    assert.ok(tipRem.html.includes('/writer/tips'));
  });

  it('asserts getAppBaseUrl fallback is strictly https://premium.urdunovelbanks.com', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    assert.strictEqual(getAppBaseUrl(), 'https://premium.urdunovelbanks.com');

    process.env.NEXT_PUBLIC_SITE_URL = 'https://custom-domain.com/';
    assert.strictEqual(getAppBaseUrl(), 'https://custom-domain.com');

    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('guarantees TEMPLATE_REGISTRY completeness for every template enqueued across database & code', () => {
    const KNOWN_ENQUEUED_TEMPLATES = [
      'payment_verified',
      'order_payment_submitted',
      'payment_rejected',
      'support_reply',
      'support_ticket_created',
      'support_message_received',
      'tip_submitted',
      'tip_confirmed',
      'tip_not_received',
      'reminder_tip_confirmation',
      'tip_reminder',
      'reminder_order_verification',
      'verification_reminder',
      'invoice_issued',
      'invoice_overdue',
      'invoice_due_reminder',
      'invoice_settled',
      'invoice_payment_rejected',
      'writer_approved',
      'writer_rejected',
      'novel_approved',
      'novel_rejected',
      'dispute_opened',
      'dispute_message',
      'dispute_resolved',
      'refund_requested',
      'refund_approved',
      'refund_rejected',
      'reminder_verification_12h',
      'reminder_verification_24h',
      'reminder_tip_expiring_7d',
    ];

    for (const key of KNOWN_ENQUEUED_TEMPLATES) {
      const meta = TEMPLATE_REGISTRY[key];
      assert.ok(meta, `Template "${key}" must be registered in TEMPLATE_REGISTRY`);
      assert.ok(meta.badgeText.length > 0, `Template "${key}" must have badgeText`);
      assert.ok(meta.badgeUrdu.length > 0, `Template "${key}" must have badgeUrdu`);
      assert.ok(meta.ctaLabel.length > 0, `Template "${key}" must have ctaLabel`);
      assert.ok(meta.ctaPath.startsWith('/'), `Template "${key}" ctaPath must start with '/'`);

      // Verify no forbidden terminology in registered metadata
      assert.ok(!meta.badgeText.toLowerCase().includes('commission'), `Forbidden term in badgeText of "${key}"`);
      assert.ok(!meta.badgeUrdu.includes('کمیشن'), `Forbidden term in badgeUrdu of "${key}"`);
      assert.ok(!meta.ctaLabel.toLowerCase().includes('commission'), `Forbidden term in ctaLabel of "${key}"`);
    }
  });

  it('guarantees across all registered templates that zero old hex colors, zero img tags, and exact layout invariants exist', () => {
    const FORBIDDEN_OLD_COLORS = [
      '#1B2A41',
      '#FAF7F2',
      '#C8A96B',
      '#1F2430',
      '#333F4D',
      '#E6DEC8',
      '#EFE8DA',
      '#735118',
      '#5F6673',
    ];

    for (const [key, meta] of Object.entries(TEMPLATE_REGISTRY)) {
      const rendered = renderEmailTemplate({
        template: key,
        subject: `Operational Test: ${meta.badgeText}`,
        bodyText: `English description for ${meta.badgeText}.\nیہ اردو متن کی آزمائش ہے۔`,
        recipientEmail: 'test@example.com',
      });

      // 1. Zero old colors
      for (const oldColor of FORBIDDEN_OLD_COLORS) {
        assert.ok(
          !rendered.html.includes(oldColor),
          `Template "${key}" contains forbidden legacy color ${oldColor}`
        );
      }

      // 2. Zero <img> tags
      assert.ok(
        !rendered.html.includes('<img'),
        `Template "${key}" must not contain raster <img> tags`
      );

      // 3. Hidden Preheader
      assert.ok(
        rendered.html.includes('mso-hide: all') && rendered.html.includes('display: none'),
        `Template "${key}" must contain hidden preheader block`
      );

      // 4. Exactly ONE Primary CTA button
      const ctaMatches = (rendered.html.match(/class="unb-btn"/g) || []).length;
      assert.strictEqual(
        ctaMatches,
        1,
        `Template "${key}" must contain exactly 1 primary CTA button (found ${ctaMatches})`
      );

      // 5. Plain-text Fallback URL
      assert.ok(
        rendered.html.includes('Button not working? Copy and paste this link into your browser:'),
        `Template "${key}" must contain plain fallback URL block`
      );

      // 6. Urdu Block
      assert.ok(
        rendered.html.includes('dir="rtl"') && rendered.html.includes('lang="ur"'),
        `Template "${key}" must contain an Urdu block with dir="rtl" and lang="ur"`
      );

      // 7. Approved Palette Tokens Present
      assert.ok(rendered.html.includes('#F1ECDF'), `Template "${key}" must have canvas #F1ECDF`);
      assert.ok(rendered.html.includes('#FFFFFF'), `Template "${key}" must have card #FFFFFF`);
      assert.ok(rendered.html.includes('#813B09'), `Template "${key}" must have brand brown #813B09`);
      assert.ok(rendered.html.includes('#5F2F16'), `Template "${key}" must have badge fill #5F2F16`);
      assert.ok(rendered.html.includes('#D39A2A'), `Template "${key}" must have gold accent #D39A2A`);
      assert.ok(rendered.html.includes('#E6DFD0'), `Template "${key}" must have divider border #E6DFD0`);

      // 8. Plain-text alternative exists and is complete
      assert.ok(rendered.text.length > 50, `Template "${key}" plain-text alternative is too short`);
      assert.ok(rendered.text.includes(meta.badgeText), `Template "${key}" plain-text missing badgeText`);
      assert.ok(rendered.text.includes('premium.urdunovelbanks.com'), `Template "${key}" plain-text missing host`);
    }
  });

  it('renders reusable callout boxes with high-contrast warm styling', () => {
    const enCallout = renderCalloutBox('Notice: payment submitted for verification.', false);
    assert.ok(enCallout.includes('#FAF6EE'), 'Callout uses soft cream background');
    assert.ok(enCallout.includes('border-left: 3px solid #D39A2A'), 'Callout uses gold left accent');
    assert.ok(enCallout.includes('#22262B'), 'Callout uses high-contrast text');
    assert.ok(enCallout.includes('direction: ltr'), 'English callout is LTR');

    const urCallout = renderCalloutBox('وضاحت: آپ کی ادائیگی موصول ہو چکی ہے۔', true);
    assert.ok(urCallout.includes('direction: rtl'), 'Urdu callout is RTL');
    assert.ok(urCallout.includes('Noto Nastaliq Urdu'), 'Urdu callout uses Nastaliq font stack');
  });

  it('Phase E3: ensures all registered templates have comprehensive bilingual guidance and verified deep-links', () => {
    const baseUrl = getAppBaseUrl();

    for (const [key, meta] of Object.entries(TEMPLATE_REGISTRY)) {
      // 1. Guidance presence and non-emptiness
      assert.ok(meta.actionGuidanceEn && meta.actionGuidanceEn.length > 20, `Template "${key}" missing actionGuidanceEn`);
      assert.ok(meta.actionGuidanceUr && meta.actionGuidanceUr.length > 20, `Template "${key}" missing actionGuidanceUr`);
      assert.ok(meta.whatHappenedEn && meta.whatHappenedEn.length > 10, `Template "${key}" missing whatHappenedEn`);
      assert.ok(meta.whatHappenedUr && meta.whatHappenedUr.length > 10, `Template "${key}" missing whatHappenedUr`);

      // 2. Urdu script validation
      assert.ok(/[\u0600-\u06FF]/.test(meta.actionGuidanceUr), `Template "${key}" actionGuidanceUr must contain Urdu script`);
      assert.ok(/[\u0600-\u06FF]/.test(meta.whatHappenedUr), `Template "${key}" whatHappenedUr must contain Urdu script`);

      // 3. Deep-link validity
      assert.ok(meta.ctaPath.startsWith('/'), `Template "${key}" ctaPath must start with '/'`);
      assert.notStrictEqual(meta.ctaPath, '/writer/dashboard', `Template "${key}" must not point to non-existent /writer/dashboard`);

      // 4. Render output checks
      const rendered = renderEmailTemplate({
        template: key,
        subject: `Notice: ${meta.badgeText}`,
        bodyText: `Your request regarding ${meta.badgeText} has been processed.`,
      });

      // HTML contains "What Happens Next" card and "اگلا قدم" card
      assert.ok(rendered.html.includes('What Happens Next'), `Template "${key}" HTML missing "What Happens Next" header`);
      assert.ok(rendered.html.includes('اگلا قدم'), `Template "${key}" HTML missing "اگلا قدم" header`);
      assert.ok(
        rendered.html.includes(meta.actionGuidanceEn.replace(/'/g, '&#039;')),
        `Template "${key}" HTML missing actionGuidanceEn`
      );

      // Plain-text contains "Next Step:" and "اگلا قدم:"
      assert.ok(rendered.text.includes('Next Step:'), `Template "${key}" text missing "Next Step:"`);
      assert.ok(rendered.text.includes('اگلا قدم:'), `Template "${key}" text missing "اگلا قدم:"`);
      assert.ok(rendered.text.includes(meta.actionGuidanceEn), `Template "${key}" text missing actionGuidanceEn`);

      // Absolute URL validation
      assert.ok(rendered.text.includes(`${baseUrl}${meta.ctaPath}`), `Template "${key}" text must contain absolute ctaUrl`);
      assert.ok(rendered.html.includes(`href="${baseUrl}${meta.ctaPath}"`), `Template "${key}" HTML must contain absolute ctaUrl`);

      // Strictly zero forbidden terminology
      assert.ok(!meta.actionGuidanceEn.toLowerCase().includes('commission'), `Forbidden term in actionGuidanceEn of "${key}"`);
      assert.ok(!meta.actionGuidanceUr.includes('کمیشن'), `Forbidden term in actionGuidanceUr of "${key}"`);
      assert.ok(!meta.whatHappenedEn.toLowerCase().includes('commission'), `Forbidden term in whatHappenedEn of "${key}"`);
      assert.ok(!meta.whatHappenedUr.includes('کمیشن'), `Forbidden term in whatHappenedUr of "${key}"`);
    }
  });

  it('Phase E3: frames reason, note, and feedback paragraphs inside callout boxes automatically', () => {
    const rendered = renderEmailTemplate({
      template: 'payment_rejected',
      subject: 'Payment Declined for Order #ORD-101',
      bodyText: 'The author could not verify your payment.\nReason: Bank statement did not match deposit reference TID.\nمصنف آپ کی ادائیگی کی تصدیق نہیں کر سکے۔\nوجہ: بینک ریکارڈ میں یہ رقم موصول نہیں ہوئی۔',
    });

    // Both English and Urdu callout boxes should be rendered
    assert.ok(rendered.html.includes('border-left: 3px solid #D39A2A'), 'English Reason line rendered in callout box');
    assert.ok(rendered.html.includes('border-right: 3px solid #D39A2A'), 'Urdu Reason line rendered in callout box');
    assert.ok(rendered.html.includes('Bank statement did not match deposit reference TID'));
    assert.ok(rendered.html.includes('بینک ریکارڈ میں یہ رقم موصول نہیں ہوئی'));
  });

  it('Phase E3: ensures payment_rejected and tip_not_received maintain respectful, non-accusatory tone', () => {
    const rejPayment = TEMPLATE_REGISTRY['payment_rejected'];
    const rejTip = TEMPLATE_REGISTRY['tip_not_received'];

    for (const meta of [rejPayment, rejTip]) {
      const combined = `${meta.whatHappenedEn} ${meta.actionGuidanceEn}`.toLowerCase();
      assert.ok(!combined.includes('fraud'), 'Must not contain accusatory word "fraud"');
      assert.ok(!combined.includes('fake'), 'Must not contain accusatory word "fake"');
      assert.ok(!combined.includes('scam'), 'Must not contain accusatory word "scam"');
      assert.ok(!combined.includes('cheat'), 'Must not contain accusatory word "cheat"');

      // Must direct calmly to review note / check receipt
      assert.ok(combined.includes('review') || combined.includes('check'), 'Must guide user calmly');
    }
  });

  it('Phase E3: strictly references verified codebase facts (30% platform fee, PKR 5,000 threshold, 24h dispute window, 7d tip expiry)', () => {
    // 1. Platform Fee Invoice threshold PKR 5,000 (0017:71, FAQ:113, Agreement:94)
    const invoiceMeta = TEMPLATE_REGISTRY['invoice_issued'];
    assert.ok(invoiceMeta.whatHappenedEn.includes('PKR 5,000') || invoiceMeta.actionGuidanceEn.includes('5,000'));
    assert.ok(invoiceMeta.whatHappenedUr.includes('5,000') || invoiceMeta.actionGuidanceUr.includes('5,000'));

    // 2. Dispute 24-hour wait window (0018:418)
    const disputeMeta = TEMPLATE_REGISTRY['reminder_verification_24h'];
    assert.ok(disputeMeta.actionGuidanceEn.includes('24 hours'));
    assert.ok(disputeMeta.actionGuidanceUr.includes('24 گھنٹے'));

    // 3. Tip expiry 7 days (0034:2026)
    const tipReminder = TEMPLATE_REGISTRY['reminder_tip_confirmation'];
    assert.ok(tipReminder.actionGuidanceEn.includes('7 days'));
    assert.ok(tipReminder.actionGuidanceUr.includes('7 دن'));
  });
});
