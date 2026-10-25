import { NextResponse } from "next/server";
import { todayISO } from "@/lib/domain/dates";
import { assess } from "@/lib/domain/validation";
import { getBooking, markConfirmed } from "@/lib/server/db";
import { jsonError, rateLimit, serverError, tooMany } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Marks a booking as a seller-confirmed PROPOSAL. Refused while any Red error, data error or unresolved review remains. */
export async function POST(req: Request, ctx: Ctx) {
  if (!rateLimit(req, "confirm", 20, 60_000)) return tooMany();
  const { id } = await ctx.params;
  let ackAmber = false;
  try {
    const body = (await req.json()) as { acknowledgeWarnings?: boolean };
    ackAmber = body?.acknowledgeWarnings === true;
  } catch {
    /* empty body is fine */
  }
  try {
    const row = await getBooking(id);
    if (!row) return jsonError("Booking not found.", 404);
    const a = assess(row.data, todayISO());
    if (!a.dispatchReady) {
      return jsonError(
        a.status === "review"
          ? "Some items need a human check for prohibited goods before this can be confirmed."
          : `This booking has ${a.counts.red} Red error(s) and ${a.counts.dataErrors} data error(s). Fix them before confirming.`,
        409,
        { assessment: a },
      );
    }
    if (a.counts.amber > 0 && !ackAmber) return jsonError("Please confirm you've reviewed the Amber warnings.", 409, { assessment: a });
    const rec = a.carrier.chosen ?? a.carrier.recommended?.evaluation ?? null;
    await markConfirmed(id, {
      carrier: rec ? `${rec.option.carrier} · ${rec.option.service}` : null,
      cost: rec?.cost ?? null,
      amberAcknowledged: a.counts.amber,
      note: "Proposed booking confirmed by seller. No carrier booking was made.",
    });
    return NextResponse.json({ ok: true, assessment: a });
  } catch (e) {
    return serverError(e, "confirming the booking");
  }
}
