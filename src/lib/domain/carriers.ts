import type { Booking, CarrierEvaluation, CarrierOption, CarrierPick, CarrierResult, SellerPriority } from "./types";
import { formatGBP, round2 } from "./normalize";

/**
 * Balanced score (documented, deterministic):
 *   For each eligible option, normalise each dimension to 0..1 across the eligible set
 *   (min–max; 1 = best, all options get 1 when they are equal on that dimension):
 *     cost        = (maxCost − cost) / (maxCost − minCost)
 *     speed       = (maxDays − days) / (maxDays − minDays)
 *     reliability = (onTime − minOnTime) / (maxOnTime − minOnTime)
 *   balanced = 0.40·cost + 0.30·speed + 0.30·reliability
 * Cost gets the largest weight because faster services on this rate card are also the more
 * reliable ones; weighting speed and reliability 30% each stops that "premium" side being counted twice.
 * Ties → lower cost, then shorter transit, then higher on-time rate, then carrier name.
 */
export const BALANCED_WEIGHTS = { cost: 0.4, speed: 0.3, reliability: 0.3 } as const;

const byName = (a: CarrierEvaluation, b: CarrierEvaluation) =>
  `${a.option.carrier} ${a.option.service}`.localeCompare(`${b.option.carrier} ${b.option.service}`);
const cost = (e: CarrierEvaluation) => e.cost ?? e.option.pricePerPallet;

type Cmp = (a: CarrierEvaluation, b: CarrierEvaluation) => number;

const COMPARATORS: Record<"cheapest" | "fastest" | "mostReliable" | "balanced", Cmp[]> = {
  cheapest: [(a, b) => cost(a) - cost(b), (a, b) => a.option.transitDays - b.option.transitDays, (a, b) => b.option.onTimeRate - a.option.onTimeRate],
  fastest: [(a, b) => a.option.transitDays - b.option.transitDays, (a, b) => cost(a) - cost(b), (a, b) => b.option.onTimeRate - a.option.onTimeRate],
  mostReliable: [(a, b) => b.option.onTimeRate - a.option.onTimeRate, (a, b) => cost(a) - cost(b), (a, b) => a.option.transitDays - b.option.transitDays],
  balanced: [
    (a, b) => round2((b.scores?.balanced ?? 0) * 1000) - round2((a.scores?.balanced ?? 0) * 1000),
    (a, b) => cost(a) - cost(b),
    (a, b) => a.option.transitDays - b.option.transitDays,
    (a, b) => b.option.onTimeRate - a.option.onTimeRate,
  ],
};

const PRIMARY_KEY: Record<keyof typeof COMPARATORS, (e: CarrierEvaluation) => number> = {
  cheapest: (e) => cost(e),
  fastest: (e) => e.option.transitDays,
  mostReliable: (e) => e.option.onTimeRate,
  balanced: (e) => round2((e.scores?.balanced ?? 0) * 1000),
};

function rank(list: CarrierEvaluation[], key: keyof typeof COMPARATORS): CarrierPick | null {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => {
    for (const c of COMPARATORS[key]) {
      const d = c(a, b);
      if (d !== 0) return d;
    }
    return byName(a, b);
  });
  const top = sorted[0];
  const tiedWith = sorted
    .slice(1)
    .filter((e) => PRIMARY_KEY[key](e) === PRIMARY_KEY[key](top))
    .map((e) => `${e.option.carrier} (${e.option.service})`);
  return { evaluation: top, tiedWith };
}

export function priorityKey(p: SellerPriority): keyof typeof COMPARATORS {
  return p === "Cheapest" ? "cheapest" : p === "Fastest" ? "fastest" : p === "Most reliable" ? "mostReliable" : "balanced";
}

function scoreBalanced(list: CarrierEvaluation[]): void {
  if (!list.length) return;
  const costs = list.map(cost);
  const days = list.map((e) => e.option.transitDays);
  const rel = list.map((e) => e.option.onTimeRate);
  const norm = (v: number, min: number, max: number, higherIsBetter: boolean) =>
    max === min ? 1 : higherIsBetter ? (v - min) / (max - min) : (max - v) / (max - min);
  for (const e of list) {
    const c = norm(cost(e), Math.min(...costs), Math.max(...costs), false);
    const s = norm(e.option.transitDays, Math.min(...days), Math.max(...days), false);
    const r = norm(e.option.onTimeRate, Math.min(...rel), Math.max(...rel), true);
    e.scores = {
      cost: round2(c),
      speed: round2(s),
      reliability: round2(r),
      balanced: round2(BALANCED_WEIGHTS.cost * c + BALANCED_WEIGHTS.speed * s + BALANCED_WEIGHTS.reliability * r),
    };
  }
}

const label = (e: CarrierEvaluation) => `${e.option.carrier} (${e.option.service})`;

export function evaluateCarriers(booking: Booking, rateCard: CarrierOption[]): CarrierResult {
  const origin = booking.originCountry;
  const dest = booking.destinationCountry;
  const pallets = booking.pallets;
  const gross = booking.totalGrossWeightKg;
  const palletsValid = pallets !== null && Number.isInteger(pallets) && pallets > 0;
  const weightPerPallet = palletsValid && gross !== null ? round2(gross / pallets!) : null;

  const route = rateCard.filter(
    (o) => !!origin && !!dest && o.originCountry.toLowerCase() === origin.toLowerCase() && o.destinationCountry.toLowerCase() === dest.toLowerCase(),
  );

  const evaluations: CarrierEvaluation[] = route.map((option) => {
    const c = palletsValid ? round2(pallets! * option.pricePerPallet) : null;
    if (weightPerPallet === null) {
      return { option, cost: c, eligible: false, ineligibleReason: "Weight per pallet unknown (needs pallets and gross weight)." };
    }
    if (weightPerPallet > option.maxWeightPerPalletKg) {
      return {
        option,
        cost: c,
        eligible: false,
        ineligibleReason: `${weightPerPallet} kg per pallet is over its ${option.maxWeightPerPalletKg} kg limit.`,
      };
    }
    return { option, cost: c, eligible: true };
  });

  const eligible = evaluations.filter((e) => e.eligible);
  scoreBalanced(eligible);

  const picks = {
    cheapest: rank(eligible, "cheapest"),
    fastest: rank(eligible, "fastest"),
    mostReliable: rank(eligible, "mostReliable"),
    balanced: rank(eligible, "balanced"),
  };

  const priority = booking.sellerPriority;
  const recommended = priority ? picks[priorityKey(priority)] : null;

  // What the seller's priority would pick if weight did not matter (scores computed on the full route set).
  let preferredIgnoringWeight: CarrierEvaluation | null = null;
  if (priority && evaluations.length) {
    const copy = evaluations.map((e) => ({ ...e, scores: undefined }));
    scoreBalanced(copy);
    preferredIgnoringWeight = rank(copy, priorityKey(priority))?.evaluation ?? null;
    if (preferredIgnoringWeight) {
      preferredIgnoringWeight = evaluations.find((e) => e.option.id === preferredIgnoringWeight!.option.id) ?? null;
    }
  }

  const selected = booking.selectedCarrierId ? evaluations.find((e) => e.option.id === booking.selectedCarrierId) ?? null : null;
  const chosen = selected ?? preferredIgnoringWeight;
  const chosenSource: CarrierResult["chosenSource"] = selected ? "seller-selected" : preferredIgnoringWeight ? "priority" : "none";

  const notes: string[] = [];
  const tradeoffs: string[] = [];
  let explanation = "";

  if (!origin || !dest) {
    explanation = "Origin and destination country are needed before carriers can be matched.";
  } else if (!route.length) {
    explanation = `No carrier on the rate card serves ${origin} → ${dest}.`;
  } else if (!palletsValid || gross === null) {
    explanation = "Pallet count and total gross weight are needed to price carriers and check pallet weight limits.";
  } else if (!eligible.length) {
    const maxLimit = Math.max(...route.map((o) => o.maxWeightPerPalletKg));
    const needed = Math.ceil(gross / maxLimit);
    explanation = `No carrier is eligible: ${weightPerPallet} kg per pallet is over every carrier's limit on this route (highest is ${maxLimit} kg). Spread the load over at least ${needed} pallets, or reduce the weight.`;
  } else if (!priority) {
    explanation = "Seller priority is missing, so no single carrier is recommended yet. The best option for each priority is shown.";
  } else if (recommended) {
    const r = recommended.evaluation;
    const why =
      priority === "Cheapest"
        ? `it is the lowest-cost eligible option at ${formatGBP(r.cost)}`
        : priority === "Fastest"
          ? `it has the shortest transit time (${r.option.transitDays} days)`
          : priority === "Most reliable"
            ? `it has the highest on-time rate (${r.option.onTimeRate}%)`
            : `it has the best balanced score (${r.scores?.balanced.toFixed(2)}) across cost, speed and reliability`;
    explanation = `${label(r)} is recommended for a "${priority}" priority because ${why}. Price ${formatGBP(r.cost)} (${booking.pallets} × ${formatGBP(r.option.pricePerPallet)} per pallet), ${r.option.transitDays} days in transit, ${r.option.onTimeRate}% historical on-time rate.`;
    if (recommended.tiedWith.length) notes.push(`Tie on the main criterion with ${recommended.tiedWith.join(", ")}; broken by lower cost, then faster transit, then higher on-time rate.`);
    for (const e of eligible) {
      if (e.option.id === r.option.id) continue;
      const dc = (e.cost ?? 0) - (r.cost ?? 0);
      const dd = e.option.transitDays - r.option.transitDays;
      const dr = e.option.onTimeRate - r.option.onTimeRate;
      const parts: string[] = [];
      parts.push(dc === 0 ? "same price" : dc > 0 ? `${formatGBP(dc)} more` : `${formatGBP(-dc)} cheaper`);
      parts.push(dd === 0 ? "same transit" : dd < 0 ? `${-dd} day${-dd === 1 ? "" : "s"} faster` : `${dd} day${dd === 1 ? "" : "s"} slower`);
      parts.push(dr === 0 ? "same on-time rate" : dr > 0 ? `${dr} pts more reliable` : `${-dr} pts less reliable`);
      tradeoffs.push(`${label(e)}: ${parts.join(", ")}.`);
    }
  }

  for (const e of evaluations.filter((x) => !x.eligible && weightPerPallet !== null)) {
    notes.push(`${label(e)} excluded — ${e.ineligibleReason}`);
  }
  if (preferredIgnoringWeight && recommended && preferredIgnoringWeight.option.id !== recommended.evaluation.option.id && !preferredIgnoringWeight.eligible) {
    const p = preferredIgnoringWeight;
    const needed = gross !== null ? Math.ceil(gross / p.option.maxWeightPerPalletKg) : null;
    notes.push(
      `Your "${priority}" priority would normally pick ${label(p)}, but it cannot take ${weightPerPallet} kg per pallet (limit ${p.option.maxWeightPerPalletKg} kg).` +
        (needed ? ` It would fit on ${needed} pallets.` : ""),
    );
  }
  if (selected && recommended && selected.option.id !== recommended.evaluation.option.id) {
    notes.push(`You selected ${label(selected)} instead of the recommended ${label(recommended.evaluation)}.`);
  }
  notes.push("Transit times and on-time rates are the carrier's published averages from the rate card, not a delivery guarantee.");

  return {
    routeFound: route.length > 0,
    weightPerPalletKg: weightPerPallet,
    evaluations,
    priority,
    picks,
    recommended,
    preferredIgnoringWeight,
    chosen,
    chosenSource,
    explanation,
    tradeoffs,
    notes,
  };
}
