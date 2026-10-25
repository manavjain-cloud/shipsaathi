"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Download, FileSpreadsheet, Info, Search, TriangleAlert, UploadCloud, XCircle } from "lucide-react";
import type { Assessment, Booking } from "@/lib/domain/types";
import type { UploadIssue } from "@/lib/domain/excel";
import { formatGBP } from "@/lib/domain/normalize";
import { ReportView } from "@/components/report/report-view";
import { Button, Card, Page, PageHeader, StatusBadge } from "@/components/ui";

interface UploadResult {
  ok: boolean;
  uploadId: string | null;
  persisted: boolean;
  filename: string;
  aiChecked: boolean;
  issues: UploadIssue[];
  stats: { bookingRows: number; itemRows: number; orphanItems: number; duplicateIds: number; skippedExampleRows: number };
  rateCardSource: "uploaded" | "default";
  results: { id: string | null; booking: Booking; assessment: Assessment }[];
}

export function UploadClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; issues?: UploadIssue[] } | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Assessment["status"]>("all");
  const [open, setOpen] = useState<number | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setResult(null);
    setOpen(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setError({ message: "Please choose an .xlsx file in the template format." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError({ message: "File is larger than 5 MB." });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setError({ message: j.error ?? "The workbook couldn't be processed.", issues: j.issues });
        return;
      }
      setResult(j);
    } catch {
      setError({ message: "Upload failed — check your connection and try again." });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const rows = (result?.results ?? []).map((r, i) => ({ ...r, i }));
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (filter === "all" || r.assessment.status === filter) &&
      (!q || [r.booking.bookingId, r.booking.sellerName, r.booking.destinationCity, r.booking.destinationCountry].some((v) => v?.toLowerCase().includes(q))),
  );
  const count = (s: Assessment["status"]) => rows.filter((r) => r.assessment.status === s).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Upload Excel"
        title="Check a whole booking sheet at once"
        actions={
          <>
            <a href="/templates/ShipSaathi_Booking_Template.xlsx" download className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-4 py-2 text-sm text-ink hover:border-ink">
              <Download className="h-4 w-4" /> Blank template
            </a>
            <a
              href="/templates/ShipSaathi_Sample_With_Mistakes.xlsx"
              download
              title="Demo input with deliberate mistakes for every rule — not real bookings"
              className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-4 py-2 text-sm text-ink hover:border-ink"
            >
              <Download className="h-4 w-4" /> Sample with planted mistakes
            </a>
          </>
        }
      >
        Upload a workbook with the <b>Bookings</b> and <b>Items</b> sheets from the supplied template. Items are linked to bookings by Booking ID, every booking runs through
        the same ten checks as the chat, and each gets a carrier recommendation from the fixed rate card.
      </PageHeader>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={clsx(
          "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          drag ? "border-teal bg-[rgba(46,107,114,.05)]" : "border-line-2 bg-card",
        )}
      >
        <UploadCloud className={clsx("h-9 w-9", drag ? "text-teal" : "text-ink-3")} />
        <div className="display mt-3 text-lg font-bold text-ink">{busy ? "Reading and checking your workbook…" : "Drop your .xlsx here"}</div>
        <p className="mt-1 text-sm text-ink-3">or choose a file · max 5 MB · Sheets 1 &amp; 2 required, Carrier options and Rulebook optional</p>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button className="mt-5" onClick={() => inputRef.current?.click()} loading={busy}>
          <FileSpreadsheet className="h-4 w-4" /> Choose file
        </Button>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red/25 bg-red-soft p-5 text-sm text-red">
          <div className="flex items-center gap-2 font-semibold">
            <XCircle className="h-4 w-4" /> {error.message}
          </div>
          {error.issues && error.issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-ink">
              {error.issues.map((i, k) => (
                <li key={k}>• {i.message}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-ink-2">Compare your file with the template: the header row must contain the template&apos;s column names exactly (any order).</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { k: "Bookings", v: rows.length },
              { k: "Blocked", v: count("blocked"), c: "text-red" },
              { k: "Needs review", v: count("review"), c: "text-amberw" },
              { k: "Warnings only", v: count("warnings"), c: "text-amberw" },
              { k: "Dispatch-ready", v: count("ready"), c: "text-green" },
            ].map((s) => (
              <Card key={s.k} className="px-4 py-3">
                <div className="label text-ink-3">{s.k}</div>
                <div className={clsx("display mt-1 text-2xl font-bold", s.c ?? "text-ink")}>{s.v}</div>
              </Card>
            ))}
          </div>

          <Card className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-2">
              <span className="font-semibold text-ink">{result.filename}</span>
              <span>{result.stats.itemRows} item rows</span>
              <span>Rate card: {result.rateCardSource === "uploaded" ? "from this workbook" : "supplied template"}</span>
              <span>AI prohibited-goods check: {result.aiChecked ? "done" : "unavailable (keyword screen only)"}</span>
              <span>{result.persisted ? "Saved to Reports" : "Not saved"}</span>
            </div>
            {result.issues.length > 0 && (
              <ul className="mt-3 space-y-1">
                {result.issues.map((i, k) => (
                  <li key={k} className={clsx("flex items-start gap-2", i.severity === "warning" ? "text-amberw" : i.severity === "error" ? "text-red" : "text-ink-3")}>
                    {i.severity === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <span>
                      {i.row ? `${i.sheet ?? ""} row ${i.row}: ` : ""}
                      {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search booking, seller, city" className="w-full rounded-full border border-line-2 bg-card py-2 pl-9 pr-3 text-sm focus:border-indigo focus:outline-none" aria-label="Search bookings" />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "blocked", "review", "warnings", "ready"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={clsx("label rounded-full border px-3 py-1.5", filter === f ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-ink")}>
                  {f === "all" ? "All" : f === "blocked" ? "Blocked" : f === "review" ? "Review" : f === "warnings" ? "Warnings" : "Ready"}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            {visible.map((r) => {
              const rec = r.assessment.carrier.recommended?.evaluation;
              const isOpen = open === r.i;
              return (
                <div key={r.i} className="border-b border-line last:border-0">
                  <button className="grid w-full grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left hover:bg-paper/60 md:grid-cols-[24px_120px_1fr_1fr_170px_90px_1fr]" onClick={() => setOpen(isOpen ? null : r.i)} aria-expanded={isOpen}>
                    <ChevronRight className={clsx("hidden h-4 w-4 text-ink-3 transition-transform md:block", isOpen && "rotate-90")} />
                    <span className="display font-bold text-ink">{r.booking.bookingId}</span>
                    <span className="truncate text-sm text-ink-2">{r.booking.sellerName ?? "—"}</span>
                    <span className="truncate text-sm text-ink-2">{r.booking.originCity ?? "?"} → {r.booking.destinationCity ?? "?"}</span>
                    <StatusBadge status={r.assessment.status} className="justify-self-start" />
                    <span className="text-sm">
                      <span className="text-red">{r.assessment.counts.red + r.assessment.counts.dataErrors}</span> · <span className="text-amberw">{r.assessment.counts.amber + r.assessment.counts.review}</span>
                    </span>
                    <span className="truncate text-sm text-ink-2">{rec ? `${rec.option.carrier} · ${formatGBP(rec.cost)}` : "No eligible carrier"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-line bg-paper/50 px-3 py-4 sm:px-5">
                      {r.id && (
                        <div className="mb-3 flex justify-end">
                          <Link href={`/reports/${r.id}`} className="label rounded-full border border-ink px-3 py-1.5 text-ink hover:bg-ink hover:text-paper">
                            Open full report to fix, confirm or email →
                          </Link>
                        </div>
                      )}
                      <ReportView booking={r.booking} assessment={r.assessment} editable={false} />
                    </div>
                  )}
                </div>
              );
            })}
            {!visible.length && <div className="px-4 py-8 text-center text-sm text-ink-3">No bookings match.</div>}
          </div>
          <p className="text-xs text-ink-3">Red / Amber counts include missing-data errors and items awaiting a prohibited-goods review. Open a booking to edit it and re-run the checks.</p>
        </div>
      )}
    </Page>
  );
}
