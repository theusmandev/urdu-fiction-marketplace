import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PublicHeaderClient, type HeaderSessionUser } from "./public-header-client";

export type { HeaderSessionUser };

/**
 * Server-rendered PublicHeader component.
 * Authoritatively retrieves authentication state using getCurrentUser().
 * Passes a safe, typed session user payload to the interactive client header.
 */
export async function PublicHeader() {
  const { user, profile, writerProfile } = await getCurrentUser();

  const sessionUser: HeaderSessionUser | null =
    user && profile
      ? {
          id: user.id,
          email: user.email || profile.email,
          name: profile.full_name || profile.username || user.email?.split("@")[0] || "User",
          username: profile.username,
          avatarUrl: profile.avatar_url,
          role: profile.role,
          isWriter:
            profile.role === "writer" ||
            writerProfile?.status === "approved" ||
            writerProfile?.status === "pending_approval",
          writerStatus: writerProfile?.status ?? null,
        }
      : null;

  return <PublicHeaderClient user={sessionUser} />;
}
