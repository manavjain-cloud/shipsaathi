"use client";
import Link from "next/link";
import { CheckCircle2, FilePlus2, Mail, MailX, PencilLine, RefreshCw, ShieldCheck, Truck, Upload } from "lucide-react";
import { fmtDateTime } from "@/components/ui";

export interface EventRow {
  id: string;
  type: string;
  detail: Record<string, unknown>;
  created_at: string;
  booking_id?: string;
  booking_ref?: string;
  seller_name?: string | null;
}

const META: Record<string, { label: string; Icon: typeof FilePlus2 }> = {
  created: { label: "Booking saved", Icon: FilePlus2 },
  uploaded: { label: "Imported from Excel", Icon: Upload },
  edited: { label: "Details edited · checks re-run", Icon: PencilLine },
  rechecked: { label: "Checks re-run", Icon: RefreshCw },
  "carrier-selected": { label: "Carrier selection changed", Icon: Truck },
  "hazard-acknowledged": { label: "Item confirmed safe by seller", Icon: ShieldCheck },
  confirmed: { label: "Proposed booking confirmed", Icon: CheckCircle2 },
  "email-sent": { label: "Email sent", Icon: Mail },
  "email-failed": { label: "Email failed", Icon: MailX },
};

function describe(e: EventRow): string {
  const d = e.detail ?? {};
  const parts: string[] = [];
  if (typeof d.change === "string") parts.push(d.change);
  if (typeof d.status === "string") parts.push(`status: ${d.status}`);
  if (typeof d.red === "number") parts.push(`${d.red} Red · ${d.amber ?? 0} Amber`);
  if (typeof d.carrier === "string") parts.push(d.carrier);
  if (typeof d.toDomain === "string") parts.push(`to …@${d.toDomain}`);
  if (typeof d.error === "string") parts.push(d.error);
  return parts.join(" · ");
}

export function EventList({ events, compact }: { events: EventRow[]; compact?: boolean }) {
  if (!events.length) return <p className="text-sm text-ink-3">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e) => {
        const m = META[e.type] ?? { label: e.type, Icon: PencilLine };
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[27px] top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line bg-card">
              <span className={e.type === "email-failed" ? "h-1.5 w-1.5 rounded-full bg-red" : e.type === "confirmed" ? "h-1.5 w-1.5 rounded-full bg-green" : "h-1.5 w-1.5 rounded-full bg-teal"} />
            </span>
            <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <m.Icon className="h-3.5 w-3.5 text-ink-3" /> {m.label}
            </div>
            {!compact && e.booking_ref && (
              <Link href={`/reports/${e.booking_id}`} className="text-sm text-indigo hover:underline">
                {e.booking_ref}
                {e.seller_name ? ` · ${e.seller_name}` : ""}
              </Link>
            )}
            {describe(e) && <div className="text-xs text-ink-3">{describe(e)}</div>}
            <div className="text-[11px] text-ink-3">{fmtDateTime(e.created_at)}</div>
          </li>
        );
      })}
    </ol>
  );
}
