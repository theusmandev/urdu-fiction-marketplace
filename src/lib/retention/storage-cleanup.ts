async function getDefaultSupabaseClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createCronSupabaseClient } = await import('../supabase/cron-client.ts');
      return createCronSupabaseClient();
    } catch {
      // fallback to server client
    }
  }
  const { createServerClient } = await import('../supabase/server.ts');
  return createServerClient();
}

export { formatBytes } from './format.ts';

/**
 * Normalizes a raw screenshot URL or relative storage path into
 * the exact object key within the 'payment-proofs' bucket.
 */
export function extractProofStorageKey(rawPathOrUrl: string): string | null {
  if (!rawPathOrUrl || rawPathOrUrl.startsWith('[PRUNED')) {
    return null;
  }

  // Strip query parameters
  const cleanUrl = rawPathOrUrl.split('?')[0].trim();
  if (!cleanUrl) {
    return null;
  }

  // If it's a full URL containing the bucket name
  const bucketMarker = '/payment-proofs/';
  const markerIdx = cleanUrl.indexOf(bucketMarker);
  if (markerIdx !== -1) {
    const relative = cleanUrl.slice(markerIdx + bucketMarker.length);
    return relative.replace(/^\/+/, '') || null;
  }

  // If it starts with storage object URL format
  const objMarker = '/object/public/';
  const objIdx = cleanUrl.indexOf(objMarker);
  if (objIdx !== -1) {
    const relative = cleanUrl.slice(objIdx + objMarker.length);
    return relative.replace(/^payment-proofs\//, '').replace(/^\/+/, '') || null;
  }

  // Relative path (e.g. "order-uuid/proof.jpg" or "folder/uuid.png")
  return cleanUrl.replace(/^\/+/, '') || null;
}

export interface StorageCleanupResult {
  success: boolean;
  deletedFiles: number;
  prunedRows?: number;
  storage_bytes_freed?: number;
  message?: string;
  error?: string;
}

/**
 * Prunes expired payment proof screenshots from Supabase Storage 'payment-proofs' bucket
 * based on the configured retention window, while preserving the financial ledger and TID rows.
 */
export async function cleanupOldPaymentProofFiles(options?: {
  retentionDays?: number;
  client?: any;
}): Promise<StorageCleanupResult> {
  try {
    // Fast path: if retentionDays was explicitly provided and is <= 0 (unlimited sentinel), skip immediately
    if (options?.retentionDays !== undefined && options.retentionDays <= 0) {
      return {
        success: true,
        deletedFiles: 0,
        storage_bytes_freed: 0,
        message: 'Payment proof retention is set to unlimited (never delete). Skipped.',
      };
    }

    let supabase = options?.client;
    if (!supabase) {
      supabase = await getDefaultSupabaseClient();
    }

    let retentionDays: number;

    // If retentionDays is not passed, load it from platform_settings
    if (options?.retentionDays !== undefined) {
      retentionDays = options.retentionDays;
    } else {
      const { data: settings, error: settingsErr } = await supabase
        .from('platform_settings')
        .select('retention_payment_proofs_days')
        .eq('id', 1)
        .maybeSingle();

      if (settingsErr) {
        console.error('[cleanupOldPaymentProofFiles] Failed to load retention settings:', settingsErr.message);
        return {
          success: false,
          deletedFiles: 0,
          error: settingsErr.message,
        };
      }

      retentionDays = settings?.retention_payment_proofs_days ?? 90;
    }

    // Sentinel: <= 0 means Unlimited / Never Delete
    if (retentionDays <= 0) {
      return {
        success: true,
        deletedFiles: 0,
        storage_bytes_freed: 0,
        message: 'Payment proof retention is set to unlimited (never delete). Skipped.',
      };
    }

    // Query expired paths from the database helper RPC
    const { data: expiredRecords, error: fetchErr } = await supabase.rpc(
      'get_expired_payment_proof_paths',
      { p_days: retentionDays }
    );

    if (fetchErr) {
      console.error('[cleanupOldPaymentProofFiles] Error fetching expired proof paths:', fetchErr.message);
      return {
        success: false,
        deletedFiles: 0,
        storage_bytes_freed: 0,
        error: fetchErr.message,
      };
    }

    if (!expiredRecords || expiredRecords.length === 0) {
      return {
        success: true,
        deletedFiles: 0,
        storage_bytes_freed: 0,
        message: 'No expired payment proofs found.',
      };
    }

    const rawPaths: string[] = [];
    const storageKeys: string[] = [];

    for (const record of expiredRecords as Array<{ proof_path: string; source_type: string }>) {
      if (!record.proof_path) continue;
      rawPaths.push(record.proof_path);

      const key = extractProofStorageKey(record.proof_path);
      if (key && !storageKeys.includes(key)) {
        storageKeys.push(key);
      }
    }

    let deletedCount = 0;

    // Delete binary objects from payment-proofs bucket in chunks
    if (storageKeys.length > 0) {
      const { data: removeData, error: removeErr } = await supabase.storage
        .from('payment-proofs')
        .remove(storageKeys);

      if (removeErr) {
        console.error('[cleanupOldPaymentProofFiles] Supabase storage remove error:', removeErr.message);
      } else if (removeData) {
        deletedCount = removeData.length;
      }
    }

    // Mark database rows as pruned so they won't be queried again
    let prunedRows = 0;
    if (rawPaths.length > 0) {
      const { data: markData, error: markErr } = await supabase.rpc(
        'mark_payment_proofs_pruned',
        { p_paths: rawPaths }
      );

      if (markErr) {
        console.error('[cleanupOldPaymentProofFiles] Error marking proofs pruned in database:', markErr.message);
      } else {
        prunedRows = markData ?? 0;
      }
    }

    const totalDeletedFiles = deletedCount || storageKeys.length;
    // Conservative average: ~350 KB (350,000 bytes) per receipt screenshot
    const storageBytesFreed = totalDeletedFiles * 350000;

    return {
      success: true,
      deletedFiles: totalDeletedFiles,
      prunedRows,
      storage_bytes_freed: storageBytesFreed,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[cleanupOldPaymentProofFiles] Unexpected error:', errorMsg);
    return {
      success: false,
      deletedFiles: 0,
      error: errorMsg,
    };
  }
}
