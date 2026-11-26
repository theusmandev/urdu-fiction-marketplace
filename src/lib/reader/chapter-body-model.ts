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
  readerFont?: 'gulzar' | 'noori';
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

export const fontSizeBaseRem: Record<ReaderFontSize, string> = {
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
};

export const fontSizeClasses: Record<ReaderFontSize, string> = {
  sm: '[--reader-base-font-size:0.875rem] text-sm',
  base: '[--reader-base-font-size:1rem] text-base',
  lg: '[--reader-base-font-size:1.125rem] text-lg',
  xl: '[--reader-base-font-size:1.25rem] text-xl',
  '2xl': '[--reader-base-font-size:1.5rem] text-2xl',
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
  const readerFont = options?.readerFont ?? 'gulzar';
  const isNoori = readerFont === 'noori';

  if (blocks.length === 0) {
    const emptyClass = isNoori
      ? 'reader-canvas text-center py-12 [padding-inline:0.85em] py-2.5 text-current/50 select-none text-base'
      : 'font-urdu text-center py-12 [padding-inline:0.5em] text-current/50 select-none text-base';
    return `<div dir="rtl" lang="ur" data-reader-font="${readerFont}" class="${emptyClass}">کوئی متن موجود نہیں۔</div>`;
  }

  const fontSize = options?.fontSize ?? 'lg';
  const baseSize = fontSizeBaseRem[fontSize] || '1.125rem';
  const lineHeight = options?.lineHeight ?? 'relaxed';
  const paragraphSpacing = options?.paragraphSpacing ?? 'normal';
  const userSelect = options?.userSelect ?? 'text';

  const fontAndPaddingClass = isNoori
    ? 'reader-canvas transition-all duration-150 [padding-inline:0.85em] py-2.5'
    : 'font-urdu transition-all duration-150 [padding-inline:0.5em] py-1.5';

  const containerClasses = [
    fontAndPaddingClass,
    fontSizeClasses[fontSize],
    lineHeightClasses[lineHeight],
    userSelect === 'none' ? 'select-none' : 'select-text',
    options?.className || '',
  ]
    .filter(Boolean)
    .join(' ');

  const htmlParts: string[] = [
    `<div dir="rtl" lang="ur" data-reader-font="${readerFont}" style="--reader-base-font-size: ${baseSize};" class="${containerClasses}">`,
  ];

  for (const block of blocks) {
    if (block.type === 'scene-break') {
      const extraClass = block.hasExtraTopGap ? ` ${extraGapClasses[paragraphSpacing]}` : '';
      htmlParts.push(
        `<div role="separator" aria-label="منظر کا وقفہ" class="flex items-center justify-center gap-2.5 my-7 text-current/35 select-none pointer-events-none${extraClass}"><span class="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span><span class="w-2 h-2 rounded-full bg-current opacity-90"></span><span class="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span></div>`
      );
    } else {
      const pClasses = [
        'text-justify antialiased [font-synthesis:none] text-current/90',
        '[font-size:calc(var(--reader-base-font-size,1.125rem)*var(--reader-font-scale,1))]',
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
