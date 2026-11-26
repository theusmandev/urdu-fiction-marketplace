# UNB Premium — Font Migration Specification: "Gulzar" Nastaliq

## 1. Executive Summary & Architectural Invariants

This document specifies the migration of all Urdu typography across **UNB Premium** (`یو این بی پریمیم`) from Google Font `Noto Nastaliq Urdu` to **`Gulzar`**.

- **Font Family**: `Gulzar` (Designed by Borna Izadpanah and Alice Savoie; released under SIL Open Font License on Google Fonts).
- **Self-Hosting Engine**: Next.js `next/font/google`. Zero third-party runtime HTTP requests to Google Font servers; fonts are downloaded at build time and served locally from `/_next/static/media/`.
- **Subsets**: `['arabic']`.
- **Display Strategy**: `display: 'swap'` with Next.js automated `size-adjust` fallback metric synthesis to guarantee **0 Cumulative Layout Shift (CLS)**.
- **Weights Invariant**: The `Gulzar` font family contains **strictly a single weight: `400` (Regular)**. Requesting any other weight (e.g. 600 or 700) is invalid and causes Next.js font build errors.
- **Fallback Font Stack**:
  ```css
  font-family: var(--font-urdu), "Noto Nastaliq Urdu", serif;
  ```
- **Synthetic Styling Prohibition**:
  Because Gulzar has no bold or italic weights, browser-generated synthetic bolding (`font-bold`, `font-semibold`) and faux italicization (`italic`) distort Nastaliq stroke modulation and break cursive ligature joins.
  Enforced via:
  ```css
  font-synthesis: none;
  ```

---

## 2. Opt-In Arabic & Quranic Typography (`<ArabicText>`)

Nastaliq calligraphy is structurally designed for Urdu/Persian poetry and prose, where ligatures cascade diagonally from top-right to bottom-left. However, for Quranic verses, Hadith, and Arabic prayers with dense diacritics (harakat / tashkeel like fatha, kasra, damma, sukun, shaddah, tanween), diagonal Nastaliq stacking can cause vertical collisions or misplaced accents.

To solve this, we provisioned an opt-in **`<ArabicText>`** component backed by **`Amiri`** (classical Arabic Naskh):
- **Import**: `import { ArabicText } from '@/components/urdu/ArabicText';`
- **Font**: `Amiri` via `next/font/google` (`weights: ['400', '700']`, `subsets: ['arabic']`, variable `--font-arabic`).
- **CSS Class**: `.font-arabic` -> `font-family: var(--font-arabic), "Amiri", "Noto Naskh Arabic", serif;`.
- **Usage for Authors / Future Features**:
  ```tsx
  // Quranic verse or Hadith quotation inside an Urdu chapter:
  <p className="font-urdu text-right">
    حضرت نے فرمایا: <ArabicText size="lg">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</ArabicText> پڑھ کر آغاز کرو۔
  </p>
  ```
- **No Automatic Detection**: Per design requirements, no regex or automatic parsing alters raw chapter text. Authors or editors can wrap Arabic phrases explicitly using `<ArabicText>` when needed.

---

## 3. Typography Calibration & Line-Height Tuning

Noto Nastaliq Urdu required excessive line-heights (`2.3` – `2.8`) and container padding (`pt-0.35rem pb-0.45rem`) because its font metrics placed glyph bounding boxes unusually far below and above the baseline, leading to severe clipping in buttons, badges, and cards.

**`Gulzar` features calibrated, modern digital screen metrics**:
1. **Body Content (`.urdu-content` & `<UrduText variant="body">`)**:
   - Default line-height set to **`2.0` – `2.1`** (down from `2.3`).
   - Word spacing tightened to **`0.08em`** (down from `0.12em`), producing dense, natural calligraphic lines without unnatural gaps.
2. **Headings (`.urdu-title` & `<UrduText variant="title">`)**:
   - Line-height set to **`1.8` – `1.9`** (down from `2.1`).
   - Padding hacks removed (`.urdu-safe-height` simplified to `overflow: visible !important;`).
3. **Reader Canvas (`SecureReaderClient` & `FreePreviewReaderClient`)**:
   - Preset line heights:
     - `normal`: `leading-[2.0]`
     - `relaxed`: `leading-[2.4]`
     - `loose`: `leading-[2.8]`
   - Font sizes scaled naturally across mobile and desktop (`sm`: 16/18px, `base`: 18/20px, `lg`: 20/24px, `xl`: 24/30px, `2xl`: 30/36px).
   - Protective reader watermark (`opacity-[0.06]`) sits behind text without colliding with Gulzar descenders.

---

## 4. Performance & Font Asset Payload Audit

Building with Next.js Turbopack generates local WOFF2 font files in `.next/static/media/`.

| Font | Subfamily / Weight | Format | Shipped File Size | Comparison vs. Noto Nastaliq |
| :--- | :--- | :--- | :--- | :--- |
| **Gulzar** | Regular (400) — Arabic Subset | WOFF2 | **187.3 KB** | **~75% reduction** (Noto was ~800 KB – 1.2 MB) |
| **Gulzar** | Regular (400) — Latin Subset | WOFF2 | **16.0 KB** | Secondary fallback |
| **Amiri** | Regular (400) — Arabic Subset | WOFF2 | **105.9 KB** | Dedicated Quranic Naskh opt-in |
| **Amiri** | Bold (700) — Arabic Subset | WOFF2 | **97.7 KB** | Naskh bold accent |

- **CLS Mitigation**: Next.js automatically injects size-adjust CSS fallback overrides:
  ```css
  @font-face {
    font-family: Gulzar Fallback;
    src: local(Times New Roman);
    ascent-override: 150.46%;
    descent-override: 120.37%;
    line-gap-override: 0.0%;
    size-adjust: 99.69%;
  }
  ```
  Text takes up identical vertical bounding box dimensions before and after font activation, yielding **0 Cumulative Layout Shift**.

---

## 5. Email Templates & Fallback Strategy

Email clients (Apple Mail, Gmail, Outlook Web, Yahoo) strip or ignore third-party `@font-face` web fonts. Embedding large WOFF2 font payloads in transactional emails causes deliverability issues and spam flag penalties.

- **Email Strategy**:
  - Urdu text in emails is kept concise (e.g. brand slogan and status labels).
  - Clean font fallback stack:
    ```css
    font-family: 'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Tahoma, serif;
    ```
  - If a user has `Gulzar` or `Noto Nastaliq Urdu` installed on their operating system (macOS, iOS, Windows, Android), it renders natively; otherwise it falls back to standard system Arabic/Urdu sans fonts (`Tahoma`, `Segoe UI`, `serif`).

---

## 6. Temporary Development Inspection Lab (`/dev/fonts`)

A dedicated development inspection lab has been provisioned at **`src/app/dev/fonts/page.tsx`** and **`DevFontTesterClient.tsx`**:
- **Environment Isolation**:
  ```tsx
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  ```
- **Sitemap & SEO**: Omitted from `sitemap.ts`; configured with `robots: { index: false, follow: false }`.
- **Features Provided**:
  1. **Line-Height Matrix**: Renders novel text across line heights `1.6`, `1.8`, `2.0`, `2.2` and sizes `16px`, `18px`, `20px`, `24px`, `28px`.
  2. **Specimen Catalog**: Novel excerpt, titles with deep ascenders/descenders, mixed bilingual Urdu-English text, Urdu numerals (`۰-۹`), and classical poetry couplets.
  3. **Quranic Tashkeel Audit**: Side-by-side comparison of full Quranic harakat in **Gulzar (Nastaliq)** vs. **Amiri (Naskh)**.
  4. **Visual Bounding Box Toggle**: Overlays outline bounds to inspect clipping and margin clearance.
  5. **Theme Switcher**: Tests typography against Light (`#FAF8F5`), Dark (`#121214`), and Sepia (`#F4ECD8`) backgrounds.

---

## 7. Complete Inventory of Changed Files

| File Path | Nature of Change |
| :--- | :--- |
| `src/app/layout.tsx` | Replaced `Noto_Nastaliq_Urdu` with `Gulzar` (`weight: "400"`, subsets: `['arabic']`, variable: `--font-urdu`). Added `Amiri` (`--font-arabic`). Added classes to `<html>`. |
| `tailwind.config.ts` | Updated `fontFamily.urdu` to `["var(--font-urdu)", "Noto Nastaliq Urdu", "serif"]`. Added `fontFamily.arabic`. Calibrated `lineHeight.nastaliq` (`2.1`), `nastaliq-tight` (`1.8`), `nastaliq-loose` (`2.4`). |
| `src/app/globals.css` | Updated `--font-urdu` and added `--font-arabic`. Applied `font-synthesis: none;` on `.font-urdu`, `.font-arabic`, `.urdu-content`, and `.urdu-title`. Added placeholder inheritance for `font-urdu`. Simplified `.urdu-safe-height`. |
| `src/components/urdu/UrduText.tsx` | Updated docstrings for Gulzar. Tuned line-heights in `sizeClasses` (`xs: 1.8` to `4xl: 2.5`). Removed `font-semibold` from `title` variant. Removed `italic` from `quote` variant. Added `[font-synthesis:none]`. |
| `src/components/urdu/ArabicText.tsx` | **NEW FILE**: Provisioned `<ArabicText>` component for Quranic verses and Arabic quotations with full harakat using Amiri Naskh (`font-arabic`). |
| `src/components/urdu/index.ts` | **NEW FILE**: Barrel export for `UrduText`, `BilingualSnippet`, and `ArabicText`. |
| `src/app/dev/fonts/page.tsx` | **NEW FILE**: Development-only typography inspection workbench with `NODE_ENV === 'production'` 404 guard. |
| `src/app/dev/fonts/DevFontTesterClient.tsx` | **NEW FILE**: Interactive client testing matrix for sizes, line-heights, themes, specimens, and Quranic tashkeel comparison. |
| `src/lib/email/templates.ts` | Updated email font-family fallback stack to include `'Gulzar'`. |
| `src/app/read/[slug]/[number]/SecureReaderClient.tsx` | Isolated chapter number badge with `font-urdu` without `font-semibold`. Removed `font-bold` from chapter title `UrduText` and reader end state. |
| `src/components/catalog/FreePreviewReaderClient.tsx` | Removed `font-bold` from `UrduText` author support heading; scaled to `size="xl"`. |
| `src/app/writer/novels/[id]/chapters/ChapterImportModal.tsx` | Removed `font-bold` on chapter title; scaled to `size="base"`. Removed `italic` on Urdu excerpt; applied `font-urdu`. |
| `src/app/writer/novels/[id]/chapters/ChapterListManager.tsx` | Removed `font-bold` on chapter title; scaled to `size="lg"`. |
| `src/app/writer/novels/NovelListClient.tsx` | Removed `font-bold` on novel title `UrduText`; scaled to `size="xl"`. |
| `src/app/writer/page.tsx` | Removed `font-bold` on author dashboard novel title `UrduText`; scaled to `size="base"`. |
| `src/app/writer/layout.tsx` | Added `font-urdu` and removed `font-semibold` on pen name label. Removed `font-bold` on `UrduText` pen name. Added `font-urdu` to pending approval text. |
| `src/app/orders/[orderNumber]/OrderDetailView.tsx` | Removed `font-semibold` on timeline Urdu status badge; scaled to `size="sm"`. |
| `src/app/orders/order-list-item.tsx` | Removed `font-bold` on novel title snapshot; scaled to `size="xl"`. |
| `src/app/admin/novels/[id]/page.tsx` | Removed `font-semibold` on title and chapter title `UrduText`; scaled to `size="2xl"` and `size="lg"`. |
| `src/app/login/login-form.tsx` | Replaced `font-bold text-3xl` with `text-4xl` on brand Urdu logo. |
| `src/app/register/register-form.tsx` | Replaced `font-bold text-3xl` with `text-4xl` on brand Urdu logo. |
| `src/app/forgot-password/forgot-password-form.tsx` | Replaced `font-bold text-3xl` with `text-4xl` on brand Urdu logo. |
| `src/app/reset-password/page.tsx` | Replaced `font-bold text-3xl` with `text-4xl` on brand Urdu logo. |
| `src/app/become-a-writer/page.tsx` | Removed `font-semibold` on pen name; styled with `font-urdu text-lg text-amber-400`. |
| `docs/FONT_CHANGE.md` | **NEW FILE**: Detailed typography migration documentation and benchmark audit. |

---

## 8. Admin-Switchable Reader Urdu Font: Jameel Noori Nastaleeq Subset

### Architectural Invariants & Scope
- **Deployment Platform**: Deployed strictly as a **Cloudflare Worker** (OpenNext output in `.open-next/worker.js`, configured via `wrangler.jsonc` with `"keep_vars": true`). This project does NOT use Cloudflare Pages.
- **Global Setting**: Stored in `public.platform_settings.reader_urdu_font` (`'gulzar'` default vs `'noori'`).
- **Scope Isolation**: When active, **only** the Paid Secure Reader and Free Preview Reader apply Noori (`data-reader-font="noori"`). All other pages (marketplace, author studio, checkout, admin, etc.) strictly use `Gulzar` and **never** download the ~5 MB font.
- **Zero Public Repo Binaries**: The repository is public. Font binaries (`.woff2`, `.ttf`, `.otf`) are strictly gitignored and must never be committed to git.
- **Zero Mid-Read Layout Shift**: On slow connections, `useReaderNooriFont` keeps Gulzar active for the entire current chapter if the font takes longer than 150ms to load, streaming Noori in the background. Subsequent chapter reads hit browser disk cache instantly (<20ms).
- **Data-Saver & Slow Network Guard**: Feature-detects `navigator.connection`. If `saveData === true` or `effectiveType` is `'slow-2g' | '2g' | '3g'`, Noori downloading is bypassed entirely to respect user bandwidth and latency, keeping the reader on Gulzar.
- **Graceful Fallback**: If `NOORI_FONT_URL` is unconfigured, corrupted, or unreachable, readers automatically and safely fall back to Gulzar with zero UI disruption.

### Cloudflare R2 Hosting & CORS Setup
The site owner hosts `JameelNooriNastaleeq-subset.v1.woff2` on Cloudflare R2:
1. **Bucket CORS Configuration**:
   Allow ONLY the production origin and local development origin:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://premium.urdunovelbanks.com",
         "http://localhost:3000"
       ],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```
2. **Edge Cache Headers**:
   - `Cache-Control: public, max-age=31536000, immutable`
   - `Content-Type: font/woff2`
3. **Environment Variables Configuration (Cloudflare Worker)**:
   - **`NOORI_FONT_URL`** (Worker Runtime Secret / Variable):
     - Configured in Cloudflare Dashboard: **Workers & Pages -> [Worker: unb-premium] -> Settings -> Variables and Secrets**.
     - Because `wrangler.jsonc` sets `"keep_vars": true`, dashboard runtime variables are preserved and will NOT be overwritten by subsequent CLI deployments.
     - Example value: `https://assets.urdunovelbanks.com/fonts/JameelNooriNastaleeq-subset.v1.woff2`
   - **`NOORI_FONT_ORIGIN`** (Workers Builds Environment Variable):
     - Configured in Cloudflare Dashboard: **Workers & Pages -> [Worker: unb-premium] -> Builds -> Build variables** (and in local `.env.local`).
     - **CRITICAL**: `next.config.ts` reads `NOORI_FONT_ORIGIN` during `npm run build` to append the origin to Content-Security-Policy (CSP) `font-src`. If this variable is missing at build time, the generated CSP header will block the browser from fetching the font from the external origin.
     - Example value: `https://assets.urdunovelbanks.com`
4. **Font Licensing**:
   - Font licensing, redistribution rights, and commercial permissions remain strictly the legal responsibility of the site owner.

