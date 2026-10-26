import { isSceneBreakLine } from '../text/clean-urdu.ts';
import type {
  ReaderFontSize,
  ReaderLineHeight,
  ReaderParagraphSpacing,
} from './schemas.ts';

export interface ParsedBlock {
  type: 'paragraph' | 'scene-break';
  text?: string;
  hasExtraTopGap: boolean;
}

export interface ChapterBodyRenderOptions {
  fontSize?: ReaderFontSize;
  lineHeight?: ReaderLineHeight;
  paragraphSpacing?: ReaderParagraphSpacing;
  userSelect?: 'none' | 'text';
  className?: string;
  paragraphClassName?: string;
}

/**
 * Parses raw chapter text into discrete semantic blocks:
 * - Normalises \r\n, \r, and Unicode paragraph/line separators to standard \n
 * - Splits into non-empty lines, each becoming its own paragraph
 * - Identifies standalone scene-break lines (***, ****, * * *, ---, ___, •••, ❖, ✦, ~~~)
 * - Identifies runs of 2+ blank lines for larger vertical gap
 */
export function parseChapterContent(rawText: string | null | undefined): ParsedBlock[] {
  if (!rawText) return [];

  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[\r\u2028\u2029]/g, '\n');

  const lines = normalized.split('\n');
  const blocks: ParsedBlock[] = [];
  let consecutiveBlankLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      consecutiveBlankLines++;
      continue;
    }

    const hasExtraTopGap = consecutiveBlankLines >= 2;

    if (isSceneBreakLine(trimmed)) {
      blocks.push({
        type: 'scene-break',
        hasExtraTopGap,
      });
    } else {
      blocks.push({
        type: 'paragraph',
        text: rawLine,
        hasExtraTopGap,
      });
    }

    consecutiveBlankLines = 0;
  }

  return blocks;
}

export const fontSizeClasses: Record<ReaderFontSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

export const lineHeightClasses: Record<ReaderLineHeight, string> = {
  normal: 'leading-[2.2]',
  relaxed: 'leading-[2.6]',
  loose: 'leading-[3.0]',
};

export const paragraphSpacingClasses: Record<ReaderParagraphSpacing, string> = {
  compact: 'mb-3.5',
  normal: 'mb-6',
  wide: 'mb-9',
};

export const extraGapClasses: Record<ReaderParagraphSpacing, string> = {
  compact: 'pt-3',
  normal: 'pt-5',
  wide: 'pt-8',
};

/**
 * Escapes HTML characters to prevent XSS.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders parsed chapter content to an HTML string (useful for testing and SSR).
 */
export function renderChapterBodyToHtml(
  rawText: string | null | undefined,
  options?: ChapterBodyRenderOptions
): string {
  const blocks = parseChapterContent(rawText);
  if (blocks.length === 0) {
    return '<div dir="rtl" lang="ur" class="font-urdu text-center py-12 text-current/50 select-none text-base">کوئی متن موجود نہیں۔</div>';
  }

  const fontSize = options?.fontSize ?? 'lg';
  const lineHeight = options?.lineHeight ?? 'relaxed';
  const paragraphSpacing = options?.paragraphSpacing ?? 'normal';
  const userSelect = options?.userSelect ?? 'text';

  const containerClasses = [
    'font-urdu transition-all duration-150',
    fontSizeClasses[fontSize],
    lineHeightClasses[lineHeight],
    userSelect === 'none' ? 'select-none' : 'select-text',
    options?.className || '',
  ]
    .filter(Boolean)
    .join(' ');

  const htmlParts: string[] = [`<div dir="rtl" lang="ur" class="${containerClasses}">`];

  for (const block of blocks) {
    if (block.type === 'scene-break') {
      const extraClass = block.hasExtraTopGap ? ` ${extraGapClasses[paragraphSpacing]}` : '';
      htmlParts.push(
        `<div role="separator" aria-label="منظر کا وقفہ" class="flex items-center justify-center gap-2.5 my-7 text-current/35 select-none pointer-events-none${extraClass}"><span class="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span><span class="w-2 h-2 rounded-full bg-current opacity-90"></span><span class="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span></div>`
      );
    } else {
      const pClasses = [
        'text-justify antialiased [font-synthesis:none] text-current/90',
        paragraphSpacingClasses[paragraphSpacing],
        block.hasExtraTopGap ? extraGapClasses[paragraphSpacing] : '',
        options?.paragraphClassName || '',
      ]
        .filter(Boolean)
        .join(' ');

      const escapedText = escapeHtml(block.text || '');
      htmlParts.push(`<p dir="rtl" lang="ur" class="${pClasses}">${escapedText}</p>`);
    }
  }

  htmlParts.push('</div>');
  return htmlParts.join('');
}
