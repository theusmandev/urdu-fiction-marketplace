# UNB Premium — Vector Brand Identity & Asset Architecture

This document defines the official vector logo system, SVG variants, component architecture, raster derivatives, placement across the site, and the rebuild workflow.

---

## 1. Master Vector Source

- **File**: `public/brand/source/logo-source.svg` (viewBox: `0 0 1250 1345`)
- **Structure**: Self-contained, pure vector SVG. All text (Urdu calligraphy, Latin *"URDU NOVEL BANK"*, and ribbon *"PREMIUM"*) is converted to paths; no external web fonts or scripts are required.
- **Color Gradients**:
  - `paper`: warm radial gradient (`#fff7ec` → `#fdf0e1` → `#f8e3cb`)
  - `ring`: gold/bronze gradient (`#c4731f` → `#ad5e14` → `#8f4a0e`)
  - `feather`: quill gradient (`#c8741f` → `#9a4b09` → `#622a06`)
  - `book`: open book gradient (`#b9681b` → `#93470c` → `#5c2706`)
  - `urdu`: calligraphy gradient (`#a95a14` → `#8a400a` → `#6d3007`)
  - `ink`: dark ink swoosh gradient (`#6b2f09` → `#5a2607`)
  - `gold` / `band` / `gloss` / `cream`: ribbon banner, border, gloss highlight, and *"PREMIUM"* lettering

> [!IMPORTANT]
> **"PREMIUM" is part of the artwork:** The word *"PREMIUM"* in the bottom ribbon consists of vector paths drawn directly into the source artwork. It is **not** a CSS live-text overlay. Any future brand name or suffix modification requires updating the ribbon path vectors in the source SVG before rebuilding.

---

## 2. Generated Vector Variants

All variants are extracted directly from the semantic groups of `logo-source.svg` and optimized with SVGO (`preset-default` + `prefixIds` to eliminate ID collisions when multiple variants appear on the same page):

| Variant File | Dimensions / ViewBox | Groups Included | Usage & Placement |
| :--- | :--- | :--- | :--- |
| **`logo-full.svg`** | `0 0 1250 1345` | Complete roundel + ribbon + ornaments + "PREMIUM" | About page, Auth pages (Login, Register, Forgot/Reset Password), Footer, Error/404 pages |
| **`logo-roundel.svg`** | `25 25 1200 1200` (1:1 square) | Roundel alone (circle, quill, book, Urdu calligraphy, ink swoosh, English text; no ribbon) | Circular profile avatars, standalone brand badges, invoice print views |
| **`logo-mark.svg`** | `25 25 1200 1200` (1:1 square) | Quill pen and open book inside the gold ring | Favicon.ico (16/32/48), tiny avatars, Writer Studio shell, Admin shell top bar |
| **`logo-wordmark.svg`** | `150 632 950 362` (~2.62:1 ratio) | Urdu calligraphy (*اردو ناول بینک*) + ink swoosh underline + diamond | Marketplace header lockup (desktop & mobile), landing hero accents |
| **`tag-premium.svg`** | `95 1172 1060 146` (~7.26:1 ratio) | Flat ribbon (gold edge, brown band, inner rule, ornaments, "PREMIUM" text; no gloss or shadow) | Header lockup (scaled to 14-22px height), compact product badges |
| **`tag-premium-full.svg`** | `80 1165 1090 175` | Full ribbon with original gloss gradient and drop shadow | Large standalone ribbon displays, marketing hero graphics |

---

## 3. Component: `<BrandLogo />`

Located at: [`src/components/brand/BrandLogo.tsx`](file:///e:/git-workstation/urdu-fiction-marketplace/src/components/brand/BrandLogo.tsx)

### Supported Variants

1. **`variant="full"`**: Complete artwork (roundel + ribbon). Renders `/brand/logo-full.svg`.
2. **`variant="roundel"`**: 1:1 circular badge without ribbon. Renders `/brand/logo-roundel.svg`.
3. **`variant="mark"`**: Simplified quill + book inside ring. Renders `/brand/logo-mark.svg`. Supports `plate` prop for dark bars.
4. **`variant="wordmark"`**: Urdu calligraphy vector cropped to its bounding box. Renders `/brand/logo-wordmark.svg`.
5. **`variant="tag"`**: Flat "PREMIUM" ribbon tag. Renders `/brand/tag-premium.svg`.
6. **`variant="lockup"`**: Composed header identity (typography-only):
   - Vertical stack: Urdu calligraphy (`logo-wordmark.svg`) on top, flat "PREMIUM" tag (`tag-premium.svg`) on bottom.
   - Responsive width: `w-[95px]` on mobile, `w-[115px]` on desktop.
   - Visible across all screen sizes (no circular mark, no `<360px` hiding).

### Properties

- `variant`: `'full' | 'roundel' | 'lockup' | 'mark' | 'wordmark' | 'tag'` (default: `'full'`)
- `size`: Primary dimension in pixels (width or diameter).
- `width` / `height`: Explicit override dimensions in pixels.
- `priority`: boolean (used on the sticky marketplace header for instant above-the-fold render).
- `plate`: boolean (applies subtle light backing plate behind mark/roundel on dark shells).
- `alt`: string (accessible alt text; defaults to `siteConfig.brandName`).

---

## 4. Raster Derivatives Inventory

Generated automatically by `scripts/build-brand-assets.mjs` via Sharp with `lanczos3` resampling and maximum compression:

| Asset Path | Resolution | Description & Purpose |
| :--- | :--- | :--- |
| `public/favicon.ico` | 16x16, 32x32, 48x48 | Multi-size root browser tab icon generated from `logo-mark.svg`. |
| `public/apple-touch-icon.png` | 180x180 | iOS Home Screen bookmark icon on cream background with safe margin. |
| `public/icon-192.png` | 192x192 | Progressive Web App maskable icon on cream background. |
| `public/icon-512.png` | 512x512 | Progressive Web App splash/install icon on cream background. |
| `public/brand/logo-email.png` | 280x301 (@ 2x) | High-DPI PNG for email clients (displays at 140x151 in HTML emails). |
| `public/brand/og-image.png` | 1200x630 | Open Graph card composed with `logo-full` on ivory site background. |
| `public/og-image.jpg` | 1200x630 | JPEG fallback for social sharing preview crawlers. |
| `public/brand/*@2x.png`, `*@3x.png` | Multi-DPI PNGs | High-resolution raster fallbacks for `logo-full`, `logo-roundel`, `logo-mark`, `logo-wordmark`, and `tag-premium`. |

---

## 5. Development Inspection Page

A dedicated visual testing page is available in development mode:
- **Route**: [`/dev/brand`](http://localhost:3000/dev/brand) (`src/app/dev/brand/page.tsx`)
- **Features**:
  - Live palette switcher (Palette A, B, C)
  - Interactive size ladder: `16px`, `24px`, `32px`, `44px`, `64px`, `96px`, `140px`, `220px`
  - Background contrast matrix: White (`#FFFFFF`), Ivory (`#FBF8F2`), Muted (`#F4ECD8`), Studio Navy (`#1B2A41`), Dark (`#111827`)
  - Visual display of all 6 vector variants plus raster previews
  - Excluded from production builds (`notFound()` in `NODE_ENV === 'production'`, `noindex, nofollow`)

---

## 6. How to Replace Artwork & Rebuild

To update the vector logo artwork:
1. Place the new master SVG at **`public/brand/source/logo-source.svg`** (viewBox: `0 0 1250 1345`).
2. Run the build script:
   ```bash
   npm run build:brand
   ```
3. Run verification tests:
   ```bash
   npm run check:colors
   npm run check:contrast
   npm run check:frontend
   npm test
   npm run build
   ```
