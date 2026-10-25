"use client";
import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, Sparkles } from "lucide-react";
import { displayDate } from "@/lib/domain/dates";
import { formatGBP, formatNum } from "@/lib/domain/normalize";
import type { Assessment, Booking } from "@/lib/domain/types";
import { Button, Card, StatusBadge } from "@/components/ui";
import { BookingEditor } from "./booking-editor";
import { CarrierPanel } from "./carriers";
import { IssueList, RuleChecklist } from "./checks";

export type ChangeEvent = "edited" | "carrier-selected" | "hazard-acknowledged";

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="label text-ink-3">{k}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold text-ink">{v}</div>
      {sub && <div className="truncate text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function BookingSummary({ booking: b, assessment: a }: { booking: Booking; assessment: Assessment }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      <Stat k="Route" v={`${b.originCity ?? "?"} → ${b.destinationCity ?? "?"}`} sub={`${b.originCountry ?? "?"} → ${b.destinationCountry ?? "?"}`} />
      <Stat k="Destination" v={b.destinationType ?? "—"} sub={`Appointment: ${b.deliveryAppointmentBooked === null ? "—" : b.deliveryAppointmentBooked ? "Yes" : "No"}`} />
      <Stat k="Ready to ship" v={displayDate(b.readyToShipDate)} sub={`Checked on ${displayDate(a.evaluatedOn)}`} />
      <Stat k="Priority" v={b.sellerPriority ?? "—"} />
      <Stat k="Pallets · cartons" v={`${formatNum(b.pallets)} · ${formatNum(b.cartons)}`} sub={`Items total ${formatNum(a.totals.itemCartons)} cartons`} />
      <Stat k="Gross weight" v={`${formatNum(b.totalGrossWeightKg)} kg`} sub={`${formatNum(a.totals.weightPerPalletKg)} kg / pallet · products ${formatNum(a.totals.netWeightKg)} kg`} />
      <Stat k="Declared value" v={formatGBP(b.totalDeclaredValue)} sub={`Items add up to ${formatGBP(a.totals.itemValue)}`} />
      <Stat k="Items" v={String(b.items.length)} sub={b.sellerName ?? undefined} />
    </div>
  );
}

function Collapsible({ title, defaultOpen = true, children, right }: { title: string; defaultOpen?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronDown className={clsx("h-4 w-4 text-ink-3 transition-transform", !open && "-rotate-90")} />
          <h2 className="display text-[17px] font-bold text-ink">{title}</h2>
        </button>
        {right}
      </div>
      {open && <div className="border-t border-line px-5 py-5">{children}</div>}
    </Card>
  );
}

export function ExplainBox({ booking }: { booking: Booking }) {
  const [state, setState] = useState<{ loading?: boolean; summary?: string; steps?: string[]; error?: string }>({});
  const run = async () => {
    setState({ loading: true });
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setState({ summary: j.summary, steps: j.nextSteps });
    } catch (e) {
      setState({ error: (e as Error).message });
    }
  };
  return (
    <div className="rounded-xl border border-line bg-paper/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="label flex items-center gap-2 text-ink-3">
          <Sparkles className="h-3.5 w-3.5 text-indigo" /> Plain-English summary (Gemini)
        </div>
        <Button size="sm" variant="secondary" onClick={run} loading={state.loading}>
          {state.summary ? "Regenerate" : "Explain this report"}
        </Button>
      </div>
      {state.summary && (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
          <p>{state.summary}</p>
          {state.steps && state.steps.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-5 text-ink-2">
              {state.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <p className="text-xs text-ink-3">Written by AI from the check results above. The checks themselves are calculated exactly, not by AI.</p>
        </div>
      )}
      {state.error && <p className="mt-2 text-sm text-red">{state.error}</p>}
    </div>
  );
}

export function ReportView({
  booking,
  assessment,
  onChange,
  editable = true,
  actions,
  editorOpen = false,
}: {
  booking: Booking;
  assessment: Assessment;
  onChange?: (b: Booking, event: ChangeEvent, detail: string) => void;
  editable?: boolean;
  actions?: React.ReactNode;
  editorOpen?: boolean;
}) {
  const a = assessment;
  const ack = (key: string) => {
    if (!onChange) return;
    onChange({ ...booking, hazardAcknowledgements: [...new Set([...(booking.hazardAcknowledgements ?? []), key])] }, "hazard-acknowledged", key.split(":")[0]);
  };
  const select = (id: string | null) => onChange?.({ ...booking, selectedCarrierId: id }, "carrier-selected", id ?? "priority pick");

  return (
    <div className="min-w-0 space-y-4">
      <Card className="p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="display text-2xl font-bold text-ink">{booking.bookingId ?? "New booking"}</h2>
            <StatusBadge status={a.status} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-red"><b>{a.counts.red}</b> Red</span>
            <span className="text-amberw"><b>{a.counts.amber}</b> Amber</span>
            <span className="text-amberw"><b>{a.counts.review}</b> review</span>
            <span className="text-ink-3"><b>{a.counts.dataErrors}</b> data errors</span>
          </div>
        </div>
        <BookingSummary booking={booking} assessment={a} />
        <div
          className={clsx(
            "mt-5 rounded-xl border px-4 py-3 text-sm",
            a.dispatchReady ? "border-green/25 bg-green-soft text-green" : "border-red/20 bg-red-soft text-red",
          )}
        >
          {a.dispatchReady
            ? a.status === "warnings"
              ? "No Red errors. You can confirm this proposed booking after reviewing the Amber warnings."
              : "No Red errors or warnings. Ready to confirm as a proposed booking."
            : a.status === "review"
              ? "Not dispatch-ready: one or more items need a human check for prohibited goods."
              : "Not dispatch-ready: fix the Red errors and missing data below. Dispatch stays blocked until they're resolved."}
        </div>
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
      </Card>

      <Collapsible title={`Issues & fixes (${a.counts.red + a.counts.amber + a.counts.review + a.counts.dataErrors})`}>
        <IssueList assessment={a} booking={booking} onAcknowledge={editable && onChange ? ack : undefined} />
      </Collapsible>

      <Collapsible title="Carrier comparison">
        <CarrierPanel result={a.carrier} pallets={booking.pallets} onSelect={editable && onChange ? select : undefined} selectedId={booking.selectedCarrierId} />
      </Collapsible>

      <Collapsible title="All ten checks" defaultOpen={false}>
        <RuleChecklist assessment={a} />
        <p className="mt-3 text-xs text-ink-3">{a.disclaimer}</p>
      </Collapsible>

      {onChange && (
        <Collapsible title="Edit shipment details" defaultOpen={editorOpen} right={<span className="hidden text-xs text-ink-3 sm:inline">Checks re-run on every change</span>}>
          <BookingEditor booking={booking} disabled={!editable} issues={a.dataIssues} onChange={(b, d) => onChange(b, "edited", d)} />
        </Collapsible>
      )}

      <ExplainBox booking={booking} />
    </div>
  );
}
