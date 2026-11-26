export type ReaderUrduFont = 'gulzar' | 'noori';

export const ALLOWED_READER_URDU_FONTS: readonly ReaderUrduFont[] = ['gulzar', 'noori'] as const;
export const DEFAULT_READER_URDU_FONT: ReaderUrduFont = 'gulzar';

/**
 * Pure validator for ReaderUrduFont value.
 */
export function isReaderUrduFont(val: unknown): val is ReaderUrduFont {
  return typeof val === 'string' && ALLOWED_READER_URDU_FONTS.includes(val as ReaderUrduFont);
}

/**
 * Pure parser returning a valid ReaderUrduFont, defaulting safely to 'gulzar'.
 */
export function parseReaderUrduFont(value: unknown): ReaderUrduFont {
  if (isReaderUrduFont(value)) {
    return value;
  }
  return DEFAULT_READER_URDU_FONT;
}

/**
 * Pure URL validator for the external Noori font asset.
 * - Requires HTTPS protocol.
 * - Forbids characters that could be used for CSS injection (quotes, semicolons, brackets, spaces, control characters).
 * - Forbids credentials (username:password).
 */
export function parseValidNooriFontUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strict injection guard: Reject characters that could escape url("...") in CSS
  if (/["';\(\)\{\}\s\r\n\0\\]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Pure resolver determining whether Noori can actually be activated.
 * Guarantees that toggling the admin setting to 'noori' when NOORI_FONT_URL
 * is unset or invalid will NEVER break reader pages — it stays safely on 'gulzar'.
 */
export function resolveEffectiveReaderFont(
  dbSetting: ReaderUrduFont,
  fontUrl: string | null
): {
  effectiveFont: ReaderUrduFont;
  fontUrl: string | null;
} {
  if (dbSetting === 'noori' && fontUrl) {
    return {
      effectiveFont: 'noori',
      fontUrl,
    };
  }

  return {
    effectiveFont: 'gulzar',
    fontUrl: null,
  };
}

/**
 * Reads NOORI_FONT_URL from environment at runtime (never baked into static builds).
 */
export function getRuntimeNooriFontUrl(): string | null {
  return parseValidNooriFontUrl(process.env.NOORI_FONT_URL);
}
