import type { Parsed } from "./normalize";

/** Shipments are collected in the UK, so "today" for R-10 is the calendar date in Europe/London. */
export const RULE_TIMEZONE = "Europe/London";

export function todayISO(now: Date = new Date(), timeZone = RULE_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Accepts the template format DD-MM-YYYY (also / or . separators), ISO YYYY-MM-DD,
 * real Excel date cells (JS Date at UTC midnight) and Excel serial numbers.
 */
export function parseDate(v: unknown): Parsed<string> {
  if (v === null || v === undefined || v === "") return { value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: null, error: "invalid date" };
    // Excel stores dates without a zone; exceljs gives UTC midnight. Round to the nearest day to absorb float noise.
    const t = new Date(Math.round(v.getTime() / 86400000) * 86400000);
    return { value: iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()) };
  }
  if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    return parseDate((v as { result: unknown }).result);
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400000);
      return parseDate(new Date(ms));
    }
    return { value: null, error: `${v} is not a date`, raw: String(v) };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const out = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    return out ? { value: out } : { value: null, error: `"${s}" is not a real calendar date (expected DD-MM-YYYY)`, raw: s };
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const out = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    return out ? { value: out } : { value: null, error: `"${s}" is not a real calendar date`, raw: s };
  }
  return { value: null, error: `"${s}" is not in DD-MM-YYYY format`, raw: s };
}

export function displayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : isoDate;
}
