import "server-only";
import { Resend } from "resend";
import { displayDate } from "@/lib/domain/dates";
import { formatGBP, formatNum } from "@/lib/domain/normalize";
import type { Assessment, Booking } from "@/lib/domain/types";
import { STATUS_LABEL } from "@/lib/domain/validation";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STATUS_COLOR: Record<Assessment["status"], string> = { blocked: "#B42318", review: "#B54708", warnings: "#B54708", ready: "#067647" };

export function renderEmail(b: Booking, a: Assessment, kind: "summary" | "report", link: string | null): { subject: string; html: string; text: string } {
  const rec = a.carrier.recommended?.evaluation;
  const subject = `${kind === "report" ? "Validation report" : "Booking summary"} · ${b.bookingId ?? "Shipment"} · ${STATUS_LABEL[a.status]}`;
  const findings = a.checks.flatMap((c) => c.findings);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#5B6472;width:44%">${esc(k)}</td><td style="padding:6px 0;color:#0E1B33;font-weight:600">${esc(v)}</td></tr>`;

  const issueHtml = findings.length
    ? findings
        .map(
          (f) => `<div style="border:1px solid #E4E2DC;border-left:3px solid ${f.status === "fail" && f.severity === "Red" ? "#B42318" : "#B54708"};padding:12px 14px;margin:0 0 10px;border-radius:6px">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5B6472">${esc(f.ruleId)} · ${f.status === "review" ? "Needs review" : esc(f.severity)}${f.lineNo ? ` · Item ${f.lineNo}${f.sku ? ` (${esc(f.sku)})` : ""}` : ""}</div>
        <div style="margin:6px 0;color:#0E1B33">${esc(f.explanation)}</div>
        <div style="font-size:13px;color:#5B6472">Actual: ${esc(f.actual)} · Expected: ${esc(f.expected)}</div>
        <div style="font-size:13px;color:#0E1B33;margin-top:6px"><strong>Fix:</strong> ${esc(f.fix)}</div></div>`,
        )
        .join("")
    : `<p style="color:#067647">All ten pre-flight checks passed.</p>`;

  const dataHtml = a.dataIssues.length
    ? `<h3 style="font-size:15px;margin:22px 0 8px">Data issues</h3><ul style="padding-left:18px;color:#0E1B33">${a.dataIssues.map((i) => `<li>${esc(i.message)}</li>`).join("")}</ul>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:28px 20px">
    <div style="font-weight:800;font-size:18px;color:#0E1B33">SaathiFly<span style="color:#E8913C">.</span></div>
    <h1 style="font-size:22px;color:#0E1B33;margin:18px 0 4px">${esc(kind === "report" ? "Pre-flight validation report" : "Proposed booking summary")}</h1>
    <div style="display:inline-block;margin:6px 0 18px;padding:4px 10px;border-radius:999px;border:1px solid ${STATUS_COLOR[a.status]};color:${STATUS_COLOR[a.status]};font-size:13px;font-weight:600">${esc(STATUS_LABEL[a.status])}</div>
    <div style="background:#fff;border:1px solid #E4E2DC;border-radius:10px;padding:18px 20px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Booking ID", b.bookingId ?? "—")}
        ${row("Seller", b.sellerName ?? "—")}
        ${row("Route", `${b.originCity ?? "?"}, ${b.originCountry ?? "?"} → ${b.destinationCity ?? "?"}, ${b.destinationCountry ?? "?"}`)}
        ${row("Destination type", b.destinationType ?? "—")}
        ${row("Ready to ship", displayDate(b.readyToShipDate))}
        ${row("Pallets / cartons", `${formatNum(b.pallets)} / ${formatNum(b.cartons)}`)}
        ${row("Gross weight", `${formatNum(b.totalGrossWeightKg)} kg (${formatNum(a.totals.weightPerPalletKg)} kg per pallet)`)}
        ${row("Declared value", formatGBP(b.totalDeclaredValue))}
        ${row("Items", String(b.items.length))}
        ${row("Seller priority", b.sellerPriority ?? "—")}
        ${row("Recommended carrier", rec ? `${rec.option.carrier} · ${rec.option.service} — ${formatGBP(rec.cost)}, ${rec.option.transitDays} days, ${rec.option.onTimeRate}% on time` : "None eligible")}
      </table>
    </div>
    <p style="color:#0E1B33;font-size:14px;line-height:1.5">${esc(a.carrier.explanation)}</p>
    <h3 style="font-size:15px;margin:22px 0 8px">Checks: ${a.counts.red} Red · ${a.counts.amber} Amber · ${a.counts.review} to review</h3>
    ${issueHtml}
    ${dataHtml}
    ${link ? `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#0E1B33;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-size:14px">Open the full report</a></p>` : ""}
    <p style="font-size:12px;color:#5B6472;line-height:1.5;border-top:1px solid #E4E2DC;padding-top:14px;margin-top:24px">
      This is a <strong>proposed</strong> booking. No carrier has been booked — SaathiFly has no live carrier integration. Prices, transit times and on-time rates come from the fixed rate card and are not a delivery guarantee.
      ${esc(a.disclaimer)}
    </p>
  </div></body></html>`;

  const text = [
    subject,
    "",
    `Route: ${b.originCity}, ${b.originCountry} → ${b.destinationCity}, ${b.destinationCountry}`,
    `Status: ${STATUS_LABEL[a.status]} (${a.counts.red} Red, ${a.counts.amber} Amber, ${a.counts.review} to review)`,
    rec ? `Recommended: ${rec.option.carrier} ${rec.option.service}, ${formatGBP(rec.cost)}, ${rec.option.transitDays} days, ${rec.option.onTimeRate}% on time` : "No eligible carrier",
    "",
    ...findings.map((f) => `- ${f.ruleId} ${f.status === "review" ? "Review" : f.severity}: ${f.explanation} Fix: ${f.fix}`),
    "",
    link ? `Full report: ${link}` : "",
    "Proposed booking only — no carrier has been booked.",
  ].join("\n");

  return { subject, html, text };
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "Email isn't configured on this deployment (RESEND_API_KEY missing)." };
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || "SaathiFly <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    });
    if (error || !data) {
      const msg = error?.message ?? "unknown error";
      // Resend's test sender can only deliver to the account owner's address.
      const hint = /testing emails|own email|verify a domain/i.test(msg)
        ? " Without a verified domain, Resend only delivers to the email address that owns the Resend account."
        : "";
      return { ok: false, error: `Resend rejected the email: ${msg}.${hint}` };
    }
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: "Could not reach Resend. Please try again." };
  }
}
