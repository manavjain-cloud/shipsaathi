import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { Assessment, Booking } from "@/lib/domain/types";

let client: NeonQueryFunction<false, false> | null = null;

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function sql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) throw new DbUnavailableError();
  client ??= neon(process.env.DATABASE_URL);
  return client;
}

export class DbUnavailableError extends Error {
  constructor() {
    super("Database is not configured (DATABASE_URL missing).");
  }
}

export interface BookingRow {
  id: string;
  booking_ref: string;
  source: "chat" | "excel" | "manual";
  upload_id: string | null;
  seller_name: string | null;
  origin: string | null;
  destination: string | null;
  data: Booking;
  status: Assessment["status"];
  red_count: number;
  amber_count: number;
  review_count: number;
  dispatch_ready: boolean;
  recommended_carrier: string | null;
  recommended_cost: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

function summaryColumns(b: Booking, a: Assessment) {
  const rec = a.carrier.recommended?.evaluation;
  return {
    booking_ref: b.bookingId ?? "(no ID)",
    seller_name: b.sellerName,
    origin: [b.originCity, b.originCountry].filter(Boolean).join(", ") || null,
    destination: [b.destinationCity, b.destinationCountry].filter(Boolean).join(", ") || null,
    status: a.status,
    red_count: a.counts.red + a.counts.dataErrors,
    amber_count: a.counts.amber,
    review_count: a.counts.review,
    dispatch_ready: a.dispatchReady,
    recommended_carrier: rec ? `${rec.option.carrier} · ${rec.option.service}` : null,
    recommended_cost: rec?.cost ?? null,
  };
}

function itemStatements(id: string, b: Booking) {
  const db = sql();
  return [
    db`DELETE FROM booking_items WHERE booking_id = ${id}`,
    ...b.items.map(
      (it) => db`INSERT INTO booking_items (booking_id, line_no, sku, description, hs_code, quantity, unit_price, units_per_carton, cartons, unit_weight_kg, country_of_origin)
        VALUES (${id}, ${it.lineNo}, ${it.sku}, ${it.description}, ${it.hsCode}, ${it.quantity}, ${it.unitPrice}, ${it.unitsPerCarton}, ${it.cartons}, ${it.unitWeightKg}, ${it.countryOfOrigin})`,
    ),
  ];
}

function resultStatements(id: string, a: Assessment) {
  const db = sql();
  const runId = randomUUID();
  type ResultRow = { rule: string; sev: string; status: string; line: number | null; field: string | null; actual: string | null; expected: string | null; explanation: string; fix: string | null };
  const rows: ResultRow[] = a.checks.flatMap((c): ResultRow[] =>
    c.findings.length
      ? c.findings.map((f) => ({ rule: c.ruleId, sev: c.severity, status: f.status, line: f.lineNo ?? null, field: f.field, actual: f.actual, expected: f.expected, explanation: f.explanation, fix: f.fix }))
      : [{ rule: c.ruleId, sev: c.severity, status: "pass", line: null, field: null, actual: null, expected: null, explanation: c.summary, fix: null }],
  );
  return rows.map(
    (r) => db`INSERT INTO validation_results (booking_id, run_id, rule_id, severity, status, line_no, field, actual, expected, explanation, fix)
      VALUES (${id}, ${runId}, ${r.rule}, ${r.sev}, ${r.status}, ${r.line}, ${r.field}, ${r.actual}, ${r.expected}, ${r.explanation}, ${r.fix})`,
  );
}

export async function insertBooking(b: Booking, a: Assessment, source: BookingRow["source"], uploadId: string | null = null, event = "created"): Promise<string> {
  const db = sql();
  const id = randomUUID();
  const s = summaryColumns(b, a);
  await db.transaction([
    db`INSERT INTO bookings (id, booking_ref, source, upload_id, seller_name, origin, destination, data, status, red_count, amber_count, review_count, dispatch_ready, recommended_carrier, recommended_cost)
       VALUES (${id}, ${s.booking_ref}, ${source}, ${uploadId}, ${s.seller_name}, ${s.origin}, ${s.destination}, ${JSON.stringify(b)}::jsonb, ${s.status}, ${s.red_count}, ${s.amber_count}, ${s.review_count}, ${s.dispatch_ready}, ${s.recommended_carrier}, ${s.recommended_cost})`,
    ...itemStatements(id, b),
    ...resultStatements(id, a),
    db`INSERT INTO booking_events (booking_id, type, detail) VALUES (${id}, ${event}, ${JSON.stringify({ status: a.status, red: a.counts.red, amber: a.counts.amber, review: a.counts.review, source })}::jsonb)`,
  ]);
  return id;
}

export async function updateBooking(id: string, b: Booking, a: Assessment, event: string, detail: Record<string, unknown> = {}): Promise<void> {
  const db = sql();
  const s = summaryColumns(b, a);
  await db.transaction([
    db`UPDATE bookings SET booking_ref = ${s.booking_ref}, seller_name = ${s.seller_name}, origin = ${s.origin}, destination = ${s.destination},
       data = ${JSON.stringify(b)}::jsonb, status = ${s.status}, red_count = ${s.red_count}, amber_count = ${s.amber_count}, review_count = ${s.review_count},
       dispatch_ready = ${s.dispatch_ready}, recommended_carrier = ${s.recommended_carrier}, recommended_cost = ${s.recommended_cost},
       confirmed_at = CASE WHEN ${s.dispatch_ready} THEN confirmed_at ELSE NULL END, updated_at = now()
       WHERE id = ${id}`,
    ...itemStatements(id, b),
    ...resultStatements(id, a),
    db`INSERT INTO booking_events (booking_id, type, detail) VALUES (${id}, ${event}, ${JSON.stringify({ status: a.status, red: a.counts.red, amber: a.counts.amber, review: a.counts.review, ...detail })}::jsonb)`,
  ]);
}

export async function markConfirmed(id: string, detail: Record<string, unknown>): Promise<void> {
  const db = sql();
  await db.transaction([
    db`UPDATE bookings SET confirmed_at = now(), updated_at = now() WHERE id = ${id}`,
    db`INSERT INTO booking_events (booking_id, type, detail) VALUES (${id}, 'confirmed', ${JSON.stringify(detail)}::jsonb)`,
  ]);
}

export async function addEvent(id: string, type: string, detail: Record<string, unknown>): Promise<void> {
  const db = sql();
  await db`INSERT INTO booking_events (booking_id, type, detail) VALUES (${id}, ${type}, ${JSON.stringify(detail)}::jsonb)`;
}

export async function getBooking(id: string): Promise<BookingRow | null> {
  if (!isUuid(id)) return null;
  const rows = (await sql()`SELECT * FROM bookings WHERE id = ${id}`) as BookingRow[];
  return rows[0] ?? null;
}

export async function getEvents(id: string) {
  if (!isUuid(id)) return [];
  return (await sql()`SELECT id, type, detail, created_at FROM booking_events WHERE booking_id = ${id} ORDER BY created_at DESC LIMIT 100`) as {
    id: string;
    type: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
}

export async function listBookings(opts: { limit?: number; uploadId?: string } = {}): Promise<Omit<BookingRow, "data">[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const db = sql();
  if (opts.uploadId && isUuid(opts.uploadId)) {
    return (await db`SELECT id, booking_ref, source, upload_id, seller_name, origin, destination, status, red_count, amber_count, review_count, dispatch_ready, recommended_carrier, recommended_cost, confirmed_at, created_at, updated_at
      FROM bookings WHERE upload_id = ${opts.uploadId} ORDER BY created_at ASC LIMIT ${limit}`) as Omit<BookingRow, "data">[];
  }
  return (await db`SELECT id, booking_ref, source, upload_id, seller_name, origin, destination, status, red_count, amber_count, review_count, dispatch_ready, recommended_carrier, recommended_cost, confirmed_at, created_at, updated_at
    FROM bookings ORDER BY updated_at DESC LIMIT ${limit}`) as Omit<BookingRow, "data">[];
}

export async function recentEvents(limit = 50) {
  return (await sql()`SELECT e.id, e.type, e.detail, e.created_at, b.id AS booking_id, b.booking_ref, b.seller_name
    FROM booking_events e JOIN bookings b ON b.id = e.booking_id ORDER BY e.created_at DESC LIMIT ${limit}`) as {
    id: string;
    type: string;
    detail: Record<string, unknown>;
    created_at: string;
    booking_id: string;
    booking_ref: string;
    seller_name: string | null;
  }[];
}

export async function insertUpload(filename: string, bookingCount: number, itemCount: number, rateCardSource: string, issues: unknown[]): Promise<string> {
  const id = randomUUID();
  await sql()`INSERT INTO uploads (id, filename, booking_count, item_count, rate_card_source, issues) VALUES (${id}, ${filename}, ${bookingCount}, ${itemCount}, ${rateCardSource}, ${JSON.stringify(issues)}::jsonb)`;
  return id;
}

export async function getStats() {
  const rows = (await sql()`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'blocked')::int AS blocked,
      count(*) FILTER (WHERE status = 'review')::int AS review,
      count(*) FILTER (WHERE status = 'warnings')::int AS warnings,
      count(*) FILTER (WHERE status = 'ready')::int AS ready,
      count(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed,
      count(*) FILTER (WHERE source = 'chat')::int AS chat,
      count(*) FILTER (WHERE source = 'excel')::int AS excel,
      coalesce(sum(red_count), 0)::int AS red_issues,
      coalesce(sum(amber_count), 0)::int AS amber_issues
    FROM bookings`) as Record<string, number>[];
  const uploads = (await sql()`SELECT count(*)::int AS n FROM uploads`) as { n: number }[];
  // Bookings currently failing each rule (latest validation run per booking only).
  const ruleRows = (await sql()`WITH latest AS (
      SELECT DISTINCT ON (booking_id) booking_id, run_id FROM validation_results ORDER BY booking_id, created_at DESC
    )
    SELECT v.rule_id, count(DISTINCT v.booking_id)::int AS n
    FROM validation_results v JOIN latest l ON l.run_id = v.run_id
    WHERE v.status <> 'pass' GROUP BY v.rule_id`) as { rule_id: string; n: number }[];
  const ruleCounts = Object.fromEntries(ruleRows.map((r) => [r.rule_id, r.n]));
  return { ...rows[0], uploads: uploads[0]?.n ?? 0, ruleCounts };
}
