/**
 * UNB Premium — Offline-Tolerant Draft Sync State Machine & Pure Utilities
 *
 * Pure, deterministic finite state machine and helper functions for chapter drafts.
 * Zero external side effects, zero React dependencies, 100% testable in Node.
 */

export type SyncStatus =
  | 'idle'
  | 'saved_local'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'conflict'
  | 'error'
  | 'auth_expired';

export type SyncEventType =
  | 'LOCAL_SAVE_COMPLETED'
  | 'SYNC_STARTED'
  | 'SYNC_SUCCESS'
  | 'SYNC_CONFLICT'
  | 'SYNC_OFFLINE'
  | 'SYNC_AUTH_EXPIRED'
  | 'SYNC_ERROR'
  | 'NETWORK_ONLINE'
  | 'FORCE_SYNC'
  | 'CONFLICT_RESOLVED'
  | 'AUTH_RESTORED';

export interface SyncEvent {
  type: SyncEventType;
  payload?: {
    serverRevision?: number;
    updatedAt?: string;
    conflictData?: {
      server_revision: number;
      server_updated_at: string;
      device_label: string | null;
      content_urdu: string;
      title_urdu: string | null;
    };
    error?: string;
  };
}

export interface SyncEngineState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  serverRevision: number;
  retryAttempt: number;
  errorMessage: string | null;
  conflictData: {
    server_revision: number;
    server_updated_at: string;
    device_label: string | null;
    content_urdu: string;
    title_urdu: string | null;
  } | null;
}

/**
 * Pure state transition function.
 * Deterministic and easily unit-tested.
 */
export function transitionSyncState(
  state: SyncEngineState,
  event: SyncEvent
): SyncEngineState {
  switch (event.type) {
    case 'LOCAL_SAVE_COMPLETED':
      if (state.status === 'conflict') {
        // Remain in conflict until resolved
        return state;
      }
      if (state.status === 'auth_expired') {
        return state;
      }
      return {
        ...state,
        status: state.status === 'offline' ? 'offline' : 'saved_local',
        errorMessage: null,
      };

    case 'SYNC_STARTED':
      return {
        ...state,
        status: 'syncing',
        errorMessage: null,
      };

    case 'SYNC_SUCCESS':
      return {
        ...state,
        status: 'synced',
        serverRevision: event.payload?.serverRevision ?? state.serverRevision,
        lastSyncedAt: event.payload?.updatedAt ?? new Date().toISOString(),
        retryAttempt: 0,
        errorMessage: null,
        conflictData: null,
      };

    case 'SYNC_CONFLICT':
      return {
        ...state,
        status: 'conflict',
        conflictData: event.payload?.conflictData || null,
        retryAttempt: 0,
      };

    case 'SYNC_OFFLINE':
      return {
        ...state,
        status: 'offline',
        retryAttempt: state.retryAttempt + 1,
        errorMessage: event.payload?.error || 'Offline — saved on this device',
      };

    case 'SYNC_AUTH_EXPIRED':
      return {
        ...state,
        status: 'auth_expired',
        errorMessage: 'Please sign in again to sync; your text is safe on this device.',
      };

    case 'SYNC_ERROR':
      return {
        ...state,
        status: 'error',
        errorMessage: event.payload?.error || 'Sync error occurred.',
        retryAttempt: state.retryAttempt + 1,
      };

    case 'NETWORK_ONLINE':
      if (state.status === 'offline') {
        return {
          ...state,
          status: 'saved_local',
          retryAttempt: 0,
          errorMessage: null,
        };
      }
      return state;

    case 'AUTH_RESTORED':
      if (state.status === 'auth_expired') {
        return {
          ...state,
          status: 'saved_local',
          errorMessage: null,
        };
      }
      return state;

    case 'CONFLICT_RESOLVED':
      return {
        ...state,
        status: 'synced',
        serverRevision: event.payload?.serverRevision ?? state.serverRevision,
        lastSyncedAt: event.payload?.updatedAt ?? new Date().toISOString(),
        conflictData: null,
        errorMessage: null,
      };

    case 'FORCE_SYNC':
      return {
        ...state,
        status: state.status === 'conflict' ? 'conflict' : 'syncing',
        errorMessage: null,
      };

    default:
      return state;
  }
}

/**
 * Calculates exponential backoff delay with random jitter (cap ~60s).
 */
export function calculateBackoffDelay(attempt: number): number {
  const base = Math.min(60000, 1000 * Math.pow(2, Math.min(attempt, 6)));
  const jitter = Math.floor(Math.random() * 1000);
  return base + jitter;
}

/**
 * Line-based diff utility for conflict dialog.
 */
export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export function computeLineDiff(originalText: string, newText: string): DiffLine[] {
  const originalLines = originalText.split('\n');
  const newLines = newText.split('\n');
  const diff: DiffLine[] = [];

  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < newLines.length) {
    if (i < originalLines.length && j < newLines.length && originalLines[i] === newLines[j]) {
      diff.push({ type: 'same', text: originalLines[i] });
      i++;
      j++;
    } else {
      if (i < originalLines.length && (j >= newLines.length || !newLines.includes(originalLines[i]))) {
        diff.push({ type: 'removed', text: originalLines[i] });
        i++;
      } else if (j < newLines.length) {
        diff.push({ type: 'added', text: newLines[j] });
        j++;
      } else {
        if (i < originalLines.length) {
          diff.push({ type: 'removed', text: originalLines[i] });
          i++;
        }
        if (j < newLines.length) {
          diff.push({ type: 'added', text: newLines[j] });
          j++;
        }
      }
    }
  }

  return diff;
}
