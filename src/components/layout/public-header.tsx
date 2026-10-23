import { PublicHeaderClient, type HeaderSessionUser } from "./public-header-client";

export type { HeaderSessionUser };

/**
 * PublicHeader component.
 * Statically cache-friendly shell for all public and ISR routes.
 * Session state is resolved gracefully client-side in PublicHeaderClient
 * to prevent Next.js from bailing out of SSG/ISR caching.
 */
export function PublicHeader() {
  return <PublicHeaderClient />;
}

