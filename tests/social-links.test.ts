import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSocialUrl,
  writerSocialLinksSchema,
  type SocialPlatform,
} from '../src/lib/validations/social-links.ts';

describe('Writer Social Media Links Normalization & Security', () => {
  describe('Handles and Plain Usernames Normalization', () => {
    test('converts handles starting with @ into canonical URLs', () => {
      assert.equal(
        normalizeSocialUrl('facebook', '@tariq.author'),
        'https://www.facebook.com/tariq.author'
      );
      assert.equal(
        normalizeSocialUrl('instagram', '@tariq_writes'),
        'https://www.instagram.com/tariq_writes'
      );
      assert.equal(
        normalizeSocialUrl('pinterest', '@tariq_novels'),
        'https://www.pinterest.com/tariq_novels'
      );
      assert.equal(
        normalizeSocialUrl('tiktok', '@tariq_urdu'),
        'https://www.tiktok.com/@tariq_urdu'
      );
      assert.equal(
        normalizeSocialUrl('linkedin', '@tariq-mehmood'),
        'https://www.linkedin.com/in/tariq-mehmood'
      );
    });

    test('converts plain usernames into canonical URLs', () => {
      assert.equal(
        normalizeSocialUrl('instagram', 'samia_ahmed'),
        'https://www.instagram.com/samia_ahmed'
      );
      assert.equal(
        normalizeSocialUrl('tiktok', 'samia_booktok'),
        'https://www.tiktok.com/@samia_booktok'
      );
      assert.equal(
        normalizeSocialUrl('linkedin', 'samia-ahmed-author'),
        'https://www.linkedin.com/in/samia-ahmed-author'
      );
    });
  });

  describe('Protocol-less URLs and Domain Prepending', () => {
    test('prepends https:// to protocol-less platform domains', () => {
      assert.equal(
        normalizeSocialUrl('facebook', 'facebook.com/author.official'),
        'https://facebook.com/author.official'
      );
      assert.equal(
        normalizeSocialUrl('instagram', 'www.instagram.com/author.daily'),
        'https://www.instagram.com/author.daily'
      );
      assert.equal(
        normalizeSocialUrl('pinterest', 'pinterest.com/author_boards'),
        'https://pinterest.com/author_boards'
      );
      assert.equal(
        normalizeSocialUrl('tiktok', 'tiktok.com/@author_official'),
        'https://tiktok.com/@author_official'
      );
      assert.equal(
        normalizeSocialUrl('linkedin', 'pk.linkedin.com/in/author-profile'),
        'https://pk.linkedin.com/in/author-profile'
      );
    });

    test('accepts short links for supported platforms (e.g. pin.it, fb.me)', () => {
      assert.equal(
        normalizeSocialUrl('pinterest', 'https://pin.it/board123'),
        'https://pin.it/board123'
      );
      assert.equal(
        normalizeSocialUrl('facebook', 'https://fb.me/authorpage'),
        'https://fb.me/authorpage'
      );
    });

    test('upgrades insecure http:// to secure https://', () => {
      assert.equal(
        normalizeSocialUrl('instagram', 'http://instagram.com/author'),
        'https://instagram.com/author'
      );
    });
  });

  describe('Empty, Null, and Whitespace Handling', () => {
    test('returns null for empty strings or whitespace (treated as cleared/unset)', () => {
      assert.equal(normalizeSocialUrl('facebook', ''), null);
      assert.equal(normalizeSocialUrl('instagram', '   '), null);
      assert.equal(normalizeSocialUrl('pinterest', null), null);
    });

    test('returns undefined when value is omitted (undefined)', () => {
      assert.equal(normalizeSocialUrl('tiktok', undefined), undefined);
    });
  });

  describe('Security and Protocol Lockdown', () => {
    test('strictly rejects dangerous pseudo-protocols', () => {
      const dangerous = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
      ];

      for (const payload of dangerous) {
        assert.throws(
          () => normalizeSocialUrl('facebook', payload),
          /Invalid URL protocol/i
        );
      }
    });

    test('strictly rejects cross-platform hostname mismatches', () => {
      assert.throws(
        () => normalizeSocialUrl('facebook', 'https://youtube.com/mychannel'),
        /Please enter a valid Facebook URL/i
      );
      assert.throws(
        () => normalizeSocialUrl('instagram', 'https://twitter.com/myhandle'),
        /Please enter a valid Instagram URL/i
      );
      assert.throws(
        () => normalizeSocialUrl('linkedin', 'https://github.com/myprofile'),
        /Please enter a valid LinkedIn URL/i
      );
    });

    test('rejects URLs exceeding 300 characters', () => {
      const longUrl = 'https://www.facebook.com/' + 'a'.repeat(301);
      assert.throws(
        () => normalizeSocialUrl('facebook', longUrl),
        /cannot exceed 300 characters/i
      );
    });

    test('rejects URLs containing embedded whitespace or newlines', () => {
      assert.throws(
        () => normalizeSocialUrl('instagram', 'https://instagram.com/author name'),
        /cannot contain spaces/i
      );
      assert.throws(
        () => normalizeSocialUrl('tiktok', 'https://tiktok.com/@auth\nor'),
        /cannot contain spaces/i
      );
    });
  });

  describe('writerSocialLinksSchema Zod Validation', () => {
    test('accepts partial links (e.g. only 1 link set, others empty)', () => {
      const parsed = writerSocialLinksSchema.safeParse({
        social_facebook: '',
        social_instagram: 'https://instagram.com/myauthor',
        social_pinterest: null,
        social_tiktok: '',
        social_linkedin: undefined,
      });

      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.social_facebook, null);
        assert.equal(parsed.data.social_instagram, 'https://instagram.com/myauthor');
        assert.equal(parsed.data.social_pinterest, null);
        assert.equal(parsed.data.social_tiktok, null);
        assert.equal(parsed.data.social_linkedin, undefined);
      }
    });

    test('accepts all 5 links populated with various handle/URL formats', () => {
      const parsed = writerSocialLinksSchema.safeParse({
        social_facebook: 'facebook.com/author1',
        social_instagram: '@author2',
        social_pinterest: 'pinterest.com/author3',
        social_tiktok: 'author4',
        social_linkedin: 'linkedin.com/in/author5',
      });

      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.social_facebook, 'https://facebook.com/author1');
        assert.equal(parsed.data.social_instagram, 'https://www.instagram.com/author2');
        assert.equal(parsed.data.social_pinterest, 'https://pinterest.com/author3');
        assert.equal(parsed.data.social_tiktok, 'https://www.tiktok.com/@author4');
        assert.equal(parsed.data.social_linkedin, 'https://linkedin.com/in/author5');
      }
    });

    test('rejects invalid inputs with descriptive field issues', () => {
      const parsed = writerSocialLinksSchema.safeParse({
        social_facebook: 'javascript:alert(1)',
      });

      assert.equal(parsed.success, false);
      if (!parsed.success) {
        const errors = parsed.error.flatten().fieldErrors;
        assert.ok(errors.social_facebook);
      }
    });
  });
});
