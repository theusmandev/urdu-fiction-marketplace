import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writerAnnouncementSchema } from '../src/lib/admin/schemas.ts';

describe('Writer Announcement Validation Schema', () => {
  it('accepts valid full bilingual announcement', () => {
    const valid = {
      enabled: true,
      variant: 'feature' as const,
      title_en: 'New Chapter Drafts Auto-Save Feature',
      title_ur: 'نئے باب کے مسودات کے لیے خودکار محفوظ کرنے کی سہولت',
      body_en: 'Your writing drafts are now backed up to your browser cache every 2 seconds.',
      body_ur: 'آپ کے تحریری مسودات اب ہر دو سیکنڈ بعد براؤزر کیش میں محفوظ ہو جاتے ہیں۔',
      link_url: '/writer/novels',
      link_label: 'Explore Studio',
      dismissible: true,
    };

    const result = writerAnnouncementSchema.safeParse(valid);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.enabled, true);
      assert.equal(result.data.variant, 'feature');
      assert.equal(result.data.link_url, '/writer/novels');
      assert.equal(result.data.dismissible, true);
    }
  });

  it('accepts English-only announcement when enabled', () => {
    const englishOnly = {
      enabled: true,
      variant: 'info' as const,
      title_en: 'Platform Maintenance Notice',
      body_en: 'Brief maintenance will occur on Sunday at 02:00 PKT.',
    };

    const result = writerAnnouncementSchema.safeParse(englishOnly);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.title_en, 'Platform Maintenance Notice');
      assert.equal(result.data.title_ur, '');
      assert.equal(result.data.dismissible, true); // default
    }
  });

  it('accepts Urdu-only announcement when enabled', () => {
    const urduOnly = {
      enabled: true,
      variant: 'success' as const,
      title_ur: 'ماہانہ انعامات کا اعلان',
      body_ur: 'اس ماہ کے نمایاں مصنفین کے نام شائع کر دیے گئے ہیں۔',
    };

    const result = writerAnnouncementSchema.safeParse(urduOnly);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.title_ur, 'ماہانہ انعامات کا اعلان');
      assert.equal(result.data.title_en, '');
    }
  });

  it('allows completely empty content when disabled', () => {
    const disabledEmpty = {
      enabled: false,
      variant: 'info' as const,
      title_en: '',
      title_ur: '',
      body_en: '',
      body_ur: '',
      link_url: '',
      link_label: '',
    };

    const result = writerAnnouncementSchema.safeParse(disabledEmpty);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.enabled, false);
    }
  });

  it('rejects completely empty content when enabled', () => {
    const enabledEmpty = {
      enabled: true,
      variant: 'info' as const,
      title_en: '   ',
      title_ur: '',
      body_en: '',
      body_ur: '  ',
    };

    const result = writerAnnouncementSchema.safeParse(enabledEmpty);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(
        result.error.issues[0].message,
        /Active announcements must have at least one non-empty title or message/i
      );
    }
  });

  it('accepts all 4 valid variants', () => {
    const variants = ['info', 'feature', 'warning', 'success'] as const;
    for (const variant of variants) {
      const result = writerAnnouncementSchema.safeParse({
        enabled: true,
        variant,
        title_en: `Testing variant ${variant}`,
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.variant, variant);
      }
    }
  });

  it('rejects invalid variant name', () => {
    const result = writerAnnouncementSchema.safeParse({
      enabled: true,
      variant: 'urgent_danger',
      title_en: 'Test title',
    });
    assert.equal(result.success, false);
  });

  it('accepts safe internal and external URLs', () => {
    const safeUrls = [
      '',
      '/',
      '/writer',
      '/writer/novels/new',
      'https://urdunovelbanks.com',
      'https://premium.urdunovelbanks.com/help',
      'http://localhost:3000/writer',
    ];

    for (const link_url of safeUrls) {
      const result = writerAnnouncementSchema.safeParse({
        enabled: true,
        variant: 'info' as const,
        title_en: 'Link test',
        link_url,
      });
      assert.equal(result.success, true, `Expected URL "${link_url}" to be valid`);
    }
  });

  it('strictly rejects malicious javascript: and data: URLs', () => {
    const dangerousUrls = [
      'javascript:alert(1)',
      'javascript:void(0)',
      'JAVASCRIPT:document.location="evil.com"',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("test")',
      'ftp://example.com/file',
      'writer/novels', // relative path without leading slash
    ];

    for (const link_url of dangerousUrls) {
      const result = writerAnnouncementSchema.safeParse({
        enabled: true,
        variant: 'info' as const,
        title_en: 'Dangerous link test',
        link_url,
      });
      assert.equal(result.success, false, `Expected URL "${link_url}" to be rejected`);
    }
  });

  it('enforces character length limits', () => {
    const overTitleEn = {
      enabled: true,
      variant: 'info' as const,
      title_en: 'A'.repeat(161),
    };
    assert.equal(writerAnnouncementSchema.safeParse(overTitleEn).success, false);

    const overTitleUr = {
      enabled: true,
      variant: 'info' as const,
      title_ur: 'ب'.repeat(161),
    };
    assert.equal(writerAnnouncementSchema.safeParse(overTitleUr).success, false);

    const overBodyEn = {
      enabled: true,
      variant: 'info' as const,
      title_en: 'Title',
      body_en: 'A'.repeat(601),
    };
    assert.equal(writerAnnouncementSchema.safeParse(overBodyEn).success, false);

    const overBodyUr = {
      enabled: true,
      variant: 'info' as const,
      title_en: 'Title',
      body_ur: 'ب'.repeat(601),
    };
    assert.equal(writerAnnouncementSchema.safeParse(overBodyUr).success, false);

    const overLinkLabel = {
      enabled: true,
      variant: 'info' as const,
      title_en: 'Title',
      link_url: '/writer',
      link_label: 'A'.repeat(61),
    };
    assert.equal(writerAnnouncementSchema.safeParse(overLinkLabel).success, false);
  });
});

