import { z } from 'zod';

export type SocialPlatform = 'facebook' | 'instagram' | 'pinterest' | 'tiktok' | 'linkedin';

export interface WriterSocialLinks {
  facebook?: string | null;
  instagram?: string | null;
  pinterest?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
}

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

/**
 * Validates and normalizes social URLs or handles for the 5 supported platforms.
 * 
 * Rules:
 *  - undefined => undefined (omitted)
 *  - null or empty string => null (cleared/unset)
 *  - @handle or plain username => canonical https:// URL
 *  - protocol-less domain (e.g. instagram.com/name) => https:// prepend
 *  - Strictly rejects javascript:, data:, file:, and invalid hostnames
 */
export function normalizeSocialUrl(platform: SocialPlatform, raw: unknown): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === null) {
    return null;
  }

  if (typeof raw !== 'string') {
    throw new Error('Expected string value for social link.');
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }

  const label = PLATFORM_LABELS[platform];

  if (trimmed.length > 300) {
    throw new Error(`${label} URL cannot exceed 300 characters.`);
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    throw new Error('Invalid URL protocol. Only https:// or http:// are allowed.');
  }

  if (/[\r\n\t\s]/.test(trimmed)) {
    throw new Error(`${label} URL cannot contain spaces or newline characters.`);
  }

  // 1. Check if the user entered a plain handle or @handle (no dots, slashes, or colons)
  const isPlainHandle = trimmed.startsWith('@') || (!trimmed.includes('.') && !trimmed.includes('/'));
  if (isPlainHandle) {
    const handle = trimmed.replace(/^@+/, '');
    if (!handle) {
      throw new Error(`Please provide a valid ${label} username or handle.`);
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(handle)) {
      throw new Error(`Invalid ${label} username characters. Use letters, numbers, dots, or underscores.`);
    }

    switch (platform) {
      case 'facebook':
        return `https://www.facebook.com/${handle}`;
      case 'instagram':
        return `https://www.instagram.com/${handle}`;
      case 'pinterest':
        return `https://www.pinterest.com/${handle}`;
      case 'tiktok':
        return `https://www.tiktok.com/@${handle}`;
      case 'linkedin':
        return `https://www.linkedin.com/in/${handle}`;
    }
  }

  // 2. Full URL or domain path: ensure https:// protocol
  let urlString = trimmed;
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    urlString = urlString.startsWith('//') ? `https:${urlString}` : `https://${urlString}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Please enter a valid ${label} profile URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are allowed.');
  }

  // Upgrade http to https for modern platform security
  parsed.protocol = 'https:';

  const host = parsed.hostname.toLowerCase();
  const isValidHost = (() => {
    switch (platform) {
      case 'facebook':
        return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host.endsWith('.fb.com') || host === 'fb.me';
      case 'instagram':
        return host === 'instagram.com' || host.endsWith('.instagram.com');
      case 'pinterest':
        return host === 'pinterest.com' || host.endsWith('.pinterest.com') || host === 'pin.it' || host.endsWith('.pin.it');
      case 'tiktok':
        return host === 'tiktok.com' || host.endsWith('.tiktok.com');
      case 'linkedin':
        return host === 'linkedin.com' || host.endsWith('.linkedin.com');
    }
  })();

  if (!isValidHost) {
    throw new Error(`Please enter a valid ${label} URL (e.g., https://${platform}.com/...).`);
  }

  const finalUrl = parsed.toString();
  if (finalUrl.length > 300) {
    throw new Error(`${label} URL cannot exceed 300 characters.`);
  }

  return finalUrl;
}

/**
 * Creates a Zod schema for a specific platform's social link field.
 */
export function createSocialUrlSchema(platform: SocialPlatform) {
  return z
    .string()
    .nullish()
    .transform((val, ctx) => {
      try {
        return normalizeSocialUrl(platform, val);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Invalid URL',
        });
        return z.NEVER;
      }
    });
}

/**
 * Validated schema for writer social links.
 */
export const writerSocialLinksSchema = z.object({
  social_facebook: createSocialUrlSchema('facebook'),
  social_instagram: createSocialUrlSchema('instagram'),
  social_pinterest: createSocialUrlSchema('pinterest'),
  social_tiktok: createSocialUrlSchema('tiktok'),
  social_linkedin: createSocialUrlSchema('linkedin'),
});

export type WriterSocialLinksInput = z.infer<typeof writerSocialLinksSchema>;

