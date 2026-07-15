import { useTheme, FONT_UI, FONT_DISPLAY } from './tokens/theme';

/* Global keyframes + resets. Rendered once; only theme colours vary. */
export default function GlobalStyles() {
  const { c } = useTheme();
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    /* overflow-x: clip, NEVER hidden — hidden silently kills position:sticky */
    html, body { overflow-x: clip; }
    body {
      font-family: ${FONT_UI};
      background: ${c.bg};
      color: ${c.text};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    h1, h2, h3 { font-family: ${FONT_DISPLAY}; letter-spacing: -0.02em; }

    @keyframes rotateMark { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes stampIn { 0% { transform: scale(1.5) rotate(-8deg); opacity: 0; } 55% { transform: scale(0.93) rotate(2deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
    @keyframes spotlightIn { from { opacity: 0; transform: translateY(-8px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes drift1 { 0%, 100% { transform: translate(0, 0); } 33% { transform: translate(40px, -30px); } 66% { transform: translate(-28px, 24px); } }
    @keyframes drift2 { 0%, 100% { transform: translate(0, 0); } 33% { transform: translate(-46px, 32px); } 66% { transform: translate(30px, -22px); } }
    @keyframes drift3 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(36px, -42px); } }
    @keyframes twinkle { 0%, 100% { opacity: var(--op, 0.35); transform: scale(1); } 50% { opacity: calc(var(--op, 0.35) * 0.25); transform: scale(0.7); } }
    @keyframes loaderDraw { 0% { stroke-dashoffset: var(--circ); } 50% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: calc(var(--circ) * -1); } }

    .fade-up { animation: fadeUp 0.5s ease forwards; }
    .fade-up-d1 { animation: fadeUp 0.5s ease 0.07s forwards; opacity: 0; }
    .fade-up-d2 { animation: fadeUp 0.5s ease 0.14s forwards; opacity: 0; }
    .fade-up-d3 { animation: fadeUp 0.5s ease 0.21s forwards; opacity: 0; }
    .fade-in { animation: fadeIn 0.4s ease forwards; }
    .stamp-in { animation: stampIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
    .float { animation: float 4s ease-in-out infinite; }
    .loader-ring { animation: loaderDraw 1.5s ease-in-out infinite; }

    /* FX-lite / reduced motion: hold everything still, never hide content */
    .fx-lite .fade-up, .fx-lite .fade-up-d1, .fx-lite .fade-up-d2, .fx-lite .fade-up-d3 { animation: none; opacity: 1; }
    .fx-lite .float, .fx-lite .stamp-in { animation: none; }
    .fx-lite .loader-ring { animation: none; stroke-dashoffset: 60; }
    @media (prefers-reduced-motion: reduce) {
      .fade-up, .fade-up-d1, .fade-up-d2, .fade-up-d3 { animation: none !important; opacity: 1; }
      .float, .stamp-in { animation: none !important; }
      html { scroll-behavior: auto; }
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${c.gold}44; border-radius: 3px; }
    ::selection { background: ${c.gold}33; color: ${c.text}; }

    input, textarea, button { font-family: ${FONT_UI}; }
    input:focus, textarea:focus { outline: none; border-color: ${c.gold} !important; }
    input::placeholder, textarea::placeholder { color: ${c.textMuted}; }
    a { color: inherit; }

    /* Instant custom tooltip — native title has a fixed ~1s delay */
    [data-tip] { position: relative; }
    [data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
      background: ${c.surface}; color: ${c.text}; border: 1px solid ${c.borderGold};
      border-radius: 8px; padding: 7px 11px; font-size: 12px; line-height: 1.5;
      width: max-content; max-width: 240px; z-index: 200; text-align: center; white-space: normal;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4); pointer-events: none;
    }

    .nav-desktop-links { display: flex; gap: 2px; flex: 1; min-width: 0; }
    .nav-hamburger { display: none; }
    .nav-brand-text { display: inline; }
    @media (max-width: 860px) {
      .nav-desktop-links { display: none !important; }
      .nav-hamburger { display: flex !important; }
    }
    @media (max-width: 420px) { .nav-brand-text { display: none; } }

    /* Marketplace shell: category rail collapses under the content on narrow */
    @media (max-width: 900px) {
      .mk-shell { grid-template-columns: 1fr !important; }
      .mk-rail { position: static !important; display: none !important; }
      .mk-rail-mobile { display: block !important; }
    }
  `;
  return <style>{css}</style>;
}
