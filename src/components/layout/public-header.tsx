"use client";

import React, { useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import { 
  BookMarked, 
  Search, 
  ChevronDown, 
  Menu, 
  X, 
  Feather, 
  ShieldCheck, 
  Sparkles
} from "lucide-react";

export function PublicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-surface/95 backdrop-blur-md border-b border-border/80 transition-all">
      {/* Top Value Banner: Direct Payment Assurance */}
      <div className="bg-navy text-white text-xs py-1.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px]">
              ★
            </span>
            <span className="font-medium text-slate-200">
              100% Direct-to-Writer Payments
            </span>
            <span className="hidden sm:inline text-slate-400">|</span>
            <span className="hidden sm:inline text-slate-300">
              JazzCash, EasyPaisa & Raast Transfer
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <Link
              href="/how-it-works"
              className="text-accent hover:text-accent-light underline underline-offset-2 transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>How Verification Works</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          
          {/* Brand Identity */}
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-11 h-11 rounded-xl bg-navy text-accent flex items-center justify-center shadow-md group-hover:scale-105 transition-transform border border-navy-light">
              <BookMarked className="w-6 h-6 text-accent" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-2xl font-bold tracking-tight text-navy leading-none">
                {siteConfig.brandName}
              </span>
              <span
                dir="rtl"
                lang="ur"
                className="font-urdu text-xs text-accent font-medium leading-tight mt-1"
              >
                {siteConfig.brandNameUrdu}
              </span>
            </div>
          </Link>

          {/* Desktop Search Trigger */}
          <div className="hidden md:flex flex-1 max-w-xs lg:max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
              <input
                type="text"
                placeholder="Search Urdu novels, writers, genres..."
                className="w-full pl-10 pr-12 py-2 text-sm bg-ivory/60 hover:bg-ivory focus:bg-white border border-border focus:border-accent rounded-full transition-all outline-none text-main placeholder:text-secondary/70 focus:ring-2 focus:ring-accent/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-secondary/60 bg-border/40 px-1.5 py-0.5 rounded">
                ⌘K
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6">
            <Link
              href="/novels"
              className="text-sm font-medium text-main hover:text-navy transition-colors py-2"
            >
              Browse Novels
            </Link>

            {/* Genre Dropdown */}
            <div className="relative">
              <button
                onClick={() => setGenreDropdownOpen(!genreDropdownOpen)}
                onBlur={() => setTimeout(() => setGenreDropdownOpen(false), 200)}
                className="flex items-center gap-1.5 text-sm font-medium text-main hover:text-navy transition-colors py-2"
                aria-expanded={genreDropdownOpen}
              >
                <span>Genres</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-secondary transition-transform duration-200 ${
                    genreDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {genreDropdownOpen && (
                <div className="absolute top-full left-0 w-72 mt-2 bg-surface rounded-xl shadow-xl border border-border/80 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider px-3 py-1.5">
                    Explore by Genre / اصناف
                  </div>
                  {siteConfig.featuredGenres.map((genre) => (
                    <Link
                      key={genre.id}
                      href={`/genres/${genre.slug}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-ivory transition-colors group"
                    >
                      <span className="text-xs font-medium text-main group-hover:text-navy">
                        {genre.nameEn}
                      </span>
                      <UrduText
                        as="span"
                        size="xs"
                        className="text-accent group-hover:text-accent-dark py-0"
                      >
                        {genre.nameUrdu}
                      </UrduText>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/become-a-writer"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-dark transition-colors"
            >
              <Feather className="w-3.5 h-3.5" />
              <span>Sell Your Novels</span>
            </Link>
          </nav>

          {/* CTAs / Auth Links */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-navy hover:text-navy-light px-3.5 py-2 rounded-lg transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 text-sm font-medium bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Join Free</span>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-main hover:bg-ivory border border-border"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-surface px-4 pt-4 pb-6 space-y-4 animate-in slide-in-from-top-4 duration-200">
          {/* Mobile Search */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input
              type="text"
              placeholder="Search novels or writers..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-ivory border border-border rounded-lg"
            />
          </div>

          {/* Mobile Nav Links */}
          <div className="flex flex-col space-y-1 divide-y divide-border/40">
            {siteConfig.navigation.public.map((link) => (
              <Link
                key={link.href}
                href={link.href === '/writers/onboarding' ? '/become-a-writer' : link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 text-sm font-medium text-main hover:text-navy"
              >
                <span>{link.title}</span>
                {link.titleUrdu && (
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    {link.titleUrdu}
                  </UrduText>
                )}
              </Link>
            ))}
          </div>

          <div className="pt-2 border-t border-border flex flex-col gap-2">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 text-sm font-medium text-navy border border-navy/20 rounded-lg hover:bg-ivory"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 text-sm font-medium bg-navy text-white rounded-lg shadow-sm"
            >
              Create Account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
