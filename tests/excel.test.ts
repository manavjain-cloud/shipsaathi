import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOKING_COLUMNS, ITEM_COLUMNS, parseWorkbook } from "@/lib/domain/excel";
import { assessBooking } from "@/lib/domain/validation";
import { TODAY } from "./fixtures";

type Row = (string | number | Date | null)[];

async function makeWorkbook(bookings: Row[], items: Row[], opts: { bookingCols?: readonly string[]; itemCols?: readonly string[]; extraSheets?: boolean } = {}) {
  const wb = new ExcelJS.Workbook();
  const b = wb.addWorksheet("Bookings");
  b.addRow(["Bookings — one row per record. Row 3 is an example (grey); enter data from row 4."]);
  b.addRow([...(opts.bookingCols ?? BOOKING_COLUMNS)]);
  b.addRow(["BK-001", "Northfield Goods", "Manchester", "United Kingdom", "Frankfurt", "Germany", "Warehouse", "05-11-2026", "Cheapest", 3, 90, 5400, "GBP", 620, "Yes"]);
  bookings.forEach((r) => b.addRow(r));
  const i = wb.addWorksheet("Items");
  i.addRow(["Items — one row per record. Row 3 is an example (grey); enter data from row 4."]);
  i.addRow([...(opts.itemCols ?? ITEM_COLUMNS)]);
  i.addRow(["BK-001", "MUG-01", "Ceramic coffee mug, 350 ml", 691200, 1080, 5, 12, 90, 0.5, "United Kingdom"]);
  items.forEach((r) => i.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

const GOOD: Row = ["BK-101", "Asha Exports", "London", "United Kingdom", "Paris", "France", "Business address", "10-11-2026", "Fastest", 2, 50, 2500, "GBP", 400, "No"];
const GOOD_ITEM: Row = ["BK-101", "TEA-01", "Assam tea, 500 g tin", 90230, 500, 5, 10, 50, 0.6, "India"];

describe("supplied template", () => {
  it("reads the real template workbook and validates the example booking", async () => {
    const file = readFileSync(path.join(process.cwd(), "reference", "Case2_Shipment_Booking_Test_Data_Format.xlsx"));
    const r = await parseWorkbook(new Uint8Array(file));
    expect(r.ok).toBe(true);
    expect(r.bookings).toHaveLength(1);
    expect(r.bookings[0].readyToShipDate).toBe("2026-11-05");
    expect(r.bookings[0].items[0].hsCode).toBe("691200");
    expect(r.rateCardSource).toBe("uploaded");
    expect(r.rateCard).toHaveLength(9);
    expect(assessBooking(r.bookings[0], { today: TODAY, rateCard: r.rateCard! }).status).toBe("ready");
  });
});

describe("parseWorkbook", () => {
  it("skips the grey example row and links items by Booking ID", async () => {
    const r = await parseWorkbook(await makeWorkbook([GOOD], [GOOD_ITEM]));
    expect(r.ok).toBe(true);
    expect(r.bookings.map((b) => b.bookingId)).toEqual(["BK-101"]);
    expect(r.bookings[0].items).toHaveLength(1);
    expect(r.stats.skippedExampleRows).toBe(2);
    expect(r.rateCardSource).toBe("default");
  });

  it("handles multiple bookings with multiple items, including planted mistakes", async () => {
    const r = await parseWorkbook(
      await makeWorkbook(
        [GOOD, ["BK-102", "Kaveri Textiles", "Leeds", "United Kingdom", "Berlin", "Germany", "Warehouse", "01-10-2026", "Cheapest", 2, 60, 9999, "GBP", 1100, "No"]],
        [GOOD_ITEM, ["BK-102", "SH-1", "Cotton shirt", 620520, 300, 12, 10, 30, 0.3, "India"], ["BK-102", "SH-2", "Linen shirt", null, 300, 15, 10, 30, 0.3, null]],
      ),
    );
    const [a, b] = r.bookings.map((x) => assessBooking(x, { today: TODAY }));
    expect(r.bookings[1].items).toHaveLength(2);
    // BK-101: HS 90230 is 5 digits → R-01
    expect(a.checks[0].status).toBe("fail");
    // BK-102: missing HS, value mismatch, 550 kg/pallet > Carrier A 500, no appointment, no origin, past date
    const failed = b.checks.filter((c) => c.status !== "pass").map((c) => c.ruleId);
    expect(failed).toEqual(["R-01", "R-02", "R-05", "R-08", "R-09", "R-10"]);
  });

  it("reports items whose Booking ID is not on the Bookings sheet", async () => {
    const r = await parseWorkbook(await makeWorkbook([GOOD], [GOOD_ITEM, ["BK-999", "X-1", "Stray item", 123456, 1, 1, 1, 1, 1, "China"]]));
    expect(r.stats.orphanItems).toBe(1);
    expect(r.issues.some((i) => i.message.includes("BK-999"))).toBe(true);
  });

  it("flags duplicate Booking IDs", async () => {
    const r = await parseWorkbook(await makeWorkbook([GOOD, GOOD], [GOOD_ITEM]));
    expect(r.stats.duplicateIds).toBe(1);
    expect(r.bookings[1].sourceIssues?.some((i) => i.message.includes("Duplicate"))).toBe(true);
    expect(assessBooking(r.bookings[1], { today: TODAY }).status).toBe("blocked");
  });

  it("records invalid values instead of guessing", async () => {
    const bad: Row = ["BK-103", "Raj Metals", "Birmingham", "United Kingdom", "Rotterdam", "Netherlands", "Depot??", "31-02-2026", "Soonest", "three", 10, "abc", "GBP", 100, "Maybe"];
    const r = await parseWorkbook(await makeWorkbook([bad], [["BK-103", "M-1", "Steel bolts", 731815, 100, 1, 10, 10, 0.05, "India"]]));
    const b = r.bookings[0];
    expect(b.pallets).toBeNull();
    expect(b.readyToShipDate).toBeNull();
    expect(b.destinationType).toBeNull();
    const fields = (b.sourceIssues ?? []).map((i) => i.field).sort();
    expect(fields).toEqual(["Delivery appointment booked", "Destination type", "Pallets", "Ready to ship date", "Seller priority", "Total declared value"].sort());
  });

  it("accepts real Excel date cells", async () => {
    const row = [...GOOD];
    row[7] = new Date(Date.UTC(2026, 10, 12));
    const r = await parseWorkbook(await makeWorkbook([row], [GOOD_ITEM]));
    expect(r.bookings[0].readyToShipDate).toBe("2026-11-12");
  });

  it("rejects a workbook with missing columns", async () => {
    const cols = BOOKING_COLUMNS.filter((c) => c !== "Pallets");
    const r = await parseWorkbook(await makeWorkbook([], [], { bookingCols: cols }));
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toContain("Pallets");
  });

  it("rejects a file that is not a workbook", async () => {
    const r = await parseWorkbook(new TextEncoder().encode("not,an,excel,file"));
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toMatch(/could not be read/);
  });

  it("rejects a workbook without the Items sheet", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Bookings").addRow([...BOOKING_COLUMNS]);
    const r = await parseWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("Items"))).toBe(true);
  });

  it("validates the example row when it is the only booking", async () => {
    const r = await parseWorkbook(await makeWorkbook([], []));
    expect(r.ok).toBe(true);
    expect(r.bookings).toHaveLength(1);
  });
});

describe("sample workbook with planted mistakes", () => {
  it("flags the intended rule on each booking", async () => {
    const file = readFileSync(path.join(process.cwd(), "public", "templates", "ShipSaathi_Sample_With_Mistakes.xlsx"));
    const r = await parseWorkbook(new Uint8Array(file));
    expect(r.ok).toBe(true);
    // Dates in the sample are relative to the day it was generated; evaluate against that window.
    const failing = (id: string, idx = 0) => {
      const b = r.bookings.filter((x) => x.bookingId === id)[idx];
      return assessBooking(b, { today: TODAY }).checks.filter((c) => c.status !== "pass").map((c) => c.ruleId);
    };
    expect(failing("BK-101")).toEqual([]);
    expect(failing("BK-102")).toEqual(["R-02", "R-08"]);
    expect(failing("BK-103")).toEqual(["R-01", "R-09", "R-10"]);
    expect(failing("BK-104")).toEqual(["R-03", "R-04"]);
    expect(failing("BK-105")).toEqual(["R-05"]);
    expect(failing("BK-106")).toEqual(["R-06"]);
    expect(failing("BK-107")).toEqual(["R-01", "R-07"]);
    expect(failing("BK-108")).toEqual(["R-05"]);
    expect(r.stats.duplicateIds).toBe(1);
    expect(r.stats.orphanItems).toBe(1);
  });
});
