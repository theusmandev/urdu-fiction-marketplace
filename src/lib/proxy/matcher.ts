/**
 * src/lib/proxy/matcher.ts
 *
 * Defines the Next.js edge proxy / middleware route matcher.
 * Matches all application request paths while excluding static assets, images, and favicons.
 */

export const PROXY_MATCHER = [
  '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
];

