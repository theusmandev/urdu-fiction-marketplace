import { PublicHeaderClient, type HeaderSessionUser } from "./public-header-client";

export type { HeaderSessionUser };

export interface PublicHeaderProps {
  initialUser?: HeaderSessionUser | null;
  initialBannerDismissed?: boolean;
}

/**
 * PublicHeader component.
 * Renders stable default logged-out header HTML for public static/ISR pages with zero
 * server-side cookies or auth calls, preventing dynamic rendering bailouts.
 * User session resolves cleanly on the client via /api/auth/session with no layout shift.
 */
export function PublicHeader({
  initialUser = null,
  initialBannerDismissed = false,
}: PublicHeaderProps = {}) {
  return (
    <PublicHeaderClient
      user={initialUser}
      initialBannerDismissed={initialBannerDismissed}
    />
  );
}

