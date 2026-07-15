import { useTheme, FONT_UI, FONT_MONO } from '../tokens/theme';
import { Ic } from './Icons.jsx';

/* ── VERIFIED STAMP ── */
export function VerifiedStamp({ size = 28, animate = true }) {
  const { c, fx } = useTheme();
  return (
    <span data-tip="Verified Creator — proof of concept manually reviewed"
      className={animate && fx !== 'lite' ? 'stamp-in' : undefined}
      style={{ display: 'inline-flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', width: size, height: size, minWidth: size, minHeight: size, borderRadius: '50%', background: `linear-gradient(135deg,${c.gold},${c.goldDim})`, boxShadow: `0 0 0 2px ${c.bg}, 0 0 0 3.5px ${c.gold}55` }}>
      <Ic.Shield s={size * 0.55} c={c.bg} />
    </span>
  );
}

/* ── Ratings ──
   A skill with no reviews shows "New" — never "0.0 (0)". Rendering an empty
   five-star row with a zero count reads as "rated badly", not "not yet rated". */
export function Stars({ rating, count, showEmpty = true, size = 11 }) {
  const { c } = useTheme();
  const r = Number(rating) || 0;
  const n = Number(count) || 0;
  if (!n) return showEmpty ? <NewTag /> : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(i => <Ic.Star key={i} s={size} c={c.gold} filled={i <= Math.round(r)} />)}
      <span style={{ fontFamily: FONT_UI, fontSize: size, color: c.textMuted, marginLeft: 3 }}>
        {r.toFixed(1)} <span style={{ color: c.textMuted }}>({n})</span>
      </span>
    </span>
  );
}

export function NewTag() {
  const { c } = useTheme();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: c.green, background: c.greenSoft, border: `1px solid ${c.green}35`, borderRadius: 20, padding: '2px 9px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      New
    </span>
  );
}

/* Downloads — spelled out, never "dl". Hidden entirely at zero. */
export function Downloads({ count, size = 11 }) {
  const { c } = useTheme();
  const n = Number(count) || 0;
  if (!n) return null;
  return (
    <span style={{ fontFamily: FONT_UI, fontSize: size, color: c.textMuted, whiteSpace: 'nowrap' }}>
      {n.toLocaleString()} {n === 1 ? 'download' : 'downloads'}
    </span>
  );
}

export function Bdg({ icon, label, color, tip }) {
  const { c } = useTheme();
  const col = color || c.gold;
  return (
    <span data-tip={tip} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${col}16`, border: `1px solid ${col}35`, borderRadius: 20, padding: '3px 10px', fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: col, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {icon}{label}
    </span>
  );
}

export function SkillBdg({ label }) {
  const { c } = useTheme();
  if (!label) return null;
  const col = label.startsWith('#1') ? c.gold : label === 'Top Rated' ? c.green : label === 'Most Downloaded' ? c.slate : c.coral;
  return <Bdg label={label} color={col} />;
}

export function PTag({ p }) {
  const { c } = useTheme();
  const colors = { Claude: c.gold, ChatGPT: c.green, Gemini: c.slate, Cursor: c.coral, Copilot: '#7aabdc' };
  const col = colors[p] || c.textMuted;
  return <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 500, color: col, background: `${col}14`, border: `1px solid ${col}28`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{p}</span>;
}

export function TimeSaved({ hours, compact = false }) {
  const { c } = useTheme();
  if (!hours) return null;
  return (
    <span data-tip="Seller's own estimate — not verified by Skill Exchange"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.goldSoft, border: `1px solid ${c.gold}30`, borderRadius: 6, padding: '3px 8px', fontFamily: FONT_UI, fontSize: 11, fontWeight: 600, color: c.gold, whiteSpace: 'nowrap' }}>
      <Ic.Clock s={11} c={c.gold} />~{hours}h saved
      {!compact && <span style={{ fontSize: 9, fontWeight: 400, color: c.textMuted }}>est.</span>}
    </span>
  );
}

export function SellerBdg({ b }) {
  const { c } = useTheme();
  if (b === 'Verified Creator') return <Bdg icon={<Ic.Shield s={10} c={c.gold} />} label="Verified Creator" color={c.gold} tip="Proof of concept manually reviewed by Skill Exchange" />;
  if (b === 'Top Seller') return <Bdg icon={<Ic.Crown s={10} c={c.coral} />} label="Top Seller" color={c.coral} tip="Highest total sales on the exchange" />;
  return null;
}

export function BuilderIcon({ b }) {
  const { c } = useTheme();
  if (b === 'Crown') return <Ic.Crown s={14} c={c.gold} />;
  if (b === 'Flame') return <Ic.Flame s={14} c={c.coral} />;
  if (b === 'Gem') return <Ic.Gem s={14} c={c.green} />;
  if (b === 'Bolt') return <Ic.Bolt s={14} c={c.slate} />;
  return null;
}

export function Price({ cents, dollars, size = 13 }) {
  const { c } = useTheme();
  const v = dollars !== undefined ? dollars : (cents || 0) / 100;
  const free = v === 0;
  return (
    <span style={{ fontFamily: FONT_UI, fontSize: size, fontWeight: 700, color: free ? c.green : c.gold, whiteSpace: 'nowrap' }}>
      {free ? 'Free' : `$${v}`}
    </span>
  );
}

export function PageWrap({ children, style }) {
  return <div style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100vh - 52px)', ...style }}>{children}</div>;
}
