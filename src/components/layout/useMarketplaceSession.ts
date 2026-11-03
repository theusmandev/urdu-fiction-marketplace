"use client";

import { useSyncExternalStore, useEffect } from "react";
import type { HeaderSessionUser } from "./public-header-client";

declare global {
  interface Window {
    __UNB_SESSION?: Promise<Response>;
  }
}

export type MarketplaceSessionStatus = "unknown" | "anonymous" | "authenticated";

export interface MarketplaceSessionState {
  user: HeaderSessionUser | null;
  status: MarketplaceSessionStatus;
}

let cachedState: MarketplaceSessionState = {
  user: null,
  status: "unknown",
};

let hasInitiatedFetch = false;
const listeners = new Set<() => void>();

function syncSessionHintCookie(isAuthenticated: boolean) {
  if (typeof document === "undefined") return;
  try {
    if (isAuthenticated) {
      const isSecure = window.location.protocol === "https:";
      const secureFlag = isSecure ? "; Secure" : "";
      document.cookie = `unb_has_session=1; path=/; max-age=2592000; SameSite=Lax${secureFlag}`;
      document.documentElement.setAttribute("data-session-hint", "1");
    } else {
      document.cookie = "unb_has_session=; path=/; max-age=0; SameSite=Lax";
      document.documentElement.removeAttribute("data-session-hint");
    }
  } catch {
    // Ignore in non-cookie environments
  }
}

export function setMarketplaceSessionUser(user: HeaderSessionUser | null) {
  setMarketplaceSessionState(user, user ? "authenticated" : "anonymous");
}

export function setMarketplaceSessionState(
  user: HeaderSessionUser | null,
  status: MarketplaceSessionStatus
) {
  cachedState = { user, status };
  if (status === "authenticated" && user) {
    syncSessionHintCookie(true);
  } else if (status === "anonymous") {
    syncSessionHintCookie(false);
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

async function fetchSessionWithRetry(): Promise<{ user: HeaderSessionUser | null } | null> {
  const fetchSessionOnce = async (): Promise<Response> => {
    // If layout already initiated an early fetch, consume and clear it
    if (typeof window !== "undefined" && window.__UNB_SESSION) {
      const promise = window.__UNB_SESSION;
      window.__UNB_SESSION = undefined;
      return promise;
    }
    return fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
    });
  };

  try {
    const res = await fetchSessionOnce();
    if (!res.ok) {
      throw new Error(`Session fetch failed with HTTP ${res.status}`);
    }
    return await res.json();
  } catch (firstErr) {
    console.warn("fetchSession: initial fetch failed, retrying once after 500ms...", firstErr);
    // Offline / network failure handling: retry once after 500ms
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const retryRes = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!retryRes.ok) {
        throw new Error(`Session retry failed with HTTP ${retryRes.status}`);
      }
      return await retryRes.json();
    } catch (retryErr) {
      console.warn("fetchSession: retry also failed, falling back to anonymous state", retryErr);
      return null;
    }
  }
}

export function useMarketplaceSession(
  initialUser?: HeaderSessionUser | null
): MarketplaceSessionState {
  const state = useSyncExternalStore(
    subscribe,
    () => {
      if (initialUser !== undefined && initialUser !== null) {
        return { user: initialUser, status: "authenticated" as const };
      }
      return cachedState;
    },
    () => {
      if (initialUser !== undefined && initialUser !== null) {
        return { user: initialUser, status: "authenticated" as const };
      }
      return { user: null, status: "unknown" as const };
    }
  );

  useEffect(() => {
    if (initialUser !== undefined && initialUser !== null) {
      cachedState = { user: initialUser, status: "authenticated" };
      syncSessionHintCookie(true);
      return;
    }

    if (hasInitiatedFetch) {
      return;
    }

    // Always fetch when unsure: never assume anonymous on client JS based on document.cookie,
    // as Supabase auth cookies may be httpOnly or partitioned across tabs.
    // If the hint cookie exists, fetchSessionWithRetry() consumes window.__UNB_SESSION (already started in <head>).
    // If no session exists, /api/auth/session fast anonymous path returns null in <1ms from the edge.
    hasInitiatedFetch = true;

    fetchSessionWithRetry().then((data) => {
      if (data === null) {
        // Network error retry failed: fall back to anonymous UI but DO NOT clear hint cookie
        cachedState = { user: null, status: "anonymous" };
        listeners.forEach((l) => l());
      } else if (data.user) {
        setMarketplaceSessionState(data.user, "authenticated");
      } else {
        setMarketplaceSessionState(null, "anonymous");
      }
    });
  }, [initialUser]);

  return state;
}
