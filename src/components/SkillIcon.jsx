import { useTheme } from '../tokens/theme';

/* Every skill gets a mark, like every Chrome Web Store item does.
   Sellers may upload one (iconUrl); otherwise we render a deterministic
   generated mark: a category glyph over a per-skill tinted plate, seeded from
   the skill id so a given skill always looks the same everywhere. */

const GLYPH = {
  Coding:    (s, c) => <><path d="M9 8 4 12l5 4" stroke={c} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 8l5 4-5 4" stroke={c} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
  Design:    (s, c) => <><circle cx="12" cy="12" r="7" stroke={c} strokeWidth="1.7" fill="none" /><path d="M12 5a7 7 0 0 1 0 14z" fill={c} opacity="0.5" /></>,
  Extension: (s, c) => <><rect x="5" y="5" width="9" height="9" rx="2" stroke={c} strokeWidth="1.7" fill="none" /><path d="M14 10h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-3a3 3 0 0 1-3-3v-3" stroke={c} strokeWidth="1.7" fill="none" strokeLinecap="round" /></>,
  Desktop:   (s, c) => <><rect x="3" y="5" width="18" height="12" rx="2" stroke={c} strokeWidth="1.7" fill="none" /><path d="M8 20h8M12 17v3" stroke={c} strokeWidth="1.7" strokeLinecap="round" /></>,
  Document:  (s, c) => <><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={c} strokeWidth="1.7" fill="none" strokeLinejoin="round" /><path d="M14 3v5h5M9 13h6M9 17h6" stroke={c} strokeWidth="1.5" strokeLinecap="round" /></>,
  Marketing: (s, c) => <><path d="M4 10v4h3l6 4V6l-6 4H4z" stroke={c} strokeWidth="1.7" fill="none" strokeLinejoin="round" /><path d="M17 9a4 4 0 0 1 0 6" stroke={c} strokeWidth="1.7" fill="none" strokeLinecap="round" /></>,
  Website:   (s, c) => <><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.7" fill="none" /><path d="M4 12h16M12 4a13 13 0 0 1 0 16a13 13 0 0 1 0-16z" stroke={c} strokeWidth="1.4" fill="none" /></>,
  Data:      (s, c) => <><ellipse cx="12" cy="6.5" rx="7" ry="2.8" stroke={c} strokeWidth="1.7" fill="none" /><path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11" stroke={c} strokeWidth="1.7" fill="none" /><path d="M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8" stroke={c} strokeWidth="1.4" fill="none" /></>,
  DevOps:    (s, c) => <><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.7" fill="none" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke={c} strokeWidth="1.6" strokeLinecap="round" /></>,
  'AI/ML':   (s, c) => <><circle cx="12" cy="12" r="2.4" fill={c} /><circle cx="6" cy="7" r="1.8" stroke={c} strokeWidth="1.5" fill="none" /><circle cx="18" cy="7" r="1.8" stroke={c} strokeWidth="1.5" fill="none" /><circle cx="6" cy="17" r="1.8" stroke={c} strokeWidth="1.5" fill="none" /><circle cx="18" cy="17" r="1.8" stroke={c} strokeWidth="1.5" fill="none" /><path d="M7.4 8.2 10 10.6M16.6 8.2 14 10.6M7.4 15.8 10 13.4M16.6 15.8 14 13.4" stroke={c} strokeWidth="1.3" /></>,
  Testing:   (s, c) => <><path d="M9 3v6l-4.6 8A2 2 0 0 0 6.2 20h11.6a2 2 0 0 0 1.8-3L15 9V3" stroke={c} strokeWidth="1.7" fill="none" strokeLinejoin="round" /><path d="M8 3h8M7.5 15h9" stroke={c} strokeWidth="1.6" strokeLinecap="round" /></>,
  Mobile:    (s, c) => <><rect x="7" y="3" width="10" height="18" rx="2.4" stroke={c} strokeWidth="1.7" fill="none" /><path d="M11 18h2" stroke={c} strokeWidth="1.7" strokeLinecap="round" /></>,
  Other:     (s, c) => <><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.7" fill="none" /><circle cx="12" cy="12" r="2.6" fill={c} /></>,
};

const hash = (str = '') => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};

export default function SkillIcon({ skill, size = 52, radius = 12 }) {
  const { c } = useTheme();
  if (skill?.iconUrl) {
    return <img src={skill.iconUrl} alt="" width={size} height={size} style={{ borderRadius: radius, objectFit: 'cover', flexShrink: 0, border: `1px solid ${c.border}`, display: 'block' }} />;
  }
  const seed = hash(skill?.id || skill?.skillId || skill?.title || 'skill');
  const glyph = GLYPH[skill?.category] || GLYPH.Other;
  // Two on-brand plate tints, chosen deterministically; gold stays dominant.
  const tints = [c.gold, c.green, c.coral, c.slate];
  const tint = tints[seed % tints.length];
  const rot = (seed >> 3) % 4; // subtle plate rotation of the corner accent
  const g = size / 52;

  return (
    <div style={{
      width: size, height: size, minWidth: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${tint}22, ${tint}0a 60%, transparent)`,
      border: `1px solid ${tint}3a`,
      display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden',
    }}>
      {/* corner constellation accent — echoes the brand mark */}
      <svg width={size} height={size} viewBox="0 0 52 52" style={{ position: 'absolute', inset: 0, opacity: 0.5, transform: `rotate(${rot * 90}deg)` }}>
        <line x1="44" y1="8" x2="34" y2="15" stroke={tint} strokeWidth="0.8" opacity="0.5" />
        <circle cx="44" cy="8" r="1.6" fill={tint} opacity="0.6" />
        <circle cx="34" cy="15" r="1" fill={tint} opacity="0.45" />
      </svg>
      <svg width={24 * g} height={24 * g} viewBox="0 0 24 24" fill="none" style={{ position: 'relative' }}>
        {glyph(size, tint)}
      </svg>
    </div>
  );
}
