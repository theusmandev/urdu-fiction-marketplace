"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  BookMarked,
  ShoppingBag,
  User,
} from "lucide-react";
import { useMarketplaceSession } from "./useMarketplaceSession";
import type { HeaderSessionUser } from "./public-header-client";

export interface BottomNavProps {
  initialUser?: HeaderSessionUser | null;
}

export function BottomNav({ initialUser }: BottomNavProps = {}) {
  const pathname = usePathname();
  const sessionUser = useMarketplaceSession(initialUser);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Detect virtual keyboard on mobile devices to prevent covering input forms
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        setKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      // Small timeout to allow next focus to settle
      setTimeout(() => {
        const active = document.activeElement;
        if (
          !active ||
          (active.tagName !== "INPUT" &&
            active.tagName !== "TEXTAREA" &&
            active.tagName !== "SELECT" &&
            !(active as HTMLElement).isContentEditable)
        ) {
          setKeyboardOpen(false);
        }
      }, 100);
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // Strict condition: only show on phones (< md), only for signed-in users
  if (!sessionUser) return null;

  // Hide on reading mode, checkout flow, keyboard open, and admin/studio shells
  const isReading =
    pathname.startsWith("/read") ||
    pathname.includes("/read/") ||
    pathname.includes("/read");
  const isCheckout = pathname.startsWith("/checkout");
  const isAdminOrStudio =
    pathname.startsWith("/admin") || pathname.startsWith("/writer");

  if (isReading || isCheckout || isAdminOrStudio || keyboardOpen) {
    return null;
  }

  const tabs = [
    {
      label: "Home",
      href: "/",
      icon: Home,
    },
    {
      label: "Browse",
      href: "/novels",
      icon: BookOpen,
    },
    {
      label: "Library",
      href: "/library",
      icon: BookMarked,
    },
    {
      label: "Orders",
      href: "/orders",
      icon: ShoppingBag,
    },
    {
      label: "Account",
      href: "/account",
      icon: User,
      badge: sessionUser.unreadNotificationsCount && sessionUser.unreadNotificationsCount > 0
        ? sessionUser.unreadNotificationsCount
        : undefined,
    },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around h-14 max-w-md mx-auto px-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex-1 flex flex-col items-center justify-center min-h-[44px] py-1 transition-colors select-none ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-text-muted hover:text-primary"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? "scale-110 text-accent-strong" : "text-text-muted"
                  }`}
                />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-accent-soft text-accent-strong text-[10px] font-bold flex items-center justify-center border border-border shadow-xs">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight mt-0.5 leading-none ${
                  isActive ? "text-primary font-bold" : "text-text-muted"
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-accent-strong rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
