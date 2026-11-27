import React from 'react';
import { cn } from '@/lib/utils';
import {
  parseChapterContent,
  fontSizeClasses,
  fontSizeBaseRem,
  lineHeightClasses,
  paragraphSpacingClasses,
  extraGapClasses,
  type ParsedBlock,
  type ChapterBodyRenderOptions,
} from '@/lib/reader/chapter-body-model';
import type {
  ReaderFontSize,
  ReaderLineHeight,
  ReaderParagraphSpacing,
} from '@/lib/reader/schemas';

export { parseChapterContent, type ParsedBlock, type ChapterBodyRenderOptions };

export interface ChapterBodyProps {
  /**
   * The raw Urdu chapter text. Line breaks (\n) and blank lines are strictly preserved.
   */
  text: string;

  /**
   * Font size corresponding to reader preference: 'sm' | 'base' | 'lg' | 'xl' | '2xl'
   * @default 'lg'
   */
  fontSize?: ReaderFontSize;

  /**
   * Line height corresponding to reader preference: 'normal' | 'relaxed' | 'loose'
   * Safe line-heights calibrated for Gulzar Nastaliq and Jameel Noori Nastaleeq calligraphy ascenders and descenders.
   * @default 'normal'
   */
  lineHeight?: ReaderLineHeight;

  /**
   * Reader paragraph spacing preference: 'compact' | 'normal' | 'wide'
   * @default 'compact'
   */
  paragraphSpacing?: ReaderParagraphSpacing;

  /**
   * User select behavior. 'none' for protected reader, 'text' for public/admin preview.
   * @default 'text'
   */
  userSelect?: 'none' | 'text';

  /**
   * Urdu font engine: 'gulzar' | 'noori'
   * @default 'gulzar'
   */
  readerFont?: 'gulzar' | 'noori';

  /**
   * Optional outer container class name.
   */
  className?: string;

  /**
   * Optional additional class applied to each <p> paragraph element.
   */
  paragraphClassName?: string;
}

/**
 * ChapterBody Component
 * 
 * Unified, high-fidelity Urdu novel chapter renderer.
 * Enforces:
 * 1. Every line break typed by writer is preserved: each non-empty line becomes a discrete <p>.
 * 2. 1 blank line = normal paragraph spacing; 2+ blank lines = larger gap.
 * 3. Standalone scene breaks (****, ---, ❖) render as centered ornament dividers.
 * 4. Inline symbols remain literal text.
 * 5. React text escaping prevents XSS (no dangerouslySetInnerHTML).
 * 6. Responsive to reader font size, line-height, and paragraph spacing preferences.
 */
export function ChapterBody({
  text,
  fontSize = 'lg',
  lineHeight = 'normal',
  paragraphSpacing = 'compact',
  userSelect = 'text',
  readerFont = 'gulzar',
  className,
  paragraphClassName,
}: ChapterBodyProps) {
  const blocks = parseChapterContent(text);
  const isNoori = readerFont === 'noori';

  if (blocks.length === 0) {
    return (
      <div
        dir="rtl"
        lang="ur"
        data-reader-font={readerFont}
        style={{
          ['--reader-base-font-size' as string]: fontSizeBaseRem[fontSize] || '1.125rem',
        }}
        className={cn(
          isNoori
            ? 'reader-canvas text-center py-12 [padding-inline:var(--reader-padding-inline,0.6em)] py-2.5 text-current/50 select-none text-base'
            : 'font-urdu text-center py-12 [padding-inline:0.5em] text-current/50 select-none text-base',
          className
        )}
      >
        کوئی متن موجود نہیں۔
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      lang="ur"
      data-reader-font={readerFont}
      style={{
        ['--reader-base-font-size' as string]: fontSizeBaseRem[fontSize] || '1.125rem',
      }}
      className={cn(
        isNoori
          ? 'reader-canvas transition-all duration-150 [padding-inline:var(--reader-padding-inline,0.6em)] py-2.5'
          : 'font-urdu transition-all duration-150 [padding-inline:0.5em] py-1.5',
        fontSizeClasses[fontSize],
        lineHeightClasses[lineHeight],
        userSelect === 'none' ? 'select-none' : 'select-text',
        className
      )}
    >
      {blocks.map((block, idx) => {
        if (block.type === 'scene-break') {
          return (
            <div
              key={`scene-break-${idx}`}
              role="separator"
              aria-label="منظر کا وقفہ"
              className={cn(
                'flex items-center justify-center gap-2.5 my-7 text-current/35 select-none pointer-events-none',
                block.hasExtraTopGap && extraGapClasses[paragraphSpacing]
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              <span className="w-2 h-2 rounded-full bg-current opacity-90" />
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
            </div>
          );
        }

        return (
          <p
            key={`p-${idx}`}
            dir="rtl"
            lang="ur"
            className={cn(
              'text-justify antialiased [font-synthesis:none] text-current/90',
              '[font-size:calc(var(--reader-base-font-size,1.125rem)*var(--reader-font-scale,1))]',
              paragraphSpacingClasses[paragraphSpacing],
              block.hasExtraTopGap && extraGapClasses[paragraphSpacing],
              paragraphClassName
            )}
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
