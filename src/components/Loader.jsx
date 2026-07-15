import { useTheme } from '../tokens/theme';
import Logo from './Logo';

/* App loader: the Skill Exchange mark with a golden arc drawing around it.
   This is the ONLY spinner in the product — no generic rings anywhere. */
export default function Loader({ label = 'Loading…', pad = '18vh 24px', mark = 40 }) {
  const { c } = useTheme();
  const box = mark + 30;
  const r = (box - 6) / 2;
  const circ = Math.round(2 * Math.PI * r);
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: pad }}>
      <div style={{ position: 'relative', width: box, height: box, display: 'grid', placeItems: 'center' }}>
        <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={c.border} strokeWidth="2.5" />
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={c.gold} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={circ} className="loader-ring" style={{ '--circ': circ }}
            transform={`rotate(-90 ${box / 2} ${box / 2})`} />
        </svg>
        <Logo size={mark} />
      </div>
      {label && <div style={{ fontSize: 13, color: c.textMuted }}>{label}</div>}
    </div>
  );
}

/* Inline variant for buttons / small panes */
export function LoaderInline({ size = 16 }) {
  return <Logo size={size} spin={1.1} />;
}
