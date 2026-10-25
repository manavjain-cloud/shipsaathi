"use client";
import { useEffect, useState } from "react";
import { EventList, type EventRow } from "@/components/events";
import { Card, Empty, Page, PageHeader, Spinner } from "@/components/ui";

export function HistoryClient() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");

  useEffect(() => {
    fetch("/api/history", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load");
        setEvents(j.events);
      })
      .catch((e) => setError(e.message));
  }, []);

  const types = [...new Set((events ?? []).map((e) => e.type))];
  const shown = (events ?? []).filter((e) => type === "all" || e.type === type);

  return (
    <Page>
      <PageHeader eyebrow="Shipment history" title="What happened, and when">
        Every save, edit, re-check, carrier change, confirmation and email attempt, newest first. Stored in Neon Postgres.
      </PageHeader>
      {error ? (
        <Empty title="Couldn't load history">{error}</Empty>
      ) : !events ? (
        <div className="flex items-center gap-2 text-ink-3"><Spinner /> Loading…</div>
      ) : !events.length ? (
        <Empty title="Nothing yet">Activity appears here once a booking is saved or uploaded.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          <Card className="h-fit p-4">
            <div className="label mb-2 text-ink-3">Filter</div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-line-2 bg-card px-3 py-2 text-sm">
              <option value="all">All activity ({events.length})</option>
              {types.map((t) => (
                <option key={t} value={t}>{t} ({events.filter((e) => e.type === t).length})</option>
              ))}
            </select>
          </Card>
          <Card className="p-6">
            <EventList events={shown} />
          </Card>
        </div>
      )}
    </Page>
  );
}
