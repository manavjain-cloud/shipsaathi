"use client";
import { useEffect, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import type { Assessment } from "@/lib/domain/types";
import { formatGBP } from "@/lib/domain/normalize";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-line bg-card p-0 text-ink backdrop:bg-[rgba(14,27,51,.35)] backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="display text-lg font-bold">{title}</h2>
        <button onClick={onClose} className="rounded-full p-1 text-ink-3 hover:text-ink" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}

export function EmailDialog({ open, onClose, bookingId, disabledReason }: { open: boolean; onClose: () => void; bookingId: string | null; disabledReason?: string }) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<"summary" | "report">("summary");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    if (!bookingId) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, kind }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Email failed (HTTP ${res.status}).`);
      setResult({ ok: true, text: `Sent to ${to}. Resend message ID: ${j.id}` });
      toast("success", `Email sent to ${to}`);
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
      toast("error", "Email was not sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { setResult(null); onClose(); }} title="Email this booking">
      {disabledReason ? (
        <p className="text-sm text-ink-2">{disabledReason}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="label mb-1 block text-ink-3">Recipient</span>
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-line-2 px-3 py-2 text-sm focus:border-indigo focus:outline-none"
            />
          </label>
          <fieldset className="flex gap-4 text-sm">
            <legend className="label mb-1 text-ink-3">Content</legend>
            <label className="flex items-center gap-2"><input type="radio" checked={kind === "summary"} onChange={() => setKind("summary")} /> Booking summary</label>
            <label className="flex items-center gap-2"><input type="radio" checked={kind === "report"} onChange={() => setKind("report")} /> Validation report</label>
          </fieldset>
          <p className="text-xs text-ink-3">
            Nothing is sent until you press Send. The email includes the status, every issue with its fix, the recommended carrier and a link to this report. Sent via Resend.
          </p>
          {result && <p className={result.ok ? "rounded-lg bg-green-soft px-3 py-2 text-sm text-green" : "rounded-lg bg-red-soft px-3 py-2 text-sm text-red"}>{result.text}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            <Button type="submit" loading={sending} disabled={!to}>
              <Mail className="h-4 w-4" /> Send email
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, assessment, onConfirm }: { open: boolean; onClose: () => void; assessment: Assessment; onConfirm: (ackAmber: boolean) => Promise<void> }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = assessment.carrier.chosen ?? assessment.carrier.recommended?.evaluation;
  const needAck = assessment.counts.amber > 0;
  return (
    <Modal open={open} onClose={() => { setAck(false); onClose(); }} title="Confirm proposed booking">
      <div className="space-y-4 text-sm text-ink-2">
        <p>
          You&apos;re confirming these details as a <b className="text-ink">proposed booking</b>
          {c ? (
            <>
              {" "}with <b className="text-ink">{c.option.carrier} ({c.option.service})</b> at <b className="text-ink">{formatGBP(c.cost)}</b>
            </>
          ) : null}
          . SaathiFly does not book carriers directly — there&apos;s no live carrier integration — so nothing is sent to a carrier.
        </p>
        <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
          <div className="label mb-1 text-ink-3">What happens next</div>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>Prepare the commercial invoice using the confirmed values.</li>
            <li>Label every carton and pallet with the booking ID.</li>
            <li>{assessment.carrier.chosen ? `Book collection with ${assessment.carrier.chosen.option.carrier} directly.` : "Book collection with your chosen carrier."}</li>
            <li>Keep the delivery appointment details with the paperwork.</li>
          </ol>
        </div>
        {needAck && (
          <label className="flex items-start gap-2 rounded-lg border border-amberw/30 bg-amberw-soft px-3 py-2.5 text-amberw">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
            <span>I&apos;ve reviewed the {assessment.counts.amber} Amber warning(s) and accept the risk.</span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={needAck && !ack}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(ack);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm proposal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
