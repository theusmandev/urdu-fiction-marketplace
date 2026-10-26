import React from 'react';
import { cn } from '@/lib/utils';
import {
  parseChapterContent,
  fontSizeClasses,
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
   * Safe line-heights calibrated for Gulzar Nastaliq calligraphy ascenders and descenders.
   * @default 'relaxed'
   */
  lineHeight?: ReaderLineHeight;

  /**
   * Reader paragraph spacing preference: 'compact' | 'normal' | 'wide'
   * @default 'normal'
   */
  paragraphSpacing?: ReaderParagraphSpacing;

  /**
   * User select behavior. 'none' for protected reader, 'text' for public/admin preview.
   * @default 'text'
   */
  userSelect?: 'none' | 'text';

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
  lineHeight = 'relaxed',
  paragraphSpacing = 'normal',
  userSelect = 'text',
  className,
  paragraphClassName,
}: ChapterBodyProps) {
  const blocks = parseChapterContent(text);

  if (blocks.length === 0) {
    return (
      <div
        dir="rtl"
        lang="ur"
        className={cn(
          'font-urdu text-center py-12 text-current/50 select-none text-base',
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
      className={cn(
        'font-urdu transition-all duration-150',
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
