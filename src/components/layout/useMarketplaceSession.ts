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

export const STORAGE_USER_KEY = "unb_user_display";
export const STORAGE_HINT_KEY = "unb_has_session";
export const SESSION_REFRESH_EVENT = "unb_session_refresh";

let cachedState: MarketplaceSessionState = {
  user: null,
  status: "unknown",
};

let hasInitiatedFetch = false;
let isFetchingPromise: Promise<{ user: HeaderSessionUser | null } | null> | null = null;
const listeners = new Set<() => void>();

function syncSessionHintCookie(isAuthenticated: boolean) {
  if (typeof document === "undefined") return;
  try {
    if (isAuthenticated) {
      const isSecure = window.location.protocol === "https:";
      const secureFlag = isSecure ? "; Secure" : "";
      document.cookie = `unb_has_session=1; Path=/; Max-Age=2592000; SameSite=Lax${secureFlag}`;
      document.documentElement.setAttribute("data-session-hint", "1");
      try {
        localStorage.setItem(STORAGE_HINT_KEY, "1");
      } catch {}
    } else {
      document.cookie = "unb_has_session=; Path=/; Max-Age=0; SameSite=Lax";
      document.documentElement.removeAttribute("data-session-hint");
      try {
        localStorage.removeItem(STORAGE_HINT_KEY);
        localStorage.removeItem(STORAGE_USER_KEY);
      } catch {}
    }
  } catch {
    // Ignore in non-cookie environments
  }
}

export function clearMarketplaceSessionCache(): void {
  hasInitiatedFetch = false;
  isFetchingPromise = null;
  cachedState = { user: null, status: "anonymous" };
  syncSessionHintCookie(false);
  listeners.forEach((l) => l());
}

export function setMarketplaceSessionUser(user: HeaderSessionUser | null) {
  setMarketplaceSessionState(user, user ? "authenticated" : "anonymous");
}

export function updateMarketplaceSessionUser(
  partial: Partial<HeaderSessionUser>
): HeaderSessionUser | null {
  if (!cachedState.user) return null;
  const updated: HeaderSessionUser = { ...cachedState.user, ...partial };
  setMarketplaceSessionState(updated, "authenticated");
  return updated;
}

export function setMarketplaceSessionState(
  user: HeaderSessionUser | null,
  status: MarketplaceSessionStatus
) {
  cachedState = { user, status };
  if (status === "authenticated" && user) {
    syncSessionHintCookie(true);
    try {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } catch {}
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

/**
 * Authoritatively re-fetches the session from /api/auth/session, updates the
 * store, syncs localStorage/cookies, and notifies all UI subscribers immediately.
 */
export async function refreshMarketplaceSession(): Promise<HeaderSessionUser | null> {
  hasInitiatedFetch = true;
  if (!isFetchingPromise) {
    isFetchingPromise = fetchSessionWithRetry().finally(() => {
      isFetchingPromise = null;
    });
  }

  const data = await isFetchingPromise;
  if (data?.user) {
    setMarketplaceSessionState(data.user, "authenticated");
    return data.user;
  } else {
    setMarketplaceSessionState(null, "anonymous");
    return null;
  }
}

// Global browser event listener registration (registered once per window lifetime)
let isEventListenerAttached = false;
function ensureEventListeners() {
  if (typeof window === "undefined" || isEventListenerAttached) return;
  isEventListenerAttached = true;

  window.addEventListener(SESSION_REFRESH_EVENT, () => {
    void refreshMarketplaceSession();
  });

  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === STORAGE_HINT_KEY) {
      if (e.newValue === "1") {
        void refreshMarketplaceSession();
      } else if (!e.newValue) {
        clearMarketplaceSessionCache();
      }
    } else if (e.key === STORAGE_USER_KEY) {
      if (e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === "object" && parsed.id) {
            setMarketplaceSessionState(parsed as HeaderSessionUser, "authenticated");
          }
        } catch {}
      } else {
        clearMarketplaceSessionCache();
      }
    }
  });
}

ensureEventListeners();

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
    ensureEventListeners();

    if (initialUser !== undefined && initialUser !== null) {
      cachedState = { user: initialUser, status: "authenticated" };
      syncSessionHintCookie(true);
      return;
    }

    // Instant paint reconciliation from localStorage display snapshot
    if (cachedState.status === "unknown" && typeof window !== "undefined") {
      try {
        const cachedUserJson = localStorage.getItem(STORAGE_USER_KEY);
        if (cachedUserJson) {
          const parsed = JSON.parse(cachedUserJson);
          if (parsed && typeof parsed === "object" && parsed.id && parsed.name) {
            cachedState = { user: parsed as HeaderSessionUser, status: "authenticated" };
            listeners.forEach((l) => l());
          }
        }
      } catch {
        // Ignore localStorage parse errors
      }
    }

    if (hasInitiatedFetch) {
      return;
    }

    void refreshMarketplaceSession();
  }, [initialUser]);

  return state;
}
