import { describe, expect, it } from "vitest";
import { assessBooking } from "@/lib/domain/validation";
import { booking, item, TODAY } from "./fixtures";

const run = (b = booking()) => assessBooking(b, { today: TODAY });
const rule = (b: ReturnType<typeof booking>, id: string) => run(b).checks.find((c) => c.ruleId === id)!;

describe("template example booking", () => {
  it("passes all ten rules and is dispatch-ready", () => {
    const a = run();
    expect(a.checks).toHaveLength(10);
    expect(a.checks.every((c) => c.status === "pass")).toBe(true);
    expect(a.status).toBe("ready");
    expect(a.dispatchReady).toBe(true);
    expect(a.dataIssues).toHaveLength(0);
  });
});

describe("R-01 HS code", () => {
  it("fails on blank HS code", () => expect(rule(booking({}, [item({ hsCode: null })]), "R-01").status).toBe("fail"));
  it("fails on 5 digits (boundary)", () => expect(rule(booking({}, [item({ hsCode: "69120" })]), "R-01").status).toBe("fail"));
  it("passes on exactly 6 digits", () => expect(rule(booking({}, [item({ hsCode: "691200" })]), "R-01").status).toBe("pass"));
  it("passes on dotted 10-digit code", () => expect(rule(booking({}, [item({ hsCode: "6912.00.10.00" })]), "R-01").status).toBe("pass"));
  it("fails on letters", () => expect(rule(booking({}, [item({ hsCode: "69A200" })]), "R-01").status).toBe("fail"));
  it("is Red and blocks dispatch", () => {
    const a = run(booking({}, [item({ hsCode: null })]));
    expect(a.counts.red).toBe(1);
    expect(a.status).toBe("blocked");
    expect(a.dispatchReady).toBe(false);
  });
  it("reports one finding per bad item", () => {
    const b = booking({ cartons: 180, totalDeclaredValue: 10800, totalGrossWeightKg: 1200 }, [item({ hsCode: "123" }), item({ lineNo: 2, sku: "MUG-02", hsCode: null })]);
    expect(rule(b, "R-01").findings.map((f) => f.lineNo)).toEqual([1, 2]);
  });
});

describe("R-02 declared value within 1%", () => {
  // items = 1080 × £5 = £5,400; 1% = £54
  it("passes at exactly +1% (5454)", () => expect(rule(booking({ totalDeclaredValue: 5454 }), "R-02").status).toBe("pass"));
  it("passes at exactly −1% (5346)", () => expect(rule(booking({ totalDeclaredValue: 5346 }), "R-02").status).toBe("pass"));
  it("fails just above +1% (5454.01)", () => expect(rule(booking({ totalDeclaredValue: 5454.01 }), "R-02").status).toBe("fail"));
  it("fails just below −1% (5345.99)", () => expect(rule(booking({ totalDeclaredValue: 5345.99 }), "R-02").status).toBe("fail"));
  it("fails when declared value is blank", () => expect(rule(booking({ totalDeclaredValue: null }), "R-02").status).toBe("fail"));
  it("fails when an item price is missing", () => expect(rule(booking({}, [item({ unitPrice: null })]), "R-02").status).toBe("fail"));
  it("sums multiple items", () => {
    const b = booking({ cartons: 100, totalDeclaredValue: 5400 + 120 * 2.5 }, [item(), item({ lineNo: 2, sku: "SP-1", quantity: 120, unitPrice: 2.5, unitsPerCarton: 12, cartons: 10, unitWeightKg: 0.1 })]);
    expect(rule(b, "R-02").status).toBe("pass");
  });
  it("shows actual vs expected and a fix", () => {
    const f = rule(booking({ totalDeclaredValue: 6000 }), "R-02").findings[0];
    expect(f.actual).toBe("£6,000");
    expect(f.expected).toContain("£5,400");
    expect(f.fix).toContain("£5,400");
  });
});

describe("R-03 units per carton × cartons = quantity", () => {
  it("fails when packed units differ", () => {
    const c = rule(booking({ cartons: 85 }, [item({ cartons: 85 })]), "R-03");
    expect(c.status).toBe("fail");
    expect(c.findings[0].fix).toContain("90");
  });
  it("fails when a value is missing", () => expect(rule(booking({}, [item({ unitsPerCarton: null })]), "R-03").status).toBe("fail"));
  it("explains non-divisible quantities", () => {
    const f = rule(booking({}, [item({ quantity: 1085 })]), "R-03").findings[0];
    expect(f.fix).toMatch(/don't divide evenly/);
  });
});

describe("R-04 booking cartons = Σ item cartons", () => {
  it("fails on mismatch", () => expect(rule(booking({ cartons: 95 }), "R-04").status).toBe("fail"));
  it("fails when booking cartons blank", () => expect(rule(booking({ cartons: null }), "R-04").status).toBe("fail"));
  it("passes across multiple items", () => {
    const b = booking({ cartons: 100, totalDeclaredValue: 5700 }, [item(), item({ lineNo: 2, sku: "X", quantity: 120, unitPrice: 2.5, unitsPerCarton: 12, cartons: 10 })]);
    expect(rule(b, "R-04").status).toBe("pass");
  });
});

describe("R-05 weight per pallet vs chosen carrier", () => {
  it("passes at exactly the limit (Carrier A 500 kg, Cheapest)", () => {
    expect(rule(booking({ totalGrossWeightKg: 1500 }), "R-05").status).toBe("pass");
  });
  it("fails 1 kg over Carrier A's limit when priority is Cheapest", () => {
    const c = rule(booking({ totalGrossWeightKg: 1503 }), "R-05");
    expect(c.status).toBe("fail");
    expect(c.findings[0].expected).toContain("500");
    expect(c.findings[0].fix).toMatch(/4 pallets|Carrier B/);
  });
  it("passes when the seller selects Carrier B for the same weight", () => {
    const b = booking({ totalGrossWeightKg: 1800, selectedCarrierId: "Carrier B|Road standard|United Kingdom|Germany" });
    expect(rule(b, "R-05").status).toBe("pass");
  });
  it("fails for Fastest (Carrier C, 400 kg) at 450 kg/pallet", () => {
    expect(rule(booking({ sellerPriority: "Fastest", totalGrossWeightKg: 1350 }), "R-05").status).toBe("fail");
  });
  it("fails when over every carrier's limit", () => {
    const a = run(booking({ totalGrossWeightKg: 2400, sellerPriority: "Most reliable" }));
    expect(a.checks[4].status).toBe("fail");
    expect(a.carrier.recommended).toBeNull();
  });
  it("fails when pallets are missing or zero", () => {
    expect(rule(booking({ pallets: null }), "R-05").status).toBe("fail");
    expect(rule(booking({ pallets: 0 }), "R-05").status).toBe("fail");
  });
  it("fails when the route has no carrier", () => {
    expect(rule(booking({ destinationCountry: "Spain", destinationCity: "Madrid" }), "R-05").status).toBe("fail");
  });
});

describe("R-06 prohibited goods", () => {
  it("fails on lithium batteries", () => expect(rule(booking({}, [item({ description: "Lithium-ion battery pack 5000mAh" })]), "R-06").status).toBe("fail"));
  it("fails on aerosols", () => expect(rule(booking({}, [item({ description: "Deodorant aerosol 150ml" })]), "R-06").status).toBe("fail"));
  it("fails on flammable liquids", () => expect(rule(booking({}, [item({ description: "Flammable paint thinner 1L" })]), "R-06").status).toBe("fail"));
  it("flags ambiguous items for review, not pass", () => {
    const a = run(booking({}, [item({ description: "Wireless bluetooth speaker" })]));
    expect(a.checks[5].status).toBe("review");
    expect(a.status).toBe("review");
    expect(a.dispatchReady).toBe(false);
  });
  it("seller acknowledgement clears a review case", () => {
    const b = booking({ hazardAcknowledgements: ["1:wireless bluetooth speaker"] }, [item({ description: "Wireless bluetooth speaker" })]);
    expect(rule(b, "R-06").status).toBe("pass");
  });
  it("acknowledgement never clears a definite hit", () => {
    const b = booking({ hazardAcknowledgements: ["1:lithium battery"] }, [item({ description: "Lithium battery" })]);
    expect(rule(b, "R-06").status).toBe("fail");
  });
  it("AI flags escalate to review only", () => {
    const b = booking({ aiHazardFlags: { "1:ceramic coffee mug, 350 ml": { category: "uncertain", reason: "test" } } });
    expect(rule(b, "R-06").status).toBe("review");
  });
  it("does not flag negated descriptions", () => {
    expect(rule(booking({}, [item({ description: "Non-flammable cotton tote bag" })]), "R-06").status).toBe("pass");
  });
});

describe("R-07 gross ≥ net weight (Amber)", () => {
  it("passes when equal (boundary)", () => expect(rule(booking({ totalGrossWeightKg: 540 }), "R-07").status).toBe("pass"));
  it("fails when lighter than products", () => {
    const a = run(booking({ totalGrossWeightKg: 539 }));
    expect(a.checks[6].status).toBe("fail");
    expect(a.counts.amber).toBe(1);
    expect(a.counts.red).toBe(0);
    expect(a.status).toBe("warnings");
    expect(a.dispatchReady).toBe(true);
  });
});

describe("R-08 warehouse appointment (Amber)", () => {
  it("fails for warehouse without appointment", () => expect(rule(booking({ deliveryAppointmentBooked: false }), "R-08").status).toBe("fail"));
  it("fails for warehouse with blank appointment", () => expect(rule(booking({ deliveryAppointmentBooked: null }), "R-08").status).toBe("fail"));
  it("passes for business address without appointment", () => expect(rule(booking({ destinationType: "Business address", deliveryAppointmentBooked: false }), "R-08").status).toBe("pass"));
});

describe("R-09 country of origin (Amber)", () => {
  it("fails when blank", () => expect(rule(booking({}, [item({ countryOfOrigin: null })]), "R-09").status).toBe("fail"));
});

describe("R-10 ready date not in the past (Amber)", () => {
  it("passes for today (boundary)", () => expect(rule(booking({ readyToShipDate: TODAY }), "R-10").status).toBe("pass"));
  it("fails for yesterday", () => expect(rule(booking({ readyToShipDate: "2026-10-24" }), "R-10").status).toBe("fail"));
  it("fails when blank", () => expect(rule(booking({ readyToShipDate: null }), "R-10").status).toBe("fail"));
});

describe("data quality", () => {
  it("blocks on missing required fields even if rules pass", () => {
    const a = run(booking({ sellerName: null }));
    expect(a.counts.dataErrors).toBe(1);
    expect(a.status).toBe("blocked");
  });
  it("rejects non-GBP currency", () => {
    const a = run(booking({ currency: "INR" }));
    expect(a.dataIssues.some((i) => i.field === "Currency")).toBe(true);
  });
  it("flags a city/country mismatch", () => {
    expect(run(booking({ destinationCity: "Paris" })).dataIssues.some((i) => i.field === "Destination city")).toBe(true);
  });
  it("flags a booking with no items", () => {
    const a = run(booking({}, []));
    expect(a.dataIssues.some((i) => i.field === "Items")).toBe(true);
    expect(a.status).toBe("blocked");
  });
});
