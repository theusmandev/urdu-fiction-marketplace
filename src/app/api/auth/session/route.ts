import { NextResponse, type NextRequest } from "next/server";
import { getHeaderSessionUser } from "@/lib/auth/getHeaderSessionUser";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Vary": "Cookie",
  };

  // Fast anonymous path: If request has no Supabase auth cookie, return null in <1ms without calling Supabase
  const cookies = request.cookies.getAll();
  const hasAuthToken = cookies.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );

  if (!hasAuthToken) {
    return NextResponse.json({ user: null }, { headers });
  }

  try {
    // Authoritative verification: Route runs its own getUser() directly from Supabase JWT cookies.
    // Zero header trust: request headers (x-user-id, etc.) are NEVER read or trusted.
    const user = await getHeaderSessionUser();
    return NextResponse.json({ user }, { headers });
  } catch (err) {
    console.error("api/auth/session: error retrieving session user:", err);
    return NextResponse.json({ user: null }, { headers });
  }
}
