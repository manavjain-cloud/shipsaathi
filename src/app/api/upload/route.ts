import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, parseWorkbook } from "@/lib/domain/excel";
import { todayISO } from "@/lib/domain/dates";
import { assess, DEFAULT_RATE_CARD } from "@/lib/domain/validation";
import { dbConfigured, insertBooking, insertUpload } from "@/lib/server/db";
import { withAiHazardFlagsMany } from "@/lib/server/hazard-ai";
import { jsonError, rateLimit, serverError, tooMany } from "@/lib/server/http";

export const maxDuration = 60;

function sameRateCard(a: typeof DEFAULT_RATE_CARD, b: typeof DEFAULT_RATE_CARD) {
  if (a.length !== b.length) return false;
  const key = (o: (typeof a)[number]) => [o.id, o.pricePerPallet, o.transitDays, o.onTimeRate, o.maxWeightPerPalletKg].join("|");
  const sa = new Set(a.map(key));
  return b.every((o) => sa.has(key(o)));
}

export async function POST(req: Request) {
  if (!rateLimit(req, "upload", 10, 60_000)) return tooMany();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Upload an .xlsx file using the form.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("No file received.");
  if (!/\.xlsx$/i.test(file.name)) return jsonError("Only .xlsx files are supported. In Excel, use File → Save As → Excel Workbook (.xlsx).");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError("File is larger than 5 MB.", 413);
  if (file.size === 0) return jsonError("The file is empty.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return jsonError("This file isn't a valid .xlsx workbook (it may be an old .xls or a renamed CSV).");

  const parsed = await parseWorkbook(bytes);
  if (!parsed.ok) return NextResponse.json({ ok: false, issues: parsed.issues, stats: parsed.stats }, { status: 422 });

  // Keep an uploaded carrier sheet only when it differs from the supplied template.
  const custom = parsed.rateCard && !sameRateCard(parsed.rateCard, DEFAULT_RATE_CARD) ? parsed.rateCard : undefined;
  if (custom) parsed.issues.push({ severity: "warning", message: "The workbook's Carrier options sheet differs from the supplied template. Its rates are used for these bookings." });
  else if (parsed.rateCard) parsed.issues.push({ severity: "info", message: "Carrier options sheet matches the supplied rate card." });

  const ai = await withAiHazardFlagsMany(parsed.bookings.map((b) => ({ ...b, customRateCard: custom })));
  const today = todayISO();
  const results = ai.bookings.map((booking) => ({ booking, assessment: assess(booking, today) }));

  let uploadId: string | null = null;
  const ids: (string | null)[] = results.map(() => null);
  let persisted = false;
  if (dbConfigured()) {
    try {
      uploadId = await insertUpload(file.name.slice(0, 200), results.length, parsed.stats.itemRows, custom ? "uploaded" : "default", parsed.issues);
      for (let i = 0; i < results.length; i++) {
        ids[i] = await insertBooking(results[i].booking, results[i].assessment, "excel", uploadId, "uploaded");
      }
      persisted = true;
    } catch (e) {
      serverError(e, "saving the upload");
      parsed.issues.push({ severity: "warning", message: "Results could not be saved to the database, so they are shown here only." });
    }
  } else {
    parsed.issues.push({ severity: "warning", message: "Database not configured — results are not saved." });
  }

  return NextResponse.json({
    ok: true,
    uploadId,
    persisted,
    filename: file.name,
    aiChecked: ai.aiChecked,
    issues: parsed.issues,
    stats: parsed.stats,
    rateCardSource: custom ? "uploaded" : "default",
    results: results.map((r, i) => ({ id: ids[i], booking: r.booking, assessment: r.assessment })),
  });
}
