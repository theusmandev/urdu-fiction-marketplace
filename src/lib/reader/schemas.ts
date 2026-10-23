import { z } from 'zod';

/**
 * Reader Display Themes
 */
export type ReaderTheme = 'light' | 'dark' | 'sepia';
export type ReaderFontSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl';
export type ReaderLineHeight = 'normal' | 'relaxed' | 'loose';

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  theme: 'light',
  fontSize: 'lg',
  lineHeight: 'relaxed',
};

export const readerPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'sepia']).default('light'),
  fontSize: z.enum(['sm', 'base', 'lg', 'xl', '2xl']).default('lg'),
  lineHeight: z.enum(['normal', 'relaxed', 'loose']).default('relaxed'),
});

/**
 * Generates a short, non-sensitive 6-character deterministic hash of a UUID
 * for display in the protective watermark.
 */
export function getShortReaderHash(readerId: string | null | undefined): string {
  if (!readerId || typeof readerId !== 'string') return 'ANON';
  const clean = readerId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (clean.length < 6) return clean.toUpperCase();
  // Take first 3 and last 3 characters
  return `${clean.slice(0, 3)}${clean.slice(-3)}`.toUpperCase();
}

/**
 * Formats watermark string overlaid on secure web reader text.
 * Honest deterrent: combines order watermark code with reader identifier hash.
 */
export function buildWatermarkPattern(
  watermarkCode: string | null | undefined,
  readerId: string | null | undefined
): string | null {
  if (!watermarkCode || typeof watermarkCode !== 'string' || watermarkCode.trim() === '') {
    return null;
  }
  const cleanCode = watermarkCode.trim();
  const hash = getShortReaderHash(readerId);
  return `${cleanCode} • #${hash}`;
}

/**
 * Computes percentage and user-friendly reading progress label.
 */
export function calculateLibraryProgress(
  lastChapterNumber: number | null | undefined,
  totalChapters: number
): { percent: number; label: string; isCompleted: boolean } {
  const total = Math.max(0, Math.floor(totalChapters || 0));

  if (total === 0) {
    return { percent: 0, label: '0 chapters published', isCompleted: false };
  }

  const current = Math.max(0, Math.floor(lastChapterNumber || 0));

  if (current === 0) {
    return { percent: 0, label: 'Not started', isCompleted: false };
  }

  if (current >= total) {
    return {
      percent: 100,
      label: `Completed (${total}/${total})`,
      isCompleted: true,
    };
  }

  const pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  return {
    percent: pct,
    label: `Chapter ${current} of ${total}`,
    isCompleted: false,
  };
}

/**
 * Maps database RPC and server error messages to user-facing reader guidance.
 */
export function mapReaderError(errorMessage: string | null | undefined): {
  type: 'rate_limited' | 'not_found' | 'unauthenticated' | 'generic';
  message: string;
  waitSuggested: boolean;
} {
  const err = (errorMessage || '').trim();

  if (err.includes('Too many chapters opened')) {
    return {
      type: 'rate_limited',
      message:
        'You have opened too many chapters in a short time. Please slow down and wait a few minutes before opening another chapter.',
      waitSuggested: true,
    };
  }

  if (err.includes('Chapter not found')) {
    return {
      type: 'not_found',
      message:
        'This chapter is either not published or requires purchase verification. If you recently placed an order, please wait for the author to verify your deposit.',
      waitSuggested: false,
    };
  }

  if (err.includes('Authentication required')) {
    return {
      type: 'unauthenticated',
      message: 'Please sign in to your account to read this chapter.',
      waitSuggested: false,
    };
  }

  return {
    type: 'generic',
    message: err || 'An unexpected error occurred while loading this chapter. Please try again.',
    waitSuggested: false,
  };
}
