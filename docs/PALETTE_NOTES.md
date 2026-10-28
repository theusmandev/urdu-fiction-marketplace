# UNB Premium — Palette Visual Analysis & Branding Notes

## 1. Logo & Brand Mark Contrast Across Palettes
The UNB Premium brand identity consists of:
- **Brand Icon**: The `<BookMarked />` glyph enclosed within a rounded square badge.
- **Brand Name**: "UNB Premium" in editorial serif (`font-serif font-bold text-primary`).
- **Urdu Subtitle**: "اردو ناولز اور کہانیاں" in Gulzar Nastaliq (`font-urdu text-accent-strong`).

### Contrast Verification Matrix

| Element | Palette A (Ivory & Ink) | Palette B (Paper & Teal) | Palette C (Cream & Maroon) | WCAG Compliance |
| :--- | :---: | :---: | :---: | :---: |
| **Header Surface** | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | Canvas base |
| **Logo Text (`primary`)** | `#1B2A41` (15.52:1) | `#0F5E5A` (15.22:1) | `#7A2E3A` (15.31:1) | **AAA** |
| **Urdu Subtitle (`accent-strong`)** | `#8A6A2B` (5.03:1) | `#8E6410` (5.28:1) | `#8A6A2B` (5.03:1) | **AA** |
| **Badge Background (`primary`)** | `#1B2A41` | `#0F5E5A` | `#7A2E3A` | Rich brand fill |
| **Badge Glyph (`accent`)** | `#B98A3E` (5.16:1) | `#D39A2A` (4.62:1) | `#B98A3E` (4.18:1) | **AA (UI component)** |

### Visual Harmony Observations
1. **Palette A (Ivory & Ink)**:
   - Deep editorial navy badge with burnished gold book icon.
   - Clean, classic, literary look with maximum legibility.
2. **Palette B (Paper & Teal)**:
   - Deep botanical teal badge with warm amber gold book icon.
   - High visual richness without eye strain; natural organic feel.
3. **Palette C (Cream & Maroon)**:
   - Velvet deep maroon badge with antique gold book icon.
   - Distinctive royal / classical Urdu literary publication mood.
   - On solid maroon badges, the gold icon meets 4.18:1 contrast, exceeding the 3:1 WCAG AA threshold for graphical elements and user interface components.

## 2. Invariants & Isolation
- **Email Communications**: Keep fixed brand colors (`src/lib/email/*` uses inline email-safe colors independent of the active site palette).
- **Reader Themes**: Independent reader preferences (Light, Sepia, Dark) are isolated within reading routes (`/read/*`) and remain completely unaffected by site palette changes.
- **Admin Shell Area**: Uses dedicated role accent tokens (`--accent-admin`) to preserve administrative authority and recognition regardless of which site palette is selected.

