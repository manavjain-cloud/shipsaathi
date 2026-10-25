import rulebookJson from "@/data/rulebook.json";
import rateCardJson from "@/data/rate-card.json";
import { evaluateCarriers } from "./carriers";
import { displayDate, todayISO } from "./dates";
import { hazardKey, screenDescription } from "./hazmat";
import { ALLOWED, countryForDestinationCity, formatGBP, formatNum, hsDigits, round2 } from "./normalize";
import type { Assessment, Booking, CarrierOption, CarrierResult, DataIssue, Finding, Item, RuleCheck, RuleDefinition } from "./types";

export const DEFAULT_RULEBOOK = rulebookJson as RuleDefinition[];
export const DEFAULT_RATE_CARD = rateCardJson as CarrierOption[];

/** R-02 tolerance. Pass when |declared − Σ(qty × unit price)| ≤ 1% × Σ(qty × unit price). */
export const DECLARED_VALUE_TOLERANCE = 0.01;

export const DISCLAIMER =
  "These ten pre-flight checks catch common booking mistakes. They are not a full customs, dangerous-goods or export-compliance review.";

export interface ValidationContext {
  rateCard?: CarrierOption[];
  rulebook?: RuleDefinition[];
  /** ISO date used as "today" for R-10. Defaults to today in Europe/London. */
  today?: string;
}

const itemLabel = (it: Item) => `Item ${it.lineNo}${it.sku ? ` (${it.sku})` : ""}`;

function sum(values: (number | null)[]): number | null {
  if (values.some((v) => v === null)) return null;
  return round2((values as number[]).reduce((a, b) => a + b, 0));
}

function ruleMeta(rulebook: RuleDefinition[], id: string): RuleDefinition {
  const r = rulebook.find((x) => x.id === id) ?? DEFAULT_RULEBOOK.find((x) => x.id === id);
  if (!r) throw new Error(`Rule ${id} missing from rulebook`);
  return r;
}

function check(meta: RuleDefinition, findings: Finding[], passSummary: string): RuleCheck {
  const status = findings.some((f) => f.status === "fail") ? "fail" : findings.length ? "review" : "pass";
  const failCount = findings.filter((f) => f.status === "fail").length;
  const summary =
    status === "pass"
      ? passSummary
      : status === "review"
        ? `${findings.length} item${findings.length === 1 ? "" : "s"} need a human check`
        : `${failCount} problem${failCount === 1 ? "" : "s"} found`;
  return { ruleId: meta.id, rule: meta.rule, severity: meta.severity, status, summary, findings };
}

// ---------- individual rules (pure, exported for tests) ----------

export function ruleR01(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  for (const it of b.items) {
    const digits = hsDigits(it.hsCode);
    if (!it.hsCode) {
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "HS code", lineNo: it.lineNo, sku: it.sku,
        actual: "blank", expected: "at least 6 digits",
        explanation: `${itemLabel(it)} has no HS code. Customs uses it to classify the product.`,
        fix: "Add the 6–10 digit HS code for this product (check the UK Trade Tariff or ask your customs broker).",
      });
    } else if (!/^\d+$/.test(digits)) {
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "HS code", lineNo: it.lineNo, sku: it.sku,
        actual: `"${it.hsCode}"`, expected: "digits only, at least 6",
        explanation: `${itemLabel(it)}'s HS code contains characters that are not digits.`,
        fix: "Enter the HS code using digits only, e.g. 691200.",
      });
    } else if (digits.length < 6) {
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "HS code", lineNo: it.lineNo, sku: it.sku,
        actual: `${it.hsCode} (${digits.length} digits)`, expected: "at least 6 digits",
        explanation: `${itemLabel(it)}'s HS code is only ${digits.length} digits — too short to classify the product.` +
          (digits.length === 5 ? " If the code starts with 0, the spreadsheet may have dropped the leading zero; store HS codes as text." : ""),
        fix: "Use the full code to at least the 6-digit subheading.",
      });
    }
  }
  if (!b.items.length) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Items", actual: "no items", expected: "at least one item",
      explanation: "The booking has no item lines, so HS codes cannot be checked.", fix: "Add the item lines for this booking.",
    });
  }
  return check(meta, findings, `All ${b.items.length} item(s) have an HS code of 6+ digits`);
}

export function ruleR02(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  const lineValues = b.items.map((it) => (it.quantity !== null && it.unitPrice !== null ? it.quantity * it.unitPrice : null));
  const computed = b.items.length ? sum(lineValues) : 0;
  const declared = b.totalDeclaredValue;
  if (declared === null) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Total declared value",
      actual: "blank", expected: computed !== null ? formatGBP(computed) : "Σ quantity × unit price",
      explanation: "Total declared value is missing, so it cannot be matched to the item values.",
      fix: computed !== null ? `Enter the declared value. The items add up to ${formatGBP(computed)}.` : "Enter the declared value.",
    });
  } else if (computed === null) {
    const missing = b.items.filter((_, i) => lineValues[i] === null).map(itemLabel).join(", ");
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Quantity / Unit price",
      actual: `declared ${formatGBP(declared)}; missing quantity or price on ${missing}`, expected: "Σ quantity × unit price",
      explanation: "Some items are missing quantity or unit price, so the declared value cannot be verified.",
      fix: `Fill in quantity and unit price for ${missing}.`,
    });
  } else {
    const diff = round2(Math.abs(declared - computed));
    const allowed = round2(computed * DECLARED_VALUE_TOLERANCE);
    const ok = computed === 0 ? declared === 0 : diff <= allowed + 1e-9;
    if (!ok) {
      const pct = computed === 0 ? "∞" : ((diff / computed) * 100).toFixed(2);
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "Total declared value",
        actual: formatGBP(declared), expected: `${formatGBP(computed)} ± ${formatGBP(allowed)} (1%)`,
        explanation: `Declared value is ${formatGBP(diff)} (${pct}%) ${declared > computed ? "above" : "below"} the sum of quantity × unit price. Customs relies on these matching.`,
        fix: `Change the declared value to ${formatGBP(computed)}, or correct the item quantities/prices that are wrong.`,
      });
    }
  }
  return check(meta, findings, `Declared ${formatGBP(declared)} matches items ${formatGBP(computed)} within 1%`);
}

export function ruleR03(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  for (const it of b.items) {
    if (it.unitsPerCarton === null || it.cartons === null || it.quantity === null) {
      const missing = [it.quantity === null && "quantity", it.unitsPerCarton === null && "units per carton", it.cartons === null && "cartons"].filter(Boolean).join(", ");
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "Units per carton / Cartons / Quantity", lineNo: it.lineNo, sku: it.sku,
        actual: `missing ${missing}`, expected: "units per carton × cartons = quantity",
        explanation: `${itemLabel(it)} is missing ${missing}, so the carton count cannot be checked.`,
        fix: `Fill in ${missing} for ${itemLabel(it)}.`,
      });
      continue;
    }
    const packed = round2(it.unitsPerCarton * it.cartons);
    if (packed !== it.quantity) {
      const exactCartons = it.quantity / it.unitsPerCarton;
      const fix = Number.isInteger(exactCartons)
        ? `Set cartons to ${exactCartons} (${formatNum(it.quantity)} ÷ ${formatNum(it.unitsPerCarton)}), or set quantity to ${formatNum(packed)} if the carton count is right.`
        : `${formatNum(it.quantity)} units don't divide evenly into cartons of ${formatNum(it.unitsPerCarton)}. Re-count the units or fix units per carton.`;
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "Cartons", lineNo: it.lineNo, sku: it.sku,
        actual: `${formatNum(it.unitsPerCarton)} × ${formatNum(it.cartons)} = ${formatNum(packed)}`, expected: `${formatNum(it.quantity)} (quantity)`,
        explanation: `${itemLabel(it)}: packed units (${formatNum(packed)}) don't match the stated quantity (${formatNum(it.quantity)}). The receiving warehouse will report units missing or extra.`,
        fix,
      });
    }
  }
  return check(meta, findings, "Every item's units per carton × cartons equals its quantity");
}

export function ruleR04(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  const itemCartons = b.items.length ? sum(b.items.map((i) => i.cartons)) : 0;
  if (b.cartons === null || itemCartons === null) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Cartons",
      actual: b.cartons === null ? "booking cartons blank" : "some item cartons blank", expected: "booking cartons = Σ item cartons",
      explanation: "Carton totals cannot be compared because a carton count is missing.",
      fix: itemCartons !== null ? `Enter the booking carton total (${formatNum(itemCartons)} from the items).` : "Fill in cartons for every item and for the booking.",
    });
  } else if (b.cartons !== itemCartons) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Cartons",
      actual: `${formatNum(b.cartons)} on booking`, expected: `${formatNum(itemCartons)} (sum of item cartons)`,
      explanation: `The booking says ${formatNum(b.cartons)} cartons but the items add up to ${formatNum(itemCartons)}.`,
      fix: `Change the booking carton total to ${formatNum(itemCartons)}, or correct the item carton counts.`,
    });
  }
  return check(meta, findings, `Booking cartons (${formatNum(b.cartons)}) equal the item total`);
}

export function ruleR05(b: Booking, meta: RuleDefinition, carriers: CarrierResult): RuleCheck {
  const findings: Finding[] = [];
  const base = { ruleId: meta.id, severity: meta.severity, status: "fail" as const, field: "Gross weight / Pallets" };
  const wpp = carriers.weightPerPalletKg;
  if (b.pallets === null || !Number.isInteger(b.pallets) || b.pallets <= 0) {
    findings.push({ ...base, field: "Pallets", actual: b.pallets === null ? "blank" : String(b.pallets), expected: "a whole number above 0",
      explanation: "Weight per pallet cannot be calculated without a valid pallet count.", fix: "Enter the number of pallets." });
  } else if (b.totalGrossWeightKg === null) {
    findings.push({ ...base, field: "Total gross weight (kg)", actual: "blank", expected: "a weight in kg",
      explanation: "Weight per pallet cannot be calculated without the total gross weight.", fix: "Enter the total gross weight including cartons and pallets." });
  } else if (!carriers.routeFound) {
    findings.push({ ...base, actual: `${wpp} kg per pallet`, expected: "a carrier serving this route",
      explanation: `No carrier on the rate card serves ${b.originCountry ?? "?"} → ${b.destinationCountry ?? "?"}, so the pallet limit cannot be checked.`,
      fix: "Check the origin and destination countries (rate card covers United Kingdom → Germany, France, Netherlands)." });
  } else if (carriers.chosen) {
    const c = carriers.chosen;
    if (wpp! > c.option.maxWeightPerPalletKg) {
      const needed = Math.ceil(b.totalGrossWeightKg / c.option.maxWeightPerPalletKg);
      const alt = carriers.recommended?.evaluation;
      const fixParts = [`spread the load over at least ${needed} pallets for ${c.option.carrier}`];
      if (alt && alt.option.id !== c.option.id) fixParts.push(`switch to ${alt.option.carrier} (${alt.option.service}, limit ${alt.option.maxWeightPerPalletKg} kg, ${formatGBP(alt.cost)})`);
      findings.push({ ...base,
        actual: `${formatNum(b.totalGrossWeightKg)} kg ÷ ${b.pallets} = ${wpp} kg per pallet`,
        expected: `≤ ${c.option.maxWeightPerPalletKg} kg (${c.option.carrier}, ${c.option.service})`,
        explanation: `${c.option.carrier} is the ${carriers.chosenSource === "seller-selected" ? "carrier you selected" : `carrier your "${b.sellerPriority}" priority picks`}, and it won't accept pallets heavier than ${c.option.maxWeightPerPalletKg} kg.`,
        fix: `Either ${fixParts.join(", or ")}.`,
      });
    }
  } else {
    // No chosen carrier yet (priority missing). Pass only if every route carrier accepts the weight.
    const limits = carriers.evaluations.map((e) => e.option.maxWeightPerPalletKg);
    const minLimit = Math.min(...limits);
    if (wpp! > minLimit) {
      const fits = carriers.evaluations.filter((e) => e.eligible).map((e) => e.option.carrier);
      findings.push({ ...base, actual: `${wpp} kg per pallet`, expected: `≤ the chosen carrier's limit (${limits.join(" / ")} kg on this route)`,
        explanation: fits.length
          ? `No carrier is chosen yet (seller priority missing). This weight only fits ${fits.join(", ")}.`
          : `${wpp} kg per pallet is over every carrier's limit on this route.`,
        fix: fits.length ? "Set the seller priority or pick a carrier that accepts this weight." : `Use at least ${Math.ceil(b.totalGrossWeightKg / Math.max(...limits))} pallets.` });
    }
  }
  const passText = carriers.chosen
    ? `${wpp} kg per pallet is within ${carriers.chosen.option.carrier}'s ${carriers.chosen.option.maxWeightPerPalletKg} kg limit`
    : `${wpp} kg per pallet fits every carrier on this route`;
  return check(meta, findings, passText);
}

export function ruleR06(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  const acks = new Set(b.hazardAcknowledgements ?? []);
  for (const it of b.items) {
    const key = hazardKey(it.lineNo, it.description);
    const screen = screenDescription(it.description);
    const ai = b.aiHazardFlags?.[key];
    if (screen.level === "prohibited") {
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "Description", lineNo: it.lineNo, sku: it.sku,
        actual: `"${it.description}"`, expected: "no lithium batteries, aerosols or flammable liquids",
        explanation: screen.reason,
        fix: "Remove this item from the shipment, or ship it with a dangerous-goods service (not on this rate card).",
      });
    } else if ((screen.level === "review" || ai) && !acks.has(key)) {
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "review", field: "Description", lineNo: it.lineNo, sku: it.sku,
        actual: `"${it.description ?? ""}"`, expected: "confirmed free of lithium batteries, aerosols and flammable liquids",
        explanation: screen.level === "review" ? screen.reason : `AI review flagged a possible ${ai!.category}: ${ai!.reason}`,
        fix: "Check the product. If it contains none of these, confirm it as safe. If it does, remove it from the shipment.",
      });
    }
  }
  return check(meta, findings, "No prohibited goods found in item descriptions");
}

export function ruleR07(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  const net = b.items.length ? sum(b.items.map((i) => (i.unitWeightKg !== null && i.quantity !== null ? i.unitWeightKg * i.quantity : null))) : 0;
  if (b.totalGrossWeightKg === null || net === null) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Total gross weight (kg)",
      actual: b.totalGrossWeightKg === null ? "gross weight blank" : "unit weight or quantity missing on an item", expected: "gross ≥ Σ unit weight × quantity",
      explanation: "The weights cannot be compared because a value is missing.",
      fix: "Fill in the total gross weight and every item's unit weight and quantity.",
    });
  } else if (b.totalGrossWeightKg < net) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Total gross weight (kg)",
      actual: `${formatNum(b.totalGrossWeightKg)} kg`, expected: `≥ ${formatNum(net)} kg (products alone)`,
      explanation: `The gross weight is lighter than the products inside it (${formatNum(net)} kg before cartons and pallets). One of the weights is wrong.`,
      fix: `Re-weigh the shipment. Gross weight must be at least ${formatNum(net)} kg plus packaging and pallets.`,
    });
  }
  return check(meta, findings, `Gross ${formatNum(b.totalGrossWeightKg)} kg ≥ product weight ${formatNum(net)} kg`);
}

export function ruleR08(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  if (b.destinationType === null) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Destination type", actual: "blank", expected: "Warehouse or Business address",
      explanation: "Destination type is missing, so we can't tell whether a delivery appointment is needed.", fix: "Set the destination type.",
    });
  } else if (b.destinationType === "Warehouse" && b.deliveryAppointmentBooked !== true) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Delivery appointment booked",
      actual: b.deliveryAppointmentBooked === false ? "No" : "blank", expected: "Yes (warehouse delivery)",
      explanation: "Warehouses usually turn away deliveries without a booked slot, which causes re-delivery fees and delays.",
      fix: "Book a delivery appointment with the receiving warehouse, then set this to Yes.",
    });
  }
  return check(meta, findings, b.destinationType === "Warehouse" ? "Warehouse delivery appointment is booked" : "Not a warehouse, no appointment needed");
}

export function ruleR09(b: Booking, meta: RuleDefinition): RuleCheck {
  const findings: Finding[] = [];
  for (const it of b.items) {
    if (!it.countryOfOrigin) {
      findings.push({
        ruleId: meta.id, severity: meta.severity, status: "fail", field: "Country of origin", lineNo: it.lineNo, sku: it.sku,
        actual: "blank", expected: "country where the product was made",
        explanation: `${itemLabel(it)} has no country of origin. Customs uses it to work out duty, and it's where the product was made, not where it ships from.`,
        fix: "Add the country where this product was manufactured.",
      });
    }
  }
  return check(meta, findings, "Every item has a country of origin");
}

export function ruleR10(b: Booking, meta: RuleDefinition, today: string): RuleCheck {
  const findings: Finding[] = [];
  if (!b.readyToShipDate) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Ready to ship date", actual: "blank", expected: `${displayDate(today)} or later`,
      explanation: "Ready-to-ship date is missing.", fix: "Enter the date the goods will be packed and ready (DD-MM-YYYY).",
    });
  } else if (b.readyToShipDate < today) {
    findings.push({
      ruleId: meta.id, severity: meta.severity, status: "fail", field: "Ready to ship date",
      actual: displayDate(b.readyToShipDate), expected: `${displayDate(today)} or later`,
      explanation: "The ready-to-ship date is in the past, so a carrier can't collect on that day.",
      fix: "Change it to the real date the goods will be ready for collection.",
    });
  }
  return check(meta, findings, `Ready on ${displayDate(b.readyToShipDate)}, not in the past`);
}

// ---------- data quality (required fields, allowed values) ----------

export function checkDataQuality(b: Booking): DataIssue[] {
  const issues: DataIssue[] = [...(b.sourceIssues ?? [])];
  const has = (field: string, lineNo?: number) => issues.some((i) => i.field === field && i.lineNo === lineNo);
  const req = (field: string, v: unknown, lineNo?: number, sku?: string | null) => {
    if ((v === null || v === undefined || v === "") && !has(field, lineNo)) {
      issues.push({ scope: lineNo ? "item" : "booking", field, lineNo, sku, severity: "error", message: `${field} is required but missing.` });
    }
  };
  req("Booking ID", b.bookingId);
  req("Seller name", b.sellerName);
  req("Origin city", b.originCity);
  req("Origin country", b.originCountry);
  req("Destination city", b.destinationCity);
  req("Destination country", b.destinationCountry);
  req("Destination type", b.destinationType);
  req("Ready to ship date", b.readyToShipDate);
  req("Seller priority", b.sellerPriority);
  req("Pallets", b.pallets);
  req("Cartons", b.cartons);
  req("Total declared value", b.totalDeclaredValue);
  req("Currency", b.currency);
  req("Total gross weight (kg)", b.totalGrossWeightKg);
  req("Delivery appointment booked", b.deliveryAppointmentBooked);

  if (b.currency && b.currency.toUpperCase() !== "GBP") {
    issues.push({ scope: "booking", field: "Currency", severity: "error", message: `Currency is ${b.currency}. Rates and checks use GBP only, so enter all values in GBP.` });
  }
  if (b.originCountry && !ALLOWED.originCountries.includes(b.originCountry)) {
    issues.push({ scope: "booking", field: "Origin country", severity: "warning", message: `"${b.originCountry}" is outside the supported origins (United Kingdom).` });
  }
  if (b.destinationCountry && !ALLOWED.destinationCountries.includes(b.destinationCountry)) {
    issues.push({ scope: "booking", field: "Destination country", severity: "warning", message: `"${b.destinationCountry}" is not a supported destination (Germany, France, Netherlands).` });
  }
  if (b.destinationCity && b.destinationCountry) {
    const c = countryForDestinationCity(b.destinationCity);
    if (c && c !== b.destinationCountry) {
      issues.push({ scope: "booking", field: "Destination city", severity: "warning", message: `${b.destinationCity} is in ${c}, but the destination country is ${b.destinationCountry}.` });
    }
  }
  if (b.pallets !== null && (!Number.isInteger(b.pallets) || b.pallets <= 0) && !has("Pallets")) {
    issues.push({ scope: "booking", field: "Pallets", severity: "error", message: "Pallets must be a whole number above 0." });
  }
  if (!b.items.length) {
    issues.push({ scope: "booking", field: "Items", severity: "error", message: "No item lines are linked to this booking." });
  }
  const skus = new Map<string, number>();
  for (const it of b.items) {
    req("SKU", it.sku, it.lineNo, it.sku);
    req("Description", it.description, it.lineNo, it.sku);
    req("Quantity (units)", it.quantity, it.lineNo, it.sku);
    req("Unit price", it.unitPrice, it.lineNo, it.sku);
    req("Units per carton", it.unitsPerCarton, it.lineNo, it.sku);
    req("Cartons", it.cartons, it.lineNo, it.sku);
    req("Unit weight (kg)", it.unitWeightKg, it.lineNo, it.sku);
    if (it.countryOfOrigin && !ALLOWED.itemOrigins.includes(it.countryOfOrigin)) {
      issues.push({ scope: "item", field: "Country of origin", lineNo: it.lineNo, sku: it.sku, severity: "warning", message: `"${it.countryOfOrigin}" is not in the template's list of origin countries.` });
    }
    if (it.sku) {
      const k = it.sku.toLowerCase();
      if (skus.has(k)) issues.push({ scope: "item", field: "SKU", lineNo: it.lineNo, sku: it.sku, severity: "warning", message: `SKU ${it.sku} appears more than once in this booking (also item ${skus.get(k)}).` });
      else skus.set(k, it.lineNo);
    }
  }
  return issues;
}

// ---------- full assessment ----------

export function assessBooking(b: Booking, ctx: ValidationContext = {}): Assessment {
  const rateCard = ctx.rateCard?.length ? ctx.rateCard : DEFAULT_RATE_CARD;
  const rulebook = ctx.rulebook?.length ? ctx.rulebook : DEFAULT_RULEBOOK;
  const today = ctx.today ?? todayISO();
  const carrier = evaluateCarriers(b, rateCard);
  const m = (id: string) => ruleMeta(rulebook, id);

  const checks: RuleCheck[] = [
    ruleR01(b, m("R-01")),
    ruleR02(b, m("R-02")),
    ruleR03(b, m("R-03")),
    ruleR04(b, m("R-04")),
    ruleR05(b, m("R-05"), carrier),
    ruleR06(b, m("R-06")),
    ruleR07(b, m("R-07")),
    ruleR08(b, m("R-08")),
    ruleR09(b, m("R-09")),
    ruleR10(b, m("R-10"), today),
  ];

  const dataIssues = checkDataQuality(b);
  const all = checks.flatMap((c) => c.findings);
  const counts = {
    red: all.filter((f) => f.status === "fail" && f.severity === "Red").length,
    amber: all.filter((f) => f.status === "fail" && f.severity === "Amber").length,
    review: all.filter((f) => f.status === "review").length,
    dataErrors: dataIssues.filter((i) => i.severity === "error").length,
    dataWarnings: dataIssues.filter((i) => i.severity === "warning").length,
  };
  const status = counts.red > 0 || counts.dataErrors > 0 ? "blocked" : counts.review > 0 ? "review" : counts.amber > 0 ? "warnings" : "ready";

  const itemValue = b.items.length ? sum(b.items.map((i) => (i.quantity !== null && i.unitPrice !== null ? i.quantity * i.unitPrice : null))) : 0;
  const itemCartons = b.items.length ? sum(b.items.map((i) => i.cartons)) : 0;
  const netWeightKg = b.items.length ? sum(b.items.map((i) => (i.unitWeightKg !== null && i.quantity !== null ? i.unitWeightKg * i.quantity : null))) : 0;

  return {
    status,
    dispatchReady: status === "ready" || status === "warnings",
    counts,
    checks,
    dataIssues,
    carrier,
    totals: { itemValue, itemCartons, netWeightKg, weightPerPalletKg: carrier.weightPerPalletKg },
    evaluatedOn: today,
    disclaimer: DISCLAIMER,
  };
}

export const STATUS_LABEL: Record<Assessment["status"], string> = {
  blocked: "Blocked — fix Red issues",
  review: "Needs human review",
  warnings: "Ready with warnings",
  ready: "Dispatch-ready",
};

/** Assess with the booking's own uploaded rate card when it has one, else the supplied template's. */
export function assess(b: Booking, today?: string): Assessment {
  return assessBooking(b, { rateCard: b.customRateCard, today });
}

export function rateCardFor(b: Booking): CarrierOption[] {
  return b.customRateCard?.length ? b.customRateCard : DEFAULT_RATE_CARD;
}
