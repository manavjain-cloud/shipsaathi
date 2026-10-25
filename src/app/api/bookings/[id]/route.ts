import { NextResponse, connection } from "next/server";
import { todayISO } from "@/lib/domain/dates";
import { assess } from "@/lib/domain/validation";
import { getBooking, getEvents, updateBooking } from "@/lib/server/db";
import { withAiHazardFlags } from "@/lib/server/hazard-ai";
import { BadJson, jsonError, rateLimit, readJson, RequestTooLarge, serverError, tooMany } from "@/lib/server/http";
import { parseBooking } from "@/lib/server/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { id } = await ctx.params;
  try {
    const row = await getBooking(id);
    if (!row) return jsonError("Booking not found.", 404);
    const events = await getEvents(id);
    // Re-assess on read so R-10 uses today's date.
    const assessment = assess(row.data, todayISO());
    const { data, ...meta } = row;
    return NextResponse.json({ meta, booking: data, assessment, events });
  } catch (e) {
    return serverError(e, "loading the booking");
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  if (!rateLimit(req, "update", 60, 60_000)) return tooMany();
  const { id } = await ctx.params;
  let body: { booking?: unknown; event?: string; detail?: Record<string, unknown> };
  try {
    body = (await readJson(req, 600_000)) as typeof body;
  } catch (e) {
    if (e instanceof RequestTooLarge) return jsonError("Request too large.", 413);
    if (e instanceof BadJson) return jsonError("Invalid JSON.");
    throw e;
  }
  const p = parseBooking(body?.booking);
  if (!p.ok) return jsonError(p.error);
  const allowedEvents = ["edited", "carrier-selected", "hazard-acknowledged", "rechecked"];
  const event = allowedEvents.includes(body.event ?? "") ? body.event! : "edited";
  try {
    const row = await getBooking(id);
    if (!row) return jsonError("Booking not found.", 404);
    // Keep the uploaded rate card (if any) from the stored record; clients can't swap rates.
    const incoming = { ...p.booking, customRateCard: row.data.customRateCard };
    const { booking } = await withAiHazardFlags(incoming);
    const assessment = assess(booking, todayISO());
    const detail = typeof body.detail === "object" && body.detail ? Object.fromEntries(Object.entries(body.detail).slice(0, 10).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 300)])) : {};
    await updateBooking(id, booking, assessment, event, detail);
    return NextResponse.json({ id, booking, assessment });
  } catch (e) {
    return serverError(e, "updating the booking");
  }
}
