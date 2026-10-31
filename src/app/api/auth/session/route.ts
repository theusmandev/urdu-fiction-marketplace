import { NextResponse } from "next/server";
import { getHeaderSessionUser } from "@/lib/auth/getHeaderSessionUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getHeaderSessionUser();
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
