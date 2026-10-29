# UNB Premium — Brand Identity & Asset Architecture

This document outlines the brand assets, component architecture, derivative sizes, where each asset is used, and how to replace artwork and rebuild all derivatives.

---

## 1. Brand Logo Architecture

The UNB Premium brand identity combines two layers:
1. **The Circular Badge Artwork (`public/brand/logo-circle.png`)**:
   - Original master artwork: Cream circular badge with warm brown calligraphy (*اردو ناول بینک*), open book, quill, and spaced Latin text (*URDU NOVEL BANK*).
   - Rendered via Next.js `<Image />` inside a circular mask (`rounded-full overflow-hidden`) to guarantee clean circular boundaries even if an artwork without transparent corners is supplied.
2. **The Live-Text "PREMIUM" Ribbon**:
   - Built with pure SVG and CSS live text rather than being baked into the raster image.
   - Positioned directly below the circle badge, overlapping its bottom by ~15%.
   - Notched/dovetail ends on both sides with a double gold border.
   - Text source: **`siteConfig.brandSuffix`** in [`src/config/site.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/src/config/site.ts) (default: `"Premium"`).
   - Dynamically inherits the active site palette:
     - **Palette A (`ivory_ink`)**: Editorial Navy fill (`#1B2A41`), gold border (`#B98A3E`), ivory text (`#FBF8F2`).
     - **Palette B (`paper_teal`)**: Deep Teal fill (`#0F5E5A`), amber gold border (`#D39A2A`), paper text (`#FAF7F0`).
     - **Palette C (`cream_maroon`)**: Rich Maroon fill (`#7A2E3A`), gold border (`#B98A3E`), cream text (`#FCF9F4`).

---

## 2. Component: `<BrandLogo />`

Located at: [`src/components/brand/BrandLogo.tsx`](file:///e:/git-workstation/urdu-fiction-marketplace/src/components/brand/BrandLogo.tsx)

### Variants

| Variant | Purpose | Default Size | Locations Used |
| :--- | :--- | :---: | :--- |
| **`"full"`** | Circle badge + live-text ribbon below | `96px` (scaled up to `104px`) | About page, Auth pages (Login, Register, Forgot Password, Reset Password), Footer, Global 404 & Error pages |
| **`"lockup"`** | Circle at 44–48px (38px on phones) with scaled-down ribbon and optional wordmark | `46px` | Sticky Marketplace Header, Slide-Over Navigation Drawer |
| **`"mark"`** | Standalone circle badge with circular mask and optional contrast plate | `36px` | Writer Studio top bar, Admin Shell top bar, compact badges |

### Key Properties

- `variant`: `'full' | 'lockup' | 'mark'` (default: `'full'`)
- `size`: circle diameter in pixels.
- `priority`: boolean (used on above-the-fold header to eliminate LCP delay).
- `showWordmark`: boolean (in `lockup`, renders adjacent brand title and Urdu subtitle).
- `plate`: boolean (renders a light contrast backing plate / ring behind the circle for dark or indigo bars like Writer Studio and Admin top bars).
- `alt`: string (accessible alt text; defaults to `""` for full/lockup when live text is present, or `siteConfig.brandName` for standalone mark).

---

## 3. Generated Brand Assets Inventory

All derivative assets are generated automatically from `public/brand/logo-circle.png` by running:

```bash
npm run build:brand
```

| Asset Path | Format & Dimensions | Purpose & Usage |
| :--- | :--- | :--- |
| `public/brand/logo-circle.png` | PNG (512x512) | **Original Master Artwork** (kept untouched). |
| `public/brand/logo-circle-64.(png\|webp)` | 64x64 | Small viewports, mobile header derivatives. |
| `public/brand/logo-circle-96.(png\|webp)` | 96x96 | Desktop header, auth page headers. |
| `public/brand/logo-circle-128.(png\|webp)` | 128x128 | High-DPI screens, About page hero. |
| `public/brand/logo-circle-192.(png\|webp)` | 192x192 | Retina 2x displays. |
| `public/brand/logo-circle-256.(png\|webp)` | 256x256 | High-resolution brand displays. |
| `public/brand/logo-circle-512.(png\|webp)` | 512x512 | Full-resolution master raster. |
| `public/brand/logo-circle-16.png` | 16x16 | Browser tab favicon entry. |
| `public/brand/logo-circle-32.png` | 32x32 | Standard desktop browser tab favicon. |
| `public/brand/logo-circle-48.png` | 48x48 | High-DPI browser tab favicon entry. |
| `public/favicon.ico` | Multi-size ICO (16, 32, 48) | Root browser tab icon. |
| `public/apple-touch-icon.png` | PNG (180x180) | iOS Home Screen bookmark icon with safe padding. |
| `public/icon-192.png` | PNG (192x192) | Progressive Web App maskable icon (80% safe zone). |
| `public/icon-512.png` | PNG (512x512) | Progressive Web App splash/install icon (80% safe zone). |
| `public/site.webmanifest` | JSON Web Manifest | Web app manifest linking PWA icons and brand name. |
| `public/brand/logo-email.png` | PNG (400x260 @ 2x) | Pre-rendered composite for email clients (circle + Default Palette A ribbon). Email clients cannot parse CSS clip-paths or variables. |
| `public/brand/og-image.png` | PNG (1200x630) | Social sharing card for Open Graph / Twitter previews. |
| `public/og-image.jpg` | JPEG (1200x630) | Legacy fallback social sharing card. |

---

## 4. How to Replace Artwork & Rebuild

To replace the circle logo:
1. Place the new circle graphic at **`public/brand/logo-circle.png`** (recommended: 512x512 transparent PNG or high-res square).
   > [!TIP]
   > For optimal results, supply a PNG with transparent corners. If a file with solid corners is provided, the `<BrandLogo />` component will automatically apply a `rounded-full overflow-hidden` CSS mask.
2. If the brand name or suffix text needs to be changed, edit `brandSuffix` or `brandName` in [`src/config/site.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/src/config/site.ts).
3. Run the automated build script:
   ```bash
   npm run build:brand
   ```
4. Verify tests and visual display:
   ```bash
   npm run check:contrast
   npm run check:colors
   npm test
   npm run build
   ```

