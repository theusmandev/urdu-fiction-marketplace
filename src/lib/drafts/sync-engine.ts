/**
 * UNB Premium — Offline-Tolerant Draft Sync Engine & State Machine
 * 
 * Provides a pure, deterministic state machine and React hook for syncing
 * chapter drafts from local IndexedDB to the Supabase draft store.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  saveLocalDraft,
  archiveLocalDraftUnderDifferentKey,
  generateDraftClientKey,
} from './local-store.ts';
import {
  upsertDraftAction,
  resolveDraftConflictAction,
} from '../../app/actions/drafts.ts';

import {
  type SyncStatus,
  type SyncEventType,
  type SyncEvent,
  type SyncEngineState,
  transitionSyncState,
  calculateBackoffDelay,
  type DiffLine,
  computeLineDiff,
} from './sync-state-machine.ts';

export {
  type SyncStatus,
  type SyncEventType,
  type SyncEvent,
  type SyncEngineState,
  transitionSyncState,
  calculateBackoffDelay,
  type DiffLine,
  computeLineDiff,
};



export interface UseDraftSyncOptions {
  userId: string;
  novelId: string;
  chapterId: string | null;
  initialTitle: string;
  initialContent: string;
  initialChapterNumber: number | null;
  baseChapterUpdatedAt: string | null;
  clientKey?: string;
  enabled?: boolean;
}

export function useDraftSync({
  userId,
  novelId,
  chapterId,
  initialTitle,
  initialContent,
  initialChapterNumber,
  baseChapterUpdatedAt,
  clientKey: customClientKey,
  enabled = true,
}: UseDraftSyncOptions) {
  const clientKey = customClientKey || generateDraftClientKey(userId, novelId, chapterId);

  const [state, setState] = useState<SyncEngineState>({
    status: 'idle',
    lastSyncedAt: null,
    serverRevision: 1,
    retryAttempt: 0,
    errorMessage: null,
    conflictData: null,
  });

  // Reference tracking for current text and debounced local saves
  const latestDraftRef = useRef<{
    title: string;
    content: string;
    chapterNumber: number | null;
    localSeq: number;
    inFlightSeq: number;
  }>({
    title: initialTitle,
    content: initialContent,
    chapterNumber: initialChapterNumber,
    localSeq: 0,
    inFlightSeq: 0,
  });

  const localSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cloudSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dispatch state machine action
  const dispatch = useCallback((event: SyncEvent) => {
    setState((prev) => transitionSyncState(prev, event));
  }, []);

  // Sync to cloud RPC
  const performCloudSync = useCallback(async () => {
    if (!enabled) return;

    // Do not sync if content exceeds 120,000 chars (kept locally, warned in UI)
    if (latestDraftRef.current.content.length > 120000) {
      dispatch({
        type: 'SYNC_ERROR',
        payload: {
          error: 'Content exceeds 120,000 characters. Kept locally on device; divide chapter before cloud sync.',
        },
      });
      return;
    }

    // Capture in-flight sequence to prevent race conditions with typing
    const inFlightSeq = latestDraftRef.current.localSeq;
    latestDraftRef.current.inFlightSeq = inFlightSeq;

    dispatch({ type: 'SYNC_STARTED' });

    try {
      const res = await upsertDraftAction({
        novelId,
        chapterId,
        clientKey,
        titleUrdu: latestDraftRef.current.title,
        contentUrdu: latestDraftRef.current.content,
        chapterNumber: latestDraftRef.current.chapterNumber,
        baseChapterUpdatedAt,
        expectedServerRevision: state.serverRevision,
      });

      if (!res.success) {
        if (res.authExpired) {
          dispatch({ type: 'SYNC_AUTH_EXPIRED' });
          return;
        }

        // Check if network fetch failed
        if (!navigator.onLine || res.error?.includes('fetch failed') || res.error?.includes('network')) {
          dispatch({ type: 'SYNC_OFFLINE', payload: { error: res.error } });
          return;
        }

        dispatch({ type: 'SYNC_ERROR', payload: { error: res.error } });
        return;
      }

      const result = res.data;
      if (!result) return;

      if (result.status === 'conflict') {
        dispatch({
          type: 'SYNC_CONFLICT',
          payload: {
            conflictData: {
              server_revision: result.server_revision,
              server_updated_at: result.server_updated_at,
              device_label: result.device_label,
              content_urdu: result.content_urdu,
              title_urdu: result.title_urdu,
            },
          },
        });
      } else if (result.status === 'ok') {
        // Successful save
        // Check if newer local changes were typed during in-flight request
        const isClean = latestDraftRef.current.localSeq === inFlightSeq;

        await saveLocalDraft({
          client_key: clientKey,
          userId,
          novelId,
          chapterId,
          title: latestDraftRef.current.title,
          content: latestDraftRef.current.content,
          chapterNumber: latestDraftRef.current.chapterNumber,
          localSeq: latestDraftRef.current.localSeq,
          baseChapterUpdatedAt,
          serverRevision: result.server_revision,
          lastSyncedSeq: inFlightSeq,
          lastSyncedAt: result.updated_at,
          dirty: !isClean,
          deviceLabel: '',
        });

        dispatch({
          type: 'SYNC_SUCCESS',
          payload: {
            serverRevision: result.server_revision,
            updatedAt: result.updated_at,
          },
        });

        if (!isClean) {
          // Trigger next debounced sync for intermediate keystrokes
          dispatch({ type: 'LOCAL_SAVE_COMPLETED' });
        }
      }
    } catch (err: unknown) {
      if (!navigator.onLine) {
        dispatch({ type: 'SYNC_OFFLINE' });
      } else {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        dispatch({ type: 'SYNC_ERROR', payload: { error: msg } });
      }
    }
  }, [enabled, novelId, chapterId, clientKey, baseChapterUpdatedAt, state.serverRevision, userId, dispatch]);

  // Schedule cloud sync debounce (~3s while typing)
  const scheduleCloudSync = useCallback(
    (delayMs = 3000) => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = setTimeout(() => {
        performCloudSync();
      }, delayMs);
    },
    [performCloudSync]
  );

  // Debounced local IndexedDB save (~800ms)
  const notifyChange = useCallback(
    (title: string, content: string, chapterNumber: number | null) => {
      latestDraftRef.current.title = title;
      latestDraftRef.current.content = content;
      latestDraftRef.current.chapterNumber = chapterNumber;
      latestDraftRef.current.localSeq += 1;

      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);

      localSaveTimerRef.current = setTimeout(async () => {
        try {
          await saveLocalDraft({
            client_key: clientKey,
            userId,
            novelId,
            chapterId,
            title,
            content,
            chapterNumber,
            localSeq: latestDraftRef.current.localSeq,
            baseChapterUpdatedAt,
            serverRevision: state.serverRevision,
            lastSyncedSeq: latestDraftRef.current.inFlightSeq,
            lastSyncedAt: state.lastSyncedAt,
            dirty: true,
            deviceLabel: '',
          });

          dispatch({ type: 'LOCAL_SAVE_COMPLETED' });
          scheduleCloudSync(3000);
        } catch (err) {
          console.error('Failed to save to local IndexedDB:', err);
        }
      }, 800);
    },
    [clientKey, userId, novelId, chapterId, baseChapterUpdatedAt, state.serverRevision, state.lastSyncedAt, dispatch, scheduleCloudSync]
  );

  // Immediate save & sync on blur / visibilitychange hidden
  const flushImmediately = useCallback(async () => {
    if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);

    try {
      await saveLocalDraft({
        client_key: clientKey,
        userId,
        novelId,
        chapterId,
        title: latestDraftRef.current.title,
        content: latestDraftRef.current.content,
        chapterNumber: latestDraftRef.current.chapterNumber,
        localSeq: latestDraftRef.current.localSeq,
        baseChapterUpdatedAt,
        serverRevision: state.serverRevision,
        lastSyncedSeq: latestDraftRef.current.inFlightSeq,
        lastSyncedAt: state.lastSyncedAt,
        dirty: true,
        deviceLabel: '',
      });
      dispatch({ type: 'LOCAL_SAVE_COMPLETED' });
      await performCloudSync();
    } catch (err) {
      console.error('Flush immediately failed:', err);
    }
  }, [clientKey, userId, novelId, chapterId, baseChapterUpdatedAt, state.serverRevision, state.lastSyncedAt, dispatch, performCloudSync]);

  // Window events: online, visibilitychange, focus, beforeunload
  useEffect(() => {
    const handleOnline = () => {
      dispatch({ type: 'NETWORK_ONLINE' });
      performCloudSync();
    };

    const handleFocus = () => {
      if (state.status === 'saved_local' || state.status === 'offline') {
        performCloudSync();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushImmediately();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [dispatch, performCloudSync, flushImmediately, state.status]);

  // Periodic 30s background sync while dirty
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.status === 'saved_local') {
        performCloudSync();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [state.status, performCloudSync]);

  // Exponential backoff retry when offline or encountering retriable errors
  useEffect(() => {
    if (state.status === 'offline' && state.retryAttempt < 10) {
      const delay = calculateBackoffDelay(state.retryAttempt);
      retryTimerRef.current = setTimeout(() => {
        performCloudSync();
      }, delay);
      return () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      };
    }
  }, [state.status, state.retryAttempt, performCloudSync]);

  // Conflict resolutions
  const resolveKeepMine = useCallback(async () => {
    const res = await resolveDraftConflictAction(
      clientKey,
      'keep_mine',
      latestDraftRef.current.content,
      latestDraftRef.current.title
    );

    if (res.success && res.data && res.data.status === 'ok') {
      dispatch({
        type: 'CONFLICT_RESOLVED',
        payload: {
          serverRevision: res.data.server_revision,
          updatedAt: res.data.updated_at,
        },
      });
    }
  }, [clientKey, dispatch]);

  const resolveKeepServer = useCallback(async () => {
    if (!state.conflictData) return;

    // Archive current local copy under distinct key so it is NEVER lost
    await archiveLocalDraftUnderDifferentKey(clientKey, userId);

    const serverContent = state.conflictData.content_urdu;
    const serverTitle = state.conflictData.title_urdu || '';

    // Update local store with server copy
    await saveLocalDraft({
      client_key: clientKey,
      userId,
      novelId,
      chapterId,
      title: serverTitle,
      content: serverContent,
      chapterNumber: latestDraftRef.current.chapterNumber,
      localSeq: latestDraftRef.current.localSeq + 1,
      baseChapterUpdatedAt,
      serverRevision: state.conflictData.server_revision,
      lastSyncedSeq: latestDraftRef.current.localSeq + 1,
      lastSyncedAt: state.conflictData.server_updated_at,
      dirty: false,
      deviceLabel: '',
    });

    latestDraftRef.current.title = serverTitle;
    latestDraftRef.current.content = serverContent;

    dispatch({
      type: 'CONFLICT_RESOLVED',
      payload: {
        serverRevision: state.conflictData.server_revision,
        updatedAt: state.conflictData.server_updated_at,
      },
    });

    return { title: serverTitle, content: serverContent };
  }, [clientKey, userId, novelId, chapterId, baseChapterUpdatedAt, state.conflictData, dispatch]);

  const copyMineToNewDraft = useCallback(async () => {
    const newSlot = `copy_${Date.now()}`;
    const newKey = generateDraftClientKey(userId, novelId, null, newSlot);

    await saveLocalDraft({
      client_key: newKey,
      userId,
      novelId,
      chapterId: null,
      title: `${latestDraftRef.current.title || 'Draft'} (Copied)`,
      content: latestDraftRef.current.content,
      chapterNumber: null,
      baseChapterUpdatedAt: null,
      serverRevision: 1,
      lastSyncedSeq: 0,
      lastSyncedAt: null,
      dirty: true,
      deviceLabel: '',
    });

    return newKey;
  }, [userId, novelId]);

  return {
    syncStatus: state.status,
    lastSyncedAt: state.lastSyncedAt,
    serverRevision: state.serverRevision,
    errorMessage: state.errorMessage,
    conflictData: state.conflictData,
    notifyChange,
    flushImmediately,
    forceSyncNow: performCloudSync,
    resolveKeepMine,
    resolveKeepServer,
    copyMineToNewDraft,
    clientKey,
  };
}
