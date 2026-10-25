import "server-only";
import { z } from "zod";
import { DESTINATION_TYPES, SELLER_PRIORITIES, type Booking } from "@/lib/domain/types";

const str = (max = 300) => z.string().max(max).nullable();
const num = z.number().finite().nonnegative().max(1e9).nullable();

const ItemSchema = z.object({
  lineNo: z.number().int().min(1).max(1000),
  sku: str(100),
  description: str(500),
  hsCode: str(40),
  quantity: num,
  unitPrice: num,
  unitsPerCarton: num,
  cartons: num,
  unitWeightKg: num,
  countryOfOrigin: str(100),
  sourceRow: z.number().int().optional(),
});

const DataIssueSchema = z.object({
  scope: z.enum(["booking", "item"]),
  field: z.string().max(100),
  lineNo: z.number().int().optional(),
  sku: z.string().max(100).nullable().optional(),
  severity: z.enum(["error", "warning"]),
  message: z.string().max(500),
  raw: z.string().max(300).optional(),
});

const CarrierOptionSchema = z.object({
  id: z.string().max(300),
  carrier: z.string().max(100),
  service: z.string().max(100),
  originCountry: z.string().max(100),
  destinationCountry: z.string().max(100),
  pricePerPallet: z.number().finite().nonnegative(),
  currency: z.string().max(10),
  transitDays: z.number().finite().nonnegative(),
  onTimeRate: z.number().finite().min(0).max(100),
  maxWeightPerPalletKg: z.number().finite().positive(),
});

export const BookingSchema = z.object({
  bookingId: str(60),
  sellerName: str(200),
  originCity: str(100),
  originCountry: str(100),
  destinationCity: str(100),
  destinationCountry: str(100),
  destinationType: z.enum(DESTINATION_TYPES).nullable(),
  readyToShipDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sellerPriority: z.enum(SELLER_PRIORITIES).nullable(),
  pallets: num,
  cartons: num,
  totalDeclaredValue: num,
  currency: str(10),
  totalGrossWeightKg: num,
  deliveryAppointmentBooked: z.boolean().nullable(),
  items: z.array(ItemSchema).max(200),
  selectedCarrierId: z.string().max(300).nullable().optional(),
  hazardAcknowledgements: z.array(z.string().max(600)).max(200).optional(),
  aiHazardFlags: z
    .record(z.string().max(600), z.object({ category: z.enum(["lithium battery", "aerosol", "flammable liquid", "uncertain"]), reason: z.string().max(400) }))
    .optional(),
  sourceIssues: z.array(DataIssueSchema).max(500).optional(),
  sourceRow: z.number().int().optional(),
  customRateCard: z.array(CarrierOptionSchema).max(100).optional(),
});

export function parseBooking(input: unknown): { ok: true; booking: Booking } | { ok: false; error: string } {
  const r = BookingSchema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `Invalid booking data at ${first.path.join(".") || "root"}: ${first.message}` };
  }
  return { ok: true, booking: r.data as Booking };
}

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) })).max(40).default([]),
  booking: BookingSchema,
  declined: z.array(z.string().max(100)).max(200).default([]),
  /** Suggestion ids that were shown to the seller in the last assistant message. Only these can be accepted. */
  offered: z.array(z.string().max(100)).max(50).default([]),
});

export const EmailRequestSchema = z.object({
  to: z.string().trim().email().max(254),
  kind: z.enum(["summary", "report"]).default("summary"),
});
