import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import type { HeaderSessionUser } from "@/components/layout/public-header-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, profile, writerProfile } = await getCurrentUser();

    if (!user || !profile) {
      return NextResponse.json({ user: null });
    }

    const sessionUser: HeaderSessionUser = {
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
    };

    return NextResponse.json({ user: sessionUser });
  } catch {
    return NextResponse.json({ user: null });
  }
}
