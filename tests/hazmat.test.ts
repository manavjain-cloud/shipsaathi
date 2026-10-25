import { describe, expect, it } from "vitest";
import { screenDescription } from "@/lib/domain/hazmat";

const level = (d: string) => screenDescription(d).level;

describe("prohibited (Red)", () => {
  it.each([
    "Lithium-ion battery pack",
    "Li-ion 18650 cells",
    "LiPo battery 3S",
    "USB power bank 10000mAh",
    "Disposable vape pens",
    "Hair spray aerosol 300ml",
    "Spray paint cans, assorted",
    "Flammable liquid adhesive remover",
    "Inflammable solvent",
    "Acetone nail polish remover",
    "Lighter fluid 125ml",
    "Petrol additive",
    "Nail polish set",
  ])("%s", (d) => expect(level(d)).toBe("prohibited"));
});

describe("ambiguous → human review", () => {
  it.each([
    "AA batteries",
    "Wireless bluetooth earbuds",
    "Laptop 14 inch",
    "Eau de parfum 50ml",
    "Acrylic paint set",
    "Trigger spray bottle",
    "Wood glue",
    "Gin 70cl",
    "Essential oil diffuser blend",
    "",
  ])("%s", (d) => expect(level(d)).toBe("review"));
});

describe("false positives avoided (clear)", () => {
  it.each([
    "Ceramic coffee mug, 350 ml",
    "Non-flammable cotton tote bag",
    "Wall clock (batteries not included)",
    "Battery-free LED tea lights",
    "Laptop sleeve, neoprene",
    "Phone case, silicone",
    "Paint brushes, set of 5",
    "Water-based acrylic paint",
    "Headphones stand, wooden",
    "Empty perfume bottles, glass",
    "Stainless steel water bottle",
    "Oil painting on canvas",
  ])("%s", (d) => expect(level(d)).toBe("clear"));
});
