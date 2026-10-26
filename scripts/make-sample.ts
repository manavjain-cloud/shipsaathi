/**
 * Builds a SAMPLE upload (demo input, not results) from the supplied template, with planted mistakes
 * covering every rule plus malformed rows. Output: public/templates/PreFly_Sample_With_Mistakes.xlsx
 *
 *   npx tsx scripts/make-sample.ts
 */
import ExcelJS from "exceljs";
import path from "node:path";

type Row = (string | number | null)[];

// Ready dates are relative to the day the file is generated so the "past date" case stays meaningful.
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
const inDays = (n: number) => fmt(new Date(Date.now() + n * 86400000));

const bookings: Row[] = [
  // id, seller, oCity, oCountry, dCity, dCountry, type, date, priority, pallets, cartons, value, cur, gross, appt
  ["BK-101", "Asha Exports", "London", "United Kingdom", "Paris", "France", "Business address", inDays(10), "Fastest", 2, 50, 2500, "GBP", 400, "No"], // clean
  ["BK-102", "Kaveri Textiles", "Leeds", "United Kingdom", "Berlin", "Germany", "Warehouse", inDays(12), "Balanced", 2, 60, 4410, "GBP", 380, "No"], // R-02 (+5% over £4,200), R-08
  ["BK-103", "Jaipur Brass Co", "Birmingham", "United Kingdom", "Lyon", "France", "Business address", inDays(-3), "Most reliable", 1, 20, 1600, "GBP", 260, "Yes"], // R-01, R-09, R-10
  ["BK-104", "Coastal Ceramics", "Manchester", "United Kingdom", "Hamburg", "Germany", "Warehouse", inDays(7), "Cheapest", 3, 95, 5400, "GBP", 640, "Yes"], // R-03, R-04
  ["BK-105", "Indus Cookware", "Birmingham", "United Kingdom", "Frankfurt", "Germany", "Warehouse", inDays(9), "Cheapest", 3, 120, 6000, "GBP", 1650, "Yes"], // R-05 (550 kg/pallet > Carrier A 500)
  ["BK-106", "Volt Gadgets", "London", "United Kingdom", "Amsterdam", "Netherlands", "Business address", inDays(8), "Balanced", 1, 30, 3150, "GBP", 150, "No"], // R-06 (power bank) + review (speaker)
  ["BK-107", "Malabar Spices", "Leeds", "United Kingdom", "Rotterdam", "Netherlands", "Warehouse", inDays(6), "Cheapest", 2, 40, 2000, "GBP", 300, "Yes"], // R-07 (gross < products)
  ["BK-108", "Granite Works", "Manchester", "United Kingdom", "Berlin", "Germany", "Business address", inDays(14), "Fastest", 2, 40, 4000, "GBP", 1800, "No"], // no eligible carrier (900 kg/pallet)
  ["BK-101", "Asha Exports", "London", "United Kingdom", "Paris", "France", "Business address", inDays(10), "Fastest", 2, 50, 2500, "GBP", 400, "No"], // duplicate Booking ID
  ["BK-110", "Typo Traders", "London", "United Kingdom", "Paris", "France", "Shop", "31-02-2026", "Soonest", "three", 10, "abc", "GBP", 100, "Maybe"], // unreadable values
];

const items: Row[] = [
  // bookingId, sku, description, hs, qty, price, upc, cartons, unitKg, origin
  ["BK-101", "TEA-01", "Assam tea, 500 g tin", 902300, 500, 5, 10, 50, 0.6, "India"],
  ["BK-102", "SH-01", "Cotton shirt", 620520, 300, 7, 10, 30, 0.3, "India"],
  ["BK-102", "SH-02", "Linen trousers", 620342, 300, 7, 10, 30, 0.45, "India"],
  ["BK-103", "BR-01", "Brass candle holder", null, 200, 8, 10, 20, 0.9, null],
  ["BK-104", "MUG-01", "Ceramic coffee mug, 350 ml", 691200, 1080, 5, 12, 85, 0.5, "United Kingdom"],
  ["BK-105", "PAN-01", "Stainless steel frying pan", 732393, 1200, 5, 10, 120, 1.1, "India"],
  ["BK-106", "PB-01", "USB power bank 10000mAh", 850760, 150, 15, 10, 15, 0.25, "China"],
  ["BK-106", "SPK-01", "Portable Bluetooth speaker", 851822, 150, 6, 10, 15, 0.5, "China"],
  ["BK-107", "SP-01", "Ground turmeric, 1 kg pouch", 91030, 400, 5, 10, 40, 1.0, "India"],
  ["BK-108", "GR-01", "Granite worktop offcut", 680293, 40, 100, 1, 40, 42, "India"],
  ["BK-110", "X-1", "Notebooks", 482010, 100, 1, 10, 10, 0.2, "Vietnam"],
  ["BK-999", "ORPHAN-1", "Item for a booking that doesn't exist", 123456, 10, 1, 10, 1, 1, "China"],
];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), "reference", "Case2_Shipment_Booking_Test_Data_Format.xlsx"));
  const b = wb.getWorksheet("Bookings")!;
  const i = wb.getWorksheet("Items")!;
  bookings.forEach((r, k) => b.getRow(4 + k).values = r as ExcelJS.CellValue[]);
  items.forEach((r, k) => i.getRow(4 + k).values = r as ExcelJS.CellValue[]);
  const out = path.join(process.cwd(), "public", "templates", "PreFly_Sample_With_Mistakes.xlsx");
  await wb.xlsx.writeFile(out);
  console.log("Wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
