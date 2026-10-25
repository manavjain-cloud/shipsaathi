"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw } from "lucide-react";
import type { Assessment, Booking } from "@/lib/domain/types";
import { assess } from "@/lib/domain/validation";
import { ReportView, type ChangeEvent } from "@/components/report/report-view";
import { ConfirmDialog, EmailDialog } from "@/components/report/dialogs";
import { Button, Empty, fmtDateTime, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { EventList, type EventRow } from "@/components/events";

interface Meta {
  id: string;
  source: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  upload_id: string | null;
}

export function ReportClient() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ booking: Booking; event: ChangeEvent | "rechecked"; detail: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not load this booking.");
      setBooking(j.booking);
      setAssessment(j.assessment);
      setMeta(j.meta);
      setEvents(j.events);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/bookings/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Could not load this booking.");
        if (!alive) return;
        setBooking(j.booking);
        setAssessment(j.assessment);
        setMeta(j.meta);
        setEvents(j.events);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking: p.booking, event: p.event, detail: { change: p.detail } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      if (!pending.current) {
        setBooking(j.booking);
        setAssessment(j.assessment);
      }
      const fresh = await fetch(`/api/bookings/${id}`, { cache: "no-store" }).then((r) => r.json());
      if (fresh.events) setEvents(fresh.events);
      if (fresh.meta) setMeta(fresh.meta);
    } catch (e) {
      toast("error", `Not saved: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [id, toast]);

  const onChange = (b: Booking, event: ChangeEvent, detail: string) => {
    setBooking(b);
    setAssessment(assess(b)); // instant local re-check; the server re-checks on save
    pending.current = { booking: b, event, detail };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, event === "edited" ? 700 : 0);
  };

  const recheck = async () => {
    if (!booking) return;
    pending.current = { booking, event: "rechecked", detail: "Checks re-run" };
    await flush();
    toast("success", "Checks re-run on the server.");
  };

  const confirm = async (ackAmber: boolean) => {
    const res = await fetch(`/api/bookings/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledgeWarnings: ackAmber }) });
    const j = await res.json();
    if (!res.ok) {
      toast("error", j.error ?? "Could not confirm.");
      throw new Error(j.error);
    }
    toast("success", "Proposed booking confirmed. No carrier has been booked.");
    await load();
  };

  if (loading) return <div className="flex items-center gap-2 text-ink-3"><Spinner /> Loading report…</div>;
  if (error || !booking || !assessment) return <Empty title="Report not available">{error}</Empty>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/reports" className="label inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All reports
        </Link>
        <div className="flex items-center gap-3 text-xs text-ink-3">
          {saving ? (
            <span className="flex items-center gap-1.5"><Spinner className="h-3 w-3" /> Saving…</span>
          ) : (
            meta && <span>Saved · updated {fmtDateTime(meta.updated_at)}</span>
          )}
          {meta && <span className="label rounded-full border border-line px-2 py-0.5">{meta.source === "excel" ? "Excel upload" : meta.source === "chat" ? "Chat" : "Manual"}</span>}
        </div>
      </div>

      {meta?.confirmed_at && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-green/25 bg-green-soft px-5 py-4 text-sm text-green">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <b>Proposed booking confirmed</b> on {fmtDateTime(meta.confirmed_at)}. No carrier booking has been made. Next: commercial invoice, carton and pallet labels, delivery
            appointment, then book collection with the carrier directly.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <ReportView
          booking={booking}
          assessment={assessment}
          onChange={onChange}
          actions={
            <>
              <Button onClick={() => setConfirmOpen(true)} disabled={!assessment.dispatchReady || saving} title={!assessment.dispatchReady ? "Fix Red errors first" : undefined}>
                <CheckCircle2 className="h-4 w-4" /> {meta?.confirmed_at ? "Re-confirm proposal" : "Confirm proposed booking"}
              </Button>
              <Button variant="secondary" onClick={() => setEmailOpen(true)} disabled={saving}>
                <Mail className="h-4 w-4" /> Email summary
              </Button>
              <Button variant="ghost" onClick={recheck} disabled={saving}>
                <RefreshCw className="h-4 w-4" /> Re-run checks
              </Button>
              {!assessment.dispatchReady && <span className="text-xs text-ink-3">Confirmation unlocks once Red errors are fixed.</span>}
            </>
          }
        />
        <aside className="space-y-3">
          <div className="label text-ink-3">Booking history</div>
          <EventList events={events} compact />
        </aside>
      </div>

      <EmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} bookingId={id} />
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} assessment={assessment} onConfirm={confirm} />
    </div>
  );
}
