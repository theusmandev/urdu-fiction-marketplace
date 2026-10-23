/**
 * Asia/Karachi (PKT, UTC+5) Timezone Helpers & Billing Boundaries
 * 
 * Pakistan Standard Time is UTC+5 year-round (no DST).
 * Billing periods and statements are aligned strictly to Karachi standard boundaries.
 */

export const KARACHI_OFFSET_HOURS = 5;

/**
 * Returns UTC ISO strings representing the start (00:00:00.000 PKT)
 * and end (23:59:59.999 PKT) of a given calendar month in Asia/Karachi time.
 * 
 * @param year e.g. 2026
 * @param month 1-indexed (1 = January, 12 = December)
 */
export function getKarachiMonthBounds(year: number, month: number): {
  periodStartIso: string;
  periodEndIso: string;
  label: string;
} {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be 1 to 12.`);
  }

  // Month in zero-indexed JS Date
  // Start of month in PKT: YYYY-MM-01 00:00:00+05:00
  // In UTC: YYYY-(MM-1)-lastDay 19:00:00Z
  const pad = (n: number) => n.toString().padStart(2, '0');
  const monthStr = pad(month);

  // Month length in days
  const lastDay = new Date(year, month, 0).getDate();
  const lastDayStr = pad(lastDay);

  const periodStartIso = `${year}-${monthStr}-01T00:00:00+05:00`;
  const periodEndIso = `${year}-${monthStr}-${lastDayStr}T23:59:59.999+05:00`;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const label = `${monthNames[month - 1]} ${year}`;

  return {
    periodStartIso,
    periodEndIso,
    label,
  };
}

/**
 * Formats an ISO string or Date into readable Asia/Karachi time string.
 */
export function formatKarachiDateTime(dateInput: string | Date | null | undefined, includeTime = true): string {
  if (!dateInput) return '—';

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }
      : {}),
  }).format(d);
}

/**
 * Formats numeric PKR with exactly two decimal places.
 */
export function formatPKR2(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return 'PKR 0.00';
  }
  const num = Number(amount);
  return `PKR ${num.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
