import { BOOKING_FIELD_LABELS, ITEM_FIELD_LABELS, emptyItem, inferCountries, parseBookingField, parseItemField } from "./conversation";
import type { Booking, BookingField, ItemField } from "./types";

/** Form edits use the same parsers as chat and Excel. Empty input clears the field. */
export function editBookingField(b: Booking, field: BookingField, raw: string): { booking: Booking; error?: string } {
  const parsed = parseBookingField(field, raw.trim() === "" ? null : raw);
  if (parsed.error) return { booking: b, error: parsed.error };
  const next: Booking = structuredClone(b);
  (next as unknown as Record<string, unknown>)[field] = parsed.value;
  next.sourceIssues = (next.sourceIssues ?? []).filter((i) => !(i.field === BOOKING_FIELD_LABELS[field] && i.lineNo === undefined));
  if (field === "originCity" || field === "destinationCity") inferCountries(next);
  return { booking: next };
}

export function editItemField(b: Booking, lineNo: number, field: ItemField, raw: string): { booking: Booking; error?: string } {
  const parsed = parseItemField(field, raw.trim() === "" ? null : raw);
  if (parsed.error) return { booking: b, error: parsed.error };
  const next: Booking = structuredClone(b);
  const it = next.items.find((i) => i.lineNo === lineNo);
  if (!it) return { booking: b, error: "Item not found" };
  (it as unknown as Record<string, unknown>)[field] = parsed.value;
  next.sourceIssues = (next.sourceIssues ?? []).filter((i) => !(i.field === ITEM_FIELD_LABELS[field] && i.lineNo === lineNo));
  return { booking: next };
}

export function addItem(b: Booking): Booking {
  const next: Booking = structuredClone(b);
  next.items.push(emptyItem(next.items.length + 1));
  next.sourceIssues = (next.sourceIssues ?? []).filter((i) => i.field !== "Items");
  return next;
}

export function removeItem(b: Booking, lineNo: number): Booking {
  const next: Booking = structuredClone(b);
  next.items = next.items.filter((i) => i.lineNo !== lineNo);
  // Item-level source issues refer to old line numbers; drop them for removed/renumbered lines.
  next.sourceIssues = (next.sourceIssues ?? []).filter((i) => i.lineNo === undefined || i.lineNo < lineNo);
  next.items.forEach((it, i) => (it.lineNo = i + 1));
  return next;
}

export function rawValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
