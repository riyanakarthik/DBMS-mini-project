import { NextResponse } from "next/server";
import { query } from "./db";
import { loadSql } from "./sql";
import { createSupabaseServerClient } from "./supabase/server";

export type Role = "analyst" | "viewer";
export type Session = { userId: string; email: string | null; displayName: string | null; role: Role };

// Who is calling? 1) Supabase Auth validates the session cookie and gives the
// user id; 2) the ROLE comes from our profiles table for that id. Nothing the
// client sends (headers, body, query string) can change either.
export async function getSession(): Promise<Session | "no-profile" | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await query<{ display_name: string | null; role: Role }>(
    loadSql("auth/profile_by_user.sql"),
    [user.id],
  );
  if (!profile) return "no-profile";
  return { userId: user.id, email: user.email ?? null, displayName: profile.display_name, role: profile.role };
}

// Gate for API routes:
//   not logged in                      -> 401 Unauthorized
//   logged in, no profile / wrong role -> 403 Forbidden
//   usage: const auth = await authorize("analyst"); if ("response" in auth) return auth.response;
export async function authorize(required?: Role): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession();
  if (session === null) {
    return { response: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  }
  if (session === "no-profile") {
    return { response: NextResponse.json({ error: "No profile for this user" }, { status: 403 }) };
  }
  if (required === "analyst" && session.role !== "analyst") {
    return {
      response: NextResponse.json({ error: "Analysts only: your role is read-only", role: session.role }, { status: 403 }),
    };
  }
  return { session };
}
