import { NextResponse } from "next/server";
import { NotFoundError } from "./watchlist";

// Turn errors into HTTP responses. Database constraint violations are the
// database doing input validation, so they become 4xx with the constraint name.
export function errorResponse(err: unknown) {
  const e = err as { code?: string; constraint?: string; message: string };
  if (err instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  switch (e.code) {
    case "23505": // unique_violation (e.g. watchlists_pkey: already watching)
      return NextResponse.json({ error: "Already exists", constraint: e.constraint }, { status: 409 });
    case "23514": // check_violation (e.g. watchlists_note_len)
    case "23502": // not_null_violation
    case "23503": // foreign_key_violation
    case "22P02": // invalid_text_representation (bad number/uuid)
      return NextResponse.json({ error: e.message, constraint: e.constraint }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
