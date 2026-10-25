import ExcelJS from "exceljs";
import { parseDate } from "./dates";
import {
  cleanText,
  normalizeCity,
  normalizeCountry,
  parseDestinationType,
  parseHsCode,
  parseNumber,
  parsePriority,
  parseYesNo,
  type Parsed,
} from "./normalize";
import type { Booking, CarrierOption, DataIssue, Item, RuleDefinition } from "./types";

export const BOOKING_COLUMNS = [
  "Booking ID",
  "Seller name",
  "Origin city",
  "Origin country",
  "Destination city",
  "Destination country",
  "Destination type",
  "Ready to ship date",
  "Seller priority",
  "Pallets",
  "Cartons",
  "Total declared value",
  "Currency",
  "Total gross weight (kg)",
  "Delivery appointment booked",
] as const;

export const ITEM_COLUMNS = [
  "Booking ID",
  "SKU",
  "Description",
  "HS code",
  "Quantity (units)",
  "Unit price",
  "Units per carton",
  "Cartons",
  "Unit weight (kg)",
  "Country of origin",
] as const;

export const CARRIER_COLUMNS = [
  "Carrier",
  "Service",
  "Origin country",
  "Destination country",
  "Price per pallet",
  "Currency",
  "Transit time (days)",
  "On-time rate (%)",
  "Max weight per pallet (kg)",
] as const;

export const RULEBOOK_COLUMNS = ["Rule ID", "Rule", "Severity if broken"] as const;

/** The grey example rows shipped in the template (row 3). Skipped when present unchanged. */
const TEMPLATE_EXAMPLE_BOOKING = ["BK-001", "Northfield Goods", "Manchester", "United Kingdom", "Frankfurt", "Germany"];
const TEMPLATE_EXAMPLE_ITEM = ["BK-001", "MUG-01", "Ceramic coffee mug, 350 ml"];

export interface UploadIssue {
  severity: "error" | "warning" | "info";
  sheet?: string;
  row?: number;
  message: string;
}

export interface ParsedWorkbook {
  ok: boolean;
  bookings: Booking[];
  issues: UploadIssue[];
  rateCard: CarrierOption[] | null;
  rateCardSource: "uploaded" | "default";
  rulebook: RuleDefinition[] | null;
  stats: { bookingRows: number; itemRows: number; orphanItems: number; duplicateIds: number; skippedExampleRows: number };
}

const norm = (s: unknown) => (cleanText(s) ?? "").toLowerCase().replace(/[^a-z0-9%()]+/g, " ").trim();

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("result" in o) return o.result ?? null;
    if ("text" in o) return o.text;
    if ("error" in o) return null;
  }
  return v;
}

interface SheetTable {
  headerRow: number;
  columnIndex: Map<string, number>;
  missing: string[];
  rows: { rowNumber: number; values: Record<string, unknown> }[];
}

/** Finds the header row (within the first 10 rows) by matching expected column names. */
export function readTable(ws: ExcelJS.Worksheet, expected: readonly string[]): SheetTable | null {
  let headerRow = -1;
  let best = 0;
  const limit = Math.min(ws.rowCount, 10);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    const names = new Set<string>();
    row.eachCell({ includeEmpty: false }, (c) => names.add(norm(cellValue(c))));
    const hits = expected.filter((e) => names.has(norm(e))).length;
    if (hits > best) {
      best = hits;
      headerRow = r;
    }
  }
  if (headerRow === -1 || best < Math.min(3, expected.length)) return null;

  const columnIndex = new Map<string, number>();
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (c, col) => {
    const n = norm(cellValue(c));
    const match = expected.find((e) => norm(e) === n);
    if (match && !columnIndex.has(match)) columnIndex.set(match, col);
  });
  const missing = expected.filter((e) => !columnIndex.has(e));

  const rows: SheetTable["rows"] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, unknown> = {};
    let any = false;
    for (const [name, col] of columnIndex) {
      const v = cellValue(row.getCell(col));
      values[name] = v;
      if (v !== null && v !== undefined && String(v).trim() !== "") any = true;
    }
    if (any) rows.push({ rowNumber: r, values });
  }
  return { headerRow, columnIndex, missing, rows };
}

function findSheet(wb: ExcelJS.Workbook, name: string, expected: readonly string[]): ExcelJS.Worksheet | null {
  const byName = wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
  if (byName) return byName;
  // Fallback: any sheet whose header looks right (renamed sheets).
  for (const ws of wb.worksheets) {
    const t = readTable(ws, expected);
    if (t && t.missing.length <= 2) return ws;
  }
  return null;
}

function isExampleRow(values: Record<string, unknown>, cols: readonly string[], example: string[]): boolean {
  return example.every((v, i) => (cleanText(values[cols[i]]) ?? "") === v);
}

function take<T>(p: Parsed<T>, field: string, issues: DataIssue[], extra: Partial<DataIssue> = {}): T | null {
  if (p.error) issues.push({ scope: extra.lineNo ? "item" : "booking", field, severity: "error", message: `${field}: ${p.error}.`, raw: p.raw, ...extra });
  return p.value;
}

export function rowToBooking(values: Record<string, unknown>, rowNumber: number): Booking {
  const issues: DataIssue[] = [];
  const b: Booking = {
    bookingId: cleanText(values["Booking ID"]),
    sellerName: cleanText(values["Seller name"]),
    originCity: normalizeCity(values["Origin city"]),
    originCountry: normalizeCountry(values["Origin country"]),
    destinationCity: normalizeCity(values["Destination city"]),
    destinationCountry: normalizeCountry(values["Destination country"]),
    destinationType: take(parseDestinationType(values["Destination type"]), "Destination type", issues),
    readyToShipDate: take(parseDate(values["Ready to ship date"]), "Ready to ship date", issues),
    sellerPriority: take(parsePriority(values["Seller priority"]), "Seller priority", issues),
    pallets: take(parseNumber(values["Pallets"], { integer: true, allowZero: false }), "Pallets", issues),
    cartons: take(parseNumber(values["Cartons"], { integer: true }), "Cartons", issues),
    totalDeclaredValue: take(parseNumber(values["Total declared value"]), "Total declared value", issues),
    currency: cleanText(values["Currency"])?.toUpperCase() ?? null,
    totalGrossWeightKg: take(parseNumber(values["Total gross weight (kg)"]), "Total gross weight (kg)", issues),
    deliveryAppointmentBooked: take(parseYesNo(values["Delivery appointment booked"]), "Delivery appointment booked", issues),
    items: [],
    sourceRow: rowNumber,
  };
  b.sourceIssues = issues;
  return b;
}

export function rowToItem(values: Record<string, unknown>, rowNumber: number, lineNo: number, issues: DataIssue[]): Item {
  const sku = cleanText(values["SKU"]);
  const ex = { lineNo, sku };
  return {
    lineNo,
    sku,
    description: cleanText(values["Description"]),
    hsCode: parseHsCode(values["HS code"]),
    quantity: take(parseNumber(values["Quantity (units)"], { integer: true }), "Quantity (units)", issues, ex),
    unitPrice: take(parseNumber(values["Unit price"]), "Unit price", issues, ex),
    unitsPerCarton: take(parseNumber(values["Units per carton"], { integer: true, allowZero: false }), "Units per carton", issues, ex),
    cartons: take(parseNumber(values["Cartons"], { integer: true }), "Cartons", issues, ex),
    unitWeightKg: take(parseNumber(values["Unit weight (kg)"]), "Unit weight (kg)", issues, ex),
    countryOfOrigin: normalizeCountry(values["Country of origin"]),
    sourceRow: rowNumber,
  };
}

export function parseCarrierSheet(ws: ExcelJS.Worksheet): { options: CarrierOption[]; issues: UploadIssue[] } {
  const issues: UploadIssue[] = [];
  const t = readTable(ws, CARRIER_COLUMNS);
  if (!t) return { options: [], issues: [{ severity: "warning", sheet: ws.name, message: "Carrier options header row not found." }] };
  if (t.missing.length) {
    return { options: [], issues: [{ severity: "warning", sheet: ws.name, message: `Carrier options sheet is missing columns: ${t.missing.join(", ")}.` }] };
  }
  const options: CarrierOption[] = [];
  for (const { rowNumber, values } of t.rows) {
    const carrier = cleanText(values["Carrier"]);
    const service = cleanText(values["Service"]);
    const originCountry = normalizeCountry(values["Origin country"]);
    const destinationCountry = normalizeCountry(values["Destination country"]);
    const price = parseNumber(values["Price per pallet"]).value;
    const transit = parseNumber(values["Transit time (days)"]).value;
    const onTime = parseNumber(values["On-time rate (%)"]).value;
    const maxW = parseNumber(values["Max weight per pallet (kg)"]).value;
    if (!carrier || !service || !originCountry || !destinationCountry || price === null || transit === null || onTime === null || maxW === null) {
      issues.push({ severity: "warning", sheet: ws.name, row: rowNumber, message: "Incomplete carrier row skipped." });
      continue;
    }
    options.push({
      id: `${carrier}|${service}|${originCountry}|${destinationCountry}`,
      carrier,
      service,
      originCountry,
      destinationCountry,
      pricePerPallet: price,
      currency: cleanText(values["Currency"])?.toUpperCase() ?? "GBP",
      transitDays: transit,
      onTimeRate: onTime,
      maxWeightPerPalletKg: maxW,
    });
  }
  return { options, issues };
}

export function parseRulebookSheet(ws: ExcelJS.Worksheet): { rules: RuleDefinition[]; issues: UploadIssue[] } {
  const t = readTable(ws, RULEBOOK_COLUMNS);
  if (!t || t.missing.length) return { rules: [], issues: [{ severity: "warning", sheet: ws.name, message: "Rulebook sheet could not be read." }] };
  const rules: RuleDefinition[] = [];
  for (const { values } of t.rows) {
    const id = cleanText(values["Rule ID"]);
    const rule = cleanText(values["Rule"]);
    const sev = cleanText(values["Severity if broken"]);
    if (id && rule && (sev === "Red" || sev === "Amber")) rules.push({ id, rule, severity: sev });
  }
  return { rules, issues: [] };
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

export async function parseWorkbook(data: ArrayBuffer | Uint8Array): Promise<ParsedWorkbook> {
  const result: ParsedWorkbook = {
    ok: false,
    bookings: [],
    issues: [],
    rateCard: null,
    rateCardSource: "default",
    rulebook: null,
    stats: { bookingRows: 0, itemRows: 0, orphanItems: 0, duplicateIds: 0, skippedExampleRows: 0 },
  };
  const wb = new ExcelJS.Workbook();
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    // exceljs expects a Node Buffer-like object.
    await wb.xlsx.load(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as ArrayBuffer);
  } catch {
    result.issues.push({ severity: "error", message: "This file could not be read as an .xlsx workbook. Save it as Excel Workbook (.xlsx) and try again." });
    return result;
  }

  const bookingSheet = findSheet(wb, "Bookings", BOOKING_COLUMNS);
  const itemSheet = findSheet(wb, "Items", ITEM_COLUMNS);
  if (!bookingSheet) result.issues.push({ severity: "error", message: 'No "Bookings" sheet found. The workbook must follow the supplied template (Sheet 1: Bookings).' });
  if (!itemSheet) result.issues.push({ severity: "error", message: 'No "Items" sheet found. The workbook must follow the supplied template (Sheet 2: Items).' });
  if (!bookingSheet || !itemSheet) return result;

  const bt = readTable(bookingSheet, BOOKING_COLUMNS);
  const it = readTable(itemSheet, ITEM_COLUMNS);
  if (!bt) result.issues.push({ severity: "error", sheet: bookingSheet.name, message: "Could not find the header row on the Bookings sheet." });
  if (!it) result.issues.push({ severity: "error", sheet: itemSheet.name, message: "Could not find the header row on the Items sheet." });
  if (!bt || !it) return result;
  if (bt.missing.length) result.issues.push({ severity: "error", sheet: bookingSheet.name, message: `Bookings sheet is missing columns: ${bt.missing.join(", ")}.` });
  if (it.missing.length) result.issues.push({ severity: "error", sheet: itemSheet.name, message: `Items sheet is missing columns: ${it.missing.join(", ")}.` });
  if (bt.missing.length || it.missing.length) return result;
  if (bt.rows.length > MAX_ROWS || it.rows.length > MAX_ROWS) {
    result.issues.push({ severity: "error", message: `Too many rows (limit ${MAX_ROWS} per sheet).` });
    return result;
  }

  // Skip the unchanged template example rows, unless they are the only data.
  let bookingRows = bt.rows;
  let itemRows = it.rows;
  const exB = bookingRows.filter((r) => isExampleRow(r.values, BOOKING_COLUMNS, TEMPLATE_EXAMPLE_BOOKING));
  const exI = itemRows.filter((r) => isExampleRow(r.values, ITEM_COLUMNS, TEMPLATE_EXAMPLE_ITEM));
  if (exB.length && bookingRows.length > exB.length) {
    bookingRows = bookingRows.filter((r) => !exB.includes(r));
    itemRows = itemRows.filter((r) => !exI.includes(r));
    result.stats.skippedExampleRows = exB.length + exI.length;
    result.issues.push({ severity: "info", message: `Skipped the template's grey example row (BK-001 Northfield Goods, row ${exB.map((r) => r.rowNumber).join(", ")}).` });
  } else if (exB.length) {
    result.issues.push({ severity: "info", message: "Only the template example booking was found, so it is validated as a sample." });
  }

  result.stats.bookingRows = bookingRows.length;
  result.stats.itemRows = itemRows.length;
  if (!bookingRows.length) {
    result.issues.push({ severity: "error", sheet: bookingSheet.name, message: "The Bookings sheet has no data rows." });
    return result;
  }

  const byId = new Map<string, Booking>();
  const seenIds = new Map<string, number>();
  for (const { rowNumber, values } of bookingRows) {
    const b = rowToBooking(values, rowNumber);
    const id = b.bookingId;
    if (!id) {
      b.bookingId = `ROW-${rowNumber}`;
      b.sourceIssues!.push({ scope: "booking", field: "Booking ID", severity: "error", message: `Booking ID is blank (row ${rowNumber}). Items cannot be linked to it.` });
    } else if (seenIds.has(id.toLowerCase())) {
      result.stats.duplicateIds++;
      const first = seenIds.get(id.toLowerCase());
      b.sourceIssues!.push({
        scope: "booking", field: "Booking ID", severity: "error",
        message: `Duplicate Booking ID ${id} (also on row ${first}). Items are linked to the first row only; give this booking its own ID.`,
      });
      result.issues.push({ severity: "warning", sheet: bookingSheet.name, row: rowNumber, message: `Duplicate Booking ID ${id} (first used on row ${first}).` });
    } else {
      seenIds.set(id.toLowerCase(), rowNumber);
      byId.set(id.toLowerCase(), b);
    }
    result.bookings.push(b);
  }

  for (const { rowNumber, values } of itemRows) {
    const ref = cleanText(values["Booking ID"]);
    const target = ref ? byId.get(ref.toLowerCase()) : undefined;
    if (!target) {
      result.stats.orphanItems++;
      const sku = cleanText(values["SKU"]) ?? "(no SKU)";
      result.issues.push({
        severity: "warning", sheet: itemSheet.name, row: rowNumber,
        message: ref ? `Item ${sku} references Booking ID "${ref}", which is not on the Bookings sheet. It was not validated.` : `Item ${sku} has no Booking ID. It was not validated.`,
      });
      continue;
    }
    const lineNo = target.items.length + 1;
    target.items.push(rowToItem(values, rowNumber, lineNo, target.sourceIssues!));
  }

  const carrierSheet = wb.worksheets.find((w) => w.name.trim().toLowerCase() === "carrier options");
  if (carrierSheet) {
    const c = parseCarrierSheet(carrierSheet);
    if (c.options.length) {
      result.rateCard = c.options;
      result.rateCardSource = "uploaded";
    }
    result.issues.push(...c.issues);
  }
  const ruleSheet = wb.worksheets.find((w) => w.name.trim().toLowerCase() === "rulebook");
  if (ruleSheet) {
    const r = parseRulebookSheet(ruleSheet);
    if (r.rules.length) result.rulebook = r.rules;
  }

  result.ok = true;
  return result;
}
