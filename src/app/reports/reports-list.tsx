"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import type { Assessment } from "@/lib/domain/types";
import { formatGBP } from "@/lib/domain/normalize";
import { ButtonLink, Empty, fmtDateTime, Page, PageHeader, Spinner, StatusBadge } from "@/components/ui";

export interface BookingListRow {
  id: string;
  booking_ref: string;
  source: string;
  seller_name: string | null;
  origin: string | null;
  destination: string | null;
  status: Assessment["status"];
  red_count: number;
  amber_count: number;
  review_count: number;
  recommended_carrier: string | null;
  recommended_cost: string | null;
  confirmed_at: string | null;
  updated_at: string;
}

export function ReportsList() {
  const [rows, setRows] = useState<BookingListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Assessment["status"] | "confirmed">("all");

  useEffect(() => {
    fetch("/api/bookings", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load");
        setRows(j.bookings);
      })
      .catch((e) => setError(e.message));
  }, []);

  const needle = q.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) =>
      (filter === "all" || (filter === "confirmed" ? !!r.confirmed_at : r.status === filter)) &&
      (!needle || [r.booking_ref, r.seller_name, r.origin, r.destination, r.recommended_carrier].some((v) => v?.toLowerCase().includes(needle))),
  );

  return (
    <Page>
      <PageHeader eyebrow="Validation reports" title="Every booking, every check" actions={<ButtonLink href="/new">New shipment</ButtonLink>}>
        Bookings saved from chat and Excel uploads. Open one to see each Red error and Amber warning with its fix, compare carriers, edit details and re-run the checks.
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bookings" aria-label="Search bookings" className="w-full rounded-full border border-line-2 bg-card py-2 pl-9 pr-3 text-sm focus:border-indigo focus:outline-none" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "blocked", "review", "warnings", "ready", "confirmed"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={clsx("label rounded-full border px-3 py-1.5", filter === f ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-ink")}>
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Empty title="Couldn't load reports">{error}</Empty>
      ) : !rows ? (
        <div className="flex items-center gap-2 text-ink-3"><Spinner /> Loading…</div>
      ) : !rows.length ? (
        <Empty title="No bookings yet">Start a shipment in the chat or upload a booking sheet — results appear here.</Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="label hidden grid-cols-[130px_1fr_1fr_190px_90px_1fr_140px] gap-4 border-b border-line px-4 py-2.5 text-ink-3 md:grid">
            <span>Booking</span><span>Seller</span><span>Route</span><span>Status</span><span>Red · Amber</span><span>Recommended</span><span>Updated</span>
          </div>
          {visible.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 last:border-0 hover:bg-paper/60 md:grid-cols-[130px_1fr_1fr_190px_90px_1fr_140px] md:items-center">
              <span className="display font-bold text-ink">
                {r.booking_ref}
                <span className="label ml-2 font-normal text-ink-3">{r.source === "excel" ? "xlsx" : r.source}</span>
              </span>
              <span className="truncate text-sm text-ink-2">{r.seller_name ?? "—"}</span>
              <span className="truncate text-sm text-ink-2">{r.origin?.split(",")[0] ?? "?"} → {r.destination ?? "?"}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={r.status} />
                {r.confirmed_at && <span className="label text-green">Confirmed</span>}
              </span>
              <span className="text-sm"><span className="text-red">{r.red_count}</span> · <span className="text-amberw">{r.amber_count + r.review_count}</span></span>
              <span className="truncate text-sm text-ink-2">{r.recommended_carrier ? `${r.recommended_carrier} · ${formatGBP(Number(r.recommended_cost))}` : "—"}</span>
              <span className="text-xs text-ink-3">{fmtDateTime(r.updated_at)}</span>
            </Link>
          ))}
          {!visible.length && <div className="px-4 py-8 text-center text-sm text-ink-3">No bookings match.</div>}
        </div>
      )}
    </Page>
  );
}
