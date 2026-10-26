import "server-only";
import { z } from "zod";
import { BOOKING_FIELDS, ITEM_FIELDS, type ChatOperations, type MissingField, type Suggestion } from "@/lib/domain/conversation";
import { displayDate } from "@/lib/domain/dates";
import type { Booking } from "@/lib/domain/types";
import { completeJSON, type ChatMessage } from "./llm";

const EDITABLE_BOOKING = BOOKING_FIELDS.filter((f) => f !== "bookingId");

const fieldChange = (fields: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["field", "value", "mode"],
  properties: {
    field: { type: "string", enum: fields },
    value: { type: "string", description: "Plain value as the seller stated it, no units. Use \"\" with mode clear." },
    mode: { type: "string", enum: ["set", "add", "clear"] },
  },
});

export const EXTRACTION_SCHEMA = {
  name: "booking_update",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["booking_changes", "item_changes", "accept_suggestions", "declined", "clarifications", "answer"],
    properties: {
      booking_changes: { type: "array", items: fieldChange(EDITABLE_BOOKING) },
      item_changes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action", "item_ref", "fields"],
          properties: {
            action: { type: "string", enum: ["add", "update", "remove"] },
            item_ref: { type: ["integer", "null"], description: "Line number of an existing item for update/remove; null for add." },
            fields: { type: "array", items: fieldChange(ITEM_FIELDS) },
          },
        },
      },
      accept_suggestions: { type: "array", items: { type: "string" } },
      declined: { type: "array", items: { type: "string" } },
      clarifications: { type: "array", items: { type: "string" } },
      answer: { type: ["string", "null"] },
    },
  },
};

const Change = z.object({ field: z.string(), value: z.string().nullable().catch(""), mode: z.enum(["set", "add", "clear"]).catch("set") });
const Extraction = z.object({
  booking_changes: z.array(Change).catch([]),
  item_changes: z
    .array(z.object({ action: z.enum(["add", "update", "remove"]), item_ref: z.number().int().nullable().catch(null), fields: z.array(Change).catch([]) }))
    .catch([]),
  accept_suggestions: z.array(z.string()).catch([]),
  declined: z.array(z.string()).catch([]),
  clarifications: z.array(z.string().max(400)).max(4).catch([]),
  answer: z.string().max(800).nullable().catch(null),
});

export interface ExtractionResult {
  ops: ChatOperations;
  clarifications: string[];
  answer: string | null;
}

function systemPrompt(today: string): string {
  return `You extract shipment booking details for SaathiFly, a pre-flight checker for sellers shipping pallets by road from the United Kingdom to Germany, France or the Netherlands.

Today is ${displayDate(today)} (DD-MM-YYYY, UK time).

Return JSON only, matching the schema. Rules:
1. Only record facts the seller actually stated in their LATEST message (use earlier messages only for context). Never invent, estimate or fill in values the seller did not give. Do not touch fields the seller did not mention.
2. If a value is vague or uncertain ("about 600 kg", "a few pallets", "sometime next month", "around £5k"), do NOT record it. Add a short clarification question instead.
3. Values are plain strings without units or symbols: "1080", "5.5", "620". Dates as DD-MM-YYYY; convert clear relative dates ("next Friday", "5th November") using today's date. Yes/No fields as "Yes" or "No".
4. Relative edits use mode "add": "add a pallet" → {field:"pallets", value:"1", mode:"add"}; "two fewer cartons" → value "-2". Absolute edits ("make it 4 pallets") use mode "set".
5. Money is GBP. If the seller uses another currency (₹, INR, USD, EUR), do not convert: set currency to that ISO code and ask them to give GBP values.
6. destinationType is "Warehouse" (fulfilment/distribution centre, Amazon FC) or "Business address" (shop, office, store). sellerPriority is one of Cheapest, Fastest, Most reliable, Balanced.
7. Products go in item_changes. New product → action "add" with every field they gave. Changes to an existing product → action "update" with item_ref = its line number from CURRENT ITEMS. Removing → "remove".
   Item fields: sku, description (keep the seller's wording), hsCode (digits as given), quantity (total units), unitPrice (GBP per unit), unitsPerCarton, cartons (cartons of this product), unitWeightKg (kg per unit), countryOfOrigin (where it was made, not where it ships from).
   Booking "cartons" is the total cartons on the booking — only set it if the seller states a total.
8. "Made in India" → countryOfOrigin "India". Collection city → originCity; delivery city → destinationCity.
9. If the seller agrees to a PENDING SUGGESTION ("yes", "use that", "correct"), put its id in accept_suggestions. If they reject it, leave it out.
10. If the seller says they don't know / don't have a field that was asked (e.g. HS code), put that field's key from STILL MISSING into declined.
11. Do not judge whether goods are dangerous; just copy the description.
12. answer: if the seller asked a question, answer it in at most two plain sentences (never claim customs compliance or guaranteed delivery); otherwise null.`;
}

function context(b: Booking, suggestions: Suggestion[], missing: MissingField[]): string {
  const { items, ...rest } = b;
  const booking = Object.fromEntries(
    Object.entries(rest).filter(([k]) => !["sourceIssues", "aiHazardFlags", "hazardAcknowledgements", "selectedCarrierId", "sourceRow"].includes(k)),
  );
  return [
    `CURRENT BOOKING: ${JSON.stringify(booking)}`,
    `CURRENT ITEMS: ${items.length ? JSON.stringify(items.map((it) => ({ ...it, sourceRow: undefined }))) : "none yet"}`,
    `PENDING SUGGESTIONS: ${suggestions.length ? suggestions.map((s) => `${s.id} = ${s.value} (${s.text})`).join("; ") : "none"}`,
    `STILL MISSING: ${missing.length ? missing.slice(0, 12).map((m) => `${m.key} (${m.label})`).join("; ") : "nothing"}`,
  ].join("\n");
}

export async function extractUpdates(args: {
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  booking: Booking;
  suggestions: Suggestion[];
  missing: MissingField[];
  today: string;
}): Promise<ExtractionResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(args.today) },
    ...args.history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
    { role: "user", content: `${context(args.booking, args.suggestions, args.missing)}\n\nSELLER'S LATEST MESSAGE:\n${args.message}` },
  ];
  const raw = await completeJSON<unknown>(messages, EXTRACTION_SCHEMA);
  const parsed = Extraction.parse(raw);
  return {
    ops: {
      bookingChanges: parsed.booking_changes.map((c) => ({ field: c.field, value: c.value, mode: c.mode })),
      itemChanges: parsed.item_changes.map((c) => ({ action: c.action, itemRef: c.item_ref, fields: c.fields.map((f) => ({ field: f.field, value: f.value, mode: f.mode })) })),
      acceptSuggestions: parsed.accept_suggestions,
      declined: parsed.declined,
    },
    clarifications: parsed.clarifications,
    answer: parsed.answer,
  };
}
