/**
 * Side view of a European cab-over tractor pulling a 40ft container, lit from behind by the sunset in the
 * hero photo: shaded body, amber rim light on the top edges, sky reflected in the glass, headlights and
 * tail lights on. Wheels turn with the CSS variable --wheel-rot (set by the hero from scroll position).
 * Faces right. ViewBox is 420 × 110; the tyres touch y = 99.
 */
export function Truck({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const wheel = (cx: number, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={88} r={11} fill="#040506" />
      <circle cx={cx} cy={88} r={10.2} fill="none" stroke="#14191c" strokeWidth={1} />
      <g className="truck-wheel" style={{ transformOrigin: `${cx}px 88px` }}>
        <circle cx={cx} cy={88} r={6.4} fill="#242b2f" stroke="#3b454a" strokeWidth={0.8} />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line
            key={a}
            x1={cx}
            y1={88}
            x2={cx + 5.6 * Math.cos((a * Math.PI) / 180)}
            y2={88 + 5.6 * Math.sin((a * Math.PI) / 180)}
            stroke="#11161a"
            strokeWidth={1.1}
          />
        ))}
        <circle cx={cx + 3.6} cy={88} r={0.9} fill="#59646a" />
        <circle cx={cx} cy={88} r={2.1} fill="#0e1316" />
      </g>
    </g>
  );

  return (
    <svg className={className} style={style} viewBox="0 0 420 110" overflow="visible" aria-hidden>
      <defs>
        <pattern id="tr-ribs" width="6" height="66" patternUnits="userSpaceOnUse">
          <rect width="3" height="66" fill="rgba(237,231,220,0.035)" />
          <rect x="3" width="3" height="66" fill="rgba(0,0,0,0.22)" />
        </pattern>
        <linearGradient id="tr-box" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#21363b" />
          <stop offset="0.55" stopColor="#152428" />
          <stop offset="1" stopColor="#0b1316" />
        </linearGradient>
        <linearGradient id="tr-cab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262f33" />
          <stop offset="0.6" stopColor="#151b1e" />
          <stop offset="1" stopColor="#0a0d0f" />
        </linearGradient>
        <linearGradient id="tr-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e6b72" stopOpacity="0.85" />
          <stop offset="0.7" stopColor="#b8733a" stopOpacity="0.7" />
          <stop offset="1" stopColor="#e8913c" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="tr-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe6c2" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffe6c2" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="tr-head" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6e6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tr-tail" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff4a3a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ff4a3a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tr-marker" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <filter id="tr-beam-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="tr-soft" x="-10%" y="-200%" width="120%" height="500%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* ground shadow */}
      <ellipse cx="210" cy="99.5" rx="206" ry="4.5" fill="#000" opacity="0.6" filter="url(#tr-soft)" />

      {/* headlight beam on the road ahead */}
      <polygon points="404,70 540,62 540,98 404,80" fill="url(#tr-beam)" filter="url(#tr-beam-blur)" style={{ mixBlendMode: "screen" }} />

      {/* trailer chassis + landing gear */}
      <rect x="14" y="80" width="276" height="5" fill="#070a0c" />
      <rect x="196" y="80" width="4" height="12" fill="#0b0f11" />
      <rect x="193" y="91" width="10" height="2" fill="#0b0f11" />

      {/* 40ft container */}
      <rect x="12" y="14" width="274" height="66" rx="1" fill="url(#tr-box)" />
      <rect x="16" y="16" width="266" height="60" fill="url(#tr-ribs)" />
      <rect x="12" y="14" width="274" height="3" fill="#0d1619" />
      <rect x="12" y="76" width="274" height="4" fill="#0a1114" />
      {/* door end: lock rods and hinges */}
      {[18, 24, 30].map((x) => (
        <rect key={x} x={x} y="18" width="1.4" height="58" fill="#0a1013" />
      ))}
      {[16, 278].map((x) => [14, 74].map((y) => <rect key={`${x}-${y}`} x={x - 4} y={y} width="6" height="6" fill="#0b1215" />))}
      {/* rim light along the top edge, from the low sun behind */}
      <line x1="12" y1="14.4" x2="286" y2="14.4" stroke="#f2a258" strokeOpacity="0.55" strokeWidth="1" />
      {/* side marker lights */}
      {[60, 110, 160, 210, 255].map((x) => (
        <g key={x}>
          <circle cx={x} cy="78" r="5" fill="url(#tr-marker)" />
          <circle cx={x} cy="78" r="1.1" fill="#ffc067" />
        </g>
      ))}
      {/* trailer mudguard over the tridem */}
      <path d="M32 82 Q32 74 40 74 L104 74 Q112 74 112 82" fill="none" stroke="#080b0d" strokeWidth="3" />

      {/* coupling: fifth wheel, air lines */}
      <rect x="286" y="76" width="20" height="8" fill="#080b0d" />
      <path d="M288 40 C294 46 292 60 298 66" fill="none" stroke="#1e2629" strokeWidth="1.4" />
      <path d="M290 42 C298 50 294 62 300 68" fill="none" stroke="#2a1b16" strokeWidth="1.2" />

      {/* cab */}
      <path d="M304 12 L312 7 Q314 6 318 6 L378 6 Q386 6 386 14 L386 18 L304 18 Z" fill="url(#tr-cab)" />
      <path d="M300 24 Q300 18 306 18 L384 18 Q392 18 394 26 L401 50 Q403 55 403 62 L403 84 L300 84 Z" fill="url(#tr-cab)" />
      <line x1="306" y1="6.5" x2="380" y2="6.5" stroke="#f2a258" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M384 18 Q392 18 394 26 L401 50" fill="none" stroke="#f2a258" strokeOpacity="0.35" strokeWidth="0.9" />
      {/* side window + windscreen sliver reflecting the sky */}
      <path d="M352 26 L384 26 Q388 26 389 30 L394 48 L352 48 Z" fill="url(#tr-glass)" />
      <path d="M392 25 L396 26.5 L402 50 L397 50 Z" fill="url(#tr-glass)" opacity="0.9" />
      <rect x="384" y="20" width="16" height="2.5" rx="1" fill="#0b0f11" />
      {/* door seam, handle, steps */}
      <path d="M349 22 L349 80" stroke="rgba(237,231,220,0.07)" strokeWidth="1" />
      <rect x="354" y="54" width="8" height="1.6" rx="0.8" fill="#3a4448" />
      <rect x="360" y="70" width="18" height="2" fill="#0c1012" />
      <rect x="360" y="76" width="18" height="2" fill="#0c1012" />
      {/* mirror */}
      <path d="M392 32 L405 30" stroke="#0c1012" strokeWidth="1.6" />
      <rect x="404" y="24" width="4" height="14" rx="1" fill="#101518" />
      {/* fuel tank */}
      <rect x="310" y="68" width="34" height="11" rx="3" fill="#1d2529" />
      <line x1="312" y1="69.5" x2="342" y2="69.5" stroke="rgba(237,231,220,0.15)" strokeWidth="0.8" />
      {/* bumper + grille slats on the front edge */}
      <rect x="398" y="76" width="10" height="9" rx="1" fill="#0b0f11" />
      {[56, 60, 64].map((y) => (
        <line key={y} x1="400" y1={y} x2="403" y2={y} stroke="#1c2326" strokeWidth="1" />
      ))}
      {/* cab mudguards */}
      <path d="M369 84 Q369 73 382 73 Q395 73 395 84" fill="none" stroke="#080b0d" strokeWidth="3" />
      <path d="M306 84 Q306 73 319 73 Q332 73 332 84" fill="none" stroke="#080b0d" strokeWidth="3" />
      {/* cab side marker */}
      <circle cx="396" cy="66" r="4" fill="url(#tr-marker)" />
      <circle cx="396" cy="66" r="0.9" fill="#ffc067" />

      {/* lights */}
      <circle cx="404" cy="72" r="16" fill="url(#tr-head)" style={{ mixBlendMode: "screen" }} />
      <rect x="401" y="70" width="6" height="4" rx="1" fill="#fff4de" />
      <circle cx="12" cy="74" r="10" fill="url(#tr-tail)" />
      <rect x="10" y="71" width="3" height="7" rx="0.6" fill="#ff3b30" />

      {/* wheels: trailer tridem, drive axle, steer axle */}
      {wheel(48, "t1")}
      {wheel(72, "t2")}
      {wheel(96, "t3")}
      {wheel(319, "d1")}
      {wheel(382, "s1")}
    </svg>
  );
}
