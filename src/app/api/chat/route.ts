import { NextResponse } from "next/server";
import { applyOperations, computeSuggestions, findMissing, isComplete, nextQuestions, progress } from "@/lib/domain/conversation";
import { todayISO } from "@/lib/domain/dates";
import { formatGBP } from "@/lib/domain/normalize";
import { assess, STATUS_LABEL } from "@/lib/domain/validation";
import { extractUpdates } from "@/lib/server/extract";
import { withAiHazardFlags } from "@/lib/server/hazard-ai";
import { BadJson, jsonError, rateLimit, readJson, RequestTooLarge, tooMany } from "@/lib/server/http";
import { LlmError, llmConfigured } from "@/lib/server/llm";
import { ChatRequestSchema } from "@/lib/server/schemas";
import type { Booking } from "@/lib/domain/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!rateLimit(req, "chat", 30, 60_000)) return tooMany();
  let body: unknown;
  try {
    body = await readJson(req, 400_000);
  } catch (e) {
    if (e instanceof RequestTooLarge) return jsonError("Request too large.", 413);
    if (e instanceof BadJson) return jsonError("Invalid JSON.");
    throw e;
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid chat request.");
  const { message, history, declined, offered } = parsed.data;
  const current = parsed.data.booking as Booking;

  if (!llmConfigured()) {
    return jsonError("The AI assistant isn't configured on this deployment. You can still fill in the booking with the form on the right.", 503);
  }

  const today = todayISO();
  // Only suggestions the seller has actually been shown can be accepted — never silently apply the rest.
  const suggestions = computeSuggestions(current).filter((s) => offered.includes(s.id));
  const missingBefore = findMissing(current, declined);

  let extraction;
  try {
    extraction = await extractUpdates({ history, message, booking: current, suggestions, missing: missingBefore, today });
  } catch (e) {
    const msg = e instanceof LlmError ? e.message : "The AI assistant had a problem.";
    return jsonError(`${msg} Your booking is unchanged — try again, or edit the fields directly.`, 502);
  }

  const applied = applyOperations(current, extraction.ops, suggestions);
  const declinedAll = [...new Set([...declined, ...applied.declined])];
  let booking = applied.booking;

  // AI second opinion on R-06 when item descriptions changed (can only escalate to review).
  const descKey = (b: Booking) => b.items.map((i) => i.description ?? "").join("|");
  let aiChecked = false;
  if (booking.items.length && descKey(booking) !== descKey(current)) {
    const r = await withAiHazardFlags(booking);
    booking = r.booking;
    aiChecked = r.aiChecked;
  } else if (current.aiHazardFlags) {
    booking.aiHazardFlags = current.aiHazardFlags;
  }

  const missing = findMissing(booking, declinedAll);
  const complete = isComplete(booking, declinedAll);
  const assessment = assess(booking, today);

  // Reply is assembled deterministically from what actually changed — the model never writes booking facts into the reply.
  const parts: string[] = [];
  if (extraction.answer) parts.push(extraction.answer);
  if (applied.changes.length) parts.push(`Updated:\n${applied.changes.map((c) => `• ${c}`).join("\n")}`);
  if (applied.problems.length) parts.push(applied.problems.map((p) => `⚠ ${p}`).join("\n"));
  if (extraction.clarifications.length) parts.push(extraction.clarifications.join("\n"));

  const questions = nextQuestions(missing.filter((m) => !m.optional || !declinedAll.includes(m.key)));
  let nextOffered: string[] = [];
  if (!complete && !extraction.clarifications.length) {
    parts.push(questions.length === 1 ? questions[0].question : `Next, I need:\n${questions.map((q) => `• ${q.question}`).join("\n")}`);
    nextOffered = questions.map((q) => q.suggestionId).filter((x): x is string => !!x);
  } else if (complete) {
    const rec = assessment.carrier.recommended?.evaluation;
    const optionalLeft = missing.filter((m) => m.optional && !declinedAll.includes(m.key));
    parts.push(
      `That's everything I need. Checks re-run: ${STATUS_LABEL[assessment.status]} — ${assessment.counts.red} Red, ${assessment.counts.amber} Amber${assessment.counts.review ? `, ${assessment.counts.review} to review` : ""}.` +
        (rec ? ` Recommended carrier: ${rec.option.carrier} (${rec.option.service}) at ${formatGBP(rec.cost)}.` : " No carrier is eligible yet.") +
        (optionalLeft.length ? ` Still blank: ${optionalLeft.map((m) => m.label).join(", ")}.` : "") +
        (() => {
          const top = assessment.checks.flatMap((c) => c.findings).filter((f) => f.status === "fail" || f.status === "review").slice(0, 3);
          return top.length ? `\n\n${top.map((f) => `• ${f.ruleId} ${f.status === "review" ? "Review" : f.severity}: ${f.explanation} Fix: ${f.fix}`).join("\n")}\n\n` : "";
        })() +
        " Review the summary, fix anything flagged, then confirm. You can change any detail here at any time.",
    );
  }
  if (!parts.length) parts.push("I didn't catch any shipment details in that. Could you rephrase?");

  return NextResponse.json({
    booking,
    reply: parts.join("\n\n"),
    changes: applied.changes,
    problems: applied.problems,
    declined: declinedAll,
    missing,
    complete,
    progress: progress(booking),
    offered: nextOffered,
    aiChecked,
    assessment,
  });
}
