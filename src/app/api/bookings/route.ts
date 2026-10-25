import { NextResponse, connection } from "next/server";
import { todayISO } from "@/lib/domain/dates";
import { assess } from "@/lib/domain/validation";
import { insertBooking, listBookings } from "@/lib/server/db";
import { withAiHazardFlags } from "@/lib/server/hazard-ai";
import { BadJson, jsonError, rateLimit, readJson, RequestTooLarge, serverError, tooMany } from "@/lib/server/http";
import { parseBooking } from "@/lib/server/schemas";

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  try {
    const rows = await listBookings({ uploadId: url.searchParams.get("upload") ?? undefined, limit: Number(url.searchParams.get("limit")) || 200 });
    return NextResponse.json({ bookings: rows });
  } catch (e) {
    return serverError(e, "loading bookings");
  }
}

export async function POST(req: Request) {
  if (!rateLimit(req, "save", 30, 60_000)) return tooMany();
  let body: { booking?: unknown; source?: string };
  try {
    body = (await readJson(req, 600_000)) as typeof body;
  } catch (e) {
    if (e instanceof RequestTooLarge) return jsonError("Request too large.", 413);
    if (e instanceof BadJson) return jsonError("Invalid JSON.");
    throw e;
  }
  const p = parseBooking(body?.booking);
  if (!p.ok) return jsonError(p.error);
  const source = body.source === "chat" ? "chat" : "manual";
  try {
    // Server re-runs AI screening and validation; the client's assessment is never trusted.
    const { booking } = await withAiHazardFlags(p.booking);
    const assessment = assess(booking, todayISO());
    const id = await insertBooking(booking, assessment, source, null, "created");
    return NextResponse.json({ id, booking, assessment });
  } catch (e) {
    return serverError(e, "saving the booking");
  }
}
