"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { UrduText } from "@/components/urdu/UrduText";
import { logoutUser } from "@/app/actions/auth";
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
  User as UserIcon,
  LogOut,
  Loader2,
  Bell,
} from "lucide-react";

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

/**
 * Interactive Logout Button with loading/disabled feedback
 */
export function LogoutButton({
  onLoggedOut,
  className,
  isMobile,
}: {
  onLoggedOut?: () => void;
  className?: string;
  isMobile?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleLogout = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    startTransition(async () => {
      onLoggedOut?.();
      await logoutUser();
    });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className={
        className ||
        (isMobile
          ? "flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl text-sm font-semibold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/25 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          : "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed")
      }
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-rose-600 shrink-0" />
          <span>Signing out...</span>
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
          <span>Sign Out</span>
        </>
      )}
    </button>
  );
}

export function PublicHeaderClient({ user: initialUser = null }: PublicHeaderClientProps) {
  const router = useRouter();
  const [user, setUser] = useState<HeaderSessionUser | null>(initialUser ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const genreDropdownRef = useRef<HTMLDivElement>(null);

  // Client-side session resolution (avoids breaking static/ISR page caching)
  useEffect(() => {
    let isMounted = true;
    if (!initialUser) {
      fetch("/api/auth/session")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isMounted && data?.user) {
            setUser(data.user);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [initialUser]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/novels?q=${encodeURIComponent(q)}`);
      setMobileMenuOpen(false);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(event.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
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
            {user?.isWriter ? (
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
            {user ? (
              <>
                {/* Notification Bell */}
                <Link
                  href="/notifications"
                  className="relative p-2 rounded-full text-secondary hover:text-navy hover:bg-ivory transition-colors cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {(user.unreadNotificationsCount ?? 0) > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-stone-950">
                      {(user.unreadNotificationsCount ?? 0) > 9 ? "9+" : user.unreadNotificationsCount}
                    </span>
                  )}
                </Link>

                {/* Signed-in Account Dropdown */}
                <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => setAccountDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2.5 py-1.5 px-3 rounded-full border border-border/90 hover:border-accent/50 bg-surface hover:bg-ivory/60 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
                  aria-expanded={accountDropdownOpen}
                  aria-haspopup="true"
                  aria-label="Account menu"
                >
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-navy text-accent border border-navy-light flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col text-left max-w-[130px]">
                    <span className="text-xs font-semibold text-main truncate leading-tight">
                      {user.name}
                    </span>
                    <span className="text-[10px] text-secondary capitalize leading-tight">
                      {user.role === "admin"
                        ? "Admin"
                        : user.isWriter
                        ? "Author"
                        : "Reader"}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-secondary transition-transform duration-200 ${
                      accountDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {accountDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-surface rounded-2xl shadow-xl border border-border/80 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* User Info Header */}
                    <div className="px-3 py-2.5 bg-ivory/70 rounded-xl mb-1.5 border border-border/60">
                      <div className="flex items-center gap-2.5">
                        {user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="w-9 h-9 rounded-full object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-navy text-accent border border-navy-light flex items-center justify-center font-bold text-sm shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-navy truncate">
                            {user.name}
                          </p>
                          <p className="text-[11px] text-secondary truncate">
                            {user.email}
                          </p>
                          <div className="mt-1">
                            <span
                              className={`inline-block text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                                user.role === "admin"
                                  ? "bg-rose-500/10 text-rose-700 border border-rose-500/20"
                                  : user.isWriter
                                  ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
                              }`}
                            >
                              {user.role === "admin"
                                ? "Platform Admin"
                                : user.writerStatus === "pending_approval"
                                ? "Author (Pending)"
                                : user.isWriter
                                ? "Verified Author"
                                : "Reader"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Role-Aware Navigation Links */}
                    <div className="space-y-0.5">
                      {user.role === "admin" && (
                        <Link
                          href="/admin"
                          onClick={() => setAccountDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>Admin Panel</span>
                        </Link>
                      )}

                      {(user.isWriter || user.role === "admin") && (
                        <Link
                          href="/writer"
                          onClick={() => setAccountDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 rounded-xl transition-colors"
                        >
                          <Feather className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Writer Studio</span>
                        </Link>
                      )}

                      <Link
                        href="/notifications"
                        onClick={() => setAccountDropdownOpen(false)}
                        className="flex items-center justify-between px-3 py-2 text-xs font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Bell className="w-4 h-4 text-secondary shrink-0" />
                          <span>Notifications</span>
                        </div>
                        {(user.unreadNotificationsCount ?? 0) > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700">
                            {user.unreadNotificationsCount}
                          </span>
                        )}
                      </Link>

                      <Link
                        href="/library"
                        onClick={() => setAccountDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                      >
                        <BookOpen className="w-4 h-4 text-secondary shrink-0" />
                        <span>My Library</span>
                      </Link>

                      <Link
                        href="/orders"
                        onClick={() => setAccountDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                      >
                        <ShoppingBag className="w-4 h-4 text-secondary shrink-0" />
                        <span>My Orders</span>
                      </Link>

                      <Link
                        href="/account"
                        onClick={() => setAccountDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-main hover:text-navy hover:bg-ivory rounded-xl transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-secondary shrink-0" />
                        <span>Account</span>
                      </Link>

                      {user.role === "reader" && !user.isWriter && (
                        <Link
                          href="/become-a-writer"
                          onClick={() => setAccountDropdownOpen(false)}
                          className="flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded-xl transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <Feather className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Become a writer</span>
                          </div>
                          <span className="text-[10px] bg-amber-500/15 text-amber-700 font-semibold px-1.5 py-0.5 rounded">
                            Sell
                          </span>
                        </Link>
                      )}
                    </div>

                    {/* Divider & Sign Out */}
                    <div className="h-px bg-border my-1.5" />
                    <LogoutButton onLoggedOut={() => setAccountDropdownOpen(false)} />
                  </div>
                )}
              </div>
            </>
          ) : (
              /* Signed-out CTAs */
              <>
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
              </>
            )}
          </div>

          {/* Mobile Right Controls */}
          <div className="flex md:hidden items-center gap-2">
            {user && (
              <Link
                href="/account"
                className="flex items-center"
                aria-label="User Account"
                title={user.name}
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-navy text-accent border border-navy-light flex items-center justify-center font-bold text-xs shadow-inner">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-main hover:bg-ivory border border-border cursor-pointer"
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
          {/* Mobile User Profile Header (if signed in) */}
          {user && (
            <div className="p-3 bg-ivory/80 rounded-xl border border-border/80 flex items-center gap-3">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-navy text-accent border border-navy-light flex items-center justify-center font-bold text-sm shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy truncate">{user.name}</p>
                <p className="text-xs text-secondary truncate">{user.email}</p>
                <div className="mt-1">
                  <span
                    className={`inline-block text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                      user.role === "admin"
                        ? "bg-rose-500/10 text-rose-700 border border-rose-500/20"
                        : user.isWriter
                        ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
                    }`}
                  >
                    {user.role === "admin"
                      ? "Admin"
                      : user.writerStatus === "pending_approval"
                      ? "Author (Pending)"
                      : user.isWriter
                      ? "Writer"
                      : "Reader"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Search */}
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search novels, authors, or genres..."
              className="w-full pl-9 pr-12 py-2 text-sm bg-ivory border border-border rounded-lg outline-none text-main placeholder:text-secondary/70 focus:border-accent"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-accent hover:text-accent-dark px-2 py-0.5 rounded cursor-pointer"
            >
              Go
            </button>
          </form>

          {/* Mobile Nav Links */}
          <div className="flex flex-col space-y-1 divide-y divide-border/40">
            {siteConfig.navigation.public.map((link) => (
              <Link
                key={link.href}
                href={
                  link.href === "/become-a-writer" && user?.isWriter
                    ? "/writer"
                    : link.href
                }
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 text-sm font-medium text-main hover:text-navy"
              >
                <span>
                  {link.href === "/become-a-writer" && user?.isWriter
                    ? "Writer Studio"
                    : link.title}
                </span>
                {link.titleUrdu && (
                  <UrduText as="span" size="xs" className="text-secondary py-0">
                    {link.titleUrdu}
                  </UrduText>
                )}
              </Link>
            ))}
          </div>

          {/* Mobile Role-Aware Portal Section (if signed in) */}
          {user && (
            <div className="space-y-1 pt-3 border-t border-border">
              <div className="text-[11px] font-semibold text-secondary uppercase tracking-wider px-1 mb-1">
                Your Portal & Library
              </div>

              {user.role === "admin" && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 py-2.5 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 rounded-xl"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Admin Panel</span>
                </Link>
              )}

              {(user.isWriter || user.role === "admin") && (
                <Link
                  href="/writer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 py-2.5 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 rounded-xl"
                >
                  <Feather className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Writer Studio</span>
                </Link>
              )}

              <Link
                href="/library"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 py-2.5 px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl"
              >
                <BookOpen className="w-4 h-4 text-secondary shrink-0" />
                <span>My Library</span>
              </Link>

              <Link
                href="/orders"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 py-2.5 px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl"
              >
                <ShoppingBag className="w-4 h-4 text-secondary shrink-0" />
                <span>My Orders</span>
              </Link>

              <Link
                href="/account"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 py-2.5 px-3 text-sm font-medium text-main hover:text-navy hover:bg-ivory rounded-xl"
              >
                <UserIcon className="w-4 h-4 text-secondary shrink-0" />
                <span>Account</span>
              </Link>

              {user.role === "reader" && !user.isWriter && (
                <Link
                  href="/become-a-writer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2.5 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 rounded-xl"
                >
                  <div className="flex items-center gap-2.5">
                    <Feather className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Become a writer</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/15 text-amber-700 font-semibold px-2 py-0.5 rounded">
                    Sell Novels
                  </span>
                </Link>
              )}
            </div>
          )}

          {/* Bottom Auth Actions */}
          <div className="pt-2 border-t border-border flex flex-col gap-2">
            {user ? (
              <LogoutButton isMobile onLoggedOut={() => setMobileMenuOpen(false)} />
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
