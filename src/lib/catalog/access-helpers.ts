import type { NovelAccessState } from '@/app/actions/checkout';

export interface ContinueReadingInfo {
  isContinue: boolean;
  chapterNumber: number;
  labelEn: string;
  labelUr: string;
}

export type ChapterRowKind = 'unlocked_link' | 'free_preview_link' | 'locked_button';

export interface ChapterRowTypeResult {
  kind: ChapterRowKind;
  isCurrent?: boolean;
  isRead?: boolean;
}

/**
 * Derives reader progress information and localized button labels.
 */
export function getContinueReadingInfo(
  lastReadChapterNumber?: number | null
): ContinueReadingInfo {
  if (lastReadChapterNumber && lastReadChapterNumber > 0) {
    return {
      isContinue: true,
      chapterNumber: lastReadChapterNumber,
      labelEn: `Continue reading — Chapter ${lastReadChapterNumber}`,
      labelUr: `پڑھنا جاری رکھیں — باب ${lastReadChapterNumber}`,
    };
  }

  return {
    isContinue: false,
    chapterNumber: 1,
    labelEn: 'Start reading',
    labelUr: 'پڑھنا شروع کریں',
  };
}

/**
 * Determines whether price boxes and direct-payment guarantees should be visible.
 * Strictly hidden for novel owners, authors, and administrators.
 */
export function shouldShowPriceAndGuarantee(state: NovelAccessState): boolean {
  return state === 'visitor';
}

/**
 * Determines the interaction model and badges for a chapter row in the Table of Contents.
 */
export function getChapterRowType(
  chapterNumber: number,
  isFreePreview: boolean,
  accessState: NovelAccessState,
  lastReadChapterNumber?: number | null
): ChapterRowTypeResult {
  const isFullAccess =
    accessState === 'owner_buyer' ||
    accessState === 'author' ||
    accessState === 'admin';

  if (isFullAccess) {
    const isCurrent = chapterNumber === lastReadChapterNumber;
    const isRead = Boolean(lastReadChapterNumber && chapterNumber < lastReadChapterNumber);
    return {
      kind: 'unlocked_link',
      isCurrent,
      isRead,
    };
  }

  if (isFreePreview) {
    return {
      kind: 'free_preview_link',
    };
  }

  return {
    kind: 'locked_button',
  };
}
