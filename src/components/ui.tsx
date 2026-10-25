"use client";
import clsx from "clsx";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { Assessment } from "@/lib/domain/types";
import { STATUS_LABEL } from "@/lib/domain/validation";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean };

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3.5 py-1.5 text-[13px]" : "px-5 py-2.5 text-sm",
        variant === "primary" && "bg-ink text-paper hover:bg-ink-2",
        variant === "secondary" && "border border-line-2 bg-card text-ink hover:border-ink",
        variant === "ghost" && "text-ink-2 hover:bg-line/50",
        variant === "danger" && "border border-red/30 bg-card text-red hover:border-red",
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: "primary" | "secondary"; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
        variant === "primary" ? "bg-ink text-paper hover:bg-ink-2" : "border border-line-2 bg-card text-ink hover:border-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}

const STATUS_STYLE: Record<Assessment["status"], string> = {
  blocked: "border-red/30 bg-red-soft text-red",
  review: "border-amberw/30 bg-amberw-soft text-amberw",
  warnings: "border-amberw/30 bg-amberw-soft text-amberw",
  ready: "border-green/30 bg-green-soft text-green",
};
const STATUS_DOT: Record<Assessment["status"], string> = { blocked: "bg-red", review: "bg-amberw", warnings: "bg-amberw", ready: "bg-green" };

export function StatusBadge({ status, className }: { status: Assessment["status"]; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status], className)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SeverityTag({ severity, status }: { severity: "Red" | "Amber"; status?: "fail" | "review" | "pass" }) {
  if (status === "pass") return <span className="label inline-flex items-center gap-1.5 text-green"><span className="h-1.5 w-1.5 rounded-full bg-green" />Pass</span>;
  if (status === "review") return <span className="label inline-flex items-center gap-1.5 text-amberw"><span className="h-1.5 w-1.5 rounded-full border border-amberw" />Review</span>;
  return (
    <span className={clsx("label inline-flex items-center gap-1.5", severity === "Red" ? "text-red" : "text-amberw")}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", severity === "Red" ? "bg-red" : "bg-amberw")} />
      {severity}
    </span>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx("rounded-2xl border border-line bg-card", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="label mb-2 flex items-center gap-2 text-ink-3">
          <span className="h-px w-6 bg-teal" aria-hidden />
          {eyebrow}
        </div>
        <h1 className="display text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.05] text-ink">{title}</h1>
        {children && <div className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-4 w-4 animate-spin", className)} aria-label="Loading" />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center">
      <div className="display text-lg font-semibold text-ink">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={clsx("mx-auto max-w-[1320px] px-4 pb-24 pt-[94px] sm:px-6", className)}>{children}</main>;
}

export function fmtDateTime(s: string) {
  const d = new Date(s);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
