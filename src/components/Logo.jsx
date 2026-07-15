import { useTheme } from '../tokens/theme';

/* The node constellation orbits; the gold hub stays fixed — the SE analogue of
   PeerReview's rotating seal. Rotates everywhere by default (animated={false}
   pins it); FX-lite / reduced-motion users get a still mark. */
export default function Logo({ size = 32, animated = true, spin = 26 }) {
  const { c, fx } = useTheme();
  const rotating = animated && fx !== 'lite';
  const nodes = [{ cx: 20, cy: 8 }, { cx: 31, cy: 14 }, { cx: 31, cy: 27 }, { cx: 20, cy: 33 }, { cx: 9, cy: 27 }, { cx: 9, cy: 14 }];
  // spokes hub→node, then the ring, then two chords across the constellation
  const spokes = nodes.map((n) => [20, 20, n.cx, n.cy]);
  const ring = nodes.map((n, i) => {
    const m = nodes[(i + 1) % nodes.length];
    return [n.cx, n.cy, m.cx, m.cy];
  });
  const chords = [[20, 8, 31, 27], [31, 14, 9, 27]];

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <g style={{ transformOrigin: '20px 20px', animation: rotating ? `rotateMark ${spin}s linear infinite` : 'none' }}>
        {spokes.map(([x1, y1, x2, y2], i) => (
          <line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.gold} strokeWidth="1.3" strokeOpacity="0.85" />
        ))}
        {ring.map(([x1, y1, x2, y2], i) => (
          <line key={`r${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.slate} strokeWidth="0.8" strokeOpacity="0.4" />
        ))}
        {chords.map(([x1, y1, x2, y2], i) => (
          <line key={`c${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.slate} strokeWidth="0.8" strokeOpacity="0.4" />
        ))}
        {nodes.map((n, i) => (
          <circle key={`n${i}`} cx={n.cx} cy={n.cy} r="2.2" fill={c.surface} stroke={i % 2 === 0 ? c.gold : c.slate} strokeWidth="1.4" />
        ))}
      </g>
      <circle cx="20" cy="20" r="3.2" fill={c.gold} />
    </svg>
  );
}
