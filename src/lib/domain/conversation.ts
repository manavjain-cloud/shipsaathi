/**
 * Deterministic side of the chat: Gemini only proposes field changes as text values;
 * this module parses them with the same parsers as the Excel path, applies them,
 * works out what's still missing and phrases the next questions.
 */
import { parseDate, displayDate } from "./dates";
import {
  cleanText,
  countryForDestinationCity,
  formatGBP,
  formatNum,
  isOriginCity,
  normalizeCity,
  normalizeCountry,
  parseDestinationType,
  parseHsCode,
  parseNumber,
  parsePriority,
  parseYesNo,
  round2,
  type Parsed,
} from "./normalize";
import type { Booking, BookingField, Item, ItemField } from "./types";

export const BOOKING_FIELD_LABELS: Record<BookingField, string> = {
  bookingId: "Booking ID",
  sellerName: "Seller name",
  originCity: "Origin city",
  originCountry: "Origin country",
  destinationCity: "Destination city",
  destinationCountry: "Destination country",
  destinationType: "Destination type",
  readyToShipDate: "Ready to ship date",
  sellerPriority: "Seller priority",
  pallets: "Pallets",
  cartons: "Cartons",
  totalDeclaredValue: "Total declared value",
  currency: "Currency",
  totalGrossWeightKg: "Total gross weight (kg)",
  deliveryAppointmentBooked: "Delivery appointment booked",
};

export const ITEM_FIELD_LABELS: Record<ItemField, string> = {
  sku: "SKU",
  description: "Description",
  hsCode: "HS code",
  quantity: "Quantity (units)",
  unitPrice: "Unit price",
  unitsPerCarton: "Units per carton",
  cartons: "Cartons",
  unitWeightKg: "Unit weight (kg)",
  countryOfOrigin: "Country of origin",
};

export const BOOKING_FIELDS = Object.keys(BOOKING_FIELD_LABELS) as BookingField[];
export const ITEM_FIELDS = Object.keys(ITEM_FIELD_LABELS) as ItemField[];
const NUMERIC_BOOKING: BookingField[] = ["pallets", "cartons", "totalDeclaredValue", "totalGrossWeightKg"];
const NUMERIC_ITEM: ItemField[] = ["quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeightKg"];

export function emptyBooking(id?: string): Booking {
  return {
    bookingId: id ?? null,
    sellerName: null,
    originCity: null,
    originCountry: null,
    destinationCity: null,
    destinationCountry: null,
    destinationType: null,
    readyToShipDate: null,
    sellerPriority: null,
    pallets: null,
    cartons: null,
    totalDeclaredValue: null,
    currency: "GBP",
    totalGrossWeightKg: null,
    deliveryAppointmentBooked: null,
    items: [],
  };
}

export function emptyItem(lineNo: number): Item {
  return { lineNo, sku: null, description: null, hsCode: null, quantity: null, unitPrice: null, unitsPerCarton: null, cartons: null, unitWeightKg: null, countryOfOrigin: null };
}

export function newChatBookingId(now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CH-${d}-${r}`;
}

// ---------- parsing a single field value ----------

export function parseBookingField(field: BookingField, raw: string | number | boolean | null): Parsed<unknown> {
  if (raw === null || raw === "") return { value: null };
  switch (field) {
    case "pallets":
      return parseNumber(raw, { integer: true, allowZero: false });
    case "cartons":
      return parseNumber(raw, { integer: true });
    case "totalDeclaredValue":
    case "totalGrossWeightKg":
      return parseNumber(raw);
    case "destinationType":
      return parseDestinationType(raw);
    case "sellerPriority":
      return parsePriority(raw);
    case "deliveryAppointmentBooked":
      return parseYesNo(raw);
    case "readyToShipDate":
      return parseDate(raw);
    case "originCountry":
    case "destinationCountry":
      return { value: normalizeCountry(raw) };
    case "originCity":
    case "destinationCity":
      return { value: normalizeCity(raw) };
    case "currency":
      return { value: cleanText(raw)?.toUpperCase() ?? null };
    default:
      return { value: cleanText(raw) };
  }
}

export function parseItemField(field: ItemField, raw: string | number | boolean | null): Parsed<unknown> {
  if (raw === null || raw === "") return { value: null };
  switch (field) {
    case "quantity":
    case "cartons":
      return parseNumber(raw, { integer: true });
    case "unitsPerCarton":
      return parseNumber(raw, { integer: true, allowZero: false });
    case "unitPrice":
    case "unitWeightKg":
      return parseNumber(raw);
    case "hsCode":
      return { value: parseHsCode(raw) };
    case "countryOfOrigin":
      return { value: normalizeCountry(raw) };
    default:
      return { value: cleanText(raw) };
  }
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "blank";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return displayDate(v);
  return String(v);
}

// ---------- operations proposed by the model ----------

export interface FieldChange {
  field: string;
  value: string | null;
  mode?: "set" | "add" | "clear";
}

export interface ItemChange {
  action: "add" | "update" | "remove";
  itemRef?: number | null;
  fields?: FieldChange[];
}

export interface ChatOperations {
  bookingChanges?: FieldChange[];
  itemChanges?: ItemChange[];
  acceptSuggestions?: string[];
  declined?: string[];
}

export interface ApplyResult {
  booking: Booking;
  changes: string[];
  problems: string[];
  declined: string[];
}

function clearSourceIssue(b: Booking, label: string, lineNo?: number) {
  if (b.sourceIssues) b.sourceIssues = b.sourceIssues.filter((i) => !(i.field === label && i.lineNo === lineNo));
}

export function setBookingValue(b: Booking, field: BookingField, change: FieldChange, log: ApplyResult): void {
  const label = BOOKING_FIELD_LABELS[field];
  const before = b[field];
  if (change.mode === "clear") {
    (b as unknown as Record<string, unknown>)[field] = field === "currency" ? b.currency : null;
    if (before !== null) log.changes.push(`${label}: ${fmt(before)} → blank`);
    return;
  }
  if (change.mode === "add" && NUMERIC_BOOKING.includes(field)) {
    const delta = parseNumber(String(change.value ?? "").replace(/^\+/, "").replace(/^-/, ""));
    const negative = String(change.value ?? "").trim().startsWith("-");
    if (delta.value === null) {
      log.problems.push(`I couldn't read "${change.value}" as a change to ${label.toLowerCase()}.`);
      return;
    }
    if (before === null) {
      log.problems.push(`${label} isn't set yet, so I can't add to it. What's the total?`);
      return;
    }
    const next = round2((before as number) + (negative ? -delta.value : delta.value));
    const check = parseBookingField(field, next);
    if (check.error) {
      log.problems.push(`${label}: ${check.error}.`);
      return;
    }
    (b as unknown as Record<string, unknown>)[field] = check.value;
    clearSourceIssue(b, label);
    log.changes.push(`${label}: ${fmt(before)} → ${fmt(check.value)}`);
    return;
  }
  const parsed = parseBookingField(field, change.value);
  if (parsed.error) {
    log.problems.push(`${label}: ${parsed.error}.`);
    return;
  }
  if (parsed.value === null) return;
  (b as unknown as Record<string, unknown>)[field] = parsed.value;
  clearSourceIssue(b, label);
  if (fmt(before) !== fmt(parsed.value)) log.changes.push(`${label}: ${before === null ? "" : `${fmt(before)} → `}${fmt(parsed.value)}`);
}

export function setItemValue(b: Booking, it: Item, field: ItemField, change: FieldChange, log: ApplyResult): void {
  const label = ITEM_FIELD_LABELS[field];
  const before = it[field];
  const name = `Item ${it.lineNo}${it.sku ? ` (${it.sku})` : ""}`;
  if (change.mode === "clear") {
    (it as unknown as Record<string, unknown>)[field] = null;
    if (before !== null) log.changes.push(`${name} ${label.toLowerCase()}: ${fmt(before)} → blank`);
    return;
  }
  if (change.mode === "add" && NUMERIC_ITEM.includes(field)) {
    const raw = String(change.value ?? "").trim();
    const negative = raw.startsWith("-");
    const delta = parseNumber(raw.replace(/^[+-]/, ""));
    if (delta.value === null || before === null) {
      log.problems.push(`I couldn't apply "${change.value}" to ${name} ${label.toLowerCase()}.`);
      return;
    }
    const next = round2((before as number) + (negative ? -delta.value : delta.value));
    const check = parseItemField(field, next);
    if (check.error) {
      log.problems.push(`${name} ${label.toLowerCase()}: ${check.error}.`);
      return;
    }
    (it as unknown as Record<string, unknown>)[field] = check.value;
    clearSourceIssue(b, label, it.lineNo);
    log.changes.push(`${name} ${label.toLowerCase()}: ${fmt(before)} → ${fmt(check.value)}`);
    return;
  }
  const parsed = parseItemField(field, change.value);
  if (parsed.error) {
    log.problems.push(`${name} ${label.toLowerCase()}: ${parsed.error}.`);
    return;
  }
  if (parsed.value === null) return;
  (it as unknown as Record<string, unknown>)[field] = parsed.value;
  clearSourceIssue(b, label, it.lineNo);
  if (fmt(before) !== fmt(parsed.value)) log.changes.push(`${name} ${label.toLowerCase()}: ${before === null ? "" : `${fmt(before)} → `}${fmt(parsed.value)}`);
}

export function applyOperations(input: Booking, ops: ChatOperations, suggestions: Suggestion[] = []): ApplyResult {
  const b: Booking = structuredClone(input);
  const log: ApplyResult = { booking: b, changes: [], problems: [], declined: [] };

  for (const c of ops.bookingChanges ?? []) {
    if (!BOOKING_FIELDS.includes(c.field as BookingField) || c.field === "bookingId") continue;
    setBookingValue(b, c.field as BookingField, c, log);
  }

  for (const ic of ops.itemChanges ?? []) {
    if (ic.action === "add") {
      const it = emptyItem(b.items.length + 1);
      b.items.push(it);
      // Field-by-field lines are noise for a new item; log one summary line instead.
      const quiet: ApplyResult = { booking: b, changes: [], problems: log.problems, declined: [] };
      for (const f of ic.fields ?? []) if (ITEM_FIELDS.includes(f.field as ItemField)) setItemValue(b, it, f.field as ItemField, { ...f, mode: f.mode === "add" ? "set" : f.mode }, quiet);
      const given = ITEM_FIELDS.filter((f) => f !== "description" && it[f] !== null).map((f) => `${ITEM_FIELD_LABELS[f].toLowerCase()} ${fmt(it[f])}`);
      log.changes.push(`Added item ${it.lineNo}${it.description ? `: ${it.description}` : ""}${given.length ? ` (${given.join(", ")})` : ""}`);
      continue;
    }
    const it = b.items.find((x) => x.lineNo === ic.itemRef);
    if (!it) {
      log.problems.push(`I couldn't tell which item you meant${ic.itemRef ? ` (item ${ic.itemRef})` : ""}.`);
      continue;
    }
    if (ic.action === "remove") {
      b.items = b.items.filter((x) => x !== it);
      b.items.forEach((x, i) => (x.lineNo = i + 1));
      log.changes.push(`Removed item ${it.lineNo}${it.description ? ` (${it.description})` : ""}`);
      continue;
    }
    for (const f of ic.fields ?? []) if (ITEM_FIELDS.includes(f.field as ItemField)) setItemValue(b, it, f.field as ItemField, f, log);
  }

  for (const id of ops.acceptSuggestions ?? []) {
    const s = suggestions.find((x) => x.id === id);
    if (!s) continue;
    if (s.lineNo) {
      const it = b.items.find((x) => x.lineNo === s.lineNo);
      if (it && it[s.field as ItemField] === null) setItemValue(b, it, s.field as ItemField, { field: s.field, value: String(s.value) }, log);
    } else if (b[s.field as BookingField] === null) {
      setBookingValue(b, s.field as BookingField, { field: s.field, value: String(s.value) }, log);
    }
  }

  inferCountries(b, log);
  log.declined = ops.declined ?? [];
  return log;
}

/** Closed-list inference: every allowed origin city is in the UK; each destination city belongs to one country. */
export function inferCountries(b: Booking, log?: ApplyResult): void {
  if (!b.originCountry && isOriginCity(b.originCity)) {
    b.originCountry = "United Kingdom";
    log?.changes.push(`Origin country: United Kingdom (${b.originCity} is in the UK)`);
  }
  const dc = countryForDestinationCity(b.destinationCity);
  if (!b.destinationCountry && dc) {
    b.destinationCountry = dc;
    log?.changes.push(`Destination country: ${dc} (${b.destinationCity} is in ${dc})`);
  }
}

// ---------- suggestions & missing fields ----------

export interface Suggestion {
  id: string;
  field: string;
  lineNo?: number;
  value: number | string;
  text: string;
}

export function computeSuggestions(b: Booking): Suggestion[] {
  const out: Suggestion[] = [];
  for (const it of b.items) {
    if (it.cartons === null && it.quantity !== null && it.unitsPerCarton) {
      const c = it.quantity / it.unitsPerCarton;
      if (Number.isInteger(c)) out.push({ id: `item:${it.lineNo}:cartons`, field: "cartons", lineNo: it.lineNo, value: c, text: `${formatNum(it.quantity)} units at ${formatNum(it.unitsPerCarton)} per carton is ${c} cartons` });
    }
    if (it.sku === null && it.description) {
      out.push({ id: `item:${it.lineNo}:sku`, field: "sku", lineNo: it.lineNo, value: `ITEM-${it.lineNo}`, text: `no SKU given, so I can label it ITEM-${it.lineNo}` });
    }
  }
  if (b.items.length) {
    if (b.cartons === null && b.items.every((i) => i.cartons !== null)) {
      const total = b.items.reduce((a, i) => a + (i.cartons ?? 0), 0);
      out.push({ id: "booking:cartons", field: "cartons", value: total, text: `the items add up to ${total} cartons` });
    }
    if (b.totalDeclaredValue === null && b.items.every((i) => i.quantity !== null && i.unitPrice !== null)) {
      const total = round2(b.items.reduce((a, i) => a + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0));
      out.push({ id: "booking:totalDeclaredValue", field: "totalDeclaredValue", value: total, text: `the items add up to ${formatGBP(total)}` });
    }
  }
  return out;
}

export interface MissingField {
  key: string;
  label: string;
  question: string;
  group: "route" | "items" | "packing" | "value" | "timing" | "seller";
  optional?: boolean;
  /** Set when the question offers a computed suggestion the seller can accept. */
  suggestionId?: string;
}

const Q: Partial<Record<BookingField, string>> = {
  sellerName: "What's your business name (the seller on the paperwork)?",
  originCity: "Which city are the goods collected from? (London, Manchester, Birmingham or Leeds)",
  destinationCity: "Which city are they going to? (Berlin, Frankfurt, Hamburg, Paris, Lyon, Amsterdam or Rotterdam)",
  destinationCountry: "Which country is the destination in?",
  originCountry: "Which country are the goods collected from?",
  destinationType: "Is the destination a warehouse (fulfilment/distribution centre) or a business address (shop or office)?",
  readyToShipDate: "What date will the goods be packed and ready for collection? (DD-MM-YYYY)",
  sellerPriority: "What matters most for this shipment: cheapest, fastest, most reliable, or a balance?",
  pallets: "How many pallets is it?",
  cartons: "How many cartons in total?",
  totalDeclaredValue: "What's the total declared value on your invoice, in GBP?",
  totalGrossWeightKg: "What's the total gross weight in kg, including cartons and pallets?",
  deliveryAppointmentBooked: "Do you have a delivery appointment (time slot) booked at the receiving site?",
};

const GROUP: Record<BookingField, MissingField["group"]> = {
  bookingId: "seller",
  sellerName: "seller",
  originCity: "route",
  originCountry: "route",
  destinationCity: "route",
  destinationCountry: "route",
  destinationType: "route",
  readyToShipDate: "timing",
  sellerPriority: "timing",
  pallets: "packing",
  cartons: "packing",
  totalDeclaredValue: "value",
  currency: "value",
  totalGrossWeightKg: "packing",
  deliveryAppointmentBooked: "timing",
};

const ORDER: BookingField[] = [
  "originCity",
  "originCountry",
  "destinationCity",
  "destinationCountry",
  "destinationType",
  "pallets",
  "totalGrossWeightKg",
  "cartons",
  "totalDeclaredValue",
  "readyToShipDate",
  "sellerPriority",
  "deliveryAppointmentBooked",
  "sellerName",
];

const ITEM_Q: Record<ItemField, string> = {
  description: "what is it?",
  quantity: "how many units?",
  unitPrice: "unit price in GBP?",
  unitsPerCarton: "how many units per carton?",
  cartons: "how many cartons?",
  unitWeightKg: "weight of one unit in kg?",
  hsCode: "HS code (6+ digits)? Say \"don't know\" if you don't have it.",
  countryOfOrigin: "country where it was made?",
  sku: "SKU / product code?",
};

export function findMissing(b: Booking, declined: string[] = []): MissingField[] {
  const out: MissingField[] = [];
  const sug = computeSuggestions(b);
  for (const f of ORDER) {
    if (b[f] !== null && b[f] !== undefined) continue;
    const s = sug.find((x) => !x.lineNo && x.field === f);
    out.push({
      key: `booking:${f}`,
      label: BOOKING_FIELD_LABELS[f],
      question: s ? `${BOOKING_FIELD_LABELS[f]}: ${s.text}. Shall I use ${f === "totalDeclaredValue" ? formatGBP(Number(s.value)) : s.value}?` : Q[f] ?? `What is the ${BOOKING_FIELD_LABELS[f].toLowerCase()}?`,
      group: GROUP[f],
      suggestionId: s?.id,
    });
  }
  if (!b.items.length) {
    out.splice(Math.min(out.length, 5), 0, {
      key: "items",
      label: "Items",
      question:
        "What are you shipping? For each product please give: description, quantity, unit price (GBP), units per carton, number of cartons, unit weight (kg), HS code and country of origin.",
      group: "items",
    });
  }
  for (const it of b.items) {
    const fields: ItemField[] = ["description", "quantity", "unitPrice", "unitsPerCarton", "cartons", "unitWeightKg", "countryOfOrigin", "hsCode", "sku"];
    for (const f of fields) {
      if (it[f] !== null) continue;
      const key = `item:${it.lineNo}:${f}`;
      const optional = f === "hsCode";
      if (declined.includes(key)) continue;
      const s = sug.find((x) => x.lineNo === it.lineNo && x.field === f);
      const name = it.description ? `${it.description}` : `Item ${it.lineNo}`;
      out.push({
        key,
        label: `${name} — ${ITEM_FIELD_LABELS[f]}`,
        question: s ? `${name}: ${s.text}. OK to use ${s.value}?` : `${name}: ${ITEM_Q[f]}`,
        group: "items",
        optional,
        suggestionId: s?.id,
      });
    }
  }
  // Keep the template order: route first, then items, then the rest.
  const rank: Record<MissingField["group"], number> = { route: 0, items: 1, packing: 2, value: 3, timing: 4, seller: 5 };
  return out.sort((a, b2) => rank[a.group] - rank[b2.group]);
}

export function isComplete(b: Booking, declined: string[] = []): boolean {
  return findMissing(b, declined).filter((m) => !m.optional).length === 0;
}

export function progress(b: Booking): { filled: number; total: number } {
  const bookingFilled = BOOKING_FIELDS.filter((f) => f !== "bookingId" && b[f] !== null).length;
  const bookingTotal = BOOKING_FIELDS.length - 1;
  const itemTotal = Math.max(1, b.items.length) * ITEM_FIELDS.length;
  const itemFilled = b.items.reduce((a, it) => a + ITEM_FIELDS.filter((f) => it[f] !== null).length, 0);
  return { filled: bookingFilled + itemFilled, total: bookingTotal + itemTotal };
}

/** Next questions: same group first, at most three, never more than one group at a time. */
export function nextQuestions(missing: MissingField[], max = 3): MissingField[] {
  if (!missing.length) return [];
  const group = missing[0].group;
  return missing.filter((m) => m.group === group).slice(0, max);
}
