import { NextResponse, type NextRequest } from "next/server";
import { getHeaderSessionUser } from "@/lib/auth/getHeaderSessionUser";
import {
  SESSION_HINT_COOKIE_NAME,
  attachSessionHintCookie,
  removeSessionHintCookie,
} from "@/lib/auth/session-hint";

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
  const hasHintCookie = request.cookies.get(SESSION_HINT_COOKIE_NAME)?.value === "1";

  if (!hasAuthToken) {
    const response = NextResponse.json({ user: null }, { headers });
    // Self-heal: clear stale hint cookie if request had it but no auth tokens exist
    if (hasHintCookie) {
      removeSessionHintCookie(response);
    }
    return response;
  }

  try {
    // Authoritative verification: Route runs its own getUser() directly from Supabase JWT cookies.
    // Zero header trust: request headers (x-user-id, etc.) are NEVER read or trusted.
    const user = await getHeaderSessionUser();
    const response = NextResponse.json({ user }, { headers });

    if (user) {
      // Self-heal: attach unb_has_session=1 so existing sessions that missed the cookie
      // never experience the 1-2s flicker on future page views, and active users refresh their TTL
      attachSessionHintCookie(response);
    } else if (hasHintCookie) {
      // Stale hint: user failed auth check (e.g. deactivated or expired session), clear cookie
      removeSessionHintCookie(response);
    }

    return response;
  } catch (err) {
    console.error("api/auth/session: error retrieving session user:", err);
    const response = NextResponse.json({ user: null }, { headers });
    if (hasHintCookie) {
      removeSessionHintCookie(response);
    }
    return response;
  }
}
