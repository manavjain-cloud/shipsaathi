import { describe, expect, it } from "vitest";
import { applyOperations, computeSuggestions, emptyBooking, findMissing, isComplete, nextQuestions } from "@/lib/domain/conversation";
import { assessBooking } from "@/lib/domain/validation";
import { booking, TODAY } from "./fixtures";

describe("applyOperations", () => {
  it("parses model values with the same parsers as Excel and infers countries from closed lists", () => {
    const r = applyOperations(emptyBooking("CH-1"), {
      bookingChanges: [
        { field: "originCity", value: "manchester" },
        { field: "destinationCity", value: "Berlin" },
        { field: "pallets", value: "3" },
        { field: "readyToShipDate", value: "05-11-2026" },
        { field: "sellerPriority", value: "cheapest" },
      ],
    });
    expect(r.booking.originCity).toBe("Manchester");
    expect(r.booking.originCountry).toBe("United Kingdom");
    expect(r.booking.destinationCountry).toBe("Germany");
    expect(r.booking.readyToShipDate).toBe("2026-11-05");
    expect(r.booking.sellerPriority).toBe("Cheapest");
  });

  it("rejects unreadable values instead of guessing", () => {
    const r = applyOperations(emptyBooking(), { bookingChanges: [{ field: "pallets", value: "a few" }] });
    expect(r.booking.pallets).toBeNull();
    expect(r.problems[0]).toMatch(/not a number/);
  });

  it("handles 'add a pallet' as a relative change and re-runs checks", () => {
    const before = booking({ totalGrossWeightKg: 1600 }); // 533 kg/pallet → Carrier A (500) fails R-05
    expect(assessBooking(before, { today: TODAY }).checks[4].status).toBe("fail");
    const r = applyOperations(before, { bookingChanges: [{ field: "pallets", value: "1", mode: "add" }] });
    expect(r.booking.pallets).toBe(4);
    expect(r.changes).toContain("Pallets: 3 → 4");
    const after = assessBooking(r.booking, { today: TODAY });
    expect(after.checks[4].status).toBe("pass"); // 400 kg/pallet
    expect(after.carrier.recommended?.evaluation.cost).toBe(720); // 4 × £180
  });

  it("adds, updates and removes items", () => {
    let b = booking();
    b = applyOperations(b, { itemChanges: [{ action: "add", fields: [{ field: "description", value: "Tea towel" }, { field: "quantity", value: "100" }] }] }).booking;
    expect(b.items).toHaveLength(2);
    b = applyOperations(b, { itemChanges: [{ action: "update", itemRef: 2, fields: [{ field: "quantity", value: "120" }] }] }).booking;
    expect(b.items[1].quantity).toBe(120);
    b = applyOperations(b, { itemChanges: [{ action: "remove", itemRef: 1 }] }).booking;
    expect(b.items).toHaveLength(1);
    expect(b.items[0].lineNo).toBe(1);
    expect(b.items[0].description).toBe("Tea towel");
  });

  it("only accepts suggestions that exist", () => {
    const b = booking({ cartons: null, totalDeclaredValue: null });
    const sugg = computeSuggestions(b);
    expect(sugg.map((s) => s.id).sort()).toEqual(["booking:cartons", "booking:totalDeclaredValue"]);
    const r = applyOperations(b, { acceptSuggestions: ["booking:totalDeclaredValue", "made-up"] }, sugg);
    expect(r.booking.totalDeclaredValue).toBe(5400);
    expect(r.booking.cartons).toBeNull();
  });
});

describe("missing fields", () => {
  it("asks for the route first, then items", () => {
    const m = findMissing(emptyBooking());
    expect(nextQuestions(m).map((q) => q.key)).toEqual(["booking:originCity", "booking:originCountry", "booking:destinationCity"]);
  });
  it("a complete booking has nothing missing", () => expect(isComplete(booking())).toBe(true));
  it("declined optional HS code stops being asked", () => {
    const b = booking({}, [{ ...booking().items[0], hsCode: null }]);
    expect(findMissing(b).some((m) => m.key === "item:1:hsCode")).toBe(true);
    expect(findMissing(b, ["item:1:hsCode"]).some((m) => m.key === "item:1:hsCode")).toBe(false);
    expect(isComplete(b)).toBe(true); // HS code is optional in the template; R-01 still flags it
  });
});
