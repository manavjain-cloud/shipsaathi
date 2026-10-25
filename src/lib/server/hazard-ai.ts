import "server-only";
import { z } from "zod";
import { hazardKey } from "@/lib/domain/hazmat";
import type { AiHazardFlag, Booking } from "@/lib/domain/types";
import { completeJSON, llmConfigured } from "./llm";

/**
 * Second opinion on R-06 for product descriptions. The result can only ESCALATE an item to
 * human review — it never clears a keyword hit and never produces a Red on its own.
 */

const SCHEMA = {
  name: "hazard_screen",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "category", "reason"],
          properties: {
            index: { type: "integer" },
            category: { type: "string", enum: ["none", "lithium battery", "aerosol", "flammable liquid", "uncertain"] },
            reason: { type: "string" },
          },
        },
      },
    },
  },
};

const Result = z.object({
  results: z.array(z.object({ index: z.number().int(), category: z.enum(["none", "lithium battery", "aerosol", "flammable liquid", "uncertain"]), reason: z.string().max(300) })),
});

const cache = new Map<string, AiHazardFlag | null>();

export async function screenWithAi(descriptions: string[]): Promise<Map<string, AiHazardFlag | null>> {
  const out = new Map<string, AiHazardFlag | null>();
  const todo = [...new Set(descriptions.map((d) => d.trim()).filter(Boolean))].filter((d) => {
    const k = d.toLowerCase();
    if (cache.has(k)) {
      out.set(k, cache.get(k)!);
      return false;
    }
    return true;
  });
  if (!todo.length || !llmConfigured()) return out;

  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const raw = await completeJSON<unknown>(
      [
        {
          role: "system",
          content:
            "You screen product descriptions for a road-freight service that refuses three things: lithium batteries (including devices with built-in lithium batteries and power banks), aerosols, and flammable liquids. " +
            'For each description return category "none" when the product clearly contains none of these, the matching category when it clearly is or contains one, or "uncertain" when it might. ' +
            "Judge only from the words given; do not assume details that aren't there. Keep reasons under 20 words.",
        },
        { role: "user", content: batch.map((d, j) => `${j}: ${d}`).join("\n") },
      ],
      SCHEMA,
      { timeoutMs: 20000 },
    );
    const parsed = Result.safeParse(raw);
    if (!parsed.success) continue;
    for (const r of parsed.data.results) {
      const d = batch[r.index];
      if (!d) continue;
      const flag: AiHazardFlag | null = r.category === "none" ? null : { category: r.category, reason: r.reason };
      cache.set(d.toLowerCase(), flag);
      out.set(d.toLowerCase(), flag);
    }
  }
  return out;
}

/** Adds AI flags to a booking (returns a copy). Fails soft: on any AI error the booking is returned unchanged. */
export async function withAiHazardFlags(b: Booking): Promise<{ booking: Booking; aiChecked: boolean }> {
  try {
    const res = await screenWithAi(b.items.map((i) => i.description ?? ""));
    if (!res.size) return { booking: b, aiChecked: false };
    const flags: Record<string, AiHazardFlag> = {};
    for (const it of b.items) {
      const f = res.get((it.description ?? "").trim().toLowerCase());
      if (f) flags[hazardKey(it.lineNo, it.description)] = f;
    }
    return { booking: { ...b, aiHazardFlags: flags }, aiChecked: true };
  } catch {
    return { booking: b, aiChecked: false };
  }
}

export async function withAiHazardFlagsMany(bookings: Booking[]): Promise<{ bookings: Booking[]; aiChecked: boolean }> {
  try {
    const res = await screenWithAi(bookings.flatMap((b) => b.items.map((i) => i.description ?? "")));
    if (!res.size) return { bookings, aiChecked: false };
    return {
      aiChecked: true,
      bookings: bookings.map((b) => {
        const flags: Record<string, AiHazardFlag> = {};
        for (const it of b.items) {
          const f = res.get((it.description ?? "").trim().toLowerCase());
          if (f) flags[hazardKey(it.lineNo, it.description)] = f;
        }
        return { ...b, aiHazardFlags: flags };
      }),
    };
  } catch {
    return { bookings, aiChecked: false };
  }
}
