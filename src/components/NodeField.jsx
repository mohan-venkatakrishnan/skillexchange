import { useEffect, useRef } from 'react';
import { useTheme } from '../tokens/theme';

/* Ambient node/dot field with mouse parallax, LaunchPad/PeerReview style:
   three depths that lag the pointer by different amounts.

   Transforms are written straight to the DOM through refs — NEVER through
   React state. A mousemove that calls setState re-renders 140 dots on every
   pointer event and janks the whole page. The rAF gate also collapses the
   burst of events between frames into one write.

   Deterministic seeded LCG so the constellation never reshuffles on re-render. */
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

  const glowRef = useRef(null);
  const farRef = useRef(null);
  const nearRef = useRef(null);
  const clusterRef = useRef(null);

  useEffect(() => {
    // No parallax for lite tier or touch — there is no pointer to follow, and
    // a coarse pointer would only jump the field around on tap.
    if (lite || !window.matchMedia?.('(pointer: fine)').matches) return;
    let raf = 0;
    let ev = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const x = ev.clientX / window.innerWidth - 0.5;
      const y = ev.clientY / window.innerHeight - 0.5;
      // Each depth lags by a different factor — that difference IS the parallax.
      if (glowRef.current) glowRef.current.style.transform = `translate3d(${x * -14}px, ${y * -9}px, 0)`;
      if (farRef.current) farRef.current.style.transform = `translate3d(${x * -10}px, ${y * -6}px, 0)`;
      if (nearRef.current) nearRef.current.style.transform = `translate3d(${x * -30}px, ${y * -19}px, 0)`;
      if (clusterRef.current) clusterRef.current.style.transform = `translate3d(${x * -46}px, ${y * -29}px, 0)`;
    };
    const onMove = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, [lite]);

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* ambient gold glows — shallowest parallax layer */}
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
        <div style={{ position: 'absolute', top: '-8%', left: '18%', width: 520, height: 420, background: `radial-gradient(ellipse, ${c.goldGlow} 0%, transparent 65%)`, animation: anim('drift1', 26) }} />
        <div style={{ position: 'absolute', bottom: '6%', right: '-6%', width: 430, height: 430, background: `radial-gradient(ellipse, ${c.slate}0d 0%, transparent 65%)`, animation: anim('drift2', 32) }} />
        <div style={{ position: 'absolute', top: '38%', left: '-6%', width: 380, height: 380, background: `radial-gradient(ellipse, ${c.goldGlow} 0%, transparent 65%)`, animation: anim('drift3', 29) }} />
      </div>

      {/* faint grid — fixed, gives the moving layers something to move against */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.025,
        backgroundImage: `linear-gradient(${c.gold} 1px, transparent 1px), linear-gradient(90deg, ${c.gold} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
      }} />

      {/* dot field — two depths. Outer div takes the pointer transform, inner
          keeps the CSS drift, so the two never fight over `transform`. */}
      <div ref={farRef} style={{ position: 'absolute', inset: '-60px', willChange: 'transform' }}>
        <div style={{ position: 'absolute', inset: 0, animation: anim('drift2', 44) }}>
          <DotLayer dots={DOTS_FAR} gold={c.gold} slate={c.slate} lite={lite} scale={0.8} />
        </div>
      </div>
      <div ref={nearRef} style={{ position: 'absolute', inset: '-60px', willChange: 'transform' }}>
        <div style={{ position: 'absolute', inset: 0, animation: anim('drift1', 30) }}>
          <DotLayer dots={DOTS_NEAR} gold={c.gold} slate={c.slate} lite={lite} />
        </div>
      </div>

      {/* node constellations — deepest layer, moves most */}
      <div ref={clusterRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
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
    </div>
  );
}
