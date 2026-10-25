import { describe, expect, it } from "vitest";
import { evaluateCarriers } from "@/lib/domain/carriers";
import { DEFAULT_RATE_CARD } from "@/lib/domain/validation";
import type { CarrierOption } from "@/lib/domain/types";
import { booking } from "./fixtures";

const ev = (over = {}, rc: CarrierOption[] = DEFAULT_RATE_CARD) => evaluateCarriers(booking(over), rc);

describe("rate card", () => {
  it("is the 9 rows from the workbook", () => {
    expect(DEFAULT_RATE_CARD).toHaveLength(9);
    const de = DEFAULT_RATE_CARD.filter((o) => o.destinationCountry === "Germany");
    expect(de.map((o) => [o.carrier, o.pricePerPallet, o.transitDays, o.onTimeRate, o.maxWeightPerPalletKg])).toEqual([
      ["Carrier A", 180, 5, 92, 500],
      ["Carrier B", 220, 3, 95, 750],
      ["Carrier C", 340, 2, 98, 400],
    ]);
  });
});

describe("priorities (UK → Germany, 3 pallets, 620 kg = 206.67 kg/pallet)", () => {
  it("Cheapest → Carrier A at 3 × £180 = £540", () => {
    const r = ev({ sellerPriority: "Cheapest" });
    expect(r.recommended?.evaluation.option.carrier).toBe("Carrier A");
    expect(r.recommended?.evaluation.cost).toBe(540);
  });
  it("Fastest → Carrier C (2 days)", () => expect(ev({ sellerPriority: "Fastest" }).recommended?.evaluation.option.carrier).toBe("Carrier C"));
  it("Most reliable → Carrier C (98%)", () => expect(ev({ sellerPriority: "Most reliable" }).recommended?.evaluation.option.carrier).toBe("Carrier C"));
  it("Balanced → Carrier B with documented scores", () => {
    const r = ev({ sellerPriority: "Balanced" });
    expect(r.recommended?.evaluation.option.carrier).toBe("Carrier B");
    const s = Object.fromEntries(r.evaluations.map((e) => [e.option.carrier, e.scores?.balanced]));
    // A: 0.4·1 + 0.3·0 + 0.3·0 = 0.40 ; B: 0.4·0.75 + 0.3·0.67 + 0.3·0.5 = 0.65 ; C: 0 + 0.3 + 0.3 = 0.60
    expect(s).toEqual({ "Carrier A": 0.4, "Carrier B": 0.65, "Carrier C": 0.6 });
  });
  it("France and Netherlands use their own rates", () => {
    expect(ev({ destinationCountry: "France", destinationCity: "Paris" }).recommended?.evaluation.cost).toBe(510);
    expect(ev({ destinationCountry: "Netherlands", destinationCity: "Amsterdam" }).recommended?.evaluation.cost).toBe(480);
  });
});

describe("weight limits", () => {
  it("excludes carriers over their pallet limit", () => {
    const r = ev({ totalGrossWeightKg: 1350, sellerPriority: "Fastest" }); // 450 kg/pallet
    expect(r.evaluations.find((e) => e.option.carrier === "Carrier C")?.eligible).toBe(false);
    expect(r.recommended?.evaluation.option.carrier).toBe("Carrier B");
    expect(r.preferredIgnoringWeight?.option.carrier).toBe("Carrier C");
  });
  it("handles no eligible carrier", () => {
    const r = ev({ totalGrossWeightKg: 3000 }); // 1000 kg/pallet
    expect(r.recommended).toBeNull();
    expect(r.explanation).toMatch(/No carrier is eligible/);
    expect(r.explanation).toMatch(/at least 4 pallets/);
  });
  it("handles missing priority without guessing", () => {
    const r = ev({ sellerPriority: null });
    expect(r.recommended).toBeNull();
    expect(r.picks.cheapest?.evaluation.option.carrier).toBe("Carrier A");
  });
});

describe("ties", () => {
  it("breaks a price tie by transit time and reports it", () => {
    const rc: CarrierOption[] = [
      { ...DEFAULT_RATE_CARD[0], id: "x", carrier: "Carrier X", pricePerPallet: 200, transitDays: 4 },
      { ...DEFAULT_RATE_CARD[0], id: "y", carrier: "Carrier Y", pricePerPallet: 200, transitDays: 3 },
    ];
    const r = ev({ sellerPriority: "Cheapest" }, rc);
    expect(r.recommended?.evaluation.option.carrier).toBe("Carrier Y");
    expect(r.recommended?.tiedWith).toEqual(["Carrier X (Road economy)"]);
  });
});
