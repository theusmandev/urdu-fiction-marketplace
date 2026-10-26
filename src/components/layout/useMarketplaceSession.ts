"use client";

import { useSyncExternalStore, useEffect } from "react";
import type { HeaderSessionUser } from "./public-header-client";

let cachedUser: HeaderSessionUser | null = null;
let hasFetched = false;
const listeners = new Set<() => void>();

export function setMarketplaceSessionUser(user: HeaderSessionUser | null) {
  cachedUser = user;
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useMarketplaceSession(initialUser?: HeaderSessionUser | null) {
  const user = useSyncExternalStore(
    subscribe,
    () => (initialUser !== undefined && initialUser !== null ? initialUser : cachedUser),
    () => (initialUser !== undefined && initialUser !== null ? initialUser : null)
  );

  useEffect(() => {
    if (initialUser !== undefined && initialUser !== null) {
      cachedUser = initialUser;
      return;
    }

    if (!hasFetched) {
      hasFetched = true;
      fetch("/api/auth/session")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) {
            setMarketplaceSessionUser(data.user);
          } else {
            setMarketplaceSessionUser(null);
          }
        })
        .catch(() => {
          setMarketplaceSessionUser(null);
        });
    }
  }, [initialUser]);

  return user;
}
