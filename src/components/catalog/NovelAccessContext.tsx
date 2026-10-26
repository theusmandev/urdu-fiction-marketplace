'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import {
  getNovelAccessStatusAction,
  type NovelAccessStatus,
  type NovelAccessState,
} from '@/app/actions/checkout';

interface NovelAccessContextValue {
  status: NovelAccessStatus | null;
  isLoading: boolean;
  state: NovelAccessState;
  signedIn: boolean;
  orderNumber: string | null;
  lastReadChapterNumber: number | null;
  refetch: () => Promise<void>;
}

const NovelAccessContext = createContext<NovelAccessContextValue | null>(null);

// Global cache of access statuses by novelId
const accessStatusCache = new Map<string, NovelAccessStatus>();
const activeFetches = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

async function fetchNovelAccess(novelId: string): Promise<void> {
  if (activeFetches.has(novelId)) {
    return activeFetches.get(novelId);
  }

  const fetchPromise = (async () => {
    try {
      const res = await getNovelAccessStatusAction(novelId);
      accessStatusCache.set(novelId, res);
    } catch (err) {
      console.error('[NovelAccessContext] Failed to fetch access status:', err);
      accessStatusCache.set(novelId, {
        state: 'visitor',
        signedIn: false,
        orderNumber: null,
        lastReadChapterNumber: null,
      });
    } finally {
      activeFetches.delete(novelId);
      notifyListeners();
    }
  })();

  activeFetches.set(novelId, fetchPromise);
  return fetchPromise;
}

interface NovelAccessProviderProps {
  novelId: string;
  children: React.ReactNode;
}

export function NovelAccessProvider({ novelId, children }: NovelAccessProviderProps) {
  const status = useSyncExternalStore(
    subscribe,
    () => accessStatusCache.get(novelId) ?? null,
    () => null
  );

  useEffect(() => {
    if (!accessStatusCache.has(novelId)) {
      fetchNovelAccess(novelId);
    }
  }, [novelId]);

  const isLoading = status === null;
  const currentState: NovelAccessState = status?.state ?? 'visitor';

  const value: NovelAccessContextValue = {
    status,
    isLoading,
    state: currentState,
    signedIn: status?.signedIn ?? false,
    orderNumber: status?.orderNumber ?? null,
    lastReadChapterNumber: status?.lastReadChapterNumber ?? null,
    refetch: () => fetchNovelAccess(novelId),
  };

  return (
    <NovelAccessContext.Provider value={value}>
      {children}
    </NovelAccessContext.Provider>
  );
}

export function useNovelAccess(): NovelAccessContextValue {
  const context = useContext(NovelAccessContext);
  if (!context) {
    return {
      status: null,
      isLoading: false,
      state: 'visitor',
      signedIn: false,
      orderNumber: null,
      lastReadChapterNumber: null,
      refetch: async () => {},
    };
  }
  return context;
}
