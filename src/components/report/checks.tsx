"use client";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleAlert, OctagonX, ShieldQuestion } from "lucide-react";
import { hazardKey } from "@/lib/domain/hazmat";
import type { Assessment, Booking, Finding } from "@/lib/domain/types";
import { SeverityTag } from "@/components/ui";

export function RuleChecklist({ assessment }: { assessment: Assessment }) {
  return (
    <ol className="divide-y divide-line">
      {assessment.checks.map((c) => (
        <li key={c.ruleId} className="flex items-start gap-3 py-2.5">
          <span className="label mt-0.5 w-10 shrink-0 text-ink-3">{c.ruleId}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-ink">{c.rule}</div>
            <div className={clsx("text-xs", c.status === "pass" ? "text-ink-3" : c.status === "review" ? "text-amberw" : c.severity === "Red" ? "text-red" : "text-amberw")}>{c.summary}</div>
          </div>
          <SeverityTag severity={c.severity} status={c.status} />
        </li>
      ))}
    </ol>
  );
}

function FindingCard({ f, onAcknowledge, booking }: { f: Finding; booking: Booking; onAcknowledge?: (key: string) => void }) {
  const red = f.status === "fail" && f.severity === "Red";
  const review = f.status === "review";
  const Icon = review ? ShieldQuestion : red ? OctagonX : AlertTriangle;
  const item = f.lineNo ? booking.items.find((i) => i.lineNo === f.lineNo) : undefined;
  return (
    <article
      className={clsx(
        "rounded-xl border bg-card p-4",
        red ? "border-red/25" : "border-amberw/25",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon className={clsx("h-4 w-4", red ? "text-red" : "text-amberw")} aria-hidden />
        <span className="label text-ink">{f.ruleId}</span>
        <SeverityTag severity={f.severity} status={f.status} />
        <span className="text-xs text-ink-3">
          {f.field}
          {f.lineNo ? ` · Item ${f.lineNo}${f.sku ? ` (${f.sku})` : ""}` : ""}
        </span>
      </header>
      <p className="mt-2 text-sm leading-relaxed text-ink">{f.explanation}</p>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
        <div className="rounded-lg bg-paper px-3 py-2">
          <dt className="label text-ink-3">Actual</dt>
          <dd className="mt-0.5 break-words text-ink">{f.actual}</dd>
        </div>
        <div className="rounded-lg bg-paper px-3 py-2">
          <dt className="label text-ink-3">Expected</dt>
          <dd className="mt-0.5 break-words text-ink">{f.expected}</dd>
        </div>
      </dl>
      <p className="mt-3 border-l-2 border-teal pl-3 text-[13px] text-ink-2">
        <span className="font-semibold text-ink">Fix: </span>
        {f.fix}
      </p>
      {review && onAcknowledge && item && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2">
          <span className="text-xs text-ink-2">Checked the product? It contains no lithium battery, aerosol or flammable liquid.</span>
          <button
            className="label rounded-full border border-ink px-3 py-1 text-ink hover:bg-ink hover:text-paper"
            onClick={() => onAcknowledge(hazardKey(item.lineNo, item.description))}
          >
            Confirm safe
          </button>
        </div>
      )}
    </article>
  );
}

function FindingSection({ title, list, tone, booking, onAcknowledge }: { title: string; list: Finding[]; tone: "red" | "amber"; booking: Booking; onAcknowledge?: (key: string) => void }) {
  if (!list.length) return null;
  return (
    <section>
      <h3 className={clsx("label mb-2 flex items-center gap-2", tone === "red" ? "text-red" : "text-amberw")}>
        <span className={clsx("h-1.5 w-1.5 rounded-full", tone === "red" ? "bg-red" : "bg-amberw")} />
        {title} ({list.length})
      </h3>
      <div className="space-y-3">
        {list.map((f, i) => (
          <FindingCard key={`${f.ruleId}-${f.lineNo ?? "b"}-${i}`} f={f} booking={booking} onAcknowledge={onAcknowledge} />
        ))}
      </div>
    </section>
  );
}

export function IssueList({ assessment, booking, onAcknowledge }: { assessment: Assessment; booking: Booking; onAcknowledge?: (key: string) => void }) {
  const all = assessment.checks.flatMap((c) => c.findings);
  const red = all.filter((f) => f.status === "fail" && f.severity === "Red");
  const review = all.filter((f) => f.status === "review");
  const amber = all.filter((f) => f.status === "fail" && f.severity === "Amber");
  const dataErrors = assessment.dataIssues.filter((i) => i.severity === "error");
  const dataWarnings = assessment.dataIssues.filter((i) => i.severity === "warning");

  if (!all.length && !assessment.dataIssues.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green/25 bg-green-soft px-4 py-3 text-sm text-green">
        <CheckCircle2 className="h-5 w-5" /> All ten pre-flight checks passed and every required field is filled.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dataErrors.length > 0 && (
        <section>
          <h3 className="label mb-2 flex items-center gap-2 text-red">
            <CircleAlert className="h-3.5 w-3.5" /> Missing or unreadable data ({dataErrors.length})
          </h3>
          <ul className="space-y-1.5 rounded-xl border border-red/25 bg-card p-4 text-sm text-ink">
            {dataErrors.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-red">•</span>
                <span>
                  {d.lineNo ? <span className="text-ink-3">Item {d.lineNo}{d.sku ? ` (${d.sku})` : ""}: </span> : null}
                  {d.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FindingSection title="Red — must fix before dispatch" list={red} tone="red" booking={booking} onAcknowledge={onAcknowledge} />
      <FindingSection title="Needs human review" list={review} tone="amber" booking={booking} onAcknowledge={onAcknowledge} />
      <FindingSection title="Amber — risky, check or fix" list={amber} tone="amber" booking={booking} onAcknowledge={onAcknowledge} />
      {dataWarnings.length > 0 && (
        <section>
          <h3 className="label mb-2 text-ink-3">Notes</h3>
          <ul className="space-y-1 text-[13px] text-ink-2">
            {dataWarnings.map((d, i) => (
              <li key={i}>• {d.lineNo ? `Item ${d.lineNo}: ` : ""}{d.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
