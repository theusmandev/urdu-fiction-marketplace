import { getHeaderSessionUser } from "@/lib/auth/getHeaderSessionUser";
import { PublicHeaderClient, type HeaderSessionUser } from "./public-header-client";

export type { HeaderSessionUser };

export interface PublicHeaderProps {
  initialUser?: HeaderSessionUser | null;
}

/**
 * PublicHeader component.
 * Server Component that authoritatively resolves the authenticated user before initial HTML rendering.
 * Eliminates auth UI flickering ("Log In" flash) on page load and refresh.
 */
export async function PublicHeader({ initialUser }: PublicHeaderProps = {}) {
  const user = initialUser !== undefined ? initialUser : await getHeaderSessionUser();
  return <PublicHeaderClient user={user} />;
}

