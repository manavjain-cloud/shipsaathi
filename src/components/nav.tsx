"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/upload", label: "Upload Excel" },
  { href: "/reports", label: "Validation Reports" },
  { href: "/carriers", label: "Carrier Comparison" },
  { href: "/history", label: "History" },
];

export function Nav() {
  const path = usePathname();
  const dark = path === "/";
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 h-[58px] border-b backdrop-blur-[14px]",
        dark ? "border-[rgba(237,231,220,.13)] bg-[rgba(10,12,14,.72)] text-bone" : "border-line bg-[rgba(247,246,242,.82)] text-ink",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="display text-[15px] font-extrabold tracking-[-0.02em]" aria-label="ShipSaathi home">
          ShipSaathi<span className="text-amber">.</span>
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "label transition-colors hover:text-amber",
                active(l.href) ? (dark ? "text-bone" : "text-ink") : dark ? "text-bone-2" : "text-ink-3",
              )}
              aria-current={active(l.href) ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className={clsx(
              "label rounded-full border px-4 py-2 transition-colors",
              dark ? "border-bone text-bone hover:border-amber hover:text-amber" : "border-ink bg-ink text-paper hover:bg-ink-2",
            )}
          >
            New shipment
          </Link>
          <button
            className={clsx("rounded-full p-2 lg:hidden", dark ? "text-bone" : "text-ink")}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          className={clsx("border-b px-4 pb-4 pt-2 lg:hidden", dark ? "border-[rgba(237,231,220,.13)] bg-ground" : "border-line bg-paper")}
          aria-label="Mobile"
        >
          {[{ href: "/new", label: "New Shipment" }, ...LINKS].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={clsx("label block py-3", active(l.href) ? "text-amber" : dark ? "text-bone" : "text-ink")}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Static placeholder shown while the pathname streams in on dynamic routes. */
export function NavFallback() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[58px] border-b border-line bg-[rgba(247,246,242,.82)] text-ink backdrop-blur-[14px]">
      <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="display text-[15px] font-extrabold tracking-[-0.02em]">
          ShipSaathi<span className="text-amber">.</span>
        </Link>
        <Link href="/new" className="label rounded-full border border-ink bg-ink px-4 py-2 text-paper">
          New shipment
        </Link>
      </div>
    </header>
  );
}
