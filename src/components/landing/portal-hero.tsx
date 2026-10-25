"use client";
import { useEffect, useRef } from "react";
import { Truck } from "./truck";

/**
 * Portal hero. Everything is bound to scroll POSITION through one CSS variable (--p, 0 → 1),
 * so the portal opens on the way down and closes again on the way up.
 * Without JS or with reduced motion, --p stays at 1: the finished, open page.
 */
export function PortalHero({ routes, services }: { routes: string; services: number }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    if (!document.documentElement.classList.contains("motion-ok")) {
      stage.style.setProperty("--p", "1");
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const range = section.offsetHeight - window.innerHeight;
      const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1;
      stage.style.setProperty("--p", p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={sectionRef} className="portal-section relative bg-ground" aria-label="ShipSaathi">
      <div ref={stageRef} className="portal-stage sticky top-0 isolate h-screen overflow-hidden">
        {/* 1. full-bleed photo, settles from overscale to 1. The "cover" box keeps the photo's aspect ratio,
               so the truck stays on the quay road however the photo is cropped. */}
        <div className="portal-image absolute inset-0">
          <div className="portal-cover absolute">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero/port-dusk-3168.webp"
              srcSet="/hero/port-dusk-1600.webp 1600w, /hero/port-dusk-3168.webp 3168w"
              sizes="(max-width: 700px) 1600px, max(100vw, 236vh)"
              alt="Container port at dusk: gantry cranes, a container ship and an empty quay road"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full select-none object-cover"
              draggable={false}
            />
            {/* the truck drives along the quay as the portal opens */}
            <div className="portal-truck absolute">
              <Truck className="block h-full w-full" />
            </div>
          </div>
        </div>
        {/* 2. duotone wash of the two accents */}
        <div className="portal-duotone pointer-events-none absolute inset-0" />
        {/* 3. radial veil */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(10,12,14,.7)_100%)]" />
        {/* 4. the two panels, meeting in the middle */}
        <div className="portal-panel-l absolute inset-y-0 left-0 w-[51%] bg-ground" />
        <div className="portal-panel-r absolute inset-y-0 right-0 w-[51%] bg-ground-2" />
        {/* 5. accent dots travelling to opposite corners */}
        <span className="portal-dot-a absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-amber shadow-[0_0_14px_3px_rgba(232,145,60,.55)]" aria-hidden />
        <span className="portal-dot-b absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-teal-bright shadow-[0_0_14px_3px_rgba(63,143,152,.55)]" aria-hidden />

        {/* 6. the wordmark, split in two */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <h1 className="portal-title display whitespace-nowrap text-center font-extrabold uppercase leading-none text-bone" aria-label="ShipSaathi">
            <span className="portal-half-a inline-block">Ship</span>
            <span className="portal-half-b inline-block">Saathi</span>
          </h1>
          <p className="portal-sub label mt-[4.5vw] px-6 text-center text-bone">Shipment booking &amp; pre-flight checks for Indian exporters</p>
        </div>

        {/* corner metadata */}
        <div className="label pointer-events-none absolute left-4 top-[78px] text-bone-2 sm:left-6">{routes}</div>
        <div className="label pointer-events-none absolute right-4 top-[78px] text-right text-bone-2 sm:right-6">10 pre-flight rules</div>
        <div className="label pointer-events-none absolute bottom-5 left-4 text-bone-2 sm:left-6">{services} carrier services · GBP</div>
        <div className="label pointer-events-none absolute bottom-5 right-4 flex items-center gap-2 text-bone-2 sm:right-6">
          <span className="portal-scroll-hint">Scroll to open</span>
          <span className="h-px w-8 bg-amber" />
        </div>
      </div>

      <style>{`
        .portal-section { height: 100vh; }
        html.motion-ok .portal-section { height: 250vh; }
        .portal-stage { --p: 1; }
        html.motion-ok .portal-stage { --p: 0; }
        .portal-image { transform: scale(calc(1.16 - 0.16 * var(--p))); transform-origin: 50% 60%; }
        /* photo is 3168 × 1344 (ratio 2.357): emulate object-fit: cover with a box of the same ratio */
        .portal-cover {
          left: 50%; top: 50%;
          width: max(100%, calc(100vh * 2.357));
          height: max(100%, calc(100vw / 2.357));
          transform: translate(-50%, -50%);
        }
        /* truck: tyres on the near lane (~88% down the photo); drives from off-screen left to the right edge */
        .portal-stage { --tp: clamp(0, calc((var(--p) - 0.04) / 0.86), 1); --wheel-rot: calc(var(--tp) * 7200deg); }
        .portal-truck {
          top: 76%;
          height: 13.5%;
          aspect-ratio: 420 / 110;
          left: 50%;
          transform: translateX(calc(-50vw - 100% + var(--tp) * 96vw));
          will-change: transform;
        }
        .truck-wheel { transform: rotate(var(--wheel-rot)); }
        .portal-duotone {
          background: linear-gradient(120deg, #e8913c 0%, #2e6b72 100%);
          mix-blend-mode: overlay;
          opacity: calc(0.14 * var(--p));
        }
        .portal-panel-l { transform: translateX(calc(-112% * min(1, var(--p) * 1.25))); }
        .portal-panel-r { transform: translateX(calc(112% * min(1, var(--p) * 1.25))); }
        .portal-dot-a { transform: translate(calc(-50% - 44vw * var(--p)), calc(-50% - 40vh * var(--p))); opacity: calc(1 - 0.4 * var(--p)); }
        .portal-dot-b { transform: translate(calc(-50% + 44vw * var(--p)), calc(-50% + 40vh * var(--p))); opacity: calc(1 - 0.4 * var(--p)); }
        .portal-title {
          font-size: clamp(26px, 6vw, 118px);
          letter-spacing: calc(0.06em - 0.09em * var(--p));
          transform: scale(calc(1 + 0.18 * var(--p)));
        }
        .portal-half-a { transform: translateX(calc(-32% * var(--p))); }
        .portal-half-b { transform: translateX(calc(32% * var(--p))); }
        .portal-sub { opacity: calc(1 - var(--p) * 0.2); }
        .portal-scroll-hint { opacity: calc(1 - var(--p)); }
        html:not(.motion-ok) .portal-scroll-hint { display: none; }
      `}</style>
    </section>
  );
}
