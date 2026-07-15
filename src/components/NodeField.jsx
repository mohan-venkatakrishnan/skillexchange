import { useTheme } from '../tokens/theme';

/* Ambient node/dot field. NO mouse parallax — the background stays put and
   only drifts on its own slow CSS keyframes. Deterministic seeded LCG so the
   constellation never reshuffles between renders. */
const rng = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

const makeDots = (n, seed) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    left: r() * 100, top: r() * 100,
    size: 1 + r() * 2.4,
    op: 0.16 + r() * 0.34,
    dur: 6 + r() * 6,
    delay: r() * 6,
    gold: r() > 0.42,
  }));
};

/* Constellations are pushed toward the page edges: a lattice sitting behind
   the hero headline competes with it for attention (they read as artefacts on
   the text). Horizontal position is drawn from the outer thirds only. */
const makeClusters = (n, seed) => {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const leftSide = i % 2 === 0;
    const edge = r() * 26; // 0-26% inset from whichever edge
    return {
      left: leftSide ? edge : 100 - edge - 8,
      top: r() * 94,
      scale: 0.5 + r() * 0.7,
      dur: 16 + r() * 16,
      delay: r() * 6,
      drift: ['drift1', 'drift2', 'drift3'][Math.floor(r() * 3)],
      flip: r() > 0.5,
    };
  });
};

/* Denser than the first build: 140 dots + 14 constellations across 2 depths. */
const DOTS_FAR = makeDots(84, 17);
const DOTS_NEAR = makeDots(56, 63);
const CLUSTERS = makeClusters(14, 91);

function Constellation({ gold, slate, flip }) {
  const a = flip ? gold : slate;
  const b = flip ? slate : gold;
  return (
    <svg width="90" height="80" viewBox="0 0 90 80" fill="none">
      <line x1="45" y1="40" x2="15" y2="15" stroke={a} strokeWidth="1.1" />
      <line x1="45" y1="40" x2="75" y2="15" stroke={b} strokeWidth="1.1" />
      <line x1="45" y1="40" x2="75" y2="62" stroke={a} strokeWidth="1.1" />
      <line x1="45" y1="40" x2="15" y2="62" stroke={b} strokeWidth="1.1" />
      <line x1="15" y1="15" x2="75" y2="15" stroke={slate} strokeWidth="0.7" />
      <line x1="15" y1="62" x2="75" y2="62" stroke={slate} strokeWidth="0.7" />
      <line x1="15" y1="15" x2="15" y2="62" stroke={slate} strokeWidth="0.7" />
      <line x1="75" y1="15" x2="75" y2="62" stroke={slate} strokeWidth="0.7" />
      <circle cx="45" cy="40" r="4.5" fill={gold} />
      <circle cx="15" cy="15" r="2.8" fill="none" stroke={gold} strokeWidth="1.3" />
      <circle cx="75" cy="15" r="2.8" fill="none" stroke={slate} strokeWidth="1.3" />
      <circle cx="75" cy="62" r="2.8" fill="none" stroke={gold} strokeWidth="1.3" />
      <circle cx="15" cy="62" r="2.8" fill="none" stroke={slate} strokeWidth="1.3" />
    </svg>
  );
}

function DotLayer({ dots, gold, slate, lite, scale = 1 }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {dots.map((d, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${d.left}%`, top: `${d.top}%`,
          width: d.size * scale * 2, height: d.size * scale * 2, borderRadius: '50%',
          background: d.gold ? gold : slate,
          opacity: d.op, '--op': d.op,
          animation: lite ? 'none' : `twinkle ${d.dur}s ease-in-out -${d.delay}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}

export default function NodeField() {
  const { c, fx } = useTheme();
  const lite = fx === 'lite';
  const anim = (name, dur, delay = 0) => (lite ? 'none' : `${name} ${dur}s ease-in-out ${delay}s infinite`);

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* ambient gold glows */}
      <div style={{ position: 'absolute', top: '-8%', left: '18%', width: 520, height: 420, background: `radial-gradient(ellipse, ${c.goldGlow} 0%, transparent 65%)`, animation: anim('drift1', 26) }} />
      <div style={{ position: 'absolute', bottom: '6%', right: '-6%', width: 430, height: 430, background: `radial-gradient(ellipse, ${c.slate}0d 0%, transparent 65%)`, animation: anim('drift2', 32) }} />
      <div style={{ position: 'absolute', top: '38%', left: '-6%', width: 380, height: 380, background: `radial-gradient(ellipse, ${c.goldGlow} 0%, transparent 65%)`, animation: anim('drift3', 29) }} />

      {/* faint grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.025,
        backgroundImage: `linear-gradient(${c.gold} 1px, transparent 1px), linear-gradient(90deg, ${c.gold} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
      }} />

      {/* dot field — two depths, drifting only */}
      <div style={{ position: 'absolute', inset: '-40px', animation: anim('drift2', 44) }}>
        <DotLayer dots={DOTS_FAR} gold={c.gold} slate={c.slate} lite={lite} scale={0.8} />
      </div>
      <div style={{ position: 'absolute', inset: '-40px', animation: anim('drift1', 30) }}>
        <DotLayer dots={DOTS_NEAR} gold={c.gold} slate={c.slate} lite={lite} />
      </div>

      {/* node constellations — ambient, never legible enough to read as content */}
      {CLUSTERS.map((cl, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${cl.left}%`, top: `${cl.top}%`,
          transform: `scale(${cl.scale})`, opacity: 0.085,
          animation: anim(cl.drift, cl.dur, cl.delay),
        }}>
          <Constellation gold={c.gold} slate={c.slate} flip={cl.flip} />
        </div>
      ))}
    </div>
  );
}
