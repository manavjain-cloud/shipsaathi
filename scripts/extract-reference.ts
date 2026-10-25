/**
 * Reads the fixed sheets (Carrier options, Rulebook) from the supplied workbook
 * and writes them to src/data/*.json so the app never hand-types rates or rules.
 *
 *   npx tsx scripts/extract-reference.ts [path/to/workbook.xlsx]
 */
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseCarrierSheet, parseRulebookSheet } from "../src/lib/domain/excel";

async function main() {
  const file =
    process.argv[2] ??
    path.join(process.cwd(), "reference", "Case2_Shipment_Booking_Test_Data_Format.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const carrierSheet = wb.worksheets.find((w) => w.name.trim().toLowerCase() === "carrier options");
  const ruleSheet = wb.worksheets.find((w) => w.name.trim().toLowerCase() === "rulebook");
  if (!carrierSheet || !ruleSheet) throw new Error("Workbook is missing Carrier options or Rulebook sheet");

  const carriers = parseCarrierSheet(carrierSheet);
  const rules = parseRulebookSheet(ruleSheet);
  if (carriers.issues.length) console.warn("Carrier sheet issues:", carriers.issues);
  if (rules.issues.length) console.warn("Rulebook issues:", rules.issues);

  const outDir = path.join(process.cwd(), "src", "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "rate-card.json"), JSON.stringify(carriers.options, null, 2) + "\n");
  writeFileSync(path.join(outDir, "rulebook.json"), JSON.stringify(rules.rules, null, 2) + "\n");
  console.log(`Wrote ${carriers.options.length} carrier options and ${rules.rules.length} rules from ${path.basename(file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
