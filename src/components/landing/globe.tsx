"use client";
import { useEffect, useRef } from "react";
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon } from "geojson";

/**
 * Scroll-driven globe for the statement fold.
 * As the reader scrolls through the (sticky) section, the globe turns until the London lanes face them,
 * then zooms into Europe: borders sharpen and city names appear. Everything is bound to scroll POSITION,
 * so it reverses on the way back up. Packets keep travelling along the lanes over time.
 * With reduced motion (or no room to scroll) it shows the finished, zoomed-in frame.
 * Land/borders: Natural Earth via world-atlas (ISC); projection: d3-geo (ISC).
 */

type City = { name: string; at: [number, number]; label?: "left" | "right" | "above" | "below" };
const LONDON: City = { name: "London", at: [-0.13, 51.51], label: "left" };
const DESTINATIONS: City[] = [
  { name: "Berlin", at: [13.4, 52.52] },
  { name: "Frankfurt", at: [8.68, 50.11] },
  { name: "Hamburg", at: [9.99, 53.55] },
  { name: "Paris", at: [2.35, 48.86] },
  { name: "Lyon", at: [4.84, 45.76] },
  { name: "Amsterdam", at: [4.9, 52.37], label: "above" },
  { name: "Rotterdam", at: [4.48, 51.92], label: "below" },
];

// Scroll choreography (p = 0 → 1 across the sticky section)
const START_VIEW = { lon: -100, lat: 12 }; // Americas facing the reader at the top
const END_VIEW = { lon: 6.5, lat: 50 }; // centred between London and the destinations
const ROTATE_UNTIL = 0.55; // turning finishes here
const ZOOM_FROM = 0.35; // zoom starts here …
const ZOOM_TO = 0.9; // … and is complete here
const MAX_ZOOM = 7.5;

const DEG = Math.PI / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Orthographic projection centred on (lc, pc) with radius r. */
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

const LANES = DESTINATIONS.map((d) => interp(LONDON.at, d.at));

type Shape = FeatureCollection<Polygon | MultiPolygon> | Feature<Polygon | MultiPolygon>;

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
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";

    type D3 = typeof import("d3-geo");
    type Topo = typeof import("topojson-client");
    let d3: D3 | null = null;
    let topo: Topo | null = null;
    let coarseLand: Shape | null = null;
    let fineLand: Shape | null = null;
    let borders: MultiLineString | null = null;
    let fineRequested = false;

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

    /** 0 → 1 while the sticky section scrolls past; 1 when there's no room to scroll (reduced motion). */
    const progress = () => {
      if (!motion) return 1;
      const section = wrap.closest("section");
      if (!section) return 1;
      const r = section.getBoundingClientRect();
      const range = r.height - window.innerHeight;
      return range > 0 ? clamp01(-r.top / range) : 1;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unwrap = (m: any) => m?.default ?? m;

    const loadFine = () => {
      if (fineRequested) return;
      fineRequested = true;
      import("world-atlas/countries-50m.json")
        .then((m) => {
          if (disposed || !topo) return;
          const t = unwrap(m);
          fineLand = topo.feature(t, t.objects.land ?? t.objects.countries) as unknown as Shape;
          borders = topo.mesh(t, t.objects.countries, (a: unknown, b: unknown) => a !== b) as MultiLineString;
          kick();
        })
        .catch(() => {});
    };

    const draw = (now: number) => {
      if (!size) return;
      const cx = size / 2,
        cy = size / 2,
        R0 = size / 2 - 2;
      const p = progress();
      const turn = smooth(clamp01(p / ROTATE_UNTIL));
      const zoomT = smooth(clamp01((p - ZOOM_FROM) / (ZOOM_TO - ZOOM_FROM)));
      const k = 1 + (MAX_ZOOM - 1) * zoomT;
      const lc = lerp(START_VIEW.lon, END_VIEW.lon, turn);
      const pc = lerp(START_VIEW.lat, END_VIEW.lat, turn);
      const R = R0 * k;
      if (k > 1.3) loadFine();

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      // The globe's own outline acts as the lens: zooming happens inside it.
      ctx.beginPath();
      ctx.arc(cx, cy, R0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = k > 1.02 ? "#0d1114" : "#101317";
      ctx.fillRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = "#101317";
      ctx.fill();

      if (d3) {
        const projection = d3.geoOrthographic().scale(R).translate([cx, cy]).rotate([-lc, -pc]).clipAngle(90).precision(0.5);
        const path = d3.geoPath(projection, ctx);
        ctx.beginPath();
        path(d3.geoGraticule().step(k > 2.5 ? [5, 5] : [20, 20])());
        ctx.strokeStyle = "rgba(237,231,220,0.07)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        const shape = k > 1.5 && fineLand ? fineLand : coarseLand;
        if (shape) {
          ctx.beginPath();
          path(shape);
          ctx.fillStyle = "rgba(46,107,114,0.55)";
          ctx.fill();
          ctx.strokeStyle = "rgba(237,231,220,0.3)";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
        if (borders && k > 1.5) {
          ctx.beginPath();
          path(borders);
          ctx.strokeStyle = `rgba(237,231,220,${0.28 * clamp01((k - 1.5) / 1.2)})`;
          ctx.lineWidth = 0.7;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Lanes: great circles on the surface, bowed in screen space so they read as arcs at any zoom.
      const t = (now - start) / 2600;
      const laneWidth = 1.3 + 0.2 * k;
      LANES.forEach((lane, i) => {
        const a = ortho(LONDON.at[0], LONDON.at[1], lc, pc, R);
        const b = ortho(DESTINATIONS[i].at[0], DESTINATIONS[i].at[1], lc, pc, R);
        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        // normal pointing "up" the screen
        let nx = -(b.y - a.y),
          ny = b.x - a.x;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        if (ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const at = (s: number) => {
          const [lon, lat] = lane(s);
          const q = ortho(lon, lat, lc, pc, R);
          const h = 0.22 * chord * Math.sin(Math.PI * s);
          return { x: cx + q.x + nx * h, y: cy - (q.y + ny * h), front: q.front };
        };

        ctx.beginPath();
        let pen = false;
        for (let n = 0; n <= 48; n++) {
          const q = at(n / 48);
          if (!q.front) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
          pen = true;
        }
        ctx.strokeStyle = "rgba(232,145,60,0.9)";
        ctx.lineWidth = laneWidth;
        ctx.stroke();

        const q = at(motion ? (t + i / LANES.length) % 1 : 0.6);
        if (q.front) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 1.8 + 0.3 * k, 0, Math.PI * 2);
          ctx.fillStyle = "#ffd2a1";
          ctx.fill();
        }
      });

      // Cities, with names fading in as we zoom
      const labelAlpha = clamp01((k - 2.4) / 1.6);
      ctx.font = `600 ${Math.round(9 + 0.45 * k)}px ${font}`;
      ctx.textBaseline = "middle";
      const city = (c: City, r: number, fill: string, origin = false) => {
        const place = c.label ?? "right";
        const q = ortho(c.at[0], c.at[1], lc, pc, R);
        if (!q.front) return;
        const x = cx + q.x,
          y = cy - q.y;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        if (labelAlpha > 0) {
          ctx.fillStyle = origin ? `rgba(237,231,220,${labelAlpha})` : `rgba(242,162,88,${labelAlpha})`;
          // Placed per city so close neighbours (Amsterdam / Rotterdam) don't collide.
          const name = c.name.toUpperCase();
          if (place === "left") {
            ctx.textAlign = "right";
            ctx.fillText(name, x - r - 6, y);
          } else if (place === "above") {
            ctx.textAlign = "center";
            ctx.fillText(name, x, y - r - 8);
          } else if (place === "below") {
            ctx.textAlign = "center";
            ctx.fillText(name, x, y + r + 9);
          } else {
            ctx.textAlign = "left";
            ctx.fillText(name, x + r + 5, y);
          }
        }
      };
      DESTINATIONS.forEach((d) => city(d, 2 + 0.3 * k, "#e8913c"));
      city(LONDON, 3 + 0.35 * k, "#ede7dc", true);

      ctx.restore();

      // lens rim
      ctx.beginPath();
      ctx.arc(cx, cy, R0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(237,231,220,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const loop = (now: number) => {
      raf = 0;
      if (disposed) return;
      draw(now);
      if (motion && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    function kick() {
      if (!raf && !disposed) raf = requestAnimationFrame(loop);
    }

    resize();
    draw(performance.now());

    // Map data loads after first paint so it never blocks the page.
    Promise.all([import("d3-geo"), import("topojson-client"), import("world-atlas/land-110m.json")])
      .then(([geo, tc, atlas]) => {
        if (disposed) return;
        d3 = geo;
        topo = tc;
        const t = unwrap(atlas);
        coarseLand = tc.feature(t, t.objects.land) as unknown as Shape;
        if (!motion) loadFine(); // reduced motion shows the zoomed frame straight away
        kick();
      })
      .catch(() => {
        /* still renders the lanes on a plain sphere */
      });

    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(wrap);
    const onVis = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVis);
    const onScroll = () => kick();
    window.addEventListener("scroll", onScroll, { passive: true });
    kick();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={wrapRef} className={className} role="img" aria-label="Globe that turns to Europe and zooms in on the shipping lanes from London to Germany, France and the Netherlands">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
