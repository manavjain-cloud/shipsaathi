"use client";
import { useEffect, useRef } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * A slowly turning orthographic globe with the rate card's lanes: London → the seven destination cities.
 * Spins on its own, and scroll position adds extra turn. With reduced motion it renders one still frame
 * centred on Europe. Land outlines: Natural Earth 110m via world-atlas (ISC); projection: d3-geo (ISC).
 */

const LONDON: [number, number] = [-0.13, 51.51];
const DESTINATIONS: [number, number][] = [
  [13.4, 52.52], // Berlin
  [8.68, 50.11], // Frankfurt
  [9.99, 53.55], // Hamburg
  [2.35, 48.86], // Paris
  [4.84, 45.76], // Lyon
  [4.9, 52.37], // Amsterdam
  [4.48, 51.92], // Rotterdam
];

const DEG = Math.PI / 180;
const TILT = 24; // degrees the view looks down from the equator, so Europe sits upper-centre
const SPIN_DEG_PER_MS = 0.004; // one turn every 90 seconds
const SCROLL_TURN = 90; // extra degrees of turn across the section's scroll, centred so Europe faces you mid-section

/** Orthographic projection of lon/lat centred on (lc, pc), radius r. Returns screen offset and whether it's on the near side. */
function ortho(lon: number, lat: number, lc: number, pc: number, r: number) {
  const l = lon * DEG,
    p = lat * DEG,
    l0 = lc * DEG,
    p0 = pc * DEG;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
  const x = r * Math.cos(p) * Math.sin(l - l0);
  const y = r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0));
  return { x, y, front: cosc >= 0 };
}

/** Great-circle interpolation between two lon/lat points. */
function interp(a: [number, number], b: [number, number]) {
  const [l1, p1] = [a[0] * DEG, a[1] * DEG];
  const [l2, p2] = [b[0] * DEG, b[1] * DEG];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  return (t: number): [number, number] => {
    if (d === 0) return a;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    return [Math.atan2(y, x) / DEG, Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG];
  };
}

const LANES = DESTINATIONS.map((d) => interp(LONDON, d));

export function RotatingGlobe({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let disposed = false;
    let raf = 0;
    let visible = true;
    let size = 0;
    const motion = document.documentElement.classList.contains("motion-ok");
    const start = performance.now();

    type D3 = typeof import("d3-geo");
    let d3: D3 | null = null;
    let land: FeatureCollection<Polygon | MultiPolygon> | Feature<Polygon | MultiPolygon> | null = null;

    const resize = () => {
      const w = wrap.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = w;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${w}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const scrollProgress = () => {
      const section = wrap.closest("section");
      if (!section) return 0;
      const r = section.getBoundingClientRect();
      return Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
    };

    const draw = (now: number) => {
      if (!size) return;
      const cx = size / 2,
        cy = size / 2,
        R = size / 2 - 2;
      // Centred on Europe (lanes in view) when the section sits mid-screen. Centre longitude decreases so
      // the surface moves west → east, like the real Earth. The spin wraps every minute.
      const lc = motion ? 28 - (now - start) * SPIN_DEG_PER_MS - (scrollProgress() - 0.5) * SCROLL_TURN : 28;
      const pc = TILT;
      ctx.clearRect(0, 0, size, size);

      // sphere
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = "#101317";
      ctx.fill();

      if (d3 && land) {
        const projection = d3.geoOrthographic().scale(R).translate([cx, cy]).rotate([-lc, -pc]).clipAngle(90).precision(0.6);
        const path = d3.geoPath(projection, ctx);
        // graticule
        ctx.beginPath();
        path(d3.geoGraticule().step([20, 20])());
        ctx.strokeStyle = "rgba(237,231,220,0.08)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // land
        ctx.beginPath();
        path(land);
        ctx.fillStyle = "rgba(46,107,114,0.55)";
        ctx.fill();
        ctx.strokeStyle = "rgba(237,231,220,0.28)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // limb
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(237,231,220,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // lanes: lifted great-circle arcs, drawn only where they're not behind the globe
      const t = (now - start) / 2400;
      LANES.forEach((lane, i) => {
        ctx.beginPath();
        let pen = false;
        for (let k = 0; k <= 40; k++) {
          const s = k / 40;
          const [lon, lat] = lane(s);
          const lift = 1 + 0.07 * Math.sin(Math.PI * s);
          const p = ortho(lon, lat, lc, pc, R * lift);
          const shown = p.front || Math.hypot(p.x, p.y) > R;
          if (!shown) {
            pen = false;
            continue;
          }
          if (!pen) ctx.moveTo(cx + p.x, cy - p.y);
          else ctx.lineTo(cx + p.x, cy - p.y);
          pen = true;
        }
        ctx.strokeStyle = "rgba(232,145,60,0.85)";
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // a small packet travelling along each lane
        if (motion) {
          const s = (t + i / LANES.length) % 1;
          const [lon, lat] = lane(s);
          const p = ortho(lon, lat, lc, pc, R * (1 + 0.07 * Math.sin(Math.PI * s)));
          if (p.front || Math.hypot(p.x, p.y) > R) {
            ctx.beginPath();
            ctx.arc(cx + p.x, cy - p.y, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = "#ffd2a1";
            ctx.fill();
          }
        }
      });

      // cities
      const dot = (c: [number, number], r: number, fill: string) => {
        const p = ortho(c[0], c[1], lc, pc, R);
        if (!p.front) return;
        ctx.beginPath();
        ctx.arc(cx + p.x, cy - p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      };
      DESTINATIONS.forEach((d) => dot(d, 2.4, "#e8913c"));
      dot(LONDON, 3.4, "#ede7dc");
    };

    const loop = (now: number) => {
      raf = 0;
      if (disposed) return;
      draw(now);
      if (motion && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(loop);
    };

    resize();
    draw(performance.now());

    // Load the map data after first paint so it never blocks the page.
    Promise.all([import("d3-geo"), import("topojson-client"), import("world-atlas/land-110m.json")])
      .then(([geo, topo, atlas]) => {
        if (disposed) return;
        d3 = geo;
        const topology = (atlas as unknown as { default?: unknown }).default ?? atlas;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        land = topo.feature(topology as any, (topology as any).objects.land) as unknown as typeof land;
        kick();
        if (!motion) draw(performance.now());
      })
      .catch(() => {
        /* globe still renders as a plain sphere with lanes */
      });

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(wrap);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(wrap);

    const onVis = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVis);
    // Reduced motion: no spin, but keep the still frame correct on scroll/resize.
    kick();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={wrapRef} className={className} role="img" aria-label="Rotating globe showing the shipping lanes from London to Germany, France and the Netherlands">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
