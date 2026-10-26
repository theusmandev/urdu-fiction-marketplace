# Chapter Line Breaks & Paragraph Rendering Audit

## Executive Summary

**Problem Statement:**
When a writer pastes chapter text, line breaks and paragraphs appear completely lost in the reader; the reader renders chapter text as one single continuous block of text where even scene-break lines like `****` end up glued inside adjacent sentences (e.g., `... وہاں سے چلی گئی۔ **** ہال میں روشنیوں کی چمک ...`).

**Root Cause Found With Concrete Evidence:**
The primary newline loss occurs **at the final presentation/DOM layer in `SecureReaderClient.tsx`**.
1. **Presentation Collapse (The Core Culprit):** In `src/app/read/[slug]/[number]/SecureReaderClient.tsx` (lines 403–410), the chapter body is rendered as:
   ```tsx
   <article className="relative">
     <UrduText
       as="div"
       className={`text-justify select-none font-normal transition-all duration-150 ${fontSizeClasses} ${lineHeightClasses}`}
     >
       {chapter.content_urdu}
     </UrduText>
   </article>
   ```
   Neither `SecureReaderClient` nor `<UrduText>` applies `white-space: pre-line` or `white-space: pre-wrap`, nor did it split `chapter.content_urdu` into paragraph `<p>` tags. In HTML/CSS, the default `white-space` property is `normal`. Under `white-space: normal`, all ASCII newline characters (`\n` and `\r\n`) are collapsed by the browser layout engine into a single space (` `). Thus, even though the database and server actions preserved `\n` and `****`, the browser rendered every line break as a space on a single continuous block!
2. **Cleaner Utility Gap:** In `src/lib/text/clean-urdu.ts`:
   - It lacked handling for Unicode paragraph/line separators `\u2028` and `\u2029`, which are often emitted when copying from modern PDF readers, eBooks, and Word processors.
   - It clamped `\n{3,}` to `\n\n`, which collapsed 2 blank lines (`\n\n\n`) into a single blank line (`\n\n`), preventing authors from intentionally creating larger scene gaps.
   - It used `line.trim()` instead of `line.trimEnd()`.
3. **Storage & DB Verification:**
   - Tracing through PostgreSQL tables, column types (`content_urdu text`), triggers (`trg_chapters_calculate_word_count`, `trg_chapter_revisions`), and RPCs (`get_chapter_for_reader`) confirms that PostgreSQL never stripped internal newlines. Chapters saved with standard line breaks have their newlines intact in storage.

---

## Detailed Trace & Audit Across All Stages

### a) The Editor Component (`src/app/writer/novels/[id]/chapters/ChapterEditor.tsx`)
- **Inspection:** Lines 436–446 use a native, plain `<textarea>` element:
  ```tsx
  <textarea
    ref={textareaRef}
    dir="rtl"
    rows={18}
    value={formData.content_urdu}
    onChange={(e) => handleChange('content_urdu', e.target.value)}
    ...
  />
  ```
- **Survives Test:** Native paste into a plain HTML `<textarea>` retains all `\n` characters exactly as placed on the system clipboard. There are no contentEditable elements or rich-text DOM layers rewriting line breaks to `<div>` or `<br>`.
- **Finding:** The editor body component is already a plain `<textarea>`. It does not drop newlines on native paste.

### b) "Paste Cleaned Text", Clean Text Assistant & `src/lib/text/clean-urdu.ts`
- **Inspection:**
  - `cleanUrduText()` performs:
    1. NFC normalisation
    2. Invisible bidi mark stripping (preserving ZWNJ and ZWJ)
    3. Digits normalisation outside tashkeel runs
    4. Optional Arabic letter normalisation (opt-in only)
    5. Line break normalization: `text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`
    6. Horizontal whitespace collapse: `text.replace(/[^\S\n]+/g, ' ')`
    7. Line trimming: `text.split('\n').map((line) => line.trim()).join('\n')`
    8. Newline clamping: `text.replace(/\n{3,}/g, '\n\n')`
- **Audit Findings:**
  - `cleanUrduText` did NOT use `/\s+/g -> ' '` (it used `/[^\S\n]+/g` which specifically excludes `\n`).
  - **Issue 1:** It failed to convert `\u2028` (Line Separator) and `\u2029` (Paragraph Separator) to `\n`. When text is copied from macOS / iOS / PDF readers containing U+2028 / U+2029, they were not converted to Unix `\n`.
  - **Issue 2:** Clamping `\n{3,}` to `\n\n` meant that 2 or more blank lines (`\n\n\n` or more) were collapsed to 1 blank line (`\n\n`). Clamping of 3+ blank lines to 2 blank lines requires `\n{4,}` -> `\n\n\n`.
  - **Issue 3:** The Clean Text Assistant and "Paste Cleaned Text" lacked before/after line counts ("123 lines -> 123 lines") and lacked an opt-in "Join broken lines" tool for hard-wrapped PDF text.

### c) Server Actions, API Routes & RPC Calls
- **Inspection:**
  - `saveChapterAction` (`src/app/actions/writer.ts` lines 382–420):
    Calls `cleanUrduText(content_urdu)`. As proven above, `cleanUrduText` retains `\n` characters. The cleaned string is passed directly into Supabase `.update({ content_urdu: cleanContent })` or `.insert(...)`.
  - `splitChapterAction` & `importChaptersAction` (`src/app/actions/writer.ts` lines 562–640):
    Calls `cleanUrduText(c.content_urdu)`. Survives cleanly.
  - `buildParts` in `src/lib/text/split-chapters.ts` (lines 727–764):
    Takes `raw.content.trim()` and passes it to each part. Preserves newlines inside each chapter part.
  - `splitManuscriptIntoChapters` in `src/lib/text/manuscript-parser.ts` (lines 76–139):
    Splits by heading lines and joins body lines using `.join('\n')`. Preserves newlines.

### d) Database Storage & Triggers
- **Inspection:**
  - Schema (`supabase/migrations/0001_enums_and_core_tables.sql`): `content_urdu text NOT NULL`. Standard Postgres `text` type preserves all byte sequences including `0x0A` (`\n`).
  - Trigger `trg_chapters_calculate_word_count` (`0011_writer_content_hardening.sql`):
    `NEW.word_count := COALESCE(array_length(regexp_split_to_array(trim(NEW.content_urdu), '\\s+'), 1), 0);`
    Only updates `NEW.word_count`. Does NOT alter `NEW.content_urdu`.
  - Trigger `trg_chapter_revisions` (`0007_gap_fixes_and_storage_hardening.sql`):
    Archives `OLD.content_urdu` into `chapter_revisions`. Does NOT alter the chapter content.
- **Finding:** No database trigger, rule, or constraint modifies `content_urdu`. Newlines survive in storage.

### e) Data Reading Paths
- **Inspection:**
  - `get_chapter_for_reader` RPC (`0023_fix_sql_construct_qualification_regression.sql` line 913):
    `'content_urdu', v_chapter.content_urdu`. Returns raw text without modification.
  - `public_free_preview_chapters` view (`0013_public_catalog.sql` line 196):
    `c.content_urdu`. Direct column projection.
  - Admin novel review query (`src/app/admin/novels/[id]/page.tsx` line 75):
    Selects `content_urdu` from `chapters`. No TS/JS transformation on fetch.
- **Finding:** All data reading queries return `content_urdu` with newlines intact.

### f) Rendering Components (The Root Cause Location)
Here is the audit of every component rendering `content_urdu`:

| Component / File | How it renders `content_urdu` | Newline Survival | Root Cause Identified |
|---|---|---|---|
| **Secure Web Reader**<br>`src/app/read/[slug]/[number]/SecureReaderClient.tsx` (line 408) | `<UrduText as="div" className="text-justify select-none font-normal transition-all duration-150 ${fontSizeClasses} ${lineHeightClasses}">{chapter.content_urdu}</UrduText>` | **FAIL (Collapsed)** | **PRIMARY ROOT CAUSE**: Default CSS `white-space: normal` collapses every `\n` to a space. Scene breaks `****` merge directly into surrounding sentences. |
| **Free Preview Reader**<br>`src/components/catalog/FreePreviewReaderClient.tsx` (line 280) | `<article dir="rtl" lang="ur" className="font-urdu ... text-right whitespace-pre-line select-text">{chapter.content_urdu}</article>` | Partial | Uses `whitespace-pre-line` in a single article, but lacks `<p>` elements, lacks scene break ornament dividers, and lacks reader paragraph spacing controls. |
| **Admin Novel Review**<br>`src/app/admin/novels/[id]/page.tsx` (line 409) | `<UrduText as="div" size="lg" className="leading-[2.4] text-main whitespace-pre-wrap select-text text-justify">{chapter.content_urdu}</UrduText>` | Partial | Uses `whitespace-pre-wrap`, but renders as a single preformatted block without semantic paragraphs or scene breaks. |
| **Chapter Editor Cleaner Modal**<br>`src/app/writer/novels/[id]/chapters/ChapterEditor.tsx` (lines 614, 624) | `<UrduText as="p" size="sm" className="text-main leading-[2.2] py-0 line-clamp-6">{formData.content_urdu.slice(0, 400)}</UrduText>` | **FAIL (Collapsed)** | Renders inside `<UrduText as="p">` without whitespace preservation. |
| **Emails & OpenGraph** | `src/app/(marketplace)/novels/[slug]/read/[number]/page.tsx`, `src/lib/email/*` | N/A | Neither OG nor emails render `content_urdu` (only metadata summaries). |

---

## Conclusion & Fix Plan

1. **New Shared Component `<ChapterBody text={...} />`**:
   Create `src/components/reader/ChapterBody.tsx` to serve as the single source of truth for rendering chapter text across `SecureReaderClient`, `FreePreviewReaderClient`, `ChapterEditor`, and `admin/novels/[id]/page.tsx`.
   - Normalises `\r\n` and `\r` to `\n`.
   - Splits on `\n`.
   - Each non-empty line becomes a `<p dir="rtl" lang="ur">` with Gulzar Nastaliq font.
   - Detects scene breaks (`***`, `****`, `* * *`, `---`, `___`, `•••`, `❖`, `✦`, `~~~`) and renders centered divider ornaments instead of raw characters.
   - Preserves blank lines: 1 blank line = standard paragraph spacing; 2+ blank lines = larger gap.
   - Respects reader preference for paragraph spacing (`compact`, `normal`, `wide`).
   - XSS-safe (React escaping, no `dangerouslySetInnerHTML`).
2. **Text Cleaner Upgrades**:
   - Update `cleanUrduText()` in `src/lib/text/clean-urdu.ts` to convert `\u2028` and `\u2029` to `\n`, clamp 3+ blank lines to 2 (`\n{4,}` -> `\n\n\n`), and use `line.trimEnd()`.
   - Add opt-in `joinBrokenLines()` utility for hard-wrapped PDF text with preview and undo.
   - Add live line and paragraph counters to `ChapterEditor.tsx`.
3. **Database Recovery Analysis**:
   - Because PostgreSQL storage and server actions never stripped newlines, existing chapters that were originally saved with line breaks **already contain their newlines in the database**. Switching the reader to `<ChapterBody>` will immediately restore their paragraphs and line breaks without database alteration. Chapters saved from already-flattened text cannot have line breaks guessed or fabricated.
