# Offline-Tolerant Chapter Autosave & Cloud Sync (Phase 1)

This document describes the design, implementation, operational invariants, security considerations, and manual verification procedures for the offline-tolerant chapter autosave and cloud synchronization system in UNB Premium.

---

## 1. Architectural Overview & Hard Invariants

### 1.1 Invariant: Absolute Separation of Drafts and Published Chapters
- **Drafts NEVER write to `public.chapters`:** Autosave operations, whether local or cloud-synced, **never** modify, insert, or delete rows in `public.chapters`.
- **Live Chapters Update Exclusively via Explicit Action:** Published or existing chapters change only when the author explicitly clicks the primary "محفوظ کریں" (Save / Publish) button via `saveChapterAction` (`src/app/actions/writer.ts`). That path enforces live chapter triggers, content revisions, audit log records, and sold-novel integrity invariants.
- **Dedicated Draft Store:** Cloud autosaves persist to an isolated table `public.chapter_drafts` exclusively via atomic `SECURITY DEFINER` RPCs (`upsert_chapter_draft`, `get_chapter_draft`, `discard_chapter_draft`, `resolve_chapter_draft_conflict`). Direct table permissions (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on `chapter_drafts` are strictly revoked from `anon` and `authenticated` roles.

### 1.2 Two-Tier Storage Architecture
1. **Tier 1 — Local Device Storage (IndexedDB):**
   - Implemented in [`src/lib/drafts/local-store.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/src/lib/drafts/local-store.ts).
   - Keyed by `client_key` (derived from `user_id`, `novel_id`, and `chapter_id` or new-chapter slot).
   - Writes occur locally on every input change with an 800 ms debounce, and immediately on page lifecycle events (`visibilitychange` hidden and `pagehide`).
   - Uses `localSeq` monotonic sequence counters to track in-flight vs. newly typed edits.
   - Text is stored byte-for-byte identically: zero trimming, zero normalization, preserving Arabic and Urdu diacritics (tashkeel), full stops (`۔`), and newlines.
2. **Tier 2 — Cloud Draft Store (PostgreSQL):**
   - Implemented in `supabase/migrations/0033_chapter_drafts.sql` and [`src/app/actions/drafts.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/src/app/actions/drafts.ts).
   - Synchronized by the pure state machine and React hook in [`src/lib/drafts/sync-engine.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/src/lib/drafts/sync-engine.ts) and [`src/lib/drafts/sync-state-machine.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/src/lib/drafts/sync-state-machine.ts).
   - Syncs every 3 seconds while typing, immediately on blur / visibility hidden, on the `window.online` event, and on a 30-second timer when unsynced.
   - Features optimistic concurrency with `server_revision` and rate limiting (max 240 upserts/hour per writer, max 100 drafts per writer).

---

## 2. Honest Limits & Guarantees

> [!IMPORTANT]
> **Copy Invariant**: The UI and documentation **must never** promise "zero data loss". Instead, the interface transparently communicates:
> - **"Saved on this device"** (محفوظ شدہ اس ڈیوائس پر)
> - **"Saved to cloud"** (کلاؤڈ پر محفوظ شدہ)

### What the System Guarantees:
1. **Sudden Power Outage or Browser Crash:** Text typed up to ~800 ms before a crash or power drop is safely committed to IndexedDB and will be detected on the next visit.
2. **Internet Connection Drops:** Writers can keep typing indefinitely while offline. All changes accumulate in IndexedDB with monotonic local sequence numbers. Once internet is restored, the sync engine automatically resumes and syncs the latest state to the cloud.
3. **Session Expiry:** If the writer's Supabase session expires mid-typing, the editor does **not** wipe or discard text. The status chip transitions to "Sign in to sync" (`auth_expired`). The author continues writing locally without disruption, and background sync resumes immediately upon re-authentication.
4. **Concurrent Multi-Tab Protection:** The Web Locks API (`navigator.locks`) ensures only one browser tab edits a draft at any moment. Secondary tabs are rendered read-only with an explicit "Take Over" action.
5. **Character Limit Handling:** If an author exceeds the 120,000-character single-chapter limit, local saves continue uninterrupted. Cloud sync pauses with a clear notification advising the author to use the chapter splitter wizard.

### Honest System Limits (Phase 1):
1. **Offline Page Reloads (No Service Worker):** In Phase 1, there is no service worker. If the writer is completely offline and triggers a full page refresh (`F5` / `Ctrl+R`) or navigates to a new URL, the browser will display the standard offline page error because HTML/JS bundles are not cached by a service worker. However, once the connection returns and the page loads, the draft in IndexedDB remains intact and can be restored.
2. **Browser Storage Clearing & Incognito / Private Browsing:**
   - If the user uses Incognito/Private browsing, all IndexedDB data is erased when the browser window closes.
   - If the user manually clears browser data / cookies / site storage in browser settings, locally stored drafts will be deleted.
3. **Unencrypted Device Storage on Shared Computers:**
   - IndexedDB data is stored unencrypted in the local browser profile.
   - For privacy on shared computers or internet cafes, writers should leave "Remember drafts on this device" unchecked, which purges synced local drafts upon logout.
4. **Multi-Device Conflict Resolution:**
   - If an author edits Chapter 1 on a laptop while offline, and edits Chapter 1 on a phone, when the laptop reconnects a `conflict` status triggers.
   - The system never overwrites silently: it displays a visual line-by-line diff and provides explicit options: "Keep mine", "Keep server version" (archives local copy safely), or "Copy mine to a new draft".

---

## 3. UI Indicators & User Experience

### 3.1 Status Chip States
The status chip is situated in the chapter editor toolbar beside the character counter:
- `saved_local`: 💾 "اس ڈیوائس پر محفوظ" (Saved on this device)
- `syncing`: 🔄 "کلاؤڈ پر محفوظ ہو رہا ہے…" (Syncing…)
- `synced`: ☁️ "کلاؤڈ پر محفوظ HH:MM" (Saved to cloud HH:MM)
- `offline`: 📡 "آف لائن — اس ڈیوائس پر محفوظ" (Offline — saved on this device)
- `conflict`: ⚠️ "تنازعہ — کارروائی درکار ہے" (Conflict — action needed)
- `auth_expired`: 🔒 "مطابقت پذیری کے لیے دوبارہ لاگ ان کریں" (Sign in to sync)
- `error`: ⚠️ "مطابقت پذیری میں خرابی" (Sync error — with retry)

### 3.2 Responsive Toolbar
The status chip is optimized for 360 px mobile viewports, using compact icon badges on narrow screens and tooltip expansions to prevent any layout shift or toolbar wrapping.

### 3.3 Draft Restoration Modal
When an editor is loaded:
1. It inspects IndexedDB for an existing local draft.
2. If a local draft exists with a higher `localSeq` or newer timestamp than the live chapter / cloud draft, an explicit dialog appears:
   - Shows the last saved time on the device and character count comparison.
   - Actions: **بحال کریں (Restore)**, **موازنہ کریں (Compare)**, or **مسترد کریں (Discard)**.
   - The system **never** silently replaces live content on initial load.

---

## 4. Manual Verification Test Script

Follow this step-by-step checklist to manually verify the autosave and sync behavior in Google Chrome or Microsoft Edge:

### Test 1: Offline Typing & Cloud Sync Recovery
1. Open the chapter editor for any novel (`/writer/novels/[id]/chapters/new` or an existing chapter).
2. Open Chrome DevTools (`F12`), switch to the **Network** tab, and toggle the throttling dropdown from **No throttling** to **Offline**.
3. Type several paragraphs of Urdu text in the editor.
4. Verify that within ~800 ms, the status chip shows:
   `📡 آف لائن — اس ڈیوائس پر محفوظ` (Offline — saved on this device).
5. Switch the DevTools Network dropdown back to **No throttling** (Online).
6. Observe that within 3 seconds, the sync engine triggers, the status chip shows `🔄 Syncing…`, and then settles on `☁️ Saved to cloud HH:MM`.
7. Verify that the draft row was updated in `chapter_drafts` in Supabase without modifying `public.chapters`.

### Test 2: Accidental Reload Warning while Unsynced
1. While still offline or before sync completes, attempt to close or refresh the tab.
2. Verify that the browser's standard `beforeunload` dialog warns: "Changes that you made may not be saved."

### Test 3: Multi-Tab Safety (Web Locks)
1. In Tab A, open Chapter 1 in the editor.
2. In Tab B (in the same browser profile), navigate to the exact same chapter URL.
3. Verify that Tab B displays the `TabConflictBanner`:
   `یہ باب ایک دوسرے ٹیب میں کھلا ہوا ہے۔ یکطرفہ ایڈیٹنگ کے لیے یہ ٹیب صرف پڑھنے کے موڈ میں ہے۔` (This chapter is open in another tab).
4. Verify typing is disabled in Tab B.
5. In Tab B, click the **"کنٹرول حاصل کریں" (Take over)** button.
6. Verify Tab B acquires the lock and enables typing, while Tab A relinquishes the lock and becomes read-only.

### Test 4: Conflict Resolution (Two Browsers / Devices)
1. Open Chapter 1 in Browser 1 (e.g. Chrome) and Browser 2 (e.g. Firefox or Edge) logged in as the same author.
2. In Browser 2, type "ورژن ۲ کی تبدیلی" and click "ابھی کلاؤڈ پر بھیجیں" (Sync now) to advance the server revision to 2.
3. In Browser 1, type "ورژن ۱ کی تبدیلی" and click "ابھی کلاؤڈ پر بھیجیں".
4. Verify Browser 1 triggers the **Conflict Dialog** with a visual line diff.
5. Test the three resolution options:
   - **Keep mine:** Overwrites cloud draft with Browser 1's content and bumps revision.
   - **Keep server:** Restores cloud content; archives Browser 1's draft under an archival key so nothing is deleted.
   - **Copy mine to new draft:** Creates an independent draft slot for the conflicting content.

### Test 5: Session Expiry Resilience
1. Open the editor and type content.
2. In DevTools > Application > Cookies / Local Storage, clear the Supabase auth token.
3. Trigger a sync.
4. Verify the status chip displays `🔒 Sign in to sync`.
5. Continue typing in the editor. Verify typing is not blocked and local saves continue to succeed in IndexedDB.
6. Re-authenticate via the login dialog.
7. Verify the sync engine resumes and cloud status turns to `☁️ Saved to cloud`.

---

## 5. Phase 2 Roadmap: Service Worker & PWA

In Phase 2, the marketplace will introduce a Progressive Web App (PWA) service worker to elevate offline tolerance:
1. **Offline App Shell Caching:** Cache Next.js HTML/JS/CSS assets with a stale-while-revalidate strategy via Workbox, allowing writers to open `/writer` and the chapter editor even without an active internet connection.
2. **Background Sync API (`sync` / `periodicsync`):** Register background sync tags so that even if a writer closes the browser tab while offline, the browser will wake up in the background and push drafts to the server once connectivity returns.
3. **PWA Install Prompt:** Allow writers to install UNB Studio as a native desktop/mobile application with an independent window, offline icon, and local cache quota allocation.
