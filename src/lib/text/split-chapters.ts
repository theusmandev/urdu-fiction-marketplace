import {
  countUrduWords,
  toUrduDigits,
} from './clean-urdu.ts';

export const HARD_MAX_CHAPTER_CHARACTERS = 120000;
export const DEFAULT_TARGET_WORDS = 6000;
export const MIN_CHAPTER_WORDS = 300;
export const MAX_TARGET_WORDS = 8000;
export const MIN_TARGET_WORDS = 2000;

export interface ParagraphItem {
  index: number; // 0-indexed paragraph
  lineStart: number; // 1-indexed line number in full text
  lineEnd: number; // 1-indexed line number in full text
  text: string;
  wordCount: number;
  charCount: number;
  isHeadingCandidate: boolean;
  isSceneBreak: boolean;
  isFrontMatter: boolean;
  isEndNote: boolean;
}

export interface BlockRange {
  text: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

export interface ManuscriptAnalysis {
  paragraphs: ParagraphItem[];
  allLines: string[];
  frontMatter: BlockRange | null;
  endNote: BlockRange | null;
  headingCandidates: {
    lineIndex: number;
    lineNumber: number;
    text: string;
  }[];
  sceneBreaks: {
    lineIndex: number;
    lineNumber: number;
    text: string;
  }[];
  totalWords: number;
  totalChars: number;
}

export interface SplitPart {
  number: number;
  title: string;
  content: string;
  wordCount: number;
  charCount: number;
  firstLine: string;
  lastLine: string;
  isFreePreview: boolean;
  isPublished: boolean;
}

export interface BuildPartsOptions {
  rawParts: { content: string; title?: string }[];
  baseTitle?: string;
  titleStyle?: 'urdu' | 'english';
  startChapterNumber?: number;
  firstPartIsFreePreview?: boolean;
  frontMatterRemoved?: string;
  endNoteRemoved?: string;
  originalText: string;
}

export interface BuildPartsResult {
  parts: SplitPart[];
  textPreserved: boolean;
  originalNormalizedLength: number;
  preservedNormalizedLength: number;
  warnings: string[];
}

/**
 * Normalizes text strictly for lossless preservation verification.
 * Only standardizes whitespace so spacing anomalies don't produce false negatives,
 * while ensuring all actual characters and words are 100% preserved.
 */
export function normalizeForPreservation(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * Escapes special regex characters in user-provided string to prevent regex injection.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Scene break marker regex: ***, ---, ___, •••, ❖, etc.
const SCENE_BREAK_PATTERN = /^\s*(?:[*_\-•❖#=~]{3,}|[*•❖\s]{4,}|[-=*~_\s]{4,})\s*$/;

// Common structural Urdu and English heading keywords
const HEADING_KEYWORDS = [
  'باب',
  'قسط',
  'فصل',
  'حصہ',
  'شمارہ',
  'ایپیسوڈ',
  'منظر',
  'chapter',
  'episode',
  'part',
  'act',
  'scene',
];

// Indicators of end-notes, promotions, or closing announcements
const END_NOTE_PATTERNS = [
  /اختتام(?:\s+پذیر)?/i,
  /ختم\s*ش[دہ]/i,
  /جاری\s+ہے/i,
  /باقی\s+آئندہ/i,
  /اگلی\s+قسط/i,
  /رائے\s+کا\s+انتظار/i,
  /دعاؤں\s+میں\s+یاد/i,
  /شمارہ\s+ختم/i,
  /قسط.*اختتام/i,
  /facebook|whatsapp|telegram|instagram|youtube|tiktok/i,
];

// Indicators of front-matter / attribution
const FRONT_MATTER_PATTERNS = [
  /از\s*قلم\s*[:\-\s]/i,
  /تحریر\s*[:\-\s]/i,
  /مصنف[ہ|ہ]?\s*[:\-\s]/i,
  /ناول\s*[:\-\s]/i,
  /انتساب\s*[:\-\s]/i,
  /پیش\s*لفظ/i,
  /مقدمہ/i,
  /author\s*[:\-\s]/i,
  /written\s+by/i,
  /dedicated\s+to/i,
];

/**
 * Pure analysis function inspecting manuscript lines and paragraphs.
 * Detects front-matter header, end-note footer, heading candidates, and scene breaks.
 */
export function analyzeManuscript(text: string): ManuscriptAnalysis {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = normalized.split('\n');
  const totalLines = allLines.length;

  const sceneBreaks: { lineIndex: number; lineNumber: number; text: string }[] = [];
  const headingCandidates: { lineIndex: number; lineNumber: number; text: string }[] = [];

  // 1. Identify Scene Breaks
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (line.length > 0 && SCENE_BREAK_PATTERN.test(line)) {
      sceneBreaks.push({
        lineIndex: i,
        lineNumber: i + 1,
        text: line,
      });
    }
  }

  // 2. Identify Front-Matter Candidates at top of file (first 25 lines)
  let frontMatterEndLine = -1;
  const maxFrontMatterScan = Math.min(25, allLines.length);

  for (let i = 0; i < maxFrontMatterScan; i++) {
    const line = allLines[i].trim();
    if (!line) continue;

    // Stop front-matter if line starts with a chapter heading or is very long
    const isHeading = HEADING_KEYWORDS.some((kw) => line.toLowerCase().startsWith(kw));
    if (isHeading || line.length > 200) {
      break;
    }

    // Check if line contains known attribution / front-matter terms
    const matchesFrontMatter = FRONT_MATTER_PATTERNS.some((p) => p.test(line));
    if (matchesFrontMatter) {
      frontMatterEndLine = i;
    } else if (frontMatterEndLine !== -1 && line.length < 80) {
      // Short line closely following an attribution line (e.g. title or dedication subtitle)
      frontMatterEndLine = i;
    }
  }

  // Build Front-Matter Block if found
  let frontMatter: BlockRange | null = null;
  if (frontMatterEndLine >= 0) {
    const fmLines = allLines.slice(0, frontMatterEndLine + 1);
    const fmText = fmLines.join('\n').trim();
    if (fmText.length > 0) {
      frontMatter = {
        text: fmText,
        startLine: 1,
        endLine: frontMatterEndLine + 1,
        lines: fmLines,
      };
    }
  }

  // 3. Identify End-Note Candidates near end of file (last 15% or last 40 lines)
  let endNoteStartLine = -1;
  const endScanStart = Math.max(0, Math.floor(allLines.length * 0.85), allLines.length - 40);

  for (let i = allLines.length - 1; i >= endScanStart; i--) {
    const line = allLines[i].trim();
    if (!line) continue;

    const matchesEndNote = END_NOTE_PATTERNS.some((p) => p.test(line));
    if (matchesEndNote) {
      endNoteStartLine = i;
    } else if (endNoteStartLine !== -1 && line.length < 100) {
      // Contiguous short lines surrounding end announcements
      endNoteStartLine = i;
    } else if (endNoteStartLine !== -1 && line.length > 200) {
      // Long narrative paragraph precedes the end note
      break;
    }
  }

  // Build End-Note Block if found
  let endNote: BlockRange | null = null;
  if (endNoteStartLine >= 0 && endNoteStartLine > (frontMatterEndLine >= 0 ? frontMatterEndLine : 0)) {
    const endLines = allLines.slice(endNoteStartLine);
    const enText = endLines.join('\n').trim();
    if (enText.length > 0) {
      endNote = {
        text: enText,
        startLine: endNoteStartLine + 1,
        endLine: allLines.length,
        lines: endLines,
      };
    }
  }

  // 4. Identify Heading Candidates
  // Rules from user specification:
  // - Short lines under ~60 chars
  // - No sentence-ending punctuation (۔, !, ؟)
  // - Followed by a body paragraph
  // - Not in the last 15% of the file
  // - Not containing اختتام / ختم / جاری / آئندہ / اگلی
  // - Exclude lines that are part of front-matter or end-note
  const headingCutoffLine = Math.floor(totalLines * 0.85);

  for (let i = 0; i < totalLines; i++) {
    // Skip if within front matter or end note
    if (frontMatter && i <= frontMatter.endLine - 1) continue;
    if (endNote && i >= endNote.startLine - 1) continue;
    if (i >= headingCutoffLine) continue;

    const line = allLines[i].trim();
    if (line.length === 0 || line.length > 60) continue;

    // Check sentence ending punctuation
    if (/[۔؟!?!.]$/.test(line)) continue;

    // Check forbidden end-note keywords
    if (/اختتام|ختم|جاری|آئندہ|اگلی/i.test(line)) continue;

    // Must not be a scene break line (***, ---)
    if (SCENE_BREAK_PATTERN.test(line)) continue;

    // Must be followed by a body line within the next 3 lines
    let hasFollowingBody = false;
    for (let next = i + 1; next < Math.min(totalLines, i + 4); next++) {
      const nextLine = allLines[next].trim();
      if (nextLine.length > 0) {
        hasFollowingBody = true;
        break;
      }
    }

    if (!hasFollowingBody) continue;

    // Matches if it contains a heading keyword OR is a clean standalone short title line
    const hasKeyword = HEADING_KEYWORDS.some((kw) => line.toLowerCase().includes(kw));
    const isMarkdownHeading = /^#{1,3}\s+/.test(line);

    if (hasKeyword || isMarkdownHeading || line.length < 40) {
      headingCandidates.push({
        lineIndex: i,
        lineNumber: i + 1,
        text: line.replace(/^#{1,3}\s+/, '').trim(),
      });
    }
  }

  // 5. Build Parsed Paragraphs
  const paragraphs: ParagraphItem[] = [];
  let currentParaLines: string[] = [];
  let currentStartLine = 1;

  for (let i = 0; i < allLines.length; i++) {
    const rawLine = allLines[i];
    const isBlank = rawLine.trim().length === 0;

    if (isBlank) {
      if (currentParaLines.length > 0) {
        const paraText = currentParaLines.join('\n').trim();
        if (paraText.length > 0) {
          const paraIndex = paragraphs.length;
          const lineStart = currentStartLine;
          const lineEnd = i;
          const isSceneBreak = SCENE_BREAK_PATTERN.test(paraText);
          const isFrontMatter = Boolean(frontMatter && lineStart >= frontMatter.startLine && lineEnd <= frontMatter.endLine);
          const isEndNote = Boolean(endNote && lineStart >= endNote.startLine);
          const isHeadingCandidate = headingCandidates.some((h) => h.lineNumber >= lineStart && h.lineNumber <= lineEnd);

          paragraphs.push({
            index: paraIndex,
            lineStart,
            lineEnd,
            text: paraText,
            wordCount: countUrduWords(paraText),
            charCount: paraText.length,
            isHeadingCandidate,
            isSceneBreak,
            isFrontMatter,
            isEndNote,
          });
        }
        currentParaLines = [];
      }
      currentStartLine = i + 2;
    } else {
      if (currentParaLines.length === 0) {
        currentStartLine = i + 1;
      }
      currentParaLines.push(rawLine);
    }
  }

  // Commit trailing paragraph
  if (currentParaLines.length > 0) {
    const paraText = currentParaLines.join('\n').trim();
    if (paraText.length > 0) {
      const paraIndex = paragraphs.length;
      const lineStart = currentStartLine;
      const lineEnd = allLines.length;
      const isSceneBreak = SCENE_BREAK_PATTERN.test(paraText);
      const isFrontMatter = Boolean(frontMatter && lineStart >= frontMatter.startLine && lineEnd <= frontMatter.endLine);
      const isEndNote = Boolean(endNote && lineStart >= endNote.startLine);
      const isHeadingCandidate = headingCandidates.some((h) => h.lineNumber >= lineStart && h.lineNumber <= lineEnd);

      paragraphs.push({
        index: paraIndex,
        lineStart,
        lineEnd,
        text: paraText,
        wordCount: countUrduWords(paraText),
        charCount: paraText.length,
        isHeadingCandidate,
        isSceneBreak,
        isFrontMatter,
        isEndNote,
      });
    }
  }

  const totalWords = countUrduWords(normalized);
  const totalChars = normalized.length;

  return {
    paragraphs,
    allLines,
    frontMatter,
    endNote,
    headingCandidates,
    sceneBreaks,
    totalWords,
    totalChars,
  };
}

/**
 * Derives a reusable pattern from a line the writer clicked (e.g. "باب نمبر پانچ" or "قسط ۱").
 * Identifies shared prefix, digit system (Arabic-Indic, Urdu-Persian, Latin or Urdu number words),
 * optional separators, and safely returns all matching 1-indexed line numbers.
 * No regex injection: all literals are escaped.
 */
export function derivePatternFromExample(
  exampleLine: string,
  allLines: string[]
): {
  patternDescription: string;
  matchingLineNumbers: number[];
} {
  const trimmed = exampleLine.trim();
  if (!trimmed) {
    return { patternDescription: '', matchingLineNumbers: [] };
  }

  // Common Urdu number words
  const urduNumberWords = [
    'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو', 'دس',
    'گیارہ', 'بارہ', 'تیرہ', 'چودہ', 'پندرہ', 'سولہ', 'سترہ', 'اٹھارہ', 'انیس', 'بیس',
    'اکیس', 'بائیس', 'تیئس', 'چوبیس', 'پچیس', 'چھبیس', 'ستائیس', 'اٹھائیس', 'انتیس', 'تیس',
    'اکتیس', 'بتیس', 'تینتیس', 'چونتیس', 'پینتیس', 'چھتیس', 'سینتیس', 'اڑتیس', 'انتالیس', 'چالیس',
    'پچاس', 'ساٹھ', 'ستر', 'اسی', 'نوے', 'سو',
    'پہلا', 'پہلی', 'دوسرا', 'دوسری', 'تیسرا', 'تیسری', 'چوتھا', 'چوتھی', 'پانچواں', 'پانچویں',
    'چھٹا', 'چھٹی', 'ساتواں', 'ساتویں', 'آٹھواں', 'آٹھویں', 'نواں', 'نویں', 'دسواں', 'دسویں',
    'اول', 'دوم', 'سوم', 'چہارم', 'پنجم', 'ششم', 'ہفتم', 'ہشتم', 'نہم', 'دہم',
  ];

  const numberPattern = `(?:[0-9]+|[۰-۹]+|[ivxlcdm]+|${urduNumberWords.map(escapeRegex).join('|')})`;

  // Check if example line starts with or contains a structural keyword
  let matchedKeyword = '';
  for (const kw of HEADING_KEYWORDS) {
    const reg = new RegExp(`(?:^|[\\s#*\\-_])${escapeRegex(kw)}(?:[\\s:،\\-–]|\$)`, 'i');
    if (reg.test(trimmed)) {
      matchedKeyword = kw;
      break;
    }
  }

  let regex: RegExp;
  let patternDescription = '';

  if (matchedKeyword) {
    const kwEscaped = escapeRegex(matchedKeyword);
    // Regex matches: optional markdown '#' / symbols, keyword, optional 'نمبر', optional number, optional separators
    regex = new RegExp(
      `^\\s*(?:#{1,3}\\s*)?${kwEscaped}(?:\\s+نمبر)?(?:\\s+${numberPattern})?(?:\\s*[:\\-–—،.]\\s*.*|\\s*$)`,
      'i'
    );
    patternDescription = `Lines matching "${matchedKeyword} [نمبر] [1..9/Urdu]"`;
  } else {
    // If no standard keyword, use the text prefix before any digits or colon
    const prefixMatch = trimmed.match(/^([^0-9۰-۹:–\-_#]+)/);
    const prefix = prefixMatch ? prefixMatch[1].trim() : trimmed.slice(0, 15).trim();
    const prefixEscaped = escapeRegex(prefix);
    regex = new RegExp(`^\\s*(?:#{1,3}\\s*)?${prefixEscaped}(?:\\s+${numberPattern})?(?:\\s*[:\\-–—،.]\\s*.*|\\s*$)`, 'i');
    patternDescription = `Lines starting with "${prefix}"`;
  }

  const matchingLineNumbers: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (line.length > 0 && regex.test(line)) {
      matchingLineNumbers.push(i + 1);
    }
  }

  return {
    patternDescription,
    matchingLineNumbers,
  };
}

/**
 * Splits text into parts by target word size.
 * Rules:
 * - Prioritize scene breaks (***, ---) nearest the target
 * - Then paragraph boundaries (\n\n)
 * - Then Urdu sentence ends (۔, ؟, !)
 * - NEVER split inside sentences or quotations unless strictly necessary for hard limit
 * - No part under minWords (300 words), merges into neighbor
 * - No part over hardMaxChars (120,000 characters)
 * - Deterministic output
 */
export function splitBySize(
  text: string,
  options: {
    targetWords?: number;
    minWords?: number;
    hardMaxChars?: number;
    prioritizeSceneBreaks?: boolean;
  } = {}
): string[] {
  const targetWords = options.targetWords !== undefined ? options.targetWords : DEFAULT_TARGET_WORDS;
  const minWords = options.minWords ?? MIN_CHAPTER_WORDS;
  const hardMaxChars = options.hardMaxChars ?? HARD_MAX_CHAPTER_CHARACTERS;
  const prioritizeSceneBreaks = options.prioritizeSceneBreaks ?? true;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const totalWords = countUrduWords(normalized);

  // If text is already under or close to target words and within character limits, return as single part
  if (totalWords <= targetWords && normalized.length <= hardMaxChars) {
    return [normalized];
  }

  // Decompose into paragraph chunks
  const rawParagraphs = normalized.split(/\n\s*\n/);
  const paragraphs = rawParagraphs.map((p) => p.trim()).filter((p) => p.length > 0);

  if (paragraphs.length <= 1) {
    // Single massive block: split by sentences
    return splitContinuousText(normalized, targetWords, minWords, hardMaxChars);
  }

  const parts: string[] = [];
  let currentChunkParas: string[] = [];
  let currentChunkWords = 0;
  let currentChunkChars = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraWords = countUrduWords(para);
    const paraChars = para.length;

    // Check if adding this paragraph would breach hard max characters
    const wouldExceedHardMax = currentChunkChars + paraChars + 2 > hardMaxChars;
    // Check if adding this paragraph brings chunk over target
    const exceedsTarget = currentChunkWords + paraWords >= targetWords;
    // Check if paragraph is a scene break
    const isSceneBreak = SCENE_BREAK_PATTERN.test(para);

    // Decision to split:
    // 1. If currently accumulated enough words (>= targetWords)
    // 2. OR if scene break reached and accumulated >= targetWords * 0.75
    // 3. OR if hard limit would be breached
    const shouldSplitAtSceneBreak =
      prioritizeSceneBreaks &&
      isSceneBreak &&
      currentChunkWords >= Math.floor(targetWords * 0.75);

    if (
      (shouldSplitAtSceneBreak || exceedsTarget || wouldExceedHardMax) &&
      currentChunkWords >= minWords
    ) {
      if (shouldSplitAtSceneBreak) {
        // Keep scene break at boundary so text is 100% preserved
        currentChunkParas.push(para);
        const committedText = currentChunkParas.join('\n\n').trim();
        if (committedText) parts.push(committedText);
        currentChunkParas = [];
        currentChunkWords = 0;
        currentChunkChars = 0;
        continue;
      }

      // Normal paragraph split
      const committedText = currentChunkParas.join('\n\n').trim();
      if (committedText) parts.push(committedText);
      currentChunkParas = [para];
      currentChunkWords = paraWords;
      currentChunkChars = paraChars;
    } else {
      currentChunkParas.push(para);
      currentChunkWords += paraWords;
      currentChunkChars += paraChars + 2; // account for \n\n
    }
  }

  // Commit remaining chunk
  if (currentChunkParas.length > 0) {
    const trailingText = currentChunkParas.join('\n\n').trim();
    if (trailingText) {
      // If trailing chunk is very small (< minWords) and we have previous parts, merge with previous
      const trailingWords = countUrduWords(trailingText);
      if (
        trailingWords < minWords &&
        parts.length > 0 &&
        parts[parts.length - 1].length + trailingText.length + 2 <= hardMaxChars
      ) {
        parts[parts.length - 1] = `${parts[parts.length - 1]}\n\n${trailingText}`;
      } else {
        parts.push(trailingText);
      }
    }
  }

  // Safety pass: verify no individual part exceeds hardMaxChars
  const finalParts: string[] = [];
  for (const part of parts) {
    if (part.length <= hardMaxChars) {
      finalParts.push(part);
    } else {
      // Emergency sentence split
      const subParts = splitContinuousText(part, targetWords, minWords, hardMaxChars);
      finalParts.push(...subParts);
    }
  }

  return finalParts;
}

/**
 * Splits continuous or oversized Urdu text without paragraph breaks
 * by sentence-ending punctuation (۔, ؟, !).
 */
export function splitContinuousText(
  text: string,
  targetWords: number,
  minWords: number,
  hardMaxChars: number
): string[] {
  // Regex to split on sentence ends: Urdu full stop (۔), Arabic question mark (؟), exclamation (!), period (.)
  // Keeps the delimiter with the preceding sentence
  const sentenceMatches = text.match(/[^۔؟!?.!]+[۔؟!?.!]*/g) || [text];
  const parts: string[] = [];
  let currentSentences: string[] = [];
  let currentWords = 0;
  let currentChars = 0;

  for (const sentence of sentenceMatches) {
    const sWords = countUrduWords(sentence);
    const sChars = sentence.length;

    const wouldExceedHardMax = currentChars + sChars > hardMaxChars;
    const reachesTarget = currentWords + sWords >= targetWords;

    if ((reachesTarget || wouldExceedHardMax) && currentWords >= minWords) {
      const chunk = currentSentences.join('').trim();
      if (chunk) parts.push(chunk);
      currentSentences = [sentence];
      currentWords = sWords;
      currentChars = sChars;
    } else {
      currentSentences.push(sentence);
      currentWords += sWords;
      currentChars += sChars;
    }
  }

  if (currentSentences.length > 0) {
    const trailing = currentSentences.join('').trim();
    if (
      countUrduWords(trailing) < minWords &&
      parts.length > 0 &&
      parts[parts.length - 1].length + trailing.length <= hardMaxChars
    ) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} ${trailing}`;
    } else {
      parts.push(trailing);
    }
  }

  return parts;
}

/**
 * Splits text at 1-indexed line numbers selected as split points.
 */
export function splitAtMarkers(text: string, splitLineNumbers: number[]): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const allLines = normalized.split('\n');

  if (splitLineNumbers.length === 0) {
    return [normalized.trim()];
  }

  const sortedPoints = Array.from(new Set(splitLineNumbers))
    .filter((lineNum) => lineNum > 1 && lineNum <= allLines.length)
    .sort((a, b) => a - b);

  if (sortedPoints.length === 0) {
    return [normalized.trim()];
  }

  const parts: string[] = [];
  let previousIndex = 0;

  for (const splitLine of sortedPoints) {
    const lineIndex = splitLine - 1; // Convert 1-indexed to 0-indexed
    const slice = allLines.slice(previousIndex, lineIndex).join('\n').trim();
    if (slice) parts.push(slice);
    previousIndex = lineIndex;
  }

  // Commit last slice
  const lastSlice = allLines.slice(previousIndex).join('\n').trim();
  if (lastSlice) parts.push(lastSlice);

  return parts;
}

/**
 * Formats a sequence number into an Urdu calligraphic part name:
 * حصہ ۱, حصہ ۲, ...
 */
export function formatPartTitle(
  partIndex: number,
  baseTitle?: string,
  style: 'urdu' | 'english' = 'urdu'
): string {
  const partNumber = partIndex + 1;
  const partSuffix =
    style === 'english'
      ? `(Part ${partNumber})`
      : `حصہ ${toUrduDigits(partNumber)}`;

  if (baseTitle && baseTitle.trim().length > 0) {
    const cleanedBase = baseTitle.trim().replace(/\s*[-–—]\s*حصہ\s*[0-9۰-۹]+$/i, '').trim();
    return `${cleanedBase} — ${partSuffix}`;
  }

  return partSuffix;
}

/**
 * Builds final validated chapters from raw parts, verifying lossless text preservation.
 */
export function buildParts(options: BuildPartsOptions): BuildPartsResult {
  const {
    rawParts,
    baseTitle = '',
    titleStyle = 'urdu',
    startChapterNumber = 1,
    firstPartIsFreePreview = false,
    frontMatterRemoved,
    endNoteRemoved,
    originalText,
  } = options;

  const warnings: string[] = [];
  const parts: SplitPart[] = [];

  for (let i = 0; i < rawParts.length; i++) {
    const raw = rawParts[i];
    const content = raw.content.trim();
    const wordCount = countUrduWords(content);
    const charCount = content.length;

    // First and last lines for previewing
    const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const firstLine = lines.length > 0 ? (lines[0].length > 70 ? `${lines[0].slice(0, 67)}...` : lines[0]) : '';
    const lastLine = lines.length > 0 ? (lines[lines.length - 1].length > 70 ? `${lines[lines.length - 1].slice(0, 67)}...` : lines[lines.length - 1]) : '';

    const defaultTitle = formatPartTitle(i, baseTitle, titleStyle);
    const title = raw.title?.trim() || defaultTitle;

    // Warnings
    if (wordCount < MIN_CHAPTER_WORDS) {
      warnings.push(`Chapter #${startChapterNumber + i} "${title}" has only ${wordCount} words (under ${MIN_CHAPTER_WORDS} words). Consider merging it.`);
    }
    if (wordCount > MAX_TARGET_WORDS) {
      warnings.push(`Chapter #${startChapterNumber + i} "${title}" has ${wordCount.toLocaleString()} words (over ${MAX_TARGET_WORDS} words). Consider splitting further.`);
    }
    if (charCount > HARD_MAX_CHAPTER_CHARACTERS) {
      warnings.push(`Chapter #${startChapterNumber + i} "${title}" exceeds the 120,000 character limit (${charCount.toLocaleString()} chars). Save will be blocked until split.`);
    }

    parts.push({
      number: startChapterNumber + i,
      title,
      content,
      wordCount,
      charCount,
      firstLine,
      lastLine,
      // Only part 0 can be free preview if writer explicitly ticked it; all others strictly false
      isFreePreview: i === 0 ? Boolean(firstPartIsFreePreview) : false,
      isPublished: false, // Imported/split chapters are saved as DRAFT
    });
  }

  // Check duplicate titles
  const titleSet = new Set<string>();
  for (const part of parts) {
    if (titleSet.has(part.title)) {
      warnings.push(`Duplicate chapter title detected: "${part.title}". Please ensure chapter titles are distinct.`);
    }
    titleSet.add(part.title);
  }

  // Preservation check:
  // (concatenation of parts) + (removed front matter) + (removed end note) must equal original text after whitespace normalisation
  const reconstructed = [
    frontMatterRemoved?.trim() || '',
    ...parts.map((p) => p.content.trim()),
    endNoteRemoved?.trim() || '',
  ]
    .filter((chunk) => chunk.length > 0)
    .join('\n');

  const normOrig = normalizeForPreservation(originalText);
  const normRecon = normalizeForPreservation(reconstructed);

  const textPreserved = normOrig === normRecon;

  if (!textPreserved) {
    warnings.push('Text preservation mismatch: Some characters or paragraphs differ between original manuscript and output parts.');
  }

  return {
    parts,
    textPreserved,
    originalNormalizedLength: normOrig.length,
    preservedNormalizedLength: normRecon.length,
    warnings,
  };
}
