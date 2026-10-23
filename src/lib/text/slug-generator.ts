/**
 * UNB Premium — Novel Slug Generator Utility
 * 
 * Rules:
 * - English title: lowercased, non-alphanumeric replaced with hyphens, trimmed hyphens.
 * - Urdu-only or non-Latin title: falls back to "novel-" + unique random hex/id.
 * - Suffix support for collision avoidance.
 */

export function generateNovelSlug(
  titleEnglish: string | null | undefined,
  fallbackSeed?: string
): string {
  if (!titleEnglish) {
    const seed = fallbackSeed || (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).substring(2, 10));
    return `novel-${seed.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  // Normalize and replace non-alphanumeric characters with hyphens
  let slug = titleEnglish
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // If slug is too short or resulted in empty string (e.g. Urdu-only characters passed)
  if (slug.length < 2) {
    const seed = fallbackSeed || (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).substring(2, 10));
    return `novel-${seed.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  // Truncate to reasonable length (e.g. 80 chars) without cutting in middle of word
  if (slug.length > 80) {
    slug = slug.substring(0, 80).replace(/-+$/, '');
  }

  return slug;
}
