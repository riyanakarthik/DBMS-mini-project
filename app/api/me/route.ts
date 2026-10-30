import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";

// GET /api/me -> the logged-in user's email, display name and role.
// The UI uses it to show who is logged in and to hide write buttons for
// viewers (cosmetic only: the API routes enforce the role themselves).
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const { email, displayName, role } = auth.session;
  return NextResponse.json({ email, displayName, role });
}
