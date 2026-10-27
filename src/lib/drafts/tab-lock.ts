/**
 * UNB Premium — Multi-Tab Lock Coordinator for Chapter Editor
 * 
 * Uses the Web Locks API (with BroadcastChannel fallback) to ensure that only
 * one browser tab edits and syncs a given client_key at a time.
 * If a second tab opens the same draft, it shows a read-only state with a "Take over" button.
 */

export interface TabLockHandle {
  clientKey: string;
  isHolder: boolean;
  release: () => void;
  takeOver: () => void;
}

export type LockLostCallback = () => void;

interface BroadcastMessage {
  type: 'CLAIM_LOCK' | 'HEARTBEAT' | 'RELEASE_LOCK' | 'TAKE_OVER_REQUEST';
  clientKey: string;
  tabId: string;
  timestamp: number;
}

const TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;

/**
 * Requests an exclusive edit lock for a specific client_key.
 */
export async function acquireDraftTabLock(
  clientKey: string,
  onLockLost?: LockLostCallback
): Promise<TabLockHandle> {
  const lockName = `unb_draft_lock_${clientKey}`;

  // 1. Preferred modern path: Web Locks API
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    let releaseLockResolver: (() => void) | null = null;
    let isHolding = false;
    let bc: BroadcastChannel | null = null;

    try {
      bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(lockName) : null;
    } catch {
      bc = null;
    }

    const lockPromise = new Promise<boolean>((resolveAcquisition) => {
      navigator.locks.request(
        lockName,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            resolveAcquisition(false);
            return;
          }

          isHolding = true;
          resolveAcquisition(true);

          // Hold lock until explicitly released or take-over requested
          await new Promise<void>((holdResolve) => {
            releaseLockResolver = holdResolve;

            if (bc) {
              bc.onmessage = (event: MessageEvent<BroadcastMessage>) => {
                if (event.data?.type === 'TAKE_OVER_REQUEST' && event.data.clientKey === clientKey) {
                  // Another tab took over
                  isHolding = false;
                  if (onLockLost) onLockLost();
                  holdResolve();
                }
              };
            }
          });
        }
      ).catch(() => {
        resolveAcquisition(false);
      });
    });

    const acquired = await lockPromise;

    return {
      clientKey,
      isHolder: acquired && isHolding,
      release: () => {
        if (releaseLockResolver) releaseLockResolver();
        if (bc) {
          try {
            bc.close();
          } catch {}
        }
      },
      takeOver: () => {
        if (bc) {
          bc.postMessage({
            type: 'TAKE_OVER_REQUEST',
            clientKey,
            tabId: TAB_ID,
            timestamp: Date.now(),
          });
        }
      },
    };
  }

  // 2. Fallback path: BroadcastChannel
  return acquireBroadcastChannelLock(clientKey, lockName, onLockLost);
}

function acquireBroadcastChannelLock(
  clientKey: string,
  channelName: string,
  onLockLost?: LockLostCallback
): TabLockHandle {
  if (typeof BroadcastChannel === 'undefined') {
    // Single tab environment (no BroadcastChannel)
    return {
      clientKey,
      isHolder: true,
      release: () => {},
      takeOver: () => {},
    };
  }

  const bc = new BroadcastChannel(channelName);
  let isHolder = true;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  bc.onmessage = (event: MessageEvent<BroadcastMessage>) => {
    const data = event.data;
    if (!data || data.clientKey !== clientKey) return;

    if (data.type === 'CLAIM_LOCK' && data.tabId !== TAB_ID) {
      if (isHolder) {
        // Assert ownership
        bc.postMessage({
          type: 'HEARTBEAT',
          clientKey,
          tabId: TAB_ID,
          timestamp: Date.now(),
        });
      }
    } else if (data.type === 'TAKE_OVER_REQUEST' && data.tabId !== TAB_ID) {
      if (isHolder) {
        isHolder = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (onLockLost) onLockLost();
      }
    }
  };

  // Announce claim
  bc.postMessage({
    type: 'CLAIM_LOCK',
    clientKey,
    tabId: TAB_ID,
    timestamp: Date.now(),
  });

  heartbeatTimer = setInterval(() => {
    if (isHolder) {
      bc.postMessage({
        type: 'HEARTBEAT',
        clientKey,
        tabId: TAB_ID,
        timestamp: Date.now(),
      });
    }
  }, 4000);

  return {
    clientKey,
    isHolder,
    release: () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        bc.close();
      } catch {}
    },
    takeOver: () => {
      isHolder = true;
      bc.postMessage({
        type: 'TAKE_OVER_REQUEST',
        clientKey,
        tabId: TAB_ID,
        timestamp: Date.now(),
      });
    },
  };
}
