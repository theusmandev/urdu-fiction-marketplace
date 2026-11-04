/**
 * Formats a raw byte count into a clean human-readable representation (e.g. "850 KB", "1.2 MB").
 */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const k = 1024;
  if (bytes < k * k) {
    const kb = bytes / k;
    return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (k * k);
  if (mb < k) {
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  const gb = bytes / (k * k * k);
  return `${gb.toFixed(1)} GB`;
}
