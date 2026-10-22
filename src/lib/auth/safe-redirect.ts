/**
 * Whitelist of allowed relative destination prefixes for post-auth redirects.
 * Prevents open redirect vulnerabilities.
 */
const ALLOWED_REDIRECT_PREFIXES = [
  '/',
  '/account',
  '/library',
  '/orders',
  '/writer',
  '/admin',
  '/become-a-writer',
  '/novels',
];

/**
 * Checks if a target path is a safe relative path within the allowed whitelist.
 */
export function isSafeRedirectPath(target: string | null | undefined): boolean {
  if (!target || typeof target !== 'string') {
    return false;
  }

  const trimmed = target.trim();

  // Reject non-relative paths, protocol-relative (//), or backslash bypasses
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\')
  ) {
    return false;
  }

  // Reject URLs with embedded scheme, control characters, or pseudo-protocols
  if (/[\r\n\t]/.test(trimmed) || /^\/[/\\]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    return ALLOWED_REDIRECT_PREFIXES.some(
      (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes and validates a redirect target URL.
 * Only allows relative, same-origin paths matching safe prefixes.
 * Returns defaultPath if invalid or unsafe.
 */
export function getSafeRedirectUrl(
  target: string | null | undefined,
  defaultPath = '/'
): string {
  if (!target || typeof target !== 'string') {
    return defaultPath;
  }

  const trimmed = target.trim();

  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\')
  ) {
    return defaultPath;
  }

  if (/[\r\n\t]/.test(trimmed) || /^\/[/\\]/.test(trimmed)) {
    return defaultPath;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    const pathname = parsed.pathname;

    const isAllowed = ALLOWED_REDIRECT_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (isAllowed) {
      return `${pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return defaultPath;
  }

  return defaultPath;
}

export const sanitizeRedirectPath = getSafeRedirectUrl;
