import { useRef, useState, useEffect } from 'react';
import { useTheme, FONT_HEAD, FONT_MONO } from '../tokens/theme';
import Logo from './Logo';

/* PublishFlow — a restrained, looping explainer diagram for the landing page.
   Three stages read left→right (stacked on mobile): a shipped project becomes a
   SKILL.md, which others buy on the marketplace. A single gold pulse travels the
   connectors so the eye follows the flow.

   Motion is pure CSS (no per-frame React state). Keyframes are colour-agnostic —
   every theme colour is applied inline — so the injected <style> only carries
   layout + timing. fx-lite / reduced-motion hold the fully composed static
   state: the pulse rests mid-connector, nothing moves. */

const STYLE = `
  .pf-flow { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 0; width: 100%; }
  .pf-stage { flex: 1 1 0; min-width: 0; max-width: 260px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .pf-conn { position: relative; flex: 0 0 auto; width: 54px; height: 2px; align-self: center; }
  .pf-conn-inner { position: absolute; inset: 0; border-radius: 2px; }
  .pf-dot { position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; border-radius: 50%; transform: translate(-50%, -50%); }

  @keyframes pf-rise { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes pf-flow-x {
    0%   { left: 4%;   opacity: 0; }
    8%   { opacity: 1; }
    38%  { left: 96%;  opacity: 1; }
    46%  { left: 96%;  opacity: 0; }
    100% { left: 96%;  opacity: 0; }
  }
  @keyframes pf-flow-y {
    0%   { top: 4%;   left: 50%; opacity: 0; }
    8%   { opacity: 1; }
    38%  { top: 96%;  left: 50%; opacity: 1; }
    46%  { top: 96%;  opacity: 0; }
    100% { top: 96%;  opacity: 0; }
  }
  @keyframes pf-shimmer { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.95; } }

  .pf-anim .pf-stage { opacity: 0; animation: pf-rise 0.6s cubic-bezier(0.22,0.61,0.36,1) forwards; }
  .pf-anim .pf-dot { animation: pf-flow-x 4.6s cubic-bezier(0.4,0,0.2,1) infinite; }
  .pf-anim .pf-glow { animation: pf-shimmer 5s ease-in-out infinite; }

  @media (max-width: 640px) {
    .pf-flow { flex-direction: column; }
    .pf-stage { max-width: 320px; width: 100%; }
    .pf-conn { width: 2px; height: 42px; }
    .pf-anim .pf-dot { animation-name: pf-flow-y; }
  }

  /* Hold everything still for reduced-motion — the pulse rests mid-connector. */
  @media (prefers-reduced-motion: reduce) {
    .pf-anim .pf-stage { animation: none !important; opacity: 1 !important; }
    .pf-anim .pf-dot { animation: none !important; }
    .pf-anim .pf-glow { animation: none !important; }
  }
`;

/* A faint UI bar used inside the project card. */
function Bar({ c, w, tone }) {
  return <div style={{ height: 6, width: w, borderRadius: 3, background: tone || c.border }} />;
}

export default function PublishFlow({ style }) {
  const { c, fx } = useTheme();
  const lite = fx === 'lite';
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown || lite) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); obs.disconnect(); }
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [lite, shown]);

  const animate = !lite && shown;

  const cardBase = {
    position: 'relative', width: '100%', height: 140, boxSizing: 'border-box',
    background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14,
    padding: 14, display: 'flex', flexDirection: 'column',
  };
  const caption = { fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 500, color: c.textSub, marginTop: 14, lineHeight: 1.4, letterSpacing: '-0.01em' };

  // Stage entrance stagger — inline delay, only meaningful while animating.
  const stageStyle = (i) => (animate ? { animationDelay: `${i * 0.14}s` } : { opacity: 1 });
  // Second connector's pulse trails the first so the eye sweeps end to end.
  const dotStyle = (delay) => ({
    background: c.gold,
    boxShadow: `0 0 8px ${c.gold}, 0 0 3px ${c.gold}`,
    ...(animate ? { animationDelay: `${delay}s` } : {}),
  });

  const Connector = ({ delay }) => (
    <div className="pf-conn" aria-hidden="true">
      <div className="pf-conn-inner pf-glow" style={{ background: `linear-gradient(90deg, ${c.border}, ${c.goldDim}, ${c.border})` }} />
      <div className="pf-dot" style={dotStyle(delay)} />
    </div>
  );

  return (
    <div ref={ref} className={animate ? 'pf-anim' : undefined}
      style={{ position: 'relative', width: '100%', fontFamily: FONT_HEAD, ...style }}>
      <style>{STYLE}</style>

      <div className="pf-flow">
        {/* ── Stage 1: a shipped project ── */}
        <div className="pf-stage" style={stageStyle(0)}>
          <div style={cardBase}>
            {/* browser chrome */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
              {[c.coral, c.gold, c.green].map((dot, i) => (
                <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: dot, opacity: 0.55 }} />
              ))}
              <div style={{ flex: 1, height: 8, marginLeft: 6, borderRadius: 4, background: c.surfaceHover, border: `1px solid ${c.border}` }} />
            </div>
            {/* faint UI content */}
            <div style={{ display: 'flex', gap: 10, flex: 1 }}>
              <div style={{ width: 34, borderRadius: 6, background: c.surfaceHover, border: `1px solid ${c.border}` }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
                <Bar c={c} w="82%" tone={c.goldSoft} />
                <Bar c={c} w="66%" />
                <Bar c={c} w="74%" />
                <Bar c={c} w="48%" />
              </div>
            </div>
          </div>
          <div style={caption}>A project you shipped</div>
        </div>

        <Connector delay={0} />

        {/* ── Stage 2: the SKILL.md ── */}
        <div className="pf-stage" style={stageStyle(1)}>
          <div style={{ ...cardBase, borderLeft: `2px solid ${c.borderGold}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <span style={{ color: c.gold, fontSize: 12 }}>✦</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 500, color: c.text, letterSpacing: '-0.01em' }}>SKILL.md</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {[['#', '78%'], ['·', '58%'], ['·', '88%'], ['·', '64%']].map(([g, w], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: i === 0 ? c.gold : c.textMuted, width: 8 }}>{g}</span>
                  <div style={{ height: 6, width: w, borderRadius: 3, background: i === 0 ? c.goldSoft : c.border }} />
                </div>
              ))}
            </div>
          </div>
          <div style={caption}>becomes a SKILL.md</div>
        </div>

        <Connector delay={1.9} />

        {/* ── Stage 3: the marketplace ── */}
        <div className="pf-stage" style={stageStyle(2)}>
          <div style={{ ...cardBase, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* soft gold glow behind the mark */}
            <div className="pf-glow" aria-hidden="true" style={{
              position: 'absolute', width: 120, height: 120, borderRadius: '50%',
              background: `radial-gradient(circle, ${c.goldSoft}, transparent 70%)`,
              top: '28%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Logo size={40} />
            </div>
            {/* mini skill tiles */}
            <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 26, height: 18, borderRadius: 5,
                  background: i === 1 ? c.goldSoft : c.surfaceHover,
                  border: `1px solid ${i === 1 ? c.borderGold : c.border}`,
                }} />
              ))}
            </div>
          </div>
          <div style={caption}>others buy &amp; reuse it</div>
        </div>
      </div>
    </div>
  );
}
