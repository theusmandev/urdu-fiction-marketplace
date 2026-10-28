"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { UrduText } from "@/components/urdu/UrduText";
import {
  Palette,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  BookOpen,
  Heart,
  Search,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Coffee,
  X,
} from "lucide-react";

type PaletteId = "A" | "B" | "C";

interface PaletteMeta {
  id: PaletteId;
  name: string;
  subtitle: string;
  description: string;
  primary: string;
  bg: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

const PALETTES: PaletteMeta[] = [
  {
    id: "A",
    name: "Ivory & Ink",
    subtitle: "Default Preset",
    description: "Warm ivory background (#FBF8F2) with deep editorial navy primary (#1B2A41) and classic muted gold (#B98A3E).",
    bg: "#FBF8F2",
    surface: "#FFFFFF",
    surfaceMuted: "#F3EEE3",
    border: "#E8E1D3",
    text: "#1F2430",
    textMuted: "#5F6673",
    primary: "#1B2A41",
    accent: "#B98A3E",
    accentStrong: "#8A6A2B",
    success: "#2F7D5B",
    warning: "#B7791F",
    danger: "#B4432F",
    info: "#2F6690",
  },
  {
    id: "B",
    name: "Paper & Teal",
    subtitle: "Organic Literati",
    description: "Classic paper canvas (#FAF7F0) with literary deep teal (#0F5E5A) and amber gold (#D39A2A).",
    bg: "#FAF7F0",
    surface: "#FFFFFF",
    surfaceMuted: "#F1ECDF",
    border: "#E6DFD0",
    text: "#22262B",
    textMuted: "#5B6470",
    primary: "#0F5E5A",
    accent: "#D39A2A",
    accentStrong: "#8E6410",
    success: "#2F7D5B",
    warning: "#B7791F",
    danger: "#B4432F",
    info: "#2F6690",
  },
  {
    id: "C",
    name: "Cream & Maroon",
    subtitle: "Subcontinental Classics",
    description: "Warm cream canvas (#FCF9F4) with regal subcontinental maroon (#7A2E3A) and antique gold (#B98A3E).",
    bg: "#FCF9F4",
    surface: "#FFFFFF",
    surfaceMuted: "#F5EEE6",
    border: "#EADFD2",
    text: "#2A2420",
    textMuted: "#6B6058",
    primary: "#7A2E3A",
    accent: "#B98A3E",
    accentStrong: "#8A6A2B",
    success: "#3C7A55",
    warning: "#B7791F",
    danger: "#A63A3A",
    info: "#4A6A8A",
  },
];

function getRelativeLuminance(hex: string): number {
  const sanitized = hex.trim().replace(/^#/, "");
  const r = parseInt(sanitized.slice(0, 2), 16) / 255;
  const g = parseInt(sanitized.slice(2, 4), 16) / 255;
  const b = parseInt(sanitized.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrast(fg: string, bg: string): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function DevThemeClient() {
  const [activePalette, setActivePalette] = useState<PaletteId>("A");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("unb_dev_palette") as PaletteId | null;
      if (saved && (saved === "A" || saved === "B" || saved === "C")) {
        setActivePalette(saved);
        document.documentElement.setAttribute("data-palette", saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handlePaletteChange = (id: PaletteId) => {
    setActivePalette(id);
    document.documentElement.setAttribute("data-palette", id);
    try {
      localStorage.setItem("unb_dev_palette", id);
    } catch {
      // Ignore
    }
  };

  const curr = PALETTES.find((p) => p.id === activePalette) || PALETTES[0];

  const swatchRows = [
    { token: "--color-bg", label: "Canvas Background", hex: curr.bg, bgHex: "#FFFFFF", role: "Page base background" },
    { token: "--color-surface", label: "Surface (Cards, Modals)", hex: curr.surface, bgHex: curr.bg, role: "Elevated content container" },
    { token: "--color-surface-muted", label: "Surface Muted", hex: curr.surfaceMuted, bgHex: curr.bg, role: "Subtle backgrounds, footers" },
    { token: "--color-text", label: "Primary Text", hex: curr.text, bgHex: curr.bg, role: "Headings & main body text" },
    { token: "--color-text-muted", label: "Muted Text", hex: curr.textMuted, bgHex: curr.bg, role: "Subheadings, secondary details" },
    { token: "--color-border", label: "Border", hex: curr.border, bgHex: curr.bg, role: "Card & section dividers" },
    { token: "--color-primary", label: "Brand Primary", hex: curr.primary, bgHex: curr.bg, role: "Hero CTAs, key brand accents" },
    { token: "--color-accent", label: "Brand Accent (Gold)", hex: curr.accent, bgHex: curr.bg, role: "Icons, borders, decorative" },
    { token: "--color-accent-strong", label: "Accent Strong (Dark Gold)", hex: curr.accentStrong, bgHex: curr.bg, role: "Text links & small gold text" },
    { token: "--color-success", label: "Status Success", hex: curr.success, bgHex: "#EBF5EF", role: "Verified, completed, active" },
    { token: "--color-warning", label: "Status Warning", hex: curr.warning, bgHex: "#FEF8EC", role: "Pending review, alert" },
    { token: "--color-danger", label: "Status Danger", hex: curr.danger, bgHex: "#FCEEED", role: "Rejected, failed, dispute" },
    { token: "--color-info", label: "Status Info", hex: curr.info, bgHex: "#EBF3F8", role: "Notices, guides, announcements" },
  ];

  return (
    <div className="min-h-screen bg-bg text-text py-8 sm:py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-accent-soft selection:text-text">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* HEADER & PALETTE SELECTOR */}
        <header className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent-strong border border-border">
                <Palette className="w-3.5 h-3.5" />
                <span>Dev-Only Design Token Lab</span>
              </div>
              <h1 className="text-3xl font-serif font-bold text-primary">
                Semantic Color Lab & Component Showcase
              </h1>
              <p className="text-sm text-text-muted">
                Compare three warm light palettes live across all UI patterns. Changes apply instantly to the entire application.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-accent-strong hover:underline self-start sm:self-auto"
            >
              <span>← Back to Marketplace</span>
            </Link>
          </div>

          {/* PALETTE SWITCHER BUTTONS */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Select Palette Preset
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PALETTES.map((p) => {
                const isActive = activePalette === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePaletteChange(p.id)}
                    className={`text-left p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      isActive
                        ? "border-primary bg-surface shadow-md ring-2 ring-primary/20"
                        : "border-border bg-surface-muted hover:border-primary/40 hover:bg-surface"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-lg font-bold text-text">
                          Preset {p.id}: {p.name}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary text-primary-contrast">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-accent-strong block">
                        {p.subtitle}
                      </span>
                      <p className="text-xs text-text-muted leading-relaxed">
                        {p.description}
                      </p>
                    </div>

                    {/* Color Swatch Preview Strip */}
                    <div className="flex items-center gap-2 pt-4 mt-2 border-t border-border/80">
                      <span className="text-[10px] text-text-muted">Tokens:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: p.bg }} title="bg" />
                        <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: p.primary }} title="primary" />
                        <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: p.accent }} title="accent" />
                        <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: p.text }} title="text" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* SECTION 1: LIVE SWATCH TABLE & WCAG AA CONTRAST RATIOS */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              1. Live Token Swatch & Contrast Table ({curr.name})
            </h2>
            <p className="text-xs text-text-muted">
              Live calculated WCAG 2.1 relative luminance and contrast ratio against context backgrounds.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-border rounded-xl overflow-hidden">
              <thead className="bg-surface-muted text-text-muted uppercase text-[10px] font-semibold tracking-wider border-b border-border">
                <tr>
                  <th className="p-3">Swatch</th>
                  <th className="p-3">Token Name</th>
                  <th className="p-3">Semantic Label</th>
                  <th className="p-3">Hex Value</th>
                  <th className="p-3">Role & Usage</th>
                  <th className="p-3 text-right">Contrast Ratio</th>
                  <th className="p-3 text-center">WCAG AA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {swatchRows.map((row) => {
                  const ratio = getContrast(row.hex, row.bgHex);
                  const pass = ratio >= 4.5 || (ratio >= 3.0 && row.token.includes("border"));
                  return (
                    <tr key={row.token} className="hover:bg-surface-muted/50 transition-colors">
                      <td className="p-3">
                        <div
                          className="w-8 h-8 rounded-lg border border-border shadow-inner"
                          style={{ backgroundColor: row.hex }}
                        />
                      </td>
                      <td className="p-3 font-mono font-semibold text-text">{row.token}</td>
                      <td className="p-3 text-text font-medium">{row.label}</td>
                      <td className="p-3 font-mono text-text-muted">{row.hex}</td>
                      <td className="p-3 text-text-muted">{row.role}</td>
                      <td className="p-3 text-right font-mono font-bold text-text">
                        {ratio.toFixed(2)}:1
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            pass
                              ? "bg-success-soft text-success-text border border-success-border"
                              : "bg-danger-soft text-danger-text border border-danger-border"
                          }`}
                        >
                          {pass ? "PASS" : "FAIL"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 2: BUTTONS (ALL STATES & TOUCH TARGET VERIFICATION) */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              2. Standardized Buttons & Touch Targets (44px Minimum)
            </h2>
            <p className="text-xs text-text-muted">
              Primary = filled primary; Secondary = outlined; Tertiary = text. All provide 44px touch targets on phones and visible 2px focus rings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Primary Buttons */}
            <div className="space-y-3 p-4 rounded-xl bg-surface-muted/40 border border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Primary Button</h3>
              <div className="space-y-2.5">
                <button type="button" className="btn-primary w-full">
                  <span>Primary Normal</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button type="button" className="btn-primary w-full opacity-90 ring-2 ring-primary ring-offset-2">
                  <span>Primary Focus State</span>
                </button>
                <button type="button" disabled className="btn-primary w-full">
                  <span>Primary Disabled</span>
                </button>
              </div>
            </div>

            {/* Secondary Buttons */}
            <div className="space-y-3 p-4 rounded-xl bg-surface-muted/40 border border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Secondary Button</h3>
              <div className="space-y-2.5">
                <button type="button" className="btn-secondary w-full">
                  <span>Secondary Normal</span>
                </button>
                <button type="button" className="btn-secondary w-full ring-2 ring-primary ring-offset-2">
                  <span>Secondary Focus State</span>
                </button>
                <button type="button" disabled className="btn-secondary w-full">
                  <span>Secondary Disabled</span>
                </button>
              </div>
            </div>

            {/* Tertiary Buttons */}
            <div className="space-y-3 p-4 rounded-xl bg-surface-muted/40 border border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Tertiary Button</h3>
              <div className="space-y-2.5">
                <button type="button" className="btn-tertiary w-full">
                  <span>Tertiary Normal</span>
                </button>
                <button type="button" className="btn-tertiary w-full ring-2 ring-primary ring-offset-2">
                  <span>Tertiary Focus State</span>
                </button>
                <button type="button" disabled className="btn-tertiary w-full">
                  <span>Tertiary Disabled</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: FORM INPUTS & VALIDATION STATES */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              3. Form Inputs & Urdu Nastaliq Inputs
            </h2>
            <p className="text-xs text-text-muted">
              Input backgrounds use surface (#FFFFFF) with high-contrast text and placeholder styling.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text">Standard Input</label>
              <input
                type="text"
                placeholder="Search novels, authors..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-text text-xs placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text">Focus State</label>
              <input
                type="text"
                defaultValue="Focused value"
                className="w-full px-3.5 py-2.5 rounded-xl border border-primary bg-surface text-text text-xs ring-2 ring-ring outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-danger-text">Error State</label>
              <input
                type="text"
                defaultValue="Invalid input value"
                className="w-full px-3.5 py-2.5 rounded-xl border border-danger bg-danger-soft/30 text-danger-text text-xs ring-1 ring-danger outline-none"
              />
              <span className="text-[10px] text-danger-text">Please enter a valid amount.</span>
            </div>

            <div className="space-y-1.5" dir="rtl">
              <label className="text-xs font-semibold text-text font-urdu">اردو نستعلیق ان پٹ</label>
              <input
                type="text"
                placeholder="عنوان یا مصنف کا نام درج کریں"
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-surface text-text text-xs font-urdu placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        {/* SECTION 4: STATUS BADGES & ALERTS */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              4. Status Badges & Semantic Alerts
            </h2>
            <p className="text-xs text-text-muted">
              Badges use soft-tint backgrounds with strong text of the same hue to guarantee WCAG AA readability.
            </p>
          </div>

          {/* Badges strip */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Status Badges</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-success-soft text-success-text border border-success-border">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified / فعال</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-warning-soft text-warning-text border border-warning-border">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Pending Review / زیر جائزہ</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-danger-soft text-danger-text border border-danger-border">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Rejected / مسترد شدہ</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-info-soft text-info-text border border-info-border">
                <Info className="w-3.5 h-3.5" />
                <span>Information / معلوماتی</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent-strong border border-border">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Featured / منتخب</span>
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-accent-admin-soft text-accent-admin border border-accent-admin-border">
                ADMIN
              </span>
            </div>
          </div>

          {/* Alerts */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Semantic Alert Banners</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-success-soft border border-success-border text-success-text text-xs flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-semibold block">Payment Verified Successfully</strong>
                  <span>Your novel access has been unlocked and added to your library.</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-warning-soft border border-warning-border text-warning-text text-xs flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-semibold block">Verification in Progress</strong>
                  <span>The author typically verifies payments within 2-4 hours.</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs flex items-start gap-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-semibold block">Dispute Window Ending</strong>
                  <span>You have 2 days remaining to raise an inquiry regarding this transaction.</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-info-soft border border-info-border text-info-text text-xs flex items-start gap-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-semibold block">Author Studio Notice</strong>
                  <span>Platform fee settlement invoices are processed on the 1st of each month.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: CARD PATTERNS (NOVEL CARD & TIP JAR CARD) */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              5. Core Cards: Novel Card & Tip Jar Card
            </h2>
            <p className="text-xs text-text-muted">
              Comparing cards in the active palette. Covers remain authentic; small gold text is replaced by accent-strong.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Novel Card Mockup */}
            <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden p-5 flex gap-4">
              <div className="w-28 h-40 rounded-xl bg-primary/10 border border-border flex flex-col items-center justify-center p-3 text-center shrink-0">
                <BookOpen className="w-8 h-8 text-accent-strong mb-2" />
                <UrduText size="sm" className="text-text font-normal">
                  پیرِ کامل
                </UrduText>
              </div>

              <div className="flex-1 flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-accent-strong uppercase tracking-wider">
                    Spiritual Fiction
                  </span>
                  <h3 className="font-serif text-lg font-bold text-text leading-tight">
                    Peer-e-Kamil (S.A.W)
                  </h3>
                  <UrduText size="base" className="text-text-muted py-0">
                    عمیرہ احمد
                  </UrduText>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">PKR 450</span>
                  <button type="button" className="btn-primary !min-h-[36px] !px-3 !py-1.5 text-xs">
                    Read Novel
                  </button>
                </div>
              </div>
            </div>

            {/* Tip Jar Card Mockup */}
            <div className="bg-surface rounded-2xl border border-border shadow-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent-strong border border-border flex items-center justify-center font-bold">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-text">Support the Author</h3>
                  <UrduText size="xs" className="text-text-muted py-0">مصنف کی داد و سرپرستی</UrduText>
                </div>
              </div>

              {/* Preset buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className="p-2 rounded-xl border border-primary bg-primary/10 text-primary font-bold text-xs text-center">
                  <div>☕ Chai</div>
                  <div className="text-[10px] opacity-80">PKR 100</div>
                </button>
                <button type="button" className="p-2 rounded-xl border border-border hover:bg-surface-muted text-text font-medium text-xs text-center">
                  <div>🍬 Mithai</div>
                  <div className="text-[10px] opacity-80">PKR 250</div>
                </button>
                <button type="button" className="p-2 rounded-xl border border-border hover:bg-surface-muted text-text font-medium text-xs text-center">
                  <div>🎁 Eidi</div>
                  <div className="text-[10px] opacity-80">PKR 500</div>
                </button>
              </div>

              <p className="text-[11px] text-text-muted leading-relaxed">
                Direct gift sent directly to the author's bank account. Voluntary appreciation.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 6: READER PREVIEW (LIGHT, SEPIA, DARK) */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              6. Reader Mode Typography Previews
            </h2>
            <p className="text-xs text-text-muted">
              Reader themes remain reader preferences: Light (#FBF8F2/#2A2520), Sepia (#F4ECD8/#3B3226), and Dark. Tested with Gulzar Nastaliq.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Light Reader */}
            <div className="p-5 rounded-2xl border border-[#E8E1D3] bg-[#FBF8F2] text-[#2A2520] space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-[#E8E1D3]/80">
                <span>Light Theme</span>
                <span className="font-mono text-[10px]">#FBF8F2 / #2A2520</span>
              </div>
              <UrduText as="p" size="base" className="text-[#2A2520] leading-[2.2] py-1">
                زندگی میں کبھی کبھی وہ موڑ بھی آتے ہیں جہاں انسان کو اپنے فیصلوں کی قیمت خود ادا کرنا پڑتی ہے۔
              </UrduText>
            </div>

            {/* Sepia Reader */}
            <div className="p-5 rounded-2xl border border-[#E2D5BA] bg-[#F4ECD8] text-[#3B3226] space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-[#E2D5BA]/80">
                <span>Sepia Theme</span>
                <span className="font-mono text-[10px]">#F4ECD8 / #3B3226</span>
              </div>
              <UrduText as="p" size="base" className="text-[#3B3226] leading-[2.2] py-1">
                زندگی میں کبھی کبھی وہ موڑ بھی آتے ہیں جہاں انسان کو اپنے فیصلوں کی قیمت خود ادا کرنا پڑتی ہے۔
              </UrduText>
            </div>

            {/* Dark Reader */}
            <div className="p-5 rounded-2xl border border-[#2A2A30] bg-[#141416] text-[#E5E5E5] space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-[#2A2A30]/80">
                <span>Dark Theme</span>
                <span className="font-mono text-[10px]">#141416 / #E5E5E5</span>
              </div>
              <UrduText as="p" size="base" className="text-[#E5E5E5] leading-[2.2] py-1">
                زندگی میں کبھی کبھی وہ موڑ بھی آتے ہیں جہاں انسان کو اپنے فیصلوں کی قیمت خود ادا کرنا پڑتی ہے۔
              </UrduText>
            </div>
          </div>
        </section>

        {/* SECTION 7: INTERACTIVE DIALOG & TOAST PREVIEWS */}
        <section className="bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-card space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-bold text-primary">
              7. Overlay Previews (Modals & Toasts)
            </h2>
            <p className="text-xs text-text-muted">
              Interactive preview of dialogs and toasts using surface tokens and warm borders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="btn-secondary"
            >
              <span>Open Sample Modal Dialog</span>
            </button>

            <button
              type="button"
              onClick={() => setToastVisible(!toastVisible)}
              className="btn-tertiary"
            >
              <span>{toastVisible ? "Hide Toast" : "Show Toast"}</span>
            </button>
          </div>

          {/* Toast representation */}
          {toastVisible && (
            <div className="max-w-md p-4 rounded-xl bg-surface border border-border shadow-lg flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-text">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Preferences updated successfully!</span>
              </div>
              <button
                type="button"
                onClick={() => setToastVisible(false)}
                className="text-text-muted hover:text-text p-1"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Modal representation */}
          {dialogOpen && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-surface max-w-md w-full rounded-2xl border border-border p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-text">Confirm Action</h3>
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    className="p-1 rounded-lg text-text-muted hover:text-text"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Are you sure you want to proceed with this verification? This will immediately unlock chapter access for the reader.
                </p>
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    className="btn-secondary !min-h-[38px] text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    className="btn-primary !min-h-[38px] text-xs"
                  >
                    Confirm & Unlock
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

