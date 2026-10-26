"use client";

import React, { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import type { UserRole, WriterStatus } from "@/types/database";
import {
  BookMarked,
  Search,
  ChevronDown,
  Menu,
  X,
  Feather,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  BookOpen,
  ShoppingBag,
  Bell,
  HelpCircle,
  Users,
  Grid,
} from "lucide-react";
import { AccountMenu, NotificationBell, LogoutButton } from "./shared";
import {
  useMarketplaceSession,
  setMarketplaceSessionUser,
} from "./useMarketplaceSession";

export interface HeaderSessionUser {
  id: string;
  email: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isWriter: boolean;
  writerStatus: WriterStatus | null;
  unreadNotificationsCount?: number;
}

export interface PublicHeaderClientProps {
  user?: HeaderSessionUser | null;
}

export { LogoutButton };

function subscribePromo(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("unb_promo_dismissed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("unb_promo_dismissed", callback);
  };
}

function getPromoSnapshot() {
  try {
    return localStorage.getItem("unb_promo_dismissed_v1") === "true";
  } catch {
    return false;
  }
}

function getPromoServerSnapshot() {
  return false;
}

export function PublicHeaderClient({ user: initialUser = null }: PublicHeaderClientProps) {
  const router = useRouter();
  const sessionUser = useMarketplaceSession(initialUser);

  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

  const promoDismissed = useSyncExternalStore(
    subscribePromo,
    getPromoSnapshot,
    getPromoServerSnapshot
  );

  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleDismissPromo = () => {
    try {
      localStorage.setItem("unb_promo_dismissed_v1", "true");
      window.dispatchEvent(new Event("unb_promo_dismissed"));
    } catch {
      // Local storage unavailable
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/novels?q=${encodeURIComponent(q)}`);
      setMobileSearchOpen(false);
      setMobileMenuOpen(false);
    }
  };

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Autofocus mobile search input when opened
  useEffect(() => {
    if (mobileSearchOpen) {
      setTimeout(() => {
        mobileSearchInputRef.current?.focus();
      }, 50);
    }
  }, [mobileSearchOpen]);

  // Handle Escape key to close mobile overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mobileSearchOpen) setMobileSearchOpen(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
        if (genreDropdownOpen) setGenreDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileSearchOpen, mobileMenuOpen, genreDropdownOpen]);

  // Lock body scroll when mobile slide-over drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen]);

  // Focus trap for mobile drawer
  useEffect(() => {
    if (!mobileMenuOpen || !drawerRef.current) return;

    const drawer = drawerRef.current;
    const focusableElements = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    firstElement?.focus();
    drawer.addEventListener("keydown", handleTabKey);
    return () => drawer.removeEventListener("keydown", handleTabKey);
  }, [mobileMenuOpen]);

  // Close genre dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        genreDropdownRef.current &&
        !genreDropdownRef.current.contains(event.target as Node)
      ) {
        setGenreDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <>
      {/* 1. Top Value Banner: Non-sticky (scrolls away naturally) */}
      {!promoDismissed && (
        <aside
          aria-label="Platform Guarantee"
          className="bg-navy text-white text-xs py-1.5 px-3 sm:px-6 transition-all border-b border-navy-light/40"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-accent/20 text-accent text-[9px] sm:text-[10px] shrink-0 font-bold">
                ★
              </span>
              <span className="font-medium text-slate-200 truncate text-[11px] sm:text-xs">
                100% Direct-to-Writer Payments
              </span>
              <span className="hidden sm:inline text-slate-400">|</span>
              <span className="hidden sm:inline text-slate-300">
                JazzCash, EasyPaisa & Raast Transfer
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-[11px]">
              <Link
                href="/how-it-works"
                className="text-accent hover:text-accent-light underline underline-offset-2 transition-colors flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">How Verification Works</span>
                <span className="sm:hidden">How it works</span>
              </Link>
              <button
                type="button"
                onClick={handleDismissPromo}
                aria-label="Dismiss banner"
                className="text-slate-400 hover:text-white p-1 rounded-sm transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 2. Compact Sticky Navigation Bar */}
      <header className="sticky top-0 z-40 w-full bg-surface/95 backdrop-blur-md border-b border-border/80 transition-all pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between h-14 sm:h-16 md:h-20 gap-2 sm:gap-4">
            {/* Brand Identity */}
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-3 group shrink-0 min-h-[44px] items-center"
              aria-label={`${siteConfig.brandName} Home`}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-lg sm:rounded-xl bg-navy text-accent flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform border border-navy-light shrink-0">
                <BookMarked className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-accent" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-navy leading-none">
                  {siteConfig.brandName}
                </span>
                <span
                  dir="rtl"
                  lang="ur"
                  className="font-urdu text-[10px] sm:text-xs text-accent font-medium leading-none mt-0.5"
                >
                  {siteConfig.brandNameUrdu}
                </span>
              </div>
            </Link>

            {/* Desktop Search Field */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:flex flex-1 max-w-xs lg:max-w-md mx-4"
            >
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Urdu novels, writers, genres..."
                  className="w-full pl-10 pr-12 py-2 text-sm bg-ivory/60 hover:bg-ivory focus:bg-white border border-border focus:border-accent rounded-full transition-all outline-none text-main placeholder:text-secondary/70 focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-secondary/70 hover:text-navy bg-border/40 hover:bg-border/70 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                >
                  ↵
                </button>
              </div>
            </form>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-6">
              <Link
                href="/novels"
                className="text-sm font-medium text-main hover:text-navy transition-colors py-2"
              >
                Browse Novels
              </Link>

              {/* Genre Dropdown */}
              <div className="relative" ref={genreDropdownRef}>
                <button
                  type="button"
                  onClick={() => setGenreDropdownOpen(!genreDropdownOpen)}
                  className="flex items-center gap-1.5 text-sm font-medium text-main hover:text-navy transition-colors py-2 cursor-pointer"
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
                        onClick={() => setGenreDropdownOpen(false)}
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

              {/* Role-adaptive Selling/Studio Link */}
              {sessionUser?.isWriter ? (
                <Link
                  href="/writer"
                  className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-dark transition-colors"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>Writer Studio</span>
                </Link>
              ) : (
                <Link
                  href="/become-a-writer"
                  className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-dark transition-colors"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>Sell Your Novels</span>
                </Link>
              )}
            </nav>

            {/* Desktop Auth / Session Menu Area */}
            <div className="hidden sm:flex items-center gap-2">
              {sessionUser ? (
                <>
                  <NotificationBell
                    unreadCount={sessionUser.unreadNotificationsCount}
                    variant="marketplace"
                  />
                  <AccountMenu user={sessionUser} variant="marketplace" />
                </>
              ) : (
                /* Signed-out CTAs */
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-navy hover:text-navy-light px-3.5 py-2 rounded-lg transition-colors min-h-[44px] flex items-center"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-1.5 text-sm font-medium bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg shadow-xs hover:shadow transition-all min-h-[44px]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Join Free</span>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Controls (Search trigger, avatar/login, hamburger menu with 44px min touch targets) */}
            <div className="flex md:hidden items-center gap-1 sm:gap-1.5">
              {/* Mobile Search Button */}
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-main hover:bg-ivory transition-colors cursor-pointer"
                aria-label="Open search"
              >
                <Search className="w-5 h-5 text-secondary" />
              </button>

              {/* Mobile User Avatar or Quick Sign In */}
              {sessionUser ? (
                <Link
                  href="/account"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="User Account"
                  title={sessionUser.name}
                >
                  {sessionUser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sessionUser.avatarUrl}
                      alt={sessionUser.name}
                      className="w-7 h-7 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-navy text-accent border border-navy-light flex items-center justify-center font-bold text-xs shadow-inner">
                      {sessionUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="min-w-[44px] min-h-[44px] px-2 flex items-center justify-center text-xs font-semibold text-navy hover:text-accent transition-colors"
                >
                  Sign In
                </Link>
              )}

              {/* Mobile Hamburger Menu Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-main hover:bg-ivory border border-border/80 cursor-pointer"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Full-Width Search Overlay */}
            {mobileSearchOpen && (
              <div className="absolute inset-0 z-50 bg-surface flex items-center px-2 sm:px-4 gap-2 animate-in fade-in duration-150">
                <form
                  onSubmit={handleSearchSubmit}
                  className="flex-1 flex items-center gap-2 min-w-0"
                >
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
                    <input
                      ref={mobileSearchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search novels, authors, genres..."
                      className="w-full pl-9 pr-3 py-2 text-base bg-ivory border border-border rounded-lg outline-none text-main placeholder:text-secondary/70 focus:border-accent focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[44px] px-3 bg-navy text-accent text-xs font-semibold rounded-lg shrink-0 cursor-pointer flex items-center justify-center"
                  >
                    Search
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-secondary hover:text-main rounded-lg cursor-pointer shrink-0"
                  aria-label="Close search"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 3. Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Drawer"
        >
          {/* Backdrop with click-to-close */}
          <div
            className="fixed inset-0 bg-navy/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          {/* Slide-over Panel */}
          <div
            ref={drawerRef}
            className="fixed inset-y-0 right-0 w-[85vw] max-w-sm bg-surface shadow-2xl flex flex-col z-50 border-l border-border pt-[env(safe-area-inset-top)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] animate-in slide-in-from-right duration-200"
          >
            {/* Drawer Top Header with Brand & Close Button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-navy text-accent flex items-center justify-center border border-navy-light">
                  <BookMarked className="w-4 h-4 text-accent" />
                </div>
                <span className="font-serif text-base font-bold text-navy">
                  {siteConfig.brandName}
                </span>
              </div>
              <button
                type="button"
                onClick={closeMobileMenu}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-secondary hover:text-navy hover:bg-ivory cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {/* Top: Signed-Out Login & Register CTAs OR Signed-In Account Card */}
              {!sessionUser ? (
                <div className="p-3 bg-ivory/80 rounded-xl border border-border/80 space-y-2">
                  <p className="text-xs font-semibold text-navy">Welcome to UNB Premium</p>
                  <p className="text-[11px] text-secondary">
                    Sign in to access your personal library and reader orders.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href="/login"
                      onClick={closeMobileMenu}
                      className="min-h-[44px] flex items-center justify-center text-center py-2 text-xs font-semibold text-navy border border-navy/25 rounded-lg hover:bg-white transition-colors"
                    >
                      Log In
                    </Link>
                    <Link
                      href="/register"
                      onClick={closeMobileMenu}
                      className="min-h-[44px] flex items-center justify-center text-center py-2 text-xs font-semibold bg-navy text-white rounded-lg shadow-xs hover:bg-navy-light transition-colors"
                    >
                      Join Free
                    </Link>
                  </div>
                </div>
              ) : (
                /* Account Card (Name, Role badge, Email) */
                <div className="p-3 bg-ivory/80 rounded-xl border border-border/80 flex items-center gap-3">
                  {sessionUser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sessionUser.avatarUrl}
                      alt={sessionUser.name}
                      className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-navy text-accent border border-navy-light flex items-center justify-center font-bold text-sm shrink-0">
                      {sessionUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-navy truncate">
                      {sessionUser.name}
                    </p>
                    <p className="text-xs text-secondary truncate">
                      {sessionUser.email}
                    </p>
                    <div className="mt-1">
                      <span
                        className={`inline-block text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                          sessionUser.role === "admin"
                            ? "bg-rose-500/10 text-rose-700 border border-rose-500/20"
                            : sessionUser.isWriter
                            ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
                        }`}
                      >
                        {sessionUser.role === "admin"
                          ? "Admin"
                          : sessionUser.writerStatus === "pending_approval"
                          ? "Author (Pending)"
                          : sessionUser.isWriter
                          ? "Writer"
                          : "Reader"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick links for signed-in users */}
              {sessionUser && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider px-1 mb-1">
                    Your Library & Portals
                  </div>

                  <Link
                    href="/library"
                    onClick={closeMobileMenu}
                    className="min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl text-sm font-medium text-main hover:text-navy hover:bg-ivory transition-colors"
                  >
                    <BookOpen className="w-4 h-4 text-secondary shrink-0" />
                    <span>My Library</span>
                  </Link>

                  <Link
                    href="/orders"
                    onClick={closeMobileMenu}
                    className="min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl text-sm font-medium text-main hover:text-navy hover:bg-ivory transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4 text-secondary shrink-0" />
                    <span>My Orders</span>
                  </Link>

                  <Link
                    href="/notifications"
                    onClick={closeMobileMenu}
                    className="min-h-[44px] flex items-center justify-between px-3 rounded-xl text-sm font-medium text-main hover:text-navy hover:bg-ivory transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bell className="w-4 h-4 text-secondary shrink-0" />
                      <span>Notifications</span>
                    </div>
                    {sessionUser.unreadNotificationsCount && sessionUser.unreadNotificationsCount > 0 ? (
                      <span className="text-[10px] bg-accent text-navy font-bold px-1.5 py-0.5 rounded-full">
                        {sessionUser.unreadNotificationsCount}
                      </span>
                    ) : null}
                  </Link>

                  {sessionUser.role === "admin" && (
                    <Link
                      href="/admin"
                      onClick={closeMobileMenu}
                      className="min-h-[44px] flex items-center gap-2.5 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Admin Panel</span>
                    </Link>
                  )}

                  {(sessionUser.isWriter || sessionUser.role === "admin") && (
                    <Link
                      href="/writer"
                      onClick={closeMobileMenu}
                      className="min-h-[44px] flex items-center gap-2.5 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 rounded-xl transition-colors"
                    >
                      <Feather className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Writer Studio</span>
                    </Link>
                  )}

                  {sessionUser.role === "reader" && !sessionUser.isWriter && (
                    <Link
                      href="/become-a-writer"
                      onClick={closeMobileMenu}
                      className="min-h-[44px] flex items-center justify-between px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Feather className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Become a writer</span>
                      </div>
                      <span className="text-[10px] bg-amber-500/15 text-amber-800 font-semibold px-2 py-0.5 rounded">
                        Sell Novels
                      </span>
                    </Link>
                  )}
                </div>
              )}

              {/* Browse links */}
              <div className="space-y-1 pt-2 border-t border-border/70">
                <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider px-1 mb-1">
                  Explore Marketplace
                </div>

                <Link
                  href="/novels"
                  onClick={closeMobileMenu}
                  className="min-h-[44px] flex items-center justify-between px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <BookMarked className="w-4 h-4 text-secondary shrink-0" />
                    <span>Browse Novels</span>
                  </div>
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    ناولز تلاش کریں
                  </UrduText>
                </Link>

                <Link
                  href="/genres"
                  onClick={closeMobileMenu}
                  className="min-h-[44px] flex items-center justify-between px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Grid className="w-4 h-4 text-secondary shrink-0" />
                    <span>Genres</span>
                  </div>
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    اصنافِ ادب
                  </UrduText>
                </Link>

                <Link
                  href="/writers"
                  onClick={closeMobileMenu}
                  className="min-h-[44px] flex items-center justify-between px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-secondary shrink-0" />
                    <span>Featured Authors</span>
                  </div>
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    نمایاں مصنّفین
                  </UrduText>
                </Link>

                <Link
                  href="/how-it-works"
                  onClick={closeMobileMenu}
                  className="min-h-[44px] flex items-center justify-between px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
                    <span>How Direct Payment Works</span>
                  </div>
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    براہ راست ادائیگی
                  </UrduText>
                </Link>

                <Link
                  href="/faq"
                  onClick={closeMobileMenu}
                  className="min-h-[44px] flex items-center justify-between px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-secondary shrink-0" />
                    <span>FAQ & Support</span>
                  </div>
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    سوالات و جوابات
                  </UrduText>
                </Link>
              </div>
            </div>

            {/* Pinned Bottom Drawer Footer: Logout if signed in */}
            {sessionUser && (
              <div className="mt-auto px-4 pt-3 border-t border-border">
                <LogoutButton
                  isMobile
                  onLoggedOut={() => {
                    setMarketplaceSessionUser(null);
                    closeMobileMenu();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
