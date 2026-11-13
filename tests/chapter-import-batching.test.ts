import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_BATCH_SIZE = 5;

describe('Chapter Import Batching & Error Resilience', () => {
  const rootDir = process.cwd();

  describe('1. Batch Slicing & Calculation Logic', () => {
    it('defines IMPORT_BATCH_SIZE = 5 in ChapterSplitterWizard.tsx', () => {
      const wizardPath = path.join(
        rootDir,
        'src',
        'app',
        'writer',
        'novels',
        '[id]',
        'chapters',
        'ChapterSplitterWizard.tsx'
      );
      const content = fs.readFileSync(wizardPath, 'utf8');
      assert.match(
        content,
        /export const IMPORT_BATCH_SIZE = 5;/,
        'ChapterSplitterWizard must export IMPORT_BATCH_SIZE = 5'
      );
    });
    it('slices 28 chapters into batches of 5 (5, 5, 5, 5, 5, 3)', () => {
      const totalChapters = 28;
      const dummyChapters = Array.from({ length: totalChapters }, (_, i) => ({
        title_urdu: `باب ${i + 1}`,
        content_urdu: `مواد باب نمبر ${i + 1}`,
      }));

      const totalBatches = Math.ceil(dummyChapters.length / IMPORT_BATCH_SIZE);
      assert.equal(totalBatches, 6, '28 chapters at batch size 5 must produce 6 batches');

      const batchSizes: number[] = [];
      const startIndices: number[] = [];

      for (let b = 0; b < totalBatches; b++) {
        const startIdx = b * IMPORT_BATCH_SIZE;
        const slice = dummyChapters.slice(startIdx, startIdx + IMPORT_BATCH_SIZE);
        batchSizes.push(slice.length);
        startIndices.push(startIdx);
      }

      assert.deepEqual(batchSizes, [5, 5, 5, 5, 5, 3]);
      assert.deepEqual(startIndices, [0, 5, 10, 15, 20, 25]);
    });

    it('computes chapter numbers accurately across batches without gaps or collisions', () => {
      const totalChapters = 28;
      const initialStartNumber = 1;
      const assignedChapterNumbers: number[] = [];

      const totalBatches = Math.ceil(totalChapters / IMPORT_BATCH_SIZE);
      let currentCommitted = 0;

      for (let b = 0; b < totalBatches; b++) {
        const startIdx = b * IMPORT_BATCH_SIZE;
        const batchLength = Math.min(IMPORT_BATCH_SIZE, totalChapters - startIdx);
        const batchStartNumber = (initialStartNumber || 1) + currentCommitted;

        for (let i = 0; i < batchLength; i++) {
          assignedChapterNumbers.push(batchStartNumber + i);
        }

        currentCommitted += batchLength;
      }

      assert.equal(assignedChapterNumbers.length, 28);
      assert.equal(assignedChapterNumbers[0], 1);
      assert.equal(assignedChapterNumbers[27], 28);

      // Verify strict sequential progression
      for (let i = 0; i < 28; i++) {
        assert.equal(assignedChapterNumbers[i], i + 1);
      }
    });

    it('supports custom initial start chapter numbers (e.g., adding to existing novel at #15)', () => {
      const totalChapters = 12;
      const initialStartNumber = 15;
      const totalBatches = Math.ceil(totalChapters / IMPORT_BATCH_SIZE);
      let currentCommitted = 0;
      const batchStartNumbers: number[] = [];

      for (let b = 0; b < totalBatches; b++) {
        const startIdx = b * IMPORT_BATCH_SIZE;
        const batchLength = Math.min(IMPORT_BATCH_SIZE, totalChapters - startIdx);
        const batchStartNumber = initialStartNumber + currentCommitted;
        batchStartNumbers.push(batchStartNumber);
        currentCommitted += batchLength;
      }

      // Batch 0 (15..19), Batch 1 (20..24), Batch 2 (25..26)
      assert.deepEqual(batchStartNumbers, [15, 20, 25]);
      assert.equal(currentCommitted, 12);
    });
  });

  describe('2. Partial Batch Recovery Logic', () => {
    it('accurately advances savedOffset and remaining parts upon mid-batch failure', () => {
      const allParts = Array.from({ length: 28 }, (_, i) => ({ id: `part-${i + 1}` }));
      let savedOffset = 0;

      // Simulate 2 batches (10 chapters) successfully saving before batch 3 fails
      const simulateBatches = (failAtBatchIndex: number) => {
        const totalBatches = Math.ceil(allParts.length / IMPORT_BATCH_SIZE);
        let currentCommitted = savedOffset;

        for (let b = 0; b < totalBatches; b++) {
          if (b === failAtBatchIndex) {
            savedOffset = currentCommitted;
            throw new Error(`Batch ${b + 1} timed out.`);
          }
          const startIdx = b * IMPORT_BATCH_SIZE;
          const slice = allParts.slice(startIdx, startIdx + IMPORT_BATCH_SIZE);
          currentCommitted += slice.length;
          savedOffset = currentCommitted;
        }
      };

      assert.throws(() => simulateBatches(2), /Batch 3 timed out\./);
      assert.equal(savedOffset, 10, 'Must record 10 saved chapters after batch 2 succeeded');

      // On retry, remaining parts must be 18
      const remainingParts = allParts.slice(savedOffset);
      assert.equal(remainingParts.length, 18, 'Remaining parts must be exactly 18');
      assert.equal(remainingParts[0].id, 'part-11', 'Next chapter to save must be part-11');
    });
  });

  describe('3. Error Message Translation Helper', () => {
    function translateError(err: unknown): string {
      let msg = err instanceof Error ? err.message : 'Operation failed.';
      if (
        msg.includes('Minified React error') ||
        msg.includes('Server Components render') ||
        msg.includes('react.dev/errors')
      ) {
        msg =
          'Server communication error: The chapter batch could not be processed. Please check your connection and click "Resume & Save" to continue saving remaining chapters.';
      }
      return msg;
    }

    it('translates Minified React error #441 into actionable message', () => {
      const rawError = new Error(
        'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
      );
      const translated = translateError(rawError);
      assert.ok(
        translated.includes('Server communication error: The chapter batch could not be processed.'),
        'Must provide helpful message'
      );
      assert.ok(
        !translated.includes('Minified React error'),
        'Must not expose raw React minification message'
      );
    });

    it('preserves clean application error messages', () => {
      const appError = new Error('Chapter part #3 exceeds the 120,000 character platform limit.');
      assert.equal(translateError(appError), 'Chapter part #3 exceeds the 120,000 character platform limit.');
    });
  });

  describe('4. Configuration Integrity (next.config.ts)', () => {
    it('configures experimental.serverActions.bodySizeLimit to at least 10mb', () => {
      const configPath = path.join(rootDir, 'next.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');

      assert.match(
        content,
        /bodySizeLimit:\s*['"](10mb|15mb|20mb)['"]/i,
        'next.config.ts must configure bodySizeLimit'
      );
    });
  });

  describe('5. Server Action Invariants (importChaptersAction)', () => {
    it('accepts skipRevalidate parameter and honors it', () => {
      const actionPath = path.join(rootDir, 'src', 'app', 'actions', 'writer.ts');
      const content = fs.readFileSync(actionPath, 'utf8');

      assert.match(
        content,
        /export async function importChaptersAction\([^)]*skipRevalidate:\s*boolean\s*=\s*false/i,
        'importChaptersAction must accept skipRevalidate parameter'
      );
      assert.match(
        content,
        /if\s*\(!skipRevalidate\)\s*\{\s*revalidatePath\(/i,
        'importChaptersAction must guard revalidatePath with !skipRevalidate'
      );
    });
  });

  describe('6. Instant State Synchronization & UX Snappiness', () => {
    it('verifies final batch in ChapterSplitterWizard sets skipRevalidate = false', () => {
      const wizardPath = path.join(
        rootDir,
        'src',
        'app',
        'writer',
        'novels',
        '[id]',
        'chapters',
        'ChapterSplitterWizard.tsx'
      );
      const content = fs.readFileSync(wizardPath, 'utf8');

      // Checks that isLastBatch is defined and !isLastBatch is passed as skipRevalidate
      assert.match(
        content,
        /const isLastBatch = b === totalBatches - 1;/i,
        'ChapterSplitterWizard must detect isLastBatch'
      );
      assert.match(
        content,
        /importChaptersAction\(\s*novelId,\s*batchSlice,\s*batchStartNumber,\s*!isLastBatch\s*\)/i,
        'ChapterSplitterWizard must pass !isLastBatch as skipRevalidate'
      );
    });

    it('verifies ChapterListManager synchronizes initialChapters prop into local state via useEffect', () => {
      const managerPath = path.join(
        rootDir,
        'src',
        'app',
        'writer',
        'novels',
        '[id]',
        'chapters',
        'ChapterListManager.tsx'
      );
      const content = fs.readFileSync(managerPath, 'utf8');

      assert.match(
        content,
        /useEffect\(\(\)\s*=>\s*\{\s*setChapters\(initialChapters\);\s*\},\s*\[initialChapters\]\);/,
        'ChapterListManager must synchronize initialChapters into local chapters state via useEffect'
      );
    });

    it('verifies ChapterImportModal declares and forwards onSuccess callback', () => {
      const modalPath = path.join(
        rootDir,
        'src',
        'app',
        'writer',
        'novels',
        '[id]',
        'chapters',
        'ChapterImportModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.match(
        content,
        /onSuccess\?:\s*\(newChapters\?:\s*ChapterRow\[\]\)\s*=>\s*void;/,
        'ChapterImportModal must declare onSuccess in ChapterImportModalProps'
      );
      assert.match(
        content,
        /<ChapterSplitterWizard[^>]*onSuccess=\{onSuccess\}/s,
        'ChapterImportModal must forward onSuccess to ChapterSplitterWizard'
      );
    });

    it('verifies ChapterSplitterWizard invokes onSuccess with optimistic ChapterRow items and calls router.refresh()', () => {
      const wizardPath = path.join(
        rootDir,
        'src',
        'app',
        'writer',
        'novels',
        '[id]',
        'chapters',
        'ChapterSplitterWizard.tsx'
      );
      const content = fs.readFileSync(wizardPath, 'utf8');

      assert.match(
        content,
        /if\s*\(onSuccess\)\s*\{\s*onSuccess\(createdChapterRows\);\s*\}/,
        'ChapterSplitterWizard must call onSuccess with createdChapterRows'
      );
      assert.match(
        content,
        /router\.refresh\(\);/,
        'ChapterSplitterWizard must call router.refresh() upon completion'
      );
    });

    it('verifies ChapterSplitterWizard closes modal after snappy delay (<= 600ms)', () => {
      const wizardPath = path.join(
        rootDir,
        'src',
        'app',
        'writer',
        'novels',
        '[id]',
        'chapters',
        'ChapterSplitterWizard.tsx'
      );
      const content = fs.readFileSync(wizardPath, 'utf8');

      assert.match(
        content,
        /setTimeout\(\(\)\s*=>\s*\{\s*onClose\(\);\s*\},\s*500\);/,
        'ChapterSplitterWizard must close modal within 500ms'
      );
    });

    it('optimistically merges and deduplicates newly imported chapters without sorting breaks', () => {
      interface MockChapter {
        id: string;
        chapter_number: number;
        title_urdu: string;
      }

      const existingChapters: MockChapter[] = [
        { id: 'ch-1', chapter_number: 1, title_urdu: 'باب ۱' },
        { id: 'ch-2', chapter_number: 2, title_urdu: 'باب ۲' },
      ];

      const newImported: MockChapter[] = [
        { id: 'ch-3', chapter_number: 3, title_urdu: 'باب ۳' },
        { id: 'ch-4', chapter_number: 4, title_urdu: 'باب ۴' },
        { id: 'ch-2', chapter_number: 2, title_urdu: 'باب ۲ duplicate' }, // Duplicate ID simulation
      ];

      const mergeChapters = (prev: MockChapter[], imported: MockChapter[]): MockChapter[] => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newItems = imported.filter((c) => !existingIds.has(c.id));
        const combined = [...prev, ...newItems];
        return combined.sort((a, b) => a.chapter_number - b.chapter_number);
      };

      const merged = mergeChapters(existingChapters, newImported);

      assert.equal(merged.length, 4, 'Must have exactly 4 chapters after deduplication');
      assert.deepEqual(
        merged.map((c) => c.chapter_number),
        [1, 2, 3, 4],
        'Must be sorted strictly sequentially by chapter_number'
      );
      assert.equal(merged[1].title_urdu, 'باب ۲', 'Must keep existing chapter when duplicate ID is received');
      assert.equal(merged[3].id, 'ch-4', 'Must include all new unique chapters');
    });
  });

  describe('7. Submit for Review Modal Viewport Safety & Layout Invariants', () => {
    it('verifies SubmitReviewModal employs 3-part flex layout and viewport bounds', () => {
      const modalPath = path.join(rootDir, 'src', 'app', 'writer', 'novels', 'SubmitReviewModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf8');

      // 1. Viewport-safe backdrop with scrolling
      assert.match(
        content,
        /fixed\s+inset-0\s+z-50[^"]*overflow-y-auto/i,
        'SubmitReviewModal backdrop must have overflow-y-auto'
      );

      // 2. Uses createPortal to escape parent transform/filter contexts
      assert.match(
        content,
        /createPortal\s*\(\s*modalContent,\s*document\.body\s*\)/,
        'SubmitReviewModal must render via createPortal into document.body'
      );

      // 3. Card constrained to 100dvh minus margin with flex-col
      assert.match(
        content,
        /max-h-\[calc\(100dvh-1\.5rem\)\]\s+sm:max-h-\[calc\(100dvh-3rem\)\]\s+flex\s+flex-col\s+overflow-hidden/,
        'Modal card must use dynamic dvh bounds and flex-col overflow-hidden'
      );

      // 4. Header is shrink-0
      assert.match(
        content,
        /shrink-0\s+px-5\s+py-4\s+border-b\s+border-border/i,
        'Header must be shrink-0 so it is never clipped'
      );

      // 5. Scrollable body with min-h-0 and overflow-y-auto
      assert.match(
        content,
        /flex-1\s+min-h-0\s+overflow-y-auto\s+px-5\s+py-4/i,
        'Body must be flex-1 min-h-0 overflow-y-auto'
      );

      // 6. Pinned footer with shrink-0 and responsive flex layout
      assert.match(
        content,
        /shrink-0\s+px-5\s+py-3\.5\s+border-t\s+border-border\s+bg-surface\s+flex\s+flex-col-reverse\s+sm:flex-row/i,
        'Footer must be shrink-0 with flex-col-reverse on mobile and sm:flex-row on desktop'
      );

      // 7. Tightened checklist items
      assert.match(
        content,
        /py-2\.5\s+px-3\.5\s+flex\s+items-center/i,
        'Checklist items must use compact padding py-2.5 px-3.5'
      );
    });

    it('validates 8 publishing checklist prerequisites logic', () => {
      interface MockNovel {
        title_urdu: string;
        title_english: string;
        synopsis_urdu: string;
        cover_url: string | null;
        rights_declaration_accepted: boolean;
        price_pkr: number;
        genres_count: number;
        published_chapters_count: number;
        active_payment_methods_count: number;
      }

      const evaluateChecklist = (novel: MockNovel) => [
        Boolean(novel.title_urdu && novel.title_urdu.trim().length >= 2),
        Boolean(novel.title_english && novel.title_english.trim().length >= 2),
        Boolean(novel.synopsis_urdu && novel.synopsis_urdu.trim().length >= 10),
        Boolean(novel.cover_url),
        Boolean(novel.rights_declaration_accepted),
        novel.genres_count > 0,
        novel.published_chapters_count > 0,
        novel.price_pkr === 0 || novel.active_payment_methods_count > 0,
      ];

      // Incomplete novel (0 published chapters, no payout method on paid novel)
      const incompleteNovel: MockNovel = {
        title_urdu: 'پیر کامل',
        title_english: 'Peer-e-Kamil',
        synopsis_urdu: 'ایک شاہکار روحانی ناول جو سفر اور تبدیلی کی کہانی سناتا ہے۔',
        cover_url: 'https://example.com/cover.jpg',
        rights_declaration_accepted: true,
        price_pkr: 500,
        genres_count: 2,
        published_chapters_count: 0,
        active_payment_methods_count: 0,
      };

      const incompleteChecks = evaluateChecklist(incompleteNovel);
      assert.equal(incompleteChecks[6], false, 'Must fail published chapters check when count is 0');
      assert.equal(incompleteChecks[7], false, 'Must fail payment method check for paid novel when count is 0');
      assert.equal(incompleteChecks.every(Boolean), false, 'allPassed must be false');

      // Ready novel
      const readyNovel: MockNovel = {
        ...incompleteNovel,
        published_chapters_count: 1,
        active_payment_methods_count: 1,
      };
      const readyChecks = evaluateChecklist(readyNovel);
      assert.equal(readyChecks.every(Boolean), true, 'allPassed must be true when all prerequisites are met');
    });
  });

  describe('8. Admin Novel Moderation Cover Aspect Ratio & Layout Invariants', () => {
    it('verifies AdminNovelReviewPage applies items-start to parent flex and aspect-[2/3] self-start to cover container', () => {
      const adminNovelPagePath = path.join(
        rootDir,
        'src',
        'app',
        'admin',
        'novels',
        '[id]',
        'page.tsx'
      );
      const content = fs.readFileSync(adminNovelPagePath, 'utf8');

      // 1. Parent flex has items-start to prevent vertical stretching
      assert.match(
        content,
        /flex\s+flex-col\s+md:flex-row\s+items-start\s+gap-6/i,
        'Parent flex container must have items-start to prevent vertical stretching'
      );

      // 2. Cover wrapper has w-40 sm:w-48 md:w-52 aspect-[2/3] shrink-0 self-start
      assert.match(
        content,
        /w-40\s+sm:w-48\s+md:w-52\s+aspect-\[2\/3\]\s+shrink-0\s+self-start/i,
        'Cover container must enforce aspect-[2/3] with self-start and responsive width'
      );

      // 3. Image uses object-cover within aspect-[2/3] frame
      assert.match(
        content,
        /className="w-full\s+h-full\s+object-cover"/,
        'Cover image must use w-full h-full object-cover within aspect-[2/3] frame'
      );

      // 4. Provides full cover view link
      assert.match(
        content,
        /View Full Cover/,
        'Must provide View Full Cover preview link on hover'
      );
    });
  });

  describe('9. NovelCard Clean Cover & Nastaliq Typography Invariants', () => {
    it('verifies NovelCard removes decorative book spine overlay', () => {
      const cardPath = path.join(rootDir, 'src', 'components', 'catalog', 'NovelCard.tsx');
      const content = fs.readFileSync(cardPath, 'utf8');

      assert.ok(
        !content.includes('bg-gradient-to-r from-black/30'),
        'NovelCard must not contain black/30 spine gradient'
      );
      assert.ok(
        !content.includes('Book Spine Visual Styling'),
        'NovelCard must not contain Book Spine styling'
      );
    });

    it('verifies NovelCard prevents Urdu Nastaliq title ascender clipping with generous padding and line-height', () => {
      const cardPath = path.join(rootDir, 'src', 'components', 'catalog', 'NovelCard.tsx');
      const content = fs.readFileSync(cardPath, 'utf8');

      // title_urdu has pt-1.5 pb-0.5 and leading-[2.1]
      assert.match(
        content,
        /pt-1\.5\s+pb-0\.5\s+line-clamp-1/,
        'title_urdu must include pt-1.5 pb-0.5 line-clamp-1 to protect ascenders and dots'
      );
      assert.match(
        content,
        /leading-\[2\.1\]/,
        'title_urdu must use leading-[2.1] line height'
      );

      // pen_name_urdu has leading-loose py-0.5
      assert.match(
        content,
        /leading-loose\s+py-0\.5/,
        'writer_pen_name_urdu must have leading-loose py-0.5 to protect dots'
      );
    });

    it('verifies home novel-card and novel detail hero cover do not contain decorative spine line', () => {
      const homeCardPath = path.join(rootDir, 'src', 'components', 'home', 'novel-card.tsx');
      const homeContent = fs.readFileSync(homeCardPath, 'utf8');
      assert.ok(
        !homeContent.includes('Editorial Book Spine Visual Styling'),
        'home novel-card must not contain spine visual styling'
      );

      const detailHeroPath = path.join(
        rootDir,
        'src',
        'app',
        '(marketplace)',
        'novels',
        '[slug]',
        'page.tsx'
      );
      const detailContent = fs.readFileSync(detailHeroPath, 'utf8');
      assert.ok(
        !detailContent.includes('Book Spine Detail'),
        'novel detail hero page must not contain Book Spine Detail'
      );
    });
  });
});
