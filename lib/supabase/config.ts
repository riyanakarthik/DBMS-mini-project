// Public Supabase settings. Both are safe in the browser: the publishable
// key only identifies the project; what a user may do is decided by
// Supabase Auth (login) and by our API routes + database (roles).
// NEXT_PUBLIC_ names must be written out literally so Next.js can inline them.
// DATABASE_URL is NOT NEXT_PUBLIC_, so it never reaches the browser bundle.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
