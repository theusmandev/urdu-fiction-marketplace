# UNB Premium — Chapter Splitter & Import Manual Testing Guide

## Overview
This document specifies the synthetic test fixtures and expected chapter segmentation results for the **Writer-Controlled Chapter Splitter** engine (`src/lib/text/split-chapters.ts`) and its UI wizard (`ChapterSplitterWizard.tsx`).

> [!IMPORTANT]
> **Known Limitations & Core Philosophy:**
> Automated heading heuristics and algorithmic splits **CANNOT** predict or be 100% accurate for every novel in the wild. Authors use vastly different typography, numbering styles, ornamentation, and formatting.
> Therefore, the platform's rule is: **THE TOOL ONLY SUGGESTS, AND THE WRITER MUST CONFIRM.**
> - The tool never silently converts, drops, or alters text.
> - Every chapter part is saved as a **DRAFT** (`is_published = false`) so the writer can review each part in the chapter editor before publishing.
> - If an episode cannot be split automatically by headings, the writer can click an example heading, use target size splitting (e.g. 6,000 words), or mark manual split points with single clicks.

---

## Synthetic Test Fixtures

All fixtures are stored in `tests/fixtures/manuscripts/` using synthetic invented Urdu text.

| Fixture File | Description & Problem Addressed | Expected Behavior & Suggested Chapters |
| :--- | :--- | :--- |
| **`one-episode-with-header-footer.txt`** | Mirrors the user-reported failure: Single episode with title/author metadata at top (`تلاشِ سحر`, `از قلم : عروبہ خان`), chapter heading `باب نمبر پانچ`, scene breaks `***`, and closing footer note `قسط پانچ اختتام پذیر ہوئی!`. | - **Front-matter block:** Correctly detects first 3 lines as attribution (`از قلم`).<br>- **End-note block:** Correctly detects closing 2 lines as announcement (`اختتام پذیر`).<br>- Neither block becomes a chapter.<br>- `باب نمبر پانچ` is suggested as the true heading candidate.<br>- When splitting by size (target ~6k words or scene breaks), splits into 2-3 clean narrative parts with 100% text preservation. |
| **`several-chapters-headings.txt`** | Manuscript containing multiple chapters headed `باب ۱`, `باب ۲`, `باب ۳`. | - Detects all 3 headings.<br>- Splits into exactly 3 chapters: `باب ۱`, `باب ۲`, `باب ۳`.<br>- Total words and characters match original. |
| **`qist-headings-only.txt`** | Manuscript containing serial episodes headed `قسط ۱`, `قسط ۲`, `قسط ۳`. | - Detects all 3 episodes.<br>- Author clicking `قسط ۱` highlights all 3 headings automatically via `derivePatternFromExample`.<br>- Result: 3 discrete draft episodes. |
| **`no-headings-long-paragraphs.txt`** | Pure narrative story without any explicit chapter headings or numbers. | - Recommends **"One chapter to split by size"** mode.<br>- With target 6,000 words, splits at paragraph boundaries (`\n\n`) without breaking mid-sentence.<br>- Resulting parts are named `حصہ ۱`, `حصہ ۲`, etc. |
| **`no-blank-lines.txt`** | Dense continuous text without blank lines or scene dividers. | - Falls back gracefully to Urdu sentence-ending punctuation (`۔`, `؟`, `!`).<br>- Never splits inside quotations (`“...”`).<br>- Zero character loss. |
| **`quranic-with-tashkeel.txt`** | Surah Al-Ikhlas with full Arabic tashkeel (`َ`, `ِ`, `ُ`, `ْ`, `ّ`) and Urdu digits (`۱`, `۲`, `۳`, `۴`). | - 100% preservation invariant: **Zero tashkeel marks dropped**.<br>- Digits remain intact.<br>- Arabic letter normalization is OFF by default to preserve sacred orthography. |
| **`huge-mixed-220k-block.txt`** | A massive 225,000+ character continuous manuscript. | - Exceeds the platform's 120,000-character limit.<br>- Editor warns with amber (>80%) and red (>100%) alerts.<br>- Splitting by size (target 6,000 words) produces 4-5 parts.<br>- **Every resulting part is strictly <= 120,000 characters and >= 300 words.** |

---

## Verification Checklist for Writers

1. **Upload / Paste:**
   - Supported formats: `.docx` and `.txt` (max 5 MB).
   - In the Chapter Editor, paste text or click **"Split into chapters"** when text counter exceeds 80% (96,000 chars) or 100% (120,000 chars).
2. **Review Structure:**
   - Verify that front-matter attribution (`از قلم`) is isolated and not converted into Chapter 1.
   - Verify that end-note announcements (`اگلی قسط`, `اختتام`) are isolated and not converted into the final chapter.
3. **Verify Parts:**
   - Look at the **"Text Preserved: 100% Exact Match"** badge.
   - Verify that each part is within the 5,000-8,000 word range.
   - Ensure the first part only has **Free Preview** ticked if desired.
4. **Save & Review:**
   - Click **"Confirm & Save Chapters"** to execute atomic transaction via RPC.
   - All newly generated chapters appear in your chapter list as **Draft**.
