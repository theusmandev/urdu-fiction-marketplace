"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Palette, ChevronUp, ChevronDown } from "lucide-react";

type PaletteId = "A" | "B" | "C";

const PALETTES: { id: PaletteId; name: string; primary: string; bg: string }[] = [
  { id: "A", name: "Ivory & Ink (Default)", primary: "#1B2A41", bg: "#FBF8F2" },
  { id: "B", name: "Paper & Teal", primary: "#0F5E5A", bg: "#FAF7F0" },
  { id: "C", name: "Cream & Maroon", primary: "#7A2E3A", bg: "#FCF9F4" },
];

export function DevFloatingPaletteSwitcher() {
  const [palette, setPalette] = useState<PaletteId>("A");
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem("unb_dev_palette") as PaletteId | null;
      if (saved && (saved === "A" || saved === "B" || saved === "C")) {
        setPalette(saved);
        document.documentElement.setAttribute("data-palette", saved);
      } else {
        const current = document.documentElement.getAttribute("data-palette") as PaletteId | null;
        if (current) setPalette(current);
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  const handleSelect = (id: PaletteId) => {
    setPalette(id);
    document.documentElement.setAttribute("data-palette", id);
    try {
      localStorage.setItem("unb_dev_palette", id);
    } catch {
      // Ignore
    }
  };

  if (!mounted || process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <aside
      aria-label="Developer Palette Switcher"
      className="fixed bottom-16 right-4 sm:bottom-6 sm:right-6 z-[9999] font-sans text-xs shadow-2xl rounded-2xl border border-border bg-surface/95 backdrop-blur-md overflow-hidden transition-all duration-200 select-none max-w-[280px]"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-surface-muted border-b border-border text-text font-semibold">
        <div className="flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-accent-strong" />
          <span>Dev Palette Switcher</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
          aria-label={collapsed ? "Expand switcher" : "Collapse switcher"}
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            {PALETTES.map((p) => {
              const active = palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all ${
                    active
                      ? "border-primary bg-primary/10 font-bold shadow-sm ring-1 ring-primary"
                      : "border-border hover:bg-surface-muted text-text-muted"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-full border border-black/10 shadow-inner"
                      style={{ backgroundColor: p.primary }}
                    />
                    <span className="text-xs font-semibold">{p.id}</span>
                  </span>
                  <span className="text-[10px] leading-tight opacity-80">{p.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-1.5 border-t border-border flex items-center justify-between text-[11px]">
            <span className="text-text-muted">
              Active: <strong className="text-text">{palette}</strong>
            </span>
            <Link
              href="/dev/theme"
              className="text-accent-strong hover:underline font-semibold flex items-center gap-1"
            >
              Theme Lab →
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}

