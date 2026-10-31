import { cookies } from "next/headers";
import { getHeaderSessionUser } from "@/lib/auth/getHeaderSessionUser";
import { PublicHeaderClient, type HeaderSessionUser } from "./public-header-client";

export type { HeaderSessionUser };

export interface PublicHeaderProps {
  initialUser?: HeaderSessionUser | null;
  initialBannerDismissed?: boolean;
}

function isDynamicServerError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === 'string' &&
    (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))
  );
}

/**
 * PublicHeader component.
 * Server Component that authoritatively resolves the authenticated user and top banner state
 * before initial HTML rendering. Eliminates auth UI flickering ("Log In" flash) and top banner
 * flash on page load and refresh.
 */
export async function PublicHeader({
  initialUser,
  initialBannerDismissed,
}: PublicHeaderProps = {}) {
  const user = initialUser !== undefined ? initialUser : await getHeaderSessionUser();

  let bannerDismissed = initialBannerDismissed;
  if (bannerDismissed === undefined) {
    try {
      const cookieStore = await cookies();
      bannerDismissed = cookieStore.get('unb_banner_dismissed')?.value === 'true';
    } catch (err) {
      if (isDynamicServerError(err)) {
        throw err;
      }
      bannerDismissed = false;
    }
  }

  return (
    <PublicHeaderClient
      user={user}
      initialBannerDismissed={bannerDismissed ?? false}
    />
  );
}

