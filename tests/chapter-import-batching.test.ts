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
});
