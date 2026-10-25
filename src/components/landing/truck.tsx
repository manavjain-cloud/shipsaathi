import { useId } from "react";

/**
 * Port vehicles for the hero, drawn to sit in the backlit dusk photo: shaded bodies, amber rim light
 * on top edges, sky reflected in the glass, lights on. Wheels turn with the CSS variable --wheel-rot
 * (set by the hero from scroll position). Both face right; mirror the wrapper to drive left.
 */

const CONTAINER = {
  teal: ["#21363b", "#152428", "#0b1316"],
  rust: ["#4a2a1f", "#2f1b15", "#170e0b"],
  navy: ["#1f2a3d", "#141c2a", "#0a0f17"],
} as const;

function useIds() {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (name: string) => `${raw}-${name}`;
}

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#040506" />
      <circle cx={cx} cy={cy} r={r * 0.93} fill="none" stroke="#14191c" strokeWidth={1} />
      <g className="truck-wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy} r={r * 0.58} fill="#242b2f" stroke="#3b454a" strokeWidth={0.8} />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line
            key={a}
            x1={cx}
            y1={cy}
            x2={cx + r * 0.51 * Math.cos((a * Math.PI) / 180)}
            y2={cy + r * 0.51 * Math.sin((a * Math.PI) / 180)}
            stroke="#11161a"
            strokeWidth={1.1}
          />
        ))}
        <circle cx={cx + r * 0.33} cy={cy} r={r * 0.08} fill="#59646a" />
        <circle cx={cx} cy={cy} r={r * 0.19} fill="#0e1316" />
      </g>
    </g>
  );
}

function SharedDefs({ id }: { id: (n: string) => string }) {
  return (
    <>
      <linearGradient id={id("cab")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#262f33" />
        <stop offset="0.6" stopColor="#151b1e" />
        <stop offset="1" stopColor="#0a0d0f" />
      </linearGradient>
      <linearGradient id={id("glass")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2e6b72" stopOpacity="0.85" />
        <stop offset="0.7" stopColor="#b8733a" stopOpacity="0.7" />
        <stop offset="1" stopColor="#e8913c" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id={id("beam")} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffe6c2" stopOpacity="0.28" />
        <stop offset="1" stopColor="#ffe6c2" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={id("head")} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff6e6" stopOpacity="0.95" />
        <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={id("tail")} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ff4a3a" stopOpacity="0.85" />
        <stop offset="1" stopColor="#ff4a3a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={id("marker")} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffb347" stopOpacity="0.9" />
        <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
      </radialGradient>
      <filter id={id("beam-blur")} x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      <filter id={id("soft")} x="-10%" y="-200%" width="120%" height="500%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
    </>
  );
}

/** Cab-over tractor + 40ft container. ViewBox 420 × 110; tyres touch y = 99. */
export function Truck({ className, container = "teal" }: { className?: string; container?: keyof typeof CONTAINER }) {
  const id = useIds();
  const url = (n: string) => `url(#${id(n)})`;
  const [c0, c1, c2] = CONTAINER[container];
  return (
    <svg className={className} viewBox="0 0 420 110" overflow="visible" aria-hidden>
      <defs>
        <SharedDefs id={id} />
        <pattern id={id("ribs")} width="6" height="66" patternUnits="userSpaceOnUse">
          <rect width="3" height="66" fill="rgba(237,231,220,0.035)" />
          <rect x="3" width="3" height="66" fill="rgba(0,0,0,0.22)" />
        </pattern>
        <linearGradient id={id("box")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c0} />
          <stop offset="0.55" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>

      <ellipse cx="210" cy="99.5" rx="206" ry="4.5" fill="#000" opacity="0.6" filter={url("soft")} />
      <polygon points="404,70 540,62 540,98 404,80" fill={url("beam")} filter={url("beam-blur")} style={{ mixBlendMode: "screen" }} />

      {/* trailer chassis + landing gear */}
      <rect x="14" y="80" width="276" height="5" fill="#070a0c" />
      <rect x="196" y="80" width="4" height="12" fill="#0b0f11" />
      <rect x="193" y="91" width="10" height="2" fill="#0b0f11" />

      {/* 40ft container */}
      <rect x="12" y="14" width="274" height="66" rx="1" fill={url("box")} />
      <rect x="16" y="16" width="266" height="60" fill={url("ribs")} />
      <rect x="12" y="14" width="274" height="3" fill="rgba(0,0,0,0.35)" />
      <rect x="12" y="76" width="274" height="4" fill="rgba(0,0,0,0.45)" />
      {[18, 24, 30].map((x) => (
        <rect key={x} x={x} y="18" width="1.4" height="58" fill="rgba(0,0,0,0.4)" />
      ))}
      {[16, 278].map((x) => [14, 74].map((y) => <rect key={`${x}-${y}`} x={x - 4} y={y} width="6" height="6" fill="rgba(0,0,0,0.45)" />))}
      <line x1="12" y1="14.4" x2="286" y2="14.4" stroke="#f2a258" strokeOpacity="0.55" strokeWidth="1" />
      {[60, 110, 160, 210, 255].map((x) => (
        <g key={x}>
          <circle cx={x} cy="78" r="5" fill={url("marker")} />
          <circle cx={x} cy="78" r="1.1" fill="#ffc067" />
        </g>
      ))}
      <path d="M32 82 Q32 74 40 74 L104 74 Q112 74 112 82" fill="none" stroke="#080b0d" strokeWidth="3" />

      {/* coupling */}
      <rect x="286" y="76" width="20" height="8" fill="#080b0d" />
      <path d="M288 40 C294 46 292 60 298 66" fill="none" stroke="#1e2629" strokeWidth="1.4" />
      <path d="M290 42 C298 50 294 62 300 68" fill="none" stroke="#2a1b16" strokeWidth="1.2" />

      {/* cab */}
      <path d="M304 12 L312 7 Q314 6 318 6 L378 6 Q386 6 386 14 L386 18 L304 18 Z" fill={url("cab")} />
      <path d="M300 24 Q300 18 306 18 L384 18 Q392 18 394 26 L401 50 Q403 55 403 62 L403 84 L300 84 Z" fill={url("cab")} />
      <line x1="306" y1="6.5" x2="380" y2="6.5" stroke="#f2a258" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M384 18 Q392 18 394 26 L401 50" fill="none" stroke="#f2a258" strokeOpacity="0.35" strokeWidth="0.9" />
      <path d="M352 26 L384 26 Q388 26 389 30 L394 48 L352 48 Z" fill={url("glass")} />
      <path d="M392 25 L396 26.5 L402 50 L397 50 Z" fill={url("glass")} opacity="0.9" />
      <rect x="384" y="20" width="16" height="2.5" rx="1" fill="#0b0f11" />
      <path d="M349 22 L349 80" stroke="rgba(237,231,220,0.07)" strokeWidth="1" />
      <rect x="354" y="54" width="8" height="1.6" rx="0.8" fill="#3a4448" />
      <rect x="360" y="70" width="18" height="2" fill="#0c1012" />
      <rect x="360" y="76" width="18" height="2" fill="#0c1012" />
      <path d="M392 32 L405 30" stroke="#0c1012" strokeWidth="1.6" />
      <rect x="404" y="24" width="4" height="14" rx="1" fill="#101518" />
      <rect x="310" y="68" width="34" height="11" rx="3" fill="#1d2529" />
      <line x1="312" y1="69.5" x2="342" y2="69.5" stroke="rgba(237,231,220,0.15)" strokeWidth="0.8" />
      <rect x="398" y="76" width="10" height="9" rx="1" fill="#0b0f11" />
      {[56, 60, 64].map((y) => (
        <line key={y} x1="400" y1={y} x2="403" y2={y} stroke="#1c2326" strokeWidth="1" />
      ))}
      <path d="M369 84 Q369 73 382 73 Q395 73 395 84" fill="none" stroke="#080b0d" strokeWidth="3" />
      <path d="M306 84 Q306 73 319 73 Q332 73 332 84" fill="none" stroke="#080b0d" strokeWidth="3" />
      <circle cx="396" cy="66" r="4" fill={url("marker")} />
      <circle cx="396" cy="66" r="0.9" fill="#ffc067" />

      <circle cx="404" cy="72" r="16" fill={url("head")} style={{ mixBlendMode: "screen" }} />
      <rect x="401" y="70" width="6" height="4" rx="1" fill="#fff4de" />
      <circle cx="12" cy="74" r="10" fill={url("tail")} />
      <rect x="10" y="71" width="3" height="7" rx="0.6" fill="#ff3b30" />

      <Wheel cx={48} cy={88} r={11} />
      <Wheel cx={72} cy={88} r={11} />
      <Wheel cx={96} cy={88} r={11} />
      <Wheel cx={319} cy={88} r={11} />
      <Wheel cx={382} cy={88} r={11} />
    </svg>
  );
}

/**
 * Terminal tractor (yard truck) with an offset one-seat cab, exhaust stack and roof beacon, pulling an
 * empty skeletal container chassis. ViewBox 300 × 80; tyres touch y = 79.
 */
export function YardTractor({ className }: { className?: string }) {
  const id = useIds();
  const url = (n: string) => `url(#${id(n)})`;
  return (
    <svg className={className} viewBox="0 0 300 80" overflow="visible" aria-hidden>
      <defs>
        <SharedDefs id={id} />
        <linearGradient id={id("body")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3418" />
          <stop offset="0.6" stopColor="#1f1c0e" />
          <stop offset="1" stopColor="#0d0c07" />
        </linearGradient>
        <radialGradient id={id("beacon")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb02e" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffb02e" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="150" cy="79.5" rx="148" ry="3.5" fill="#000" opacity="0.55" filter={url("soft")} />
      <polygon points="290,50 400,44 400,74 290,58" fill={url("beam")} filter={url("beam-blur")} style={{ mixBlendMode: "screen" }} />

      {/* skeletal chassis: main beams, cross members, twist-lock posts, gooseneck */}
      <rect x="10" y="54" width="186" height="5" fill="#0a0c0e" />
      <path d="M196 54 L210 46 L238 46 L238 51 L212 51 L198 59 Z" fill="#0a0c0e" />
      {[14, 64, 120, 176].map((x) => (
        <g key={x}>
          <rect x={x} y="49" width="4" height="6" fill="#121619" />
          <line x1={x - 2} y1="49.4" x2={x + 6} y2="49.4" stroke="#f2a258" strokeOpacity="0.5" strokeWidth="0.8" />
        </g>
      ))}
      <line x1="10" y1="54.3" x2="196" y2="54.3" stroke="#f2a258" strokeOpacity="0.4" strokeWidth="0.8" />
      <rect x="150" y="59" width="3" height="10" fill="#0b0f11" />
      <path d="M20 62 Q20 56 27 56 L58 56 Q65 56 65 62" fill="none" stroke="#080b0d" strokeWidth="2.5" />

      {/* tractor frame + raised fifth wheel */}
      <rect x="214" y="58" width="80" height="6" fill="#0a0c0e" />
      <rect x="222" y="51" width="22" height="4" rx="1" fill="#14181a" />

      {/* offset cab */}
      <path d="M252 62 L252 26 Q252 20 258 20 L284 20 Q290 20 291 26 L294 46 L294 62 Z" fill={url("body")} />
      <path d="M258 20.4 L284 20.4" stroke="#f2a258" strokeOpacity="0.55" strokeWidth="1" />
      <path d="M257 26 L284 26 Q287 26 288 29 L290 42 L257 42 Z" fill={url("glass")} />
      <path d="M270 26 L270 42" stroke="#1a1708" strokeWidth="1.4" />
      <rect x="260" y="48" width="6" height="1.4" rx="0.7" fill="#4a4426" />
      {/* exhaust stack */}
      <rect x="246" y="16" width="3" height="44" fill="#141414" />
      <rect x="245" y="14" width="5" height="3" fill="#0c0c0c" />
      {/* roof beacon */}
      <circle cx="271" cy="17" r="9" fill={url("beacon")} style={{ mixBlendMode: "screen" }} />
      <rect x="268.5" y="15.5" width="5" height="4" rx="1.5" fill="#ffb02e" />
      {/* bumper + steps */}
      <rect x="290" y="56" width="7" height="8" rx="1" fill="#0b0f11" />
      <rect x="256" y="58" width="12" height="1.6" fill="#0c1012" />
      <path d="M268 64 Q268 54 278 54 Q288 54 288 64" fill="none" stroke="#080b0d" strokeWidth="2.5" />

      {/* lights */}
      <circle cx="292" cy="52" r="11" fill={url("head")} style={{ mixBlendMode: "screen" }} />
      <rect x="290" y="50.5" width="4" height="3" rx="0.8" fill="#fff4de" />
      <circle cx="10" cy="57" r="8" fill={url("tail")} />
      <rect x="8.5" y="55" width="2.5" height="4.5" rx="0.5" fill="#ff3b30" />

      {/* wheels: chassis tandem, tractor drive + steer */}
      <Wheel cx={30} cy={71} r={8.5} />
      <Wheel cx={50} cy={71} r={8.5} />
      <Wheel cx={230} cy={70} r={9.5} />
      <Wheel cx={278} cy={70} r={9.5} />
    </svg>
  );
}
