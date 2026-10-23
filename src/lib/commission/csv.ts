/**
 * CSV Export Helpers with Formula Injection Neutralization
 * 
 * Prevents CSV Formula Injection (CWE-1236) by prepending a single quote (')
 * to any cell whose text begins with sensitive formula trigger characters (=, +, -, @, \t, \r).
 */

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value);

  // If starts with formula trigger characters, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape internal double quotes by doubling them
  const escaped = str.replace(/"/g, '""');

  return `"${escaped}"`;
}

export function buildCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function generateCsvContent(headers: string[], rows: unknown[][]): string {
  const headerLine = buildCsvRow(headers);
  const dataLines = rows.map(buildCsvRow);
  return [headerLine, ...dataLines].join('\r\n');
}
