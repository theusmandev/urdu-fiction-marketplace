import mammoth from 'mammoth';
import {
  cleanUrduText,
  countUrduWords,
  toUrduDigits,
  type CleanUrduOptions,
} from './clean-urdu.ts';

export interface ChapterPreview {
  chapter_number: number;
  title_urdu: string;
  content_urdu: string;
  word_count: number;
  char_count: number;
  is_valid_length: boolean;
}

export const MAX_CHAPTER_CHARACTERS = 120000;

// Patterns for detecting chapter beginnings
const CHAPTER_HEADING_PATTERNS = [
  // Urdu headings: باب 1, قسط نمبر 2, فصل اول, وغیرہ
  /^(?:باب|قسط|فصل)(?:\s+(?:نمبر)?)?\s*([0-9۰-۹ایک|دو|تین|چار|پانچ|چھ|سات|آٹھ|نو|دس|گیارہ|بارہ|پہلا|دوسرا|تیسرا|چوتھا|پانچواں|چھٹا|ساتواں|آٹھواں|نواں|دسواں|اول|دوم|سوم|چہارم]+)?\s*[:\-\.\–]?\s*(.*)$/i,
  // Markdown headings: # باب 1 or # Chapter 1
  /^#{1,3}\s+(.+)$/,
  // English headings: Chapter 1, Episode 2
  /^(?:chapter|episode|part)\s+([0-9ivxlcdm]+)?\s*[:\-\.\–]?\s*(.*)$/i,
  // Explicit dividers: --- باب اول --- or *** Chapter 1 ***
  /^[-=*]{3,}\s*(.+?)\s*[-=*]{3,}$/,
];

function isHeadingLine(line: string): { isHeading: boolean; headingTitle: string } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 150) {
    return { isHeading: false, headingTitle: '' };
  }

  for (const pattern of CHAPTER_HEADING_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { isHeading: true, headingTitle: trimmed.replace(/^#{1,3}\s*/, '').replace(/^[-=*]{3,}|[-=*]{3,}$/g, '').trim() };
    }
  }

  return { isHeading: false, headingTitle: '' };
}

/**
 * Extracts raw text from an uploaded manuscript buffer (.docx or .txt).
 * Does NOT persist the original file to disk or storage.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.docx') || (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    // DOCX format via mammoth
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  // Plain text (UTF-8)
  return buffer.toString('utf-8');
}

/**
 * Parses raw manuscript text and splits it into discrete chapters based on headings.
 * Safe by default: does NOT normalize Arabic letter forms unless explicitly requested.
 */
export function splitManuscriptIntoChapters(
  rawText: string,
  options?: CleanUrduOptions
): ChapterPreview[] {
  const cleaned = cleanUrduText(rawText, options);
  if (!cleaned) return [];

  const lines = cleaned.split('\n');
  const chapters: ChapterPreview[] = [];

  let currentHeading = '';
  let currentBodyLines: string[] = [];
  let chapterIndex = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { isHeading, headingTitle } = isHeadingLine(line);

    if (isHeading) {
      // If we already accumulated text from a previous chapter, commit it
      if (currentBodyLines.length > 0 || currentHeading) {
        const content = currentBodyLines.join('\n').trim();
        if (content.length > 0) {
          const title = currentHeading || `باب ${toUrduDigits(chapterIndex)}`;
          chapters.push({
            chapter_number: chapterIndex,
            title_urdu: title,
            content_urdu: content,
            word_count: countUrduWords(content),
            char_count: content.length,
            is_valid_length: content.length <= MAX_CHAPTER_CHARACTERS,
          });
          chapterIndex++;
        }
      }

      currentHeading = headingTitle;
      currentBodyLines = [];
    } else {
      currentBodyLines.push(line);
    }
  }

  // Commit trailing chapter
  const trailingContent = currentBodyLines.join('\n').trim();
  if (trailingContent.length > 0) {
    const title = currentHeading || `باب ${toUrduDigits(chapterIndex)}`;
    chapters.push({
      chapter_number: chapterIndex,
      title_urdu: title,
      content_urdu: trailingContent,
      word_count: countUrduWords(trailingContent),
      char_count: trailingContent.length,
      is_valid_length: trailingContent.length <= MAX_CHAPTER_CHARACTERS,
    });
  }

  // If no chapter headings were detected at all, return the entire text as Chapter 1
  if (chapters.length === 0 && cleaned.length > 0) {
    chapters.push({
      chapter_number: 1,
      title_urdu: 'باب ۱',
      content_urdu: cleaned,
      word_count: countUrduWords(cleaned),
      char_count: cleaned.length,
      is_valid_length: cleaned.length <= MAX_CHAPTER_CHARACTERS,
    });
  }

  return chapters;
}
