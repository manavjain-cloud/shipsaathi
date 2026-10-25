import { NextResponse } from "next/server";
import { todayISO } from "@/lib/domain/dates";
import { assess } from "@/lib/domain/validation";
import { addEvent, getBooking } from "@/lib/server/db";
import { renderEmail, sendEmail } from "@/lib/server/email";
import { jsonError, rateLimit, serverError, tooMany } from "@/lib/server/http";
import { EmailRequestSchema } from "@/lib/server/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Sends only when the seller explicitly asks (button + confirmation in the UI). Never automatic. */
export async function POST(req: Request, ctx: Ctx) {
  if (!rateLimit(req, "email", 5, 10 * 60_000)) return tooMany();
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON.");
  }
  const p = EmailRequestSchema.safeParse(body);
  if (!p.success) return jsonError("Enter a valid email address.");
  try {
    const row = await getBooking(id);
    if (!row) return jsonError("Booking not found.", 404);
    const a = assess(row.data, todayISO());
    const origin = new URL(req.url).origin;
    const { subject, html, text } = renderEmail(row.data, a, p.data.kind, `${origin}/reports/${id}`);
    const result = await sendEmail(p.data.to, subject, html, text);
    const domain = p.data.to.split("@")[1];
    await addEvent(id, result.ok ? "email-sent" : "email-failed", { kind: p.data.kind, toDomain: domain, ...(result.ok ? { resendId: result.id } : { error: result.error.slice(0, 200) }) }).catch(() => {});
    if (!result.ok) return jsonError(result.error, 502);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    return serverError(e, "sending the email");
  }
}
