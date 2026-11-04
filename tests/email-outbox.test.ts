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
  getAppBaseUrl,
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
  it('renders official UNB Premium aesthetic tokens (Warm Ivory, Deep Navy, Antique Gold)', () => {
    const rendered = renderEmailTemplate({
      template: 'payment_verified',
      subject: 'Novel Access Unlocked | ناول ان لاک ہو گیا',
      bodyText: 'Your payment has been verified. Novel "Laa" is now in your library.\nآپ کا آرڈر منظور ہو چکا ہے۔',
      recipientEmail: 'reader@example.com',
    });

    // Aesthetic token checks
    assert.ok(rendered.html.includes('#FAF7F2'), 'Includes Warm Ivory background (#FAF7F2)');
    assert.ok(rendered.html.includes('#FFFFFF'), 'Includes Crisp White card (#FFFFFF)');
    assert.ok(rendered.html.includes('#1B2A41'), 'Includes Deep Navy banner (#1B2A41)');
    assert.ok(rendered.html.includes('#C8A96B'), 'Includes Antique Gold trim/border (#C8A96B)');
    assert.ok(rendered.html.includes('#E6DEC8'), 'Includes Warm Cream border (#E6DEC8)');

    // Nastaliq RTL typography
    assert.ok(rendered.html.includes('direction: rtl'));
    assert.ok(rendered.html.includes('Gulzar'));
    assert.ok(rendered.html.includes('Noto Nastaliq Urdu'));

    // Category badge & CTA
    assert.ok(rendered.html.includes('Novel Unlocked'));
    assert.ok(rendered.html.includes('رسائی مل گئی'));
    assert.ok(rendered.html.includes('/library'));
    assert.ok(rendered.html.includes('Open My Library'));

    // Plain text representation
    assert.ok(rendered.text.includes('UNB Premium'));
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
      { template: 'writer_approved', cta: '/writer/dashboard', badge: 'Writer Studio' },
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
});
