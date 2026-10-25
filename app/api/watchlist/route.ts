import { NextResponse } from "next/server";
import { badRequest, errorResponse } from "@/lib/api";
import {
  addToWatchlist,
  demoUserId,
  listWatchlist,
  removeFromWatchlist,
  updateWatchlistNote,
} from "@/lib/watchlist";

// /api/watchlist
//   GET                         -> the user's watchlist
//   POST   {ticker, note?}      -> add   (transaction: INSERT watchlists + INSERT activity_log)
//   PATCH  {cik, note}          -> edit  (transaction: UPDATE watchlists + INSERT activity_log)
//   DELETE ?cik=...             -> remove (transaction: DELETE watchlists + INSERT activity_log)
// TODO(Phase 4): replace demoUserId() with the logged-in user and check
// profiles.role = 'analyst' before any write.
export const dynamic = "force-dynamic";

function cleanNote(note: unknown): string | null {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") throw new TypeError("note must be a string");
  return note.trim() || null; // length is validated by the DB (watchlists_note_len)
}

export async function GET() {
  try {
    return NextResponse.json(await listWatchlist(demoUserId()));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.ticker || typeof body.ticker !== "string") return badRequest("ticker is required");
  try {
    const row = await addToWatchlist(demoUserId(), body.ticker.toUpperCase(), cleanNote(body.note));
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof TypeError) return badRequest(err.message);
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.cik || typeof body.cik !== "string") return badRequest("cik is required");
  try {
    return NextResponse.json(await updateWatchlistNote(demoUserId(), body.cik, cleanNote(body.note)));
  } catch (err) {
    if (err instanceof TypeError) return badRequest(err.message);
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const cik = new URL(req.url).searchParams.get("cik");
  if (!cik) return badRequest("cik is required");
  try {
    return NextResponse.json(await removeFromWatchlist(demoUserId(), cik));
  } catch (err) {
    return errorResponse(err);
  }
}
