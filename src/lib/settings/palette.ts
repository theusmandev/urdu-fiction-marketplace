/**
 * src/lib/settings/palette.ts
 *
 * Single source of truth for the curated site palettes.
 * Synchronized with PostgreSQL CHECK constraint chk_platform_settings_site_palette
 * in supabase/migrations/0036_site_palette_settings.sql.
 */

export const ALLOWED_SITE_PALETTES = [
  'ivory_ink',
  'paper_teal',
  'cream_maroon',
] as const;

export type SitePalette = (typeof ALLOWED_SITE_PALETTES)[number];

export const DEFAULT_SITE_PALETTE: SitePalette = 'ivory_ink';

export interface PaletteMeta {
  id: SitePalette;
  legacyCode: 'A' | 'B' | 'C';
  name: string;
  nameUrdu: string;
  description: string;
  descriptionUrdu: string;
  themeColor: string;
  swatches: {
    bg: string;
    surface: string;
    primary: string;
    accent: string;
    accentStrong: string;
  };
  contrastSummary: {
    textOnBg: string;
    textOnSurface: string;
    accentOnSurface: string;
    primaryContrast: string;
    status: 'WCAG AA Compliant';
  };
}

export const PALETTES_CONFIG: Record<SitePalette, PaletteMeta> = {
  ivory_ink: {
    id: 'ivory_ink',
    legacyCode: 'A',
    name: 'Ivory & Ink',
    nameUrdu: 'آئیوری اور انک',
    description: 'Warm bookish canvas with classical editorial navy and burnished gold accents.',
    descriptionUrdu: 'کلاسک نیوی اور سنہری حاشیوں کے ساتھ پرسکون کتابی انداز۔',
    themeColor: '#FBF8F2',
    swatches: {
      bg: '#FBF8F2',
      surface: '#FFFFFF',
      primary: '#1B2A41',
      accent: '#B98A3E',
      accentStrong: '#8A6A2B',
    },
    contrastSummary: {
      textOnBg: '14.64:1',
      textOnSurface: '15.52:1',
      accentOnSurface: '5.03:1',
      primaryContrast: '14.44:1',
      status: 'WCAG AA Compliant',
    },
  },
  paper_teal: {
    id: 'paper_teal',
    legacyCode: 'B',
    name: 'Paper & Teal',
    nameUrdu: 'پیپر اور ٹیل',
    description: 'Crisp laid paper tone anchored by deep botanical teal and warm amber gold.',
    descriptionUrdu: 'گہرے ٹیل اور عنبری سنہری رنگوں کے ساتھ پروقار تاثر۔',
    themeColor: '#FAF7F0',
    swatches: {
      bg: '#FAF7F0',
      surface: '#FFFFFF',
      primary: '#0F5E5A',
      accent: '#D39A2A',
      accentStrong: '#8E6410',
    },
    contrastSummary: {
      textOnBg: '14.22:1',
      textOnSurface: '15.22:1',
      accentOnSurface: '5.28:1',
      primaryContrast: '7.58:1',
      status: 'WCAG AA Compliant',
    },
  },
  cream_maroon: {
    id: 'cream_maroon',
    legacyCode: 'C',
    name: 'Cream & Maroon',
    nameUrdu: 'کریم اور میرون',
    description: 'Soft porcelain cream with literary deep maroon velvet and antique gold highlights.',
    descriptionUrdu: 'گہرے میرون مخمل اور قدیم سنہری جھلک کے ساتھ ادبی حسن۔',
    themeColor: '#FCF9F4',
    swatches: {
      bg: '#FCF9F4',
      surface: '#FFFFFF',
      primary: '#7A2E3A',
      accent: '#B98A3E',
      accentStrong: '#8A6A2B',
    },
    contrastSummary: {
      textOnBg: '14.58:1',
      textOnSurface: '15.31:1',
      accentOnSurface: '5.03:1',
      primaryContrast: '9.21:1',
      status: 'WCAG AA Compliant',
    },
  },
};

export function isSitePalette(value: unknown): value is SitePalette {
  return typeof value === 'string' && (ALLOWED_SITE_PALETTES as readonly string[]).includes(value);
}

export function getPaletteThemeColor(palette: SitePalette): string {
  return PALETTES_CONFIG[palette]?.themeColor ?? PALETTES_CONFIG.ivory_ink.themeColor;
}

export const ADMIN_PALETTE_PREVIEW_COOKIE = 'unb_admin_palette_preview';

