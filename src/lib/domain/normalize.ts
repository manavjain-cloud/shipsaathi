import { DESTINATION_TYPES, SELLER_PRIORITIES, type DestinationType, type SellerPriority } from "./types";

/** Allowed values from the template's "Allowed values" sheet. */
export const ALLOWED = {
  originCountries: ["United Kingdom"],
  originCities: ["London", "Manchester", "Birmingham", "Leeds"],
  destinationCountries: ["Germany", "France", "Netherlands"],
  destinationCities: {
    Germany: ["Berlin", "Frankfurt", "Hamburg"],
    France: ["Paris", "Lyon"],
    Netherlands: ["Amsterdam", "Rotterdam"],
  } as Record<string, string[]>,
  currencies: ["GBP"],
  itemOrigins: ["United Kingdom", "China", "India", "Vietnam", "Turkey", "Germany"],
};

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  gb: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  "united kingdom": "United Kingdom",
  de: "Germany",
  deutschland: "Germany",
  germany: "Germany",
  fr: "France",
  france: "France",
  nl: "Netherlands",
  holland: "Netherlands",
  "the netherlands": "Netherlands",
  netherlands: "Netherlands",
  cn: "China",
  china: "China",
  prc: "China",
  in: "India",
  india: "India",
  bharat: "India",
  vn: "Vietnam",
  "viet nam": "Vietnam",
  vietnam: "Vietnam",
  tr: "Turkey",
  turkey: "Turkey",
  "türkiye": "Turkey",
  turkiye: "Turkey",
};

export type Parsed<T> = { value: T | null; error?: string; raw?: string };

export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
    return cleanText((v as { text: unknown }).text);
  }
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Numbers: accepts 1,080 / £5,400 / " 620 kg ". Rejects anything else with a reason. */
export function parseNumber(v: unknown, opts: { integer?: boolean; min?: number; allowZero?: boolean } = {}): Parsed<number> {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return { value: null };
  let n: number;
  let raw = String(v);
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    return parseNumber((v as { result: unknown }).result, opts);
  } else {
    raw = String(v).trim();
    const stripped = raw.replace(/^(gbp|£)\s*/i, "").replace(/\s*(kg|kgs|gbp|units?|pcs)$/i, "").replace(/,/g, "").trim();
    if (!/^-?\d+(\.\d+)?$/.test(stripped)) return { value: null, error: `"${raw}" is not a number`, raw };
    n = Number(stripped);
  }
  if (!Number.isFinite(n)) return { value: null, error: `"${raw}" is not a number`, raw };
  if (n < 0) return { value: null, error: `${raw} is negative`, raw };
  if (n === 0 && opts.allowZero === false) return { value: null, error: `must be greater than 0 (got 0)`, raw };
  if (opts.integer && !Number.isInteger(n)) return { value: null, error: `${raw} must be a whole number`, raw };
  return { value: n };
}

export function parseYesNo(v: unknown): Parsed<boolean> {
  if (typeof v === "boolean") return { value: v };
  const s = cleanText(v);
  if (!s) return { value: null };
  const l = s.toLowerCase();
  if (["yes", "y", "true", "1", "booked"].includes(l)) return { value: true };
  if (["no", "n", "false", "0", "not booked"].includes(l)) return { value: false };
  return { value: null, error: `"${s}" is not Yes or No`, raw: s };
}

export function parseDestinationType(v: unknown): Parsed<DestinationType> {
  const s = cleanText(v);
  if (!s) return { value: null };
  const l = s.toLowerCase();
  const exact = DESTINATION_TYPES.find((t) => t.toLowerCase() === l);
  if (exact) return { value: exact };
  if (/warehouse|fulfil|distribution|dc\b|fc\b/.test(l)) return { value: "Warehouse" };
  if (/business|shop|office|store|retail/.test(l)) return { value: "Business address" };
  return { value: null, error: `"${s}" is not Warehouse or Business address`, raw: s };
}

export function parsePriority(v: unknown): Parsed<SellerPriority> {
  const s = cleanText(v);
  if (!s) return { value: null };
  const l = s.toLowerCase();
  const exact = SELLER_PRIORITIES.find((p) => p.toLowerCase() === l);
  if (exact) return { value: exact };
  if (/cheap|lowest cost|budget/.test(l)) return { value: "Cheapest" };
  if (/fast|quick|express|urgent/.test(l)) return { value: "Fastest" };
  if (/reliab|on.?time/.test(l)) return { value: "Most reliable" };
  if (/balanc|trade.?off|no (strong )?preference/.test(l)) return { value: "Balanced" };
  return { value: null, error: `"${s}" is not one of Cheapest / Fastest / Most reliable / Balanced`, raw: s };
}

export function normalizeCountry(v: unknown): string | null {
  const s = cleanText(v);
  if (!s) return null;
  return COUNTRY_ALIASES[s.toLowerCase()] ?? s;
}

export function normalizeCity(v: unknown): string | null {
  const s = cleanText(v);
  if (!s) return null;
  const all = [...ALLOWED.originCities, ...Object.values(ALLOWED.destinationCities).flat()];
  return all.find((c) => c.toLowerCase() === s.toLowerCase()) ?? s;
}

export function countryForDestinationCity(city: string | null): string | null {
  if (!city) return null;
  for (const [country, cities] of Object.entries(ALLOWED.destinationCities)) {
    if (cities.some((c) => c.toLowerCase() === city.toLowerCase())) return country;
  }
  return null;
}

export function isOriginCity(city: string | null): boolean {
  return !!city && ALLOWED.originCities.some((c) => c.toLowerCase() === city.toLowerCase());
}

/** HS codes stay text. 691200 (number) → "691200"; "6912.00" → "6912.00". */
export function parseHsCode(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    return parseHsCode((v as { result: unknown }).result);
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  return cleanText(v);
}

export function hsDigits(hs: string | null): string {
  return (hs ?? "").replace(/[\s.\-]/g, "");
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatGBP(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

export function formatNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-GB", { maximumFractionDigits: digits });
}
