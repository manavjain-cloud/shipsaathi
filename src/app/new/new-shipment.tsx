"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowUp, ExternalLink, RotateCcw, Save } from "lucide-react";
import { computeSuggestions, emptyBooking, findMissing, isComplete, newChatBookingId, progress, type MissingField } from "@/lib/domain/conversation";
import type { Booking } from "@/lib/domain/types";
import { assess } from "@/lib/domain/validation";
import { ReportView } from "@/components/report/report-view";
import { Button, Page } from "@/components/ui";
import { useToast } from "@/components/toast";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! Tell me about your shipment in your own words — what you're sending, from where to where, how many pallets, and when it's ready. I'll only ask for what's missing, then run the ten pre-flight checks and suggest a carrier.\n\nShipments run from the UK (London, Manchester, Birmingham, Leeds) to Germany, France or the Netherlands, priced in GBP.",
};

const STARTERS = [
  "I'm sending 3 pallets of ceramic coffee mugs from Manchester to a warehouse in Frankfurt, ready on 5 November.",
  "Need to ship cotton kurtas made in India from London to a shop in Paris, cheapest option please.",
  "2 pallets of steel cookware, Birmingham to Rotterdam, about 900 kg, as fast as possible.",
];

const STORE_KEY = "shipsaathi:chat-draft:v1";

interface Draft {
  booking: Booking;
  messages: Msg[];
  declined: string[];
  offered?: string[];
  savedId: string | null;
}

function freshDraft(): Draft {
  return { booking: emptyBooking(newChatBookingId()), messages: [GREETING], declined: [], savedId: null };
}

export function NewShipment() {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirtySinceSave, setDirtySinceSave] = useState(false);
  const [tab, setTab] = useState<"chat" | "booking">("chat");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let d: Draft | null = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) d = JSON.parse(raw) as Draft;
    } catch {
      /* storage unavailable */
    }
    // Restoring a browser-only draft after mount (localStorage isn't available during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(d?.booking && Array.isArray(d.messages) ? d : freshDraft());
  }, []);

  useEffect(() => {
    if (!draft) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [draft?.messages.length, sending]);

  const derived = useMemo(() => {
    if (!draft) return null;
    const missing = findMissing(draft.booking, draft.declined);
    return {
      assessment: assess(draft.booking),
      missing,
      complete: isComplete(draft.booking, draft.declined),
      progress: progress(draft.booking),
      suggestions: computeSuggestions(draft.booking),
    };
  }, [draft]);

  if (!draft || !derived) return <Page><div className="text-ink-3">Loading…</div></Page>;

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    const history = draft.messages.filter((m) => m !== GREETING).slice(-12);
    const withUser: Draft = { ...draft, messages: [...draft.messages, { role: "user", content: message }] };
    setDraft(withUser);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, booking: draft.booking, declined: draft.declined, offered: draft.offered ?? [] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `The assistant failed (HTTP ${res.status}).`);
      setDraft({ ...withUser, booking: j.booking, declined: j.declined, offered: j.offered ?? [], messages: [...withUser.messages, { role: "assistant", content: j.reply }] });
      if (j.changes?.length) setDirtySinceSave(true);
    } catch (e) {
      setDraft({ ...withUser, messages: [...withUser.messages, { role: "assistant", content: `⚠ ${(e as Error).message}` }] });
    } finally {
      setSending(false);
    }
  };

  const onEdit = (b: Booking) => {
    setDraft({ ...draft, booking: b, offered: [] });
    setDirtySinceSave(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = draft.savedId ? `/api/bookings/${draft.savedId}` : "/api/bookings";
      const res = await fetch(url, {
        method: draft.savedId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking: draft.booking, source: "chat", event: "edited", detail: { change: "Updated from chat" } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setDraft({ ...draft, booking: j.booking, savedId: j.id ?? draft.savedId });
      setDirtySinceSave(false);
      toast("success", draft.savedId ? "Changes saved and re-checked." : "Booking saved. Open the report to confirm or email it.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!confirm("Start a new shipment? The current conversation will be cleared (saved bookings stay in Reports).")) return;
    setDraft(freshDraft());
    setDirtySinceSave(false);
  };

  const pct = Math.round((derived.progress.filled / derived.progress.total) * 100);
  const required: MissingField[] = derived.missing.filter((m) => !m.optional);

  return (
    <Page className="max-w-[1440px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label mb-1 flex items-center gap-2 text-ink-3"><span className="h-px w-6 bg-teal" /> New shipment · conversational booking</div>
          <h1 className="display text-[clamp(26px,3vw,36px)] font-bold text-ink">Describe it. We&apos;ll check it.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft.savedId && (
            <Link href={`/reports/${draft.savedId}`} className="label inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-2 text-ink hover:border-ink">
              Open report <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Start over</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!derived.complete || (!!draft.savedId && !dirtySinceSave)} title={!derived.complete ? "Finish the required details first" : undefined}>
            <Save className="h-4 w-4" /> {draft.savedId ? (dirtySinceSave ? "Save changes" : "Saved") : "Save booking"}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex rounded-full border border-line bg-card p-1 lg:hidden" role="tablist">
        {(["chat", "booking"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("label flex-1 rounded-full py-2", tab === t ? "bg-ink text-paper" : "text-ink-3")}>
            {t === "chat" ? "Chat" : `Booking & checks${derived.assessment.counts.red ? ` (${derived.assessment.counts.red} Red)` : ""}`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(360px,440px)_1fr]">
        {/* Chat */}
        <section className={clsx("flex h-[calc(100vh-200px)] min-h-[520px] flex-col rounded-2xl border border-line bg-card lg:sticky lg:top-[78px]", tab !== "chat" && "hidden lg:flex")} aria-label="Chat">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span className="label">Booking details</span>
              <span>{derived.complete ? "Complete" : `${derived.progress.filled} of ${derived.progress.total} filled`}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={clsx("h-full rounded-full transition-all", derived.complete ? "bg-green" : "bg-teal")} style={{ width: `${derived.complete ? 100 : pct}%` }} />
            </div>
            {!derived.complete && required.length > 0 && (
              <div className="mt-2 line-clamp-2 text-[11px] text-ink-3">Still needed: {required.slice(0, 6).map((m) => m.label).join(", ")}{required.length > 6 ? ` +${required.length - 6} more` : ""}</div>
            )}
          </div>

          <div ref={listRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {draft.messages.map((m, i) => (
              <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
                    m.role === "user" ? "rounded-br-md bg-ink text-paper" : "rounded-bl-md border border-line bg-paper text-ink",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-1 px-2 py-1" aria-label="Assistant is typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            {draft.messages.length === 1 && (
              <div className="space-y-2 pt-2">
                <div className="label text-ink-3">Try an example</div>
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border border-line px-3 py-2 text-left text-[13px] text-ink-2 hover:border-ink hover:text-ink">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(draft.offered?.length ?? 0) > 0 && !sending && (
            <div className="flex flex-wrap gap-1.5 border-t border-line px-4 pt-3">
              <button onClick={() => send("Yes, use the suggested value(s) you just offered.")} className="label rounded-full border border-teal px-3 py-1 text-teal hover:bg-teal hover:text-paper">
                Use suggested values
              </button>
            </div>
          )}

          <form
            className="flex items-end gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder={derived.complete ? "Change anything — e.g. “add a pallet” or “make it fastest”" : "Type your answer…"}
              className="max-h-40 min-h-[48px] flex-1 resize-none rounded-xl border border-line-2 bg-paper px-3 py-2.5 text-sm text-ink focus:border-indigo focus:outline-none"
              aria-label="Message"
            />
            <button type="submit" disabled={!input.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
        </section>

        {/* Live booking + checks */}
        <section className={clsx("min-w-0", tab !== "booking" && "hidden lg:block")} aria-label="Booking and checks">
          {!draft.booking.items.length && !draft.booking.originCity && !draft.booking.destinationCity ? (
            <div className="rounded-2xl border border-dashed border-line-2 bg-card/50 px-6 py-16 text-center">
              <div className="display text-xl font-bold text-ink">Your booking builds here as you talk</div>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">
                Every detail you give is shown and re-checked against the ten rules straight away. Nothing is guessed — anything missing is asked for, and you can edit any field directly.
              </p>
            </div>
          ) : (
            <ReportView booking={draft.booking} assessment={derived.assessment} onChange={onEdit} editorOpen={!derived.complete} />
          )}
        </section>
      </div>
    </Page>
  );
}
