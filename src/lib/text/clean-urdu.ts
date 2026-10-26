/**
 * UNB Premium — Urdu Text Normalization and Cleaning Utility
 *
 * Responsibilities:
 * - Unicode normalization (NFC)
 * - Strip zero-width & bidi directional formatting controls EXCEPT ZWNJ (\u200C) and ZWJ (\u200D)
 * - Map Arabic-Indic digits (٠-٩) to Urdu-Persian digits (۰-۹) ONLY when not inside
 *   an Arabic-script run containing harakat/tashkeel (Quranic verses, duas, hadith)
 * - Safe by default: NEVER alters Arabic Kaf (ك), Yeh (ي, ى), or Teh Marbuta (ة) unless
 *   the caller explicitly opts in via { normalizeArabicLetters: true }
 * - Collapse repeated spaces and excess blank lines (max 2 consecutive newlines)
 * - Trim leading and trailing whitespace
 */

export interface CleanUrduOptions {
  /**
   * Explicit opt-in to convert Arabic letter forms to Urdu forms:
   * - Arabic Kaf (ك \u0643) -> Urdu Keheh (ک \u06A9)
   * - Arabic Yeh (ي \u064A, ى \u0649) -> Urdu Farsi Yeh (ی \u06CC)
   * - Arabic Teh Marbuta (ة \u0629) -> Urdu Goal Heh (ہ \u06C1)
   *
   * MUST BE FALSE BY DEFAULT because novels frequently quote Quranic verses,
   * duas, and Arabic idioms whose orthography must not be altered.
   */
  normalizeArabicLetters?: boolean;
}

// Arabic-Indic to Urdu-Persian digits map
export const ARABIC_TO_URDU_DIGITS: Record<string, string> = {
  '\u0660': '\u06F0', // ٠ -> ۰
  '\u0661': '\u06F1', // ١ -> ۱
  '\u0662': '\u06F2', // ٢ -> ۲
  '\u0663': '\u06F3', // ٣ -> ۳
  '\u0664': '\u06F4', // ٤ -> ۴
  '\u0665': '\u06F5', // ٥ -> ۵
  '\u0666': '\u06F6', // ٦ -> ۶
  '\u0667': '\u06F7', // ٧ -> ۷
  '\u0668': '\u06F8', // ٨ -> ۸
  '\u0669': '\u06F9', // ٩ -> ۹
};

// Forbidden control characters (BOM, zero-width space, and bidi embedding/overrides)
// NOTE: \u200C (ZWNJ) and \u200D (ZWJ) are strictly preserved for proper Urdu Nastaliq letter shaping.
const BIDI_AND_INVISIBLE_CHARS_REGEX = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u2060]/g;

// Arabic character replacements for standard Urdu orthography
export const ARABIC_CHAR_MAP: Record<string, string> = {
  '\u0643': '\u06A9', // Arabic Kaf ك -> Urdu Keheh ک
  '\u064A': '\u06CC', // Arabic Yeh with 2 dots below ي -> Urdu Farsi Yeh ی
  '\u0649': '\u06CC', // Arabic Alef Maksura ى -> Urdu Farsi Yeh ی
  '\u0629': '\u06C1', // Arabic Teh Marbuta ة -> Urdu Goal Heh ہ
};

// Regex matching Arabic harakat / tashkeel and Quranic verse markers
// \u064B-\u0652: Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun
// \u0670: Superscript / Dagger Alef (الرَّحْمَٰنِ)
// \u06DD: End of Ayah sign (۝)
// \uFD3E, \uFD3F: Ornate Quranic parentheses (﴾ ﴿)
export const TASHKEEL_REGEX = /[\u064B-\u0652\u0670\u06DD\uFD3E\uFD3F]/;

/**
 * Checks whether an Arabic-Indic digit match is inside an Arabic-script run
 * containing harakat/tashkeel (such as a Quranic ayah, Hadith, or dua).
 */
export function isInsideArabicRun(text: string, matchIndex: number, matchLength: number): boolean {
  // 1. Check if the digit is enclosed in quotation marks or brackets:
  // e.g. "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ ﴿١﴾" or (١) inside an ayah
  const beforeText = text.slice(0, matchIndex);
  const afterText = text.slice(matchIndex + matchLength);

  const backwardLimit = Math.max(0, matchIndex - 200);
  const forwardLimit = Math.min(text.length, matchIndex + matchLength + 200);

  // Search backward for the nearest sentence, clause, or quote boundary
  const delimRegex = /[\n\r۔\.!\?؟«»"“”'‘’﴿﴾\(\)\[\]{}؛]/;

  let start = matchIndex;
  while (start > backwardLimit) {
    if (delimRegex.test(text[start - 1])) {
      break;
    }
    start--;
  }

  // Search forward for the nearest boundary
  let end = matchIndex + matchLength;
  while (end < forwardLimit) {
    if (delimRegex.test(text[end])) {
      break;
    }
    end++;
  }

  // Check the immediate sentence/clause segment
  const immediateSegment = text.slice(start, end);
  if (TASHKEEL_REGEX.test(immediateSegment)) {
    return true;
  }

  // Also check if digit is enclosed within quotes or ornate parentheses with tashkeel
  const quoteOpenIdx = Math.max(
    beforeText.lastIndexOf('"'),
    beforeText.lastIndexOf('“'),
    beforeText.lastIndexOf('«'),
    beforeText.lastIndexOf('﴿'),
    beforeText.lastIndexOf('(')
  );

  if (quoteOpenIdx !== -1 && quoteOpenIdx >= backwardLimit) {
    const quoteCloseRelative = afterText.search(/["”»﴾\)]/);
    if (quoteCloseRelative !== -1) {
      const fullQuotedSpan = text.slice(
        quoteOpenIdx,
        matchIndex + matchLength + quoteCloseRelative + 1
      );
      if (TASHKEEL_REGEX.test(fullQuotedSpan)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Normalizes Arabic letter forms (ك, ي, ى, ة) to Urdu equivalents (ک, ی, ہ).
 * Should ONLY be used upon explicit user opt-in with preview.
 */
export function normalizeArabicLetterForms(text: string): string {
  if (!text) return '';
  return text.replace(/[\u0643\u064A\u0649\u0629]/g, (match) => ARABIC_CHAR_MAP[match] || match);
}

/**
 * Checks if the text contains any Arabic letter forms that could be normalized to Urdu.
 */
export function hasArabicLetterForms(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[\u0643\u064A\u0649\u0629]/.test(text);
}

/**
 * Cleans and normalizes Urdu manuscript and title text.
 * Safe by default: Unicode NFC, bidi stripping (preserves ZWNJ/ZWJ), whitespace
 * collapse, and context-aware Arabic-Indic digits conversion.
 * Arabic letter forms (ك, ي, ى, ة) are NOT converted unless options.normalizeArabicLetters is true.
 */
export function cleanUrduText(
  input: string | null | undefined,
  options?: CleanUrduOptions
): string {
  if (!input) return '';

  // 1. Unicode NFC Normalization
  let text = input.normalize('NFC');

  // 2. Remove bidi formatting and invisible control characters (preserve ZWNJ \u200C & ZWJ \u200D)
  text = text.replace(BIDI_AND_INVISIBLE_CHARS_REGEX, '');

  // 3. Map Arabic-Indic digits (٠-٩) to Urdu-Persian digits (۰-۹)
  // ONLY when not inside an Arabic-script run containing harakat/tashkeel!
  text = text.replace(/[\u0660-\u0669]+/g, (match, offset) => {
    if (isInsideArabicRun(text, offset, match.length)) {
      return match; // Keep original Arabic-Indic digits for Quranic ayah / Arabic run
    }
    return match.replace(/[\u0660-\u0669]/g, (d) => ARABIC_TO_URDU_DIGITS[d] || d);
  });

  // 4. Opt-in only: Normalize Arabic Kaf, Yeh, and Teh Marbuta to standard Urdu glyphs
  if (options?.normalizeArabicLetters) {
    text = normalizeArabicLetterForms(text);
  }

  // 5. Replace Windows/Mac line breaks and Unicode line/paragraph separators (U+2028, U+2029) with standard Unix newlines
  text = text.replace(/\r\n/g, '\n').replace(/[\r\u2028\u2029]/g, '\n');

  // 6. Collapse repeated horizontal whitespace (spaces & tabs) INSIDE a line to a single space
  text = text.replace(/[^\S\n]+/g, ' ');

  // 7. Remove trailing spaces from individual lines
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // 8. Clamp runs of 3+ blank lines to 2 (max 3 consecutive \n = 2 blank lines)
  text = text.replace(/\n{4,}/g, '\n\n\n');

  // 9. Final trim (strips leading and trailing empty lines from whole document)
  return text.trim();
}

/**
 * Detects whether a single line is a standalone scene break.
 * Consists solely of divider/ornament symbols and spaces:
 * e.g., ***, ****, * * *, ---, ___, •••, ❖, ✦, ~~~, etc.
 * Lines containing alphanumeric words alongside these symbols are NOT scene breaks.
 */
export function isSceneBreakLine(line: string | null | undefined): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Single decorative glyphs
  if (/^[❖✦◆■★☆]$/.test(trimmed)) {
    return true;
  }

  // Standalone divider lines made of ornament symbols and spaces
  // Symbols allowed: * _ - ~ • = ═ # ─ ━
  const sceneCharsOnly = /^[\s*_\-~•❖✦◆■★☆=═#─━]+$/;
  if (!sceneCharsOnly.test(trimmed)) {
    return false;
  }

  // Count non-whitespace characters (at least 2 symbols)
  const symbolCount = trimmed.replace(/\s/g, '').length;
  return symbolCount >= 2;
}

/**
 * Opt-in tool to join mid-sentence broken lines (e.g. text copied from hard-wrapped PDFs or text files).
 * Joins consecutive non-empty lines unless:
 * - The previous line ends with sentence-ending punctuation: ۔, ؟, !, ", ”, ', ’, », or )
 * - The current line is a heading or scene break.
 * Blank lines (paragraph breaks) are strictly preserved.
 */
export function joinBrokenLines(text: string | null | undefined): string {
  if (!text) return '';

  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[\r\u2028\u2029]/g, '\n');

  const lines = normalized.split('\n');
  const result: string[] = [];
  let buffer = '';

  const isHeading = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (
      /^(?:باب|قسط|فصل)(?:\s+(?:نمبر)?)?\s*([0-9۰-۹ایک|دو|تین|چار|پانچ|چھ|سات|آٹھ|نو|دس|گیارہ|بارہ|پہلا|دوسرا|تیسرا|چوتھا|پانچواں|چھٹا|ساتواں|آٹھواں|نواں|دسواں|اول|دوم|سوم|چہارم]+)?\s*[:\-\.\–]?/i.test(
        trimmed
      )
    ) {
      return true;
    }
    if (/^(?:chapter|part|episode)\s+[0-9ivxlcdm]+/i.test(trimmed)) return true;
    return false;
  };

  const endsWithSentencePunctuation = (line: string): boolean => {
    const trimmed = line.trim();
    return /[۔؟!\"”\'’»\)]$/.test(trimmed);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      if (buffer.length > 0) {
        result.push(buffer);
        buffer = '';
      }
      result.push('');
      continue;
    }

    if (isSceneBreakLine(trimmed) || isHeading(trimmed)) {
      if (buffer.length > 0) {
        result.push(buffer);
        buffer = '';
      }
      result.push(trimmed);
      continue;
    }

    if (buffer === '') {
      buffer = trimmed;
    } else {
      if (endsWithSentencePunctuation(buffer)) {
        result.push(buffer);
        buffer = trimmed;
      } else {
        buffer = `${buffer} ${trimmed}`;
      }
    }
  }

  if (buffer.length > 0) {
    result.push(buffer);
  }

  return result.join('\n');
}

/**
 * Counts total lines and non-empty paragraph blocks in text.
 */
export function countLinesAndParagraphs(text: string | null | undefined): {
  lines: number;
  paragraphs: number;
} {
  if (!text || text.trim() === '') {
    return { lines: 0, paragraphs: 0 };
  }
  const lines = text.split('\n').length;
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !isSceneBreakLine(p)).length;
  return { lines, paragraphs };
}

/**
 * Calculates accurate Urdu word count based on whitespace-separated tokens.
 */
export function countUrduWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Converts Western digits (0-9) to Urdu digits (۰-۹)
 */
export function toUrduDigits(num: number | string): string {
  const str = String(num);
  const westernToUrdu: Record<string, string> = {
    '0': '۰',
    '1': '۱',
    '2': '۲',
    '3': '۳',
    '4': '۴',
    '5': '۵',
    '6': '۶',
    '7': '۷',
    '8': '۸',
    '9': '۹',
  };
  return str.replace(/[0-9]/g, (d) => westernToUrdu[d] || d);
}
