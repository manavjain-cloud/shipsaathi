"use client";
import { useState } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { BOOKING_FIELD_LABELS, ITEM_FIELD_LABELS } from "@/lib/domain/conversation";
import { addItem, editBookingField, editItemField, rawValue, removeItem } from "@/lib/domain/edit";
import { ALLOWED } from "@/lib/domain/normalize";
import { DESTINATION_TYPES, SELLER_PRIORITIES, type Booking, type BookingField, type DataIssue, type ItemField } from "@/lib/domain/types";

type Kind = "text" | "number" | "date" | "select" | "yesno" | "datalist";

const BOOKING_LAYOUT: { field: BookingField; kind: Kind; options?: readonly string[]; span?: 2 }[] = [
  { field: "bookingId", kind: "text" },
  { field: "sellerName", kind: "text" },
  { field: "originCity", kind: "datalist", options: ALLOWED.originCities },
  { field: "originCountry", kind: "datalist", options: ALLOWED.originCountries },
  { field: "destinationCity", kind: "datalist", options: Object.values(ALLOWED.destinationCities).flat() },
  { field: "destinationCountry", kind: "datalist", options: ALLOWED.destinationCountries },
  { field: "destinationType", kind: "select", options: DESTINATION_TYPES },
  { field: "deliveryAppointmentBooked", kind: "yesno" },
  { field: "readyToShipDate", kind: "date" },
  { field: "sellerPriority", kind: "select", options: SELLER_PRIORITIES },
  { field: "pallets", kind: "number" },
  { field: "cartons", kind: "number" },
  { field: "totalGrossWeightKg", kind: "number" },
  { field: "totalDeclaredValue", kind: "number" },
  { field: "currency", kind: "text" },
];

const ITEM_COLS: { field: ItemField; kind: Kind; w: string }[] = [
  { field: "sku", kind: "text", w: "w-24" },
  { field: "description", kind: "text", w: "min-w-[200px]" },
  { field: "hsCode", kind: "text", w: "w-24" },
  { field: "quantity", kind: "number", w: "w-20" },
  { field: "unitPrice", kind: "number", w: "w-20" },
  { field: "unitsPerCarton", kind: "number", w: "w-20" },
  { field: "cartons", kind: "number", w: "w-20" },
  { field: "unitWeightKg", kind: "number", w: "w-20" },
  { field: "countryOfOrigin", kind: "datalist", w: "w-32" },
];

function CellInput({
  value,
  kind,
  options,
  onCommit,
  invalid,
  label,
  compact,
  disabled,
  listId,
}: {
  value: string;
  kind: Kind;
  options?: readonly string[];
  onCommit: (raw: string) => string | undefined;
  invalid?: boolean;
  label: string;
  compact?: boolean;
  disabled?: boolean;
  listId?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState<string | undefined>();
  const commit = (v: string) => {
    if (v === value) return;
    const e = onCommit(v);
    setErr(e);
    if (e) setDraft(v);
  };
  const base = clsx(
    "w-full rounded-lg border bg-card text-ink placeholder:text-ink-3/60 transition-colors focus:border-indigo focus:outline-none disabled:bg-paper disabled:text-ink-3",
    compact ? "px-2 py-1.5 text-[13px]" : "px-3 py-2 text-sm",
    err || invalid ? "border-red/50 bg-red-soft/40" : "border-line-2",
  );
  return (
    <div>
      {kind === "select" || kind === "yesno" ? (
        <select
          aria-label={label}
          className={base}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
        >
          <option value="">—</option>
          {(kind === "yesno" ? ["Yes", "No"] : options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          className={base}
          type={kind === "date" ? "date" : "text"}
          inputMode={kind === "number" ? "decimal" : undefined}
          list={kind === "datalist" ? listId : undefined}
          value={draft}
          disabled={disabled}
          placeholder={kind === "number" ? "0" : ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
      {err && <div className="mt-1 text-[11px] text-red">{err}</div>}
    </div>
  );
}

export function BookingEditor({
  booking,
  onChange,
  disabled,
  issues = [],
}: {
  booking: Booking;
  onChange: (b: Booking, detail: string) => void;
  disabled?: boolean;
  issues?: DataIssue[];
}) {
  const fieldBad = (label: string, lineNo?: number) => issues.some((i) => i.field === label && i.lineNo === lineNo && i.severity === "error");
  return (
    <div className="space-y-6">
      <datalist id="dl-origin-city">{ALLOWED.originCities.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-origin-country">{ALLOWED.originCountries.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-dest-city">{Object.values(ALLOWED.destinationCities).flat().map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-dest-country">{ALLOWED.destinationCountries.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-item-origin">{ALLOWED.itemOrigins.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {BOOKING_LAYOUT.map(({ field, kind, options }) => {
          const label = BOOKING_FIELD_LABELS[field];
          const listId =
            field === "originCity" ? "dl-origin-city" : field === "originCountry" ? "dl-origin-country" : field === "destinationCity" ? "dl-dest-city" : field === "destinationCountry" ? "dl-dest-country" : undefined;
          return (
            <label key={field} className="block">
              <span className="label mb-1 block text-ink-3">{label}</span>
              <CellInput
                key={rawValue(booking[field])}
                label={label}
                kind={kind}
                options={options}
                listId={listId}
                disabled={disabled}
                invalid={fieldBad(label)}
                value={rawValue(booking[field])}
                onCommit={(raw) => {
                  const r = editBookingField(booking, field, raw);
                  if (!r.error) onChange(r.booking, `${label} changed`);
                  return r.error;
                }}
              />
            </label>
          );
        })}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label text-ink-3">Items ({booking.items.length})</span>
          {!disabled && (
            <button className="label inline-flex items-center gap-1 text-indigo hover:text-ink" onClick={() => onChange(addItem(booking), "Item added")}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          )}
        </div>
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-paper/60">
                <th className="label w-8 px-2 py-2 text-ink-3">#</th>
                {ITEM_COLS.map((c) => (
                  <th key={c.field} className={clsx("label px-1.5 py-2 text-ink-3", c.w)}>
                    {ITEM_FIELD_LABELS[c.field]}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {booking.items.map((it) => (
                <tr key={it.lineNo} className="border-b border-line last:border-0">
                  <td className="px-2 py-1.5 text-xs text-ink-3">{it.lineNo}</td>
                  {ITEM_COLS.map((c) => (
                    <td key={c.field} className={clsx("px-1 py-1", c.w)}>
                      <CellInput
                        key={`${it.lineNo}:${rawValue(it[c.field])}`}
                        compact
                        label={`Item ${it.lineNo} ${ITEM_FIELD_LABELS[c.field]}`}
                        kind={c.kind}
                        listId={c.field === "countryOfOrigin" ? "dl-item-origin" : undefined}
                        disabled={disabled}
                        invalid={fieldBad(ITEM_FIELD_LABELS[c.field], it.lineNo)}
                        value={rawValue(it[c.field])}
                        onCommit={(raw) => {
                          const r = editItemField(booking, it.lineNo, c.field, raw);
                          if (!r.error) onChange(r.booking, `Item ${it.lineNo} ${ITEM_FIELD_LABELS[c.field]} changed`);
                          return r.error;
                        }}
                      />
                    </td>
                  ))}
                  <td className="px-1">
                    {!disabled && (
                      <button className="rounded p-1.5 text-ink-3 hover:text-red" aria-label={`Remove item ${it.lineNo}`} onClick={() => onChange(removeItem(booking, it.lineNo), `Item ${it.lineNo} removed`)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!booking.items.length && (
                <tr>
                  <td colSpan={ITEM_COLS.length + 2} className="px-3 py-6 text-center text-sm text-ink-3">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">Money in GBP. Dates are shown as DD-MM-YYYY in reports. Leave a cell empty to clear it.</p>
      </div>
    </div>
  );
}
