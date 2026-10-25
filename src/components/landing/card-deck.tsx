"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { CarrierOption } from "@/lib/domain/types";

const COUNTRY_CODE: Record<string, string> = { "United Kingdom": "UK", Germany: "DE", France: "FR", Netherlands: "NL" };

/**
 * The rate card as a physical stack. Drag the top card past ~10% of the deck width to throw it;
 * arrow keys do the same. touch-action: pan-y keeps vertical page scroll working on phones.
 */
export function CardDeck({ options }: { options: CarrierOption[] }) {
  const deckRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState(() => options.map((_, i) => i));
  const [throwing, setThrowing] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const total = options.length;

  const reduced = () => !document.documentElement.classList.contains("motion-ok");

  const restack = useCallback(() => {
    setOrder((o) => [...o.slice(1), o[0]]);
    setThrowing(false);
  }, []);

  const throwCard = useCallback(
    (dir: 1 | -1) => {
      const el = topRef.current;
      const deck = deckRef.current;
      if (!el || !deck || throwing) return;
      if (reduced()) {
        restack();
        return;
      }
      setThrowing(true);
      const w = deck.offsetWidth;
      el.style.transition = "transform 420ms cubic-bezier(.2,.7,.2,1), opacity 420ms";
      el.style.transform = `translate(${dir * w * 1.15}px, -36px) rotate(${dir * 24}deg)`;
      el.style.opacity = "0";
      window.setTimeout(() => {
        el.style.transition = "none";
        el.style.transform = "";
        el.style.opacity = "";
        restack();
      }, 430);
    },
    [restack, throwing],
  );

  useEffect(() => {
    // Clear inline styles left on the new top card.
    const el = topRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
  }, [order]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (throwing || e.button !== 0) return;
    const el = topRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    el.style.transition = "none";
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = topRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x;
    d.dy = (e.clientY - d.y) * 0.35;
    el.style.transform = `translate(${d.dx}px, ${d.dy}px) rotate(${d.dx * 0.06}deg) scale(1.02)`;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = topRef.current;
    const deck = deckRef.current;
    drag.current = null;
    if (!d || !el || !deck) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (Math.abs(d.dx) > deck.offsetWidth * 0.1) {
      throwCard(d.dx > 0 ? 1 : -1);
    } else {
      el.style.transition = "transform 300ms cubic-bezier(.2,.7,.2,1)";
      el.style.transform = "";
    }
  };

  const current = order[0];

  return (
    <div>
      <div
        ref={deckRef}
        tabIndex={0}
        role="region"
        aria-roledescription="card deck"
        aria-label={`Rate card, ${total} services. Use left and right arrow keys to flip.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            throwCard(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            throwCard(-1);
          }
        }}
        className="relative mx-auto aspect-square w-full max-w-[460px] select-none rounded-3xl outline-offset-8"
        style={{ touchAction: "pan-y" }}
      >
        {order
          .slice(0, 5)
          .map((idx, depth) => {
            const o = options[idx];
            const isTop = depth === 0;
            return (
              <div
                key={idx}
                ref={isTop ? topRef : undefined}
                onPointerDown={isTop ? onPointerDown : undefined}
                onPointerMove={isTop ? onPointerMove : undefined}
                onPointerUp={isTop ? onPointerUp : undefined}
                onPointerCancel={isTop ? onPointerUp : undefined}
                className={clsx(
                  "absolute inset-0 flex flex-col justify-between rounded-3xl border border-[rgba(237,231,220,.13)] bg-ground-2 p-7 text-bone shadow-[0_24px_60px_-20px_rgba(0,0,0,.7)]",
                  isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
                )}
                style={{
                  zIndex: 10 - depth,
                  transform: isTop ? undefined : `translate(${depth * 8}px, ${depth * -10}px) scale(${1 - depth * 0.04}) rotate(${depth * -2.2}deg)`,
                  transition: isTop ? undefined : "transform 400ms cubic-bezier(.2,.7,.2,1)",
                  touchAction: "pan-y",
                }}
                aria-hidden={!isTop}
              >
                <div className="flex items-start justify-between">
                  <div className="label text-bone-2">
                    {COUNTRY_CODE[o.originCountry] ?? o.originCountry} → {COUNTRY_CODE[o.destinationCountry] ?? o.destinationCountry}
                  </div>
                  <div className="label text-bone-muted">
                    {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                  </div>
                </div>
                <div>
                  <div className="display text-[clamp(34px,5vw,52px)] font-extrabold leading-none tracking-[-0.03em]">{o.carrier}</div>
                  <div className="mt-2 text-[15px] text-bone-2">
                    {o.service} · {o.destinationCountry}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[rgba(237,231,220,.13)] pt-4">
                  <div>
                    <div className="label text-bone-muted">Per pallet</div>
                    <div className="display text-2xl font-bold text-amber">£{o.pricePerPallet}</div>
                  </div>
                  <div>
                    <div className="label text-bone-muted">Transit</div>
                    <div className="display text-2xl font-bold">{o.transitDays} days</div>
                  </div>
                  <div>
                    <div className="label text-bone-muted">On-time</div>
                    <div className="text-lg font-semibold">{o.onTimeRate}%</div>
                  </div>
                  <div>
                    <div className="label text-bone-muted">Max / pallet</div>
                    <div className="text-lg font-semibold">{o.maxWeightPerPalletKg} kg</div>
                  </div>
                </div>
              </div>
            );
          })
          .reverse()}
      </div>
      <div className="mx-auto mt-6 flex max-w-[460px] items-center justify-between gap-4">
        <p className="label text-bone-muted">Drag or use ← → to flip</p>
        <div className="flex gap-1.5" aria-hidden>
          {options.map((_, i) => (
            <span key={i} className={clsx("h-1.5 rounded-full transition-all", i === current ? "w-5 bg-amber" : "w-1.5 bg-[rgba(237,231,220,.25)]")} />
          ))}
        </div>
      </div>
    </div>
  );
}
