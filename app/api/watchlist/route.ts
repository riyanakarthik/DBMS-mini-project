import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { badRequest, errorResponse } from "@/lib/api";
import { addToWatchlist, listWatchlist, removeFromWatchlist, updateWatchlistNote } from "@/lib/watchlist";

// /api/watchlist: always acts on the LOGGED-IN user's own watchlist.
//   GET                         -> list            (viewer or analyst)
//   POST   {ticker, note?}      -> add             (analyst; transaction: INSERT watchlists + INSERT activity_log)
//   PATCH  {cik, note}          -> edit note       (analyst; transaction: UPDATE watchlists + INSERT activity_log)
//   DELETE ?cik=...             -> remove          (analyst; transaction: DELETE watchlists + INSERT activity_log)
// The user id comes from the verified session, never from the request body,
// so a user can only ever touch their own rows.
export const dynamic = "force-dynamic";

function cleanNote(note: unknown): string | null {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") throw new TypeError("note must be a string");
  return note.trim() || null; // length is validated by the DB (watchlists_note_len)
}

export async function GET() {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await listWatchlist(auth.session.userId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  const auth = await authorize("analyst");
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body?.ticker || typeof body.ticker !== "string") return badRequest("ticker is required");
  try {
    const row = await addToWatchlist(auth.session.userId, body.ticker.toUpperCase(), cleanNote(body.note));
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof TypeError) return badRequest(err.message);
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorize("analyst");
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body?.cik || typeof body.cik !== "string") return badRequest("cik is required");
  try {
    return NextResponse.json(await updateWatchlistNote(auth.session.userId, body.cik, cleanNote(body.note)));
  } catch (err) {
    if (err instanceof TypeError) return badRequest(err.message);
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorize("analyst");
  if ("response" in auth) return auth.response;
  const cik = new URL(req.url).searchParams.get("cik");
  if (!cik) return badRequest("cik is required");
  try {
    return NextResponse.json(await removeFromWatchlist(auth.session.userId, cik));
  } catch (err) {
    return errorResponse(err);
  }
}
