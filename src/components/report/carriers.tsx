"use client";
import clsx from "clsx";
import { Clock, PoundSterling, Target, Truck } from "lucide-react";
import { BALANCED_WEIGHTS } from "@/lib/domain/carriers";
import { formatGBP } from "@/lib/domain/normalize";
import type { CarrierEvaluation, CarrierResult } from "@/lib/domain/types";

function pickLabels(r: CarrierResult, e: CarrierEvaluation): string[] {
  const out: string[] = [];
  if (r.picks.cheapest?.evaluation.option.id === e.option.id) out.push("Cheapest");
  if (r.picks.fastest?.evaluation.option.id === e.option.id) out.push("Fastest");
  if (r.picks.mostReliable?.evaluation.option.id === e.option.id) out.push("Most reliable");
  if (r.picks.balanced?.evaluation.option.id === e.option.id) out.push("Balanced");
  return out;
}

export function CarrierPanel({ result, pallets, onSelect, selectedId }: { result: CarrierResult; pallets: number | null; onSelect?: (id: string | null) => void; selectedId?: string | null }) {
  const rec = result.recommended?.evaluation;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-paper/60 p-4">
        <div className="label mb-1 flex items-center gap-2 text-ink-3">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Recommendation{result.priority ? ` · priority: ${result.priority}` : ""}
        </div>
        {rec ? (
          <div className="display text-xl font-bold text-ink">
            {rec.option.carrier} <span className="font-semibold text-ink-3">· {rec.option.service}</span> <span className="text-teal">{formatGBP(rec.cost)}</span>
          </div>
        ) : (
          <div className="display text-lg font-semibold text-ink">No carrier recommended yet</div>
        )}
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{result.explanation}</p>
        {result.tradeoffs.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[13px] text-ink-2">
            {result.tradeoffs.map((t) => (
              <li key={t}>— {t}</li>
            ))}
          </ul>
        )}
      </div>

      {result.evaluations.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {result.evaluations.map((e) => {
            const isRec = rec?.option.id === e.option.id;
            const isChosen = result.chosen?.option.id === e.option.id;
            const isSelected = selectedId === e.option.id;
            const labels = pickLabels(result, e);
            return (
              <div
                key={e.option.id}
                className={clsx("flex flex-col rounded-xl border bg-card p-4", isRec ? "border-teal" : "border-line", !e.eligible && "opacity-70")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="display text-base font-bold text-ink">{e.option.carrier}</div>
                    <div className="text-xs text-ink-3">{e.option.service}</div>
                  </div>
                  {isRec && <span className="label text-teal">Recommended</span>}
                </div>
                <div className="mt-3 text-2xl font-semibold text-ink">{formatGBP(e.cost)}</div>
                <div className="text-xs text-ink-3">
                  {pallets ?? "?"} pallet{pallets === 1 ? "" : "s"} × {formatGBP(e.option.pricePerPallet)}
                </div>
                <dl className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                  <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-ink-3" /> {e.option.transitDays} days transit</div>
                  <div className="flex items-center gap-2"><Target className="h-3.5 w-3.5 text-ink-3" /> {e.option.onTimeRate}% on-time (historical)</div>
                  <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-ink-3" /> max {e.option.maxWeightPerPalletKg} kg / pallet</div>
                  {e.scores && <div className="flex items-center gap-2"><PoundSterling className="h-3.5 w-3.5 text-ink-3" /> balanced score {e.scores.balanced.toFixed(2)}</div>}
                </dl>
                {labels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {labels.map((l) => (
                      <span key={l} className="label rounded-full border border-line px-2 py-0.5 text-ink-2">
                        {l}
                      </span>
                    ))}
                  </div>
                )}
                {!e.eligible && <p className="mt-3 text-xs text-red">Not eligible: {e.ineligibleReason}</p>}
                {onSelect && (
                  <div className="mt-auto pt-4">
                    {isSelected ? (
                      <button className="label w-full rounded-full border border-ink bg-ink px-3 py-1.5 text-paper" onClick={() => onSelect(null)}>
                        Selected · use priority pick
                      </button>
                    ) : (
                      <button
                        className="label w-full rounded-full border border-line-2 px-3 py-1.5 text-ink hover:border-ink"
                        onClick={() => onSelect(e.option.id)}
                      >
                        {isChosen && !selectedId ? "Priority pick" : "Select this carrier"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {result.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-3">
          {result.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      <details className="text-xs text-ink-3">
        <summary className="cursor-pointer select-none">How the Balanced score works</summary>
        <p className="mt-1.5 leading-relaxed">
          Among eligible carriers, each dimension is scaled 0–1 (best = 1): cost and transit by (worst − value) ÷ (worst − best), on-time rate by (value − worst) ÷ (best − worst).
          Balanced = {BALANCED_WEIGHTS.cost} × cost + {BALANCED_WEIGHTS.speed} × speed + {BALANCED_WEIGHTS.reliability} × reliability. Cost gets the biggest weight because on this
          rate card the faster services are also the more reliable ones, so weighting speed and reliability equally to cost would count that premium twice. Ties go to the lower
          price, then shorter transit, then higher on-time rate.
        </p>
      </details>
    </div>
  );
}
