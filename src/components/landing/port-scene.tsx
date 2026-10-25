/**
 * The hero "photograph": a dusk container port, drawn in SVG so it ships with the app.
 * The two interface accents are taken from it — amber (#E8913C) from the low sun, teal (#2E6B72) from the sky and stacks.
 */
export function PortScene({ className }: { className?: string }) {
  const stacks: { x: number; y: number; w: number; rows: number; cols: number }[] = [
    { x: 120, y: 560, w: 34, rows: 4, cols: 7 },
    { x: 420, y: 585, w: 30, rows: 3, cols: 6 },
    { x: 1240, y: 570, w: 32, rows: 4, cols: 8 },
  ];
  const tones = ["#16343a", "#1c4148", "#102428", "#2e6b72", "#13302f", "#5a3b22"];
  return (
    <svg className={className} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a container port at dusk">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081215" />
          <stop offset="0.42" stopColor="#173a40" />
          <stop offset="0.66" stopColor="#2e6b72" />
          <stop offset="0.8" stopColor="#b8733a" />
          <stop offset="0.86" stopColor="#e8913c" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a3a3e" />
          <stop offset="0.5" stopColor="#0e2124" />
          <stop offset="1" stopColor="#0a0c0e" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd2a1" />
          <stop offset="0.45" stopColor="#e8913c" />
          <stop offset="1" stopColor="#e8913c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1600" height="780" fill="url(#sky)" />
      <circle cx="1010" cy="690" r="230" fill="url(#sun)" opacity="0.55" />
      <circle cx="1010" cy="690" r="62" fill="#f2a258" />

      {/* far shore */}
      <path d="M0 700 L140 688 L260 694 L380 680 L520 690 L700 684 L860 692 L1000 686 L1180 694 L1340 682 L1480 690 L1600 684 L1600 712 L0 712 Z" fill="#14292c" />

      {/* sea + reflections */}
      <rect y="706" width="1600" height="194" fill="url(#sea)" />
      {Array.from({ length: 14 }).map((_, i) => (
        <rect key={i} x={1010 - (70 - i * 4)} y={716 + i * 11} width={(70 - i * 4) * 2} height="2" fill="#e8913c" opacity={0.55 - i * 0.035} rx="1" />
      ))}

      {/* gantry cranes */}
      {[
        { x: 300, h: 330 },
        { x: 640, h: 360 },
        { x: 1420, h: 340 },
      ].map((c, i) => (
        <g key={i} fill="none" stroke="#071012" strokeWidth="9" strokeLinecap="square">
          <path d={`M${c.x} 712 L${c.x} ${712 - c.h} M${c.x + 70} 712 L${c.x + 70} ${712 - c.h}`} />
          <path d={`M${c.x - 120} ${712 - c.h} L${c.x + 230} ${712 - c.h}`} strokeWidth="12" />
          <path d={`M${c.x} ${712 - c.h + 70} L${c.x + 70} ${712 - c.h + 70} M${c.x} ${712 - c.h} L${c.x + 70} ${712 - c.h + 70}`} strokeWidth="5" />
          <path d={`M${c.x + 35} ${712 - c.h} L${c.x + 35} ${712 - c.h - 60} M${c.x - 120} ${712 - c.h} L${c.x + 35} ${712 - c.h - 60} L${c.x + 230} ${712 - c.h}`} strokeWidth="4" />
          <path d={`M${c.x + 170} ${712 - c.h} L${c.x + 170} ${712 - c.h + 120}`} strokeWidth="2" />
        </g>
      ))}

      {/* container ship */}
      <g>
        <path d="M720 700 L1180 700 L1150 742 L752 742 Z" fill="#071012" />
        {Array.from({ length: 3 }).map((_, r) =>
          Array.from({ length: 12 }).map((__, c) => (
            <rect key={`${r}-${c}`} x={770 + c * 32} y={676 - r * 24} width="30" height="22" fill={tones[(r * 5 + c * 3) % tones.length]} stroke="#0a1416" strokeWidth="1.5" />
          )),
        )}
        <rect x="1130" y="610" width="34" height="90" fill="#0b1719" />
        <rect x="1136" y="620" width="22" height="5" fill="#e8913c" opacity="0.8" />
      </g>

      {/* quay stacks */}
      {stacks.map((s, si) => (
        <g key={si}>
          {Array.from({ length: s.rows }).map((_, r) =>
            Array.from({ length: s.cols }).map((__, c) => (
              <rect key={`${r}-${c}`} x={s.x + c * (s.w + 2)} y={s.y + 140 - (r + 1) * 26} width={s.w} height="24" fill={tones[(r * 7 + c * 2 + si) % tones.length]} stroke="#0a1416" strokeWidth="1.5" />
            )),
          )}
        </g>
      ))}

      {/* quay */}
      <rect y="760" width="1600" height="140" fill="#0a0c0e" />
      <rect y="758" width="1600" height="3" fill="#2e6b72" opacity="0.6" />

      {/* truck with pallets */}
      <g transform="translate(980 690)">
        <rect x="0" y="20" width="250" height="52" fill="#101317" stroke="#1c2a2d" strokeWidth="2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <g key={i}>
            <rect x={14 + i * 58} y="28" width="48" height="30" fill="#5a3b22" />
            <rect x={14 + i * 58} y="58" width="48" height="6" fill="#3a2716" />
          </g>
        ))}
        <path d="M250 34 L300 34 L322 56 L322 72 L250 72 Z" fill="#101317" stroke="#1c2a2d" strokeWidth="2" />
        <rect x="292" y="40" width="18" height="12" fill="#e8913c" opacity="0.7" />
        {[40, 120, 210, 290].map((x) => (
          <circle key={x} cx={x} cy="76" r="11" fill="#050607" stroke="#1c2a2d" strokeWidth="3" />
        ))}
      </g>

      {/* quay lights */}
      {[90, 520, 880, 1330, 1540].map((x) => (
        <g key={x}>
          <rect x={x} y="640" width="4" height="120" fill="#081012" />
          <circle cx={x + 2} cy="638" r="4" fill="#f2a258" />
        </g>
      ))}
    </svg>
  );
}
