"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { CarrierOption, RuleDefinition } from "@/lib/domain/types";
import { formatGBP } from "@/lib/domain/normalize";
import { CardDeck } from "./card-deck";
import { RotatingGlobe } from "./globe";

const RULE_TITLES: Record<string, string> = {
  "R-01": "HS code, six digits or more",
  "R-02": "Declared value matches the items",
  "R-03": "Units per carton × cartons = quantity",
  "R-04": "Carton totals agree",
  "R-05": "Pallet weight within the carrier's limit",
  "R-06": "No lithium, aerosols or flammables",
  "R-07": "Gross weight covers the goods",
  "R-08": "Warehouse slot booked",
  "R-09": "Country of origin on every item",
  "R-10": "Ready date not in the past",
};

interface Stats {
  total: number;
  blocked: number;
  review: number;
  warnings: number;
  ready: number;
  confirmed: number;
  uploads: number;
  red_issues: number;
  amber_issues: number;
  ruleCounts: Record<string, number>;
}
interface Recent {
  id: string;
  booking_ref: string;
  seller_name: string | null;
  origin: string | null;
  destination: string | null;
  status: "blocked" | "review" | "warnings" | "ready";
  recommended_carrier: string | null;
  recommended_cost: string | null;
  updated_at: string;
}

const STATUS_TEXT: Record<Recent["status"], string> = { blocked: "Blocked", review: "Review", warnings: "Warnings", ready: "Ready" };

function useReveal() {
  useEffect(() => {
    if (!document.documentElement.classList.contains("motion-ok")) return;
    // Reveal anything that has entered or already passed the viewport. Fires once per element, never un-reveals.
    let raf = 0;
    const check = () => {
      raf = 0;
      const limit = window.innerHeight * 0.92;
      document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)").forEach((el) => {
        if (el.getBoundingClientRect().top < limit) el.classList.add("is-in");
      });
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

function StatementFold() {
  // Tall section with a sticky stage: the scroll travel drives the globe turning to Europe and zooming in on the lanes.
  return (
    <section className="statement-fold relative bg-ground">
      <div className="sticky top-0 flex min-h-screen items-center overflow-hidden px-4 py-24 sm:px-6">
        <div className="pointer-events-none absolute -right-[22vw] top-1/2 w-[min(84vw,440px)] -translate-y-1/2 opacity-40 md:-right-[5vw] md:w-[min(42vw,600px)] md:opacity-90">
          <RotatingGlobe className="aspect-square w-full" />
        </div>
        <div className="relative mx-auto w-full max-w-[1320px]">
          <div className="label reveal mb-8 flex items-center gap-3 text-bone-2">
            <span className="h-px w-8 bg-teal" /> Why pre-flight
          </div>
          <p className="display reveal max-w-[22ch] text-[clamp(24px,3.6vw,52px)] font-semibold leading-[1.12] tracking-[-0.02em] text-bone">
            Most customs holds start as a small mistake on a booking form. ShipSaathi reads your shipment, runs ten exact checks and <span className="text-amber">names the fix</span> before the truck arrives.
          </p>
          <div className="reveal mt-14 flex items-end gap-6">
            <span className="outline-numeral display text-[clamp(96px,16vw,220px)] font-extrabold leading-[0.8]">10</span>
            <p className="max-w-[34ch] pb-3 text-[15px] leading-relaxed text-bone-2">
              Rules from the fixed rulebook — six Red that stop a shipment, four Amber worth a second look. Numbers are checked by code, never by AI judgement.
            </p>
          </div>
        </div>
      </div>
      <style>{`
        html.motion-ok .statement-fold { height: 230vh; }
      `}</style>
    </section>
  );
}

export function Landing({ rateCard, rulebook }: { rateCard: CarrierOption[]; rulebook: RuleDefinition[] }) {
  useReveal();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const j = await r.json();
        setStats(j.stats);
        setRecent(j.recent);
      })
      .catch(() => setStatsError(true));
  }, []);

  const hair = "border-[rgba(237,231,220,.13)]";

  return (
    <div className="bg-ground text-bone">
      <StatementFold />

      {/* live ledger — real counts from the database only */}
      <section className={clsx("border-y px-4 py-10 sm:px-6", hair)}>
        <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-y-8 md:grid-cols-5">
          {[
            { k: "Bookings checked", v: stats?.total },
            { k: "Blocked by Red errors", v: stats?.blocked },
            { k: "Awaiting review", v: stats?.review },
            { k: "Dispatch-ready", v: stats ? stats.ready + stats.warnings : undefined },
            { k: "Excel uploads", v: stats?.uploads },
          ].map((s) => (
            <div key={s.k} className="reveal">
              <div className="label text-bone-muted">{s.k}</div>
              <div className="display mt-2 text-4xl font-bold">{s.v ?? (statsError ? "—" : "·")}</div>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-[1320px] text-xs text-bone-muted">Live from this deployment&apos;s database. {statsError ? "Database unavailable right now." : ""}</p>
      </section>

      {/* rate card + deck */}
      <section className="px-4 py-28 sm:px-6">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <div className="reveal">
            <div className="label mb-6 flex items-center gap-3 text-bone-2">
              <span className="h-px w-8 bg-amber" /> The rate card
            </div>
            <h2 className="display text-[clamp(32px,4.4vw,64px)] font-bold leading-[1.02] tracking-[-0.03em]">
              {rateCard.length} services.
              <br />
              One honest price.
            </h2>
            <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-bone-2">
              Three carriers on each lane from the United Kingdom to Germany, France and the Netherlands. Cost is pallets × price per pallet — nothing invented. Carriers that can&apos;t
              take your pallet weight are filtered out, then the rest are ranked by what you care about: cheapest, fastest, most reliable or a balanced score.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/new" className="label rounded-full border border-bone bg-bone px-5 py-3 text-ground hover:border-amber hover:bg-amber">
                Start a shipment
              </Link>
              <Link href="/carriers" className="label rounded-full border border-bone px-5 py-3 text-bone hover:border-amber hover:text-amber">
                Compare carriers
              </Link>
            </div>
          </div>
          <div className="reveal">
            <CardDeck options={rateCard} />
          </div>
        </div>
      </section>

      {/* rulebook roster */}
      <section className="px-4 pb-28 sm:px-6">
        <div className="mx-auto max-w-[1320px]">
          <div className="reveal mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-[clamp(28px,3.6vw,48px)] font-bold tracking-[-0.03em]">The rulebook</h2>
            <span className="label text-bone-muted">Bookings currently failing</span>
          </div>
          <ul className={clsx("border-t", hair)}>
            {rulebook.map((r) => (
              <li key={r.id} className={clsx("reveal grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-b py-5 sm:grid-cols-[140px_1fr_auto]", hair)}>
                <span className="label flex items-center gap-2 text-bone-2">
                  <span className={clsx("h-1.5 w-1.5 rounded-full", r.severity === "Red" ? "bg-[#e5484d]" : "bg-amber")} />
                  {r.id} · {r.severity}
                </span>
                <span className="display col-span-2 row-start-2 text-[clamp(18px,2vw,26px)] font-semibold tracking-[-0.02em] sm:col-span-1 sm:row-start-auto">{RULE_TITLES[r.id] ?? r.rule}</span>
                <span className="col-start-2 row-start-1 text-right text-sm tabular-nums text-bone-2 sm:col-start-auto sm:row-start-auto">
                  {stats ? (stats.ruleCounts[r.id] ?? 0) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* recent shipments table */}
      <section className="px-4 pb-28 sm:px-6">
        <div className="mx-auto max-w-[1320px]">
          <div className="reveal mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-[clamp(28px,3.6vw,48px)] font-bold tracking-[-0.03em]">Recent shipments</h2>
            <Link href="/reports" className="label text-bone-2 hover:text-amber">All reports →</Link>
          </div>
          {recent && recent.length > 0 ? (
            <div className="reveal">
              <div className={clsx("label hidden grid-cols-[160px_1.2fr_1.4fr_120px_1.2fr] gap-6 border-b pb-3 text-bone-muted md:grid", hair)}>
                <span>Booking</span>
                <span>Seller</span>
                <span>Route</span>
                <span>Status</span>
                <span>Recommended</span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.id}
                  href={`/reports/${r.id}`}
                  className={clsx("grid grid-cols-2 gap-x-6 gap-y-1 border-b py-4 hover:text-amber md:grid-cols-[160px_1.2fr_1.4fr_120px_1.2fr] md:items-baseline", hair)}
                >
                  <span className="display text-lg font-bold">{r.booking_ref}</span>
                  <span className="text-sm text-bone-2">{r.seller_name ?? "—"}</span>
                  <span className="text-sm text-bone-2">{r.origin?.split(",")[0] ?? "?"} → {r.destination ?? "?"}</span>
                  <span className={clsx("label", r.status === "blocked" ? "text-amber" : r.status === "ready" ? "text-teal-bright" : "text-bone-2")}>{STATUS_TEXT[r.status]}</span>
                  <span className="col-span-2 text-sm text-bone-2 md:col-span-1">{r.recommended_carrier ? `${r.recommended_carrier} · ${formatGBP(Number(r.recommended_cost))}` : "No eligible carrier"}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className={clsx("reveal border-t pt-6 text-bone-2", hair)}>
              {recent ? "No shipments yet. Start one in the chat or upload a booking sheet." : statsError ? "Couldn't load recent shipments." : "Loading…"}
            </p>
          )}
        </div>
      </section>

      {/* close */}
      <section className="overflow-hidden px-4 pt-16 sm:px-6">
        <div className="mx-auto max-w-[1320px]">
          <div className="reveal flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="display text-[clamp(30px,4vw,56px)] font-bold leading-[1.02] tracking-[-0.03em]">Book it right the first time.</h2>
              <p className="mt-4 max-w-[60ch] text-xs leading-relaxed text-bone-muted">
                ShipSaathi creates proposed bookings — it doesn&apos;t book carriers for you. The ten checks catch common mistakes but are not a full customs or dangerous-goods review.
                Transit times and on-time rates are averages from the rate card, not guarantees.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/new" className="label rounded-full border border-bone bg-bone px-5 py-3 text-ground hover:border-amber hover:bg-amber">
                New shipment
              </Link>
              <Link href="/upload" className="label rounded-full border border-bone px-5 py-3 text-bone hover:border-amber hover:text-amber">
                Upload Excel
              </Link>
            </div>
          </div>
          <div className={clsx("mt-16 flex flex-wrap items-center justify-between gap-4 border-t py-5", hair)}>
            <span className="label text-bone-muted">Gemini · Neon · Resend · Vercel</span>
            <nav className="flex flex-wrap gap-5" aria-label="Footer">
              {[
                ["/upload", "Upload"],
                ["/reports", "Reports"],
                ["/carriers", "Carriers"],
                ["/history", "History"],
              ].map(([href, l]) => (
                <Link key={href} href={href} className="label text-bone-2 hover:text-amber">
                  {l}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        <div aria-hidden className="display translate-y-[18%] select-none whitespace-nowrap text-center text-[clamp(36px,9.3vw,200px)] font-extrabold uppercase leading-[0.8] tracking-[-0.04em] text-bone">
          ShipSaathi<span className="text-amber">.</span>
        </div>
      </section>
    </div>
  );
}
