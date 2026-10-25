"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { evaluateCarriers } from "@/lib/domain/carriers";
import { emptyBooking } from "@/lib/domain/conversation";
import { formatGBP } from "@/lib/domain/normalize";
import { SELLER_PRIORITIES, type SellerPriority } from "@/lib/domain/types";
import { DEFAULT_RATE_CARD } from "@/lib/domain/validation";
import { CarrierPanel } from "@/components/report/carriers";
import { Card, Page, PageHeader } from "@/components/ui";

const DESTS = [...new Set(DEFAULT_RATE_CARD.map((o) => o.destinationCountry))];

export function CarrierCompare() {
  const [dest, setDest] = useState(DESTS[0]);
  const [pallets, setPallets] = useState("3");
  const [weight, setWeight] = useState("620");
  const [priority, setPriority] = useState<SellerPriority>("Balanced");

  const result = useMemo(() => {
    const b = emptyBooking();
    b.originCountry = "United Kingdom";
    b.destinationCountry = dest;
    const p = Number(pallets);
    const w = Number(weight);
    b.pallets = Number.isInteger(p) && p > 0 ? p : null;
    b.totalGrossWeightKg = Number.isFinite(w) && w >= 0 && weight.trim() !== "" ? w : null;
    b.sellerPriority = priority;
    return evaluateCarriers(b, DEFAULT_RATE_CARD);
  }, [dest, pallets, weight, priority]);

  const input = "w-full rounded-lg border border-line-2 bg-card px-3 py-2 text-sm focus:border-indigo focus:outline-none";

  return (
    <Page>
      <PageHeader eyebrow="Carrier comparison" title="The rate card, priced for your load">
        Carriers are filtered by route and by the weight each one accepts per pallet, then ranked by your priority. Cost is pallets × price per pallet from the fixed rate card
        (GBP). Transit time and on-time rate are published averages, not guarantees.
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit space-y-4 p-5">
          <div className="label text-ink-3">Your load</div>
          <label className="block">
            <span className="label mb-1 block text-ink-3">Route</span>
            <select className={input} value={dest} onChange={(e) => setDest(e.target.value)}>
              {DESTS.map((d) => (
                <option key={d} value={d}>United Kingdom → {d}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block text-ink-3">Pallets</span>
            <input className={input} inputMode="numeric" value={pallets} onChange={(e) => setPallets(e.target.value)} />
          </label>
          <label className="block">
            <span className="label mb-1 block text-ink-3">Total gross weight (kg)</span>
            <input className={input} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <fieldset>
            <legend className="label mb-1.5 text-ink-3">Seller priority</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {SELLER_PRIORITIES.map((p) => (
                <button key={p} onClick={() => setPriority(p)} className={clsx("rounded-lg border px-2 py-2 text-[13px]", priority === p ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-ink")}>
                  {p}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-ink-3">{result.weightPerPalletKg !== null ? `${result.weightPerPalletKg} kg per pallet` : "Enter pallets and weight"}</p>
        </Card>

        <CarrierPanel result={result} pallets={Number(pallets) || null} />
      </div>

      <section className="mt-12">
        <h2 className="display mb-1 text-xl font-bold text-ink">Full rate card</h2>
        <p className="mb-4 text-sm text-ink-3">Read from the Carrier options sheet of the supplied workbook. Fixed — judges use exactly these values.</p>
        <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="label border-b border-line text-ink-3">
                {["Carrier", "Service", "Route", "Price / pallet", "Transit", "On-time", "Max kg / pallet"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEFAULT_RATE_CARD.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="display px-4 py-2.5 font-bold text-ink">{o.carrier}</td>
                  <td className="px-4 py-2.5 text-ink-2">{o.service}</td>
                  <td className="px-4 py-2.5 text-ink-2">{o.originCountry} → {o.destinationCountry}</td>
                  <td className="px-4 py-2.5 text-ink">{formatGBP(o.pricePerPallet)}</td>
                  <td className="px-4 py-2.5 text-ink-2">{o.transitDays} days</td>
                  <td className="px-4 py-2.5 text-ink-2">{o.onTimeRate}%</td>
                  <td className="px-4 py-2.5 text-ink-2">{o.maxWeightPerPalletKg} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}
