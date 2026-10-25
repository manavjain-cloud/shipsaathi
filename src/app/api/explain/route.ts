import { NextResponse } from "next/server";
import { z } from "zod";
import { todayISO } from "@/lib/domain/dates";
import { assess } from "@/lib/domain/validation";
import { BadJson, jsonError, rateLimit, readJson, RequestTooLarge, tooMany } from "@/lib/server/http";
import { completeJSON, LlmError, llmConfigured } from "@/lib/server/llm";
import { parseBooking } from "@/lib/server/schemas";

const SCHEMA = {
  name: "explanation",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "next_steps"],
    properties: { summary: { type: "string" }, next_steps: { type: "array", items: { type: "string" } } },
  },
};
const Out = z.object({ summary: z.string().max(1500), next_steps: z.array(z.string().max(300)).max(6) });

/** Plain-English explanation of an assessment. Gemini only rephrases the computed facts it is given. */
export async function POST(req: Request) {
  if (!rateLimit(req, "explain", 15, 60_000)) return tooMany();
  if (!llmConfigured()) return jsonError("The AI assistant isn't configured on this deployment.", 503);
  let body: { booking?: unknown };
  try {
    body = (await readJson(req, 600_000)) as typeof body;
  } catch (e) {
    if (e instanceof RequestTooLarge) return jsonError("Request too large.", 413);
    if (e instanceof BadJson) return jsonError("Invalid JSON.");
    throw e;
  }
  const p = parseBooking(body?.booking);
  if (!p.ok) return jsonError(p.error);
  const a = assess(p.booking, todayISO());
  const facts = {
    status: a.status,
    dispatchReady: a.dispatchReady,
    counts: a.counts,
    findings: a.checks.flatMap((c) => c.findings.map((f) => ({ rule: c.ruleId, severity: f.severity, status: f.status, item: f.lineNo, actual: f.actual, expected: f.expected, fix: f.fix }))),
    dataIssues: a.dataIssues.map((i) => i.message),
    carrier: { explanation: a.carrier.explanation, tradeoffs: a.carrier.tradeoffs, notes: a.carrier.notes },
  };
  try {
    const raw = await completeJSON<unknown>(
      [
        {
          role: "system",
          content:
            "You explain shipment pre-flight check results to a small exporter in plain, friendly English (Indian English is fine). Use ONLY the facts in the JSON. " +
            "Do not add numbers, rules, rates or claims that are not in it. Never say the shipment is customs-compliant or that delivery is guaranteed. This is a proposed booking, not a carrier booking. " +
            "summary: 3-5 short sentences, most serious problem first. next_steps: up to 5 concrete actions in order.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
      SCHEMA,
      { temperature: 0.2 },
    );
    const out = Out.parse(raw);
    return NextResponse.json({ summary: out.summary, nextSteps: out.next_steps });
  } catch (e) {
    return jsonError(e instanceof LlmError ? e.message : "Couldn't generate an explanation.", 502);
  }
}
