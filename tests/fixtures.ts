import type { Booking, Item } from "@/lib/domain/types";

export const TODAY = "2026-10-25";

export function item(over: Partial<Item> = {}): Item {
  return {
    lineNo: 1,
    sku: "MUG-01",
    description: "Ceramic coffee mug, 350 ml",
    hsCode: "691200",
    quantity: 1080,
    unitPrice: 5,
    unitsPerCarton: 12,
    cartons: 90,
    unitWeightKg: 0.5,
    countryOfOrigin: "United Kingdom",
    ...over,
  };
}

/** The template's example booking (BK-001) — passes every rule. */
export function booking(over: Partial<Booking> = {}, items?: Item[]): Booking {
  return {
    bookingId: "BK-001",
    sellerName: "Northfield Goods",
    originCity: "Manchester",
    originCountry: "United Kingdom",
    destinationCity: "Frankfurt",
    destinationCountry: "Germany",
    destinationType: "Warehouse",
    readyToShipDate: "2026-11-05",
    sellerPriority: "Cheapest",
    pallets: 3,
    cartons: 90,
    totalDeclaredValue: 5400,
    currency: "GBP",
    totalGrossWeightKg: 620,
    deliveryAppointmentBooked: true,
    items: items ?? [item()],
    ...over,
  };
}
