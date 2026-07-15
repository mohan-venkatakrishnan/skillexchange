import { createContext, useContext } from 'react';

/* ============ DESIGN TOKENS ============
   Skill Exchange palette (gold on near-black), structured like PeerReview's
   tokens so every surface/edge/text role has one name and one value. */
export const DARK = {
  bg: '#121212', surface: '#1b1b1b', surfaceHover: '#232323', elevated: '#272727',
  border: '#2b2b28', borderGold: 'rgba(201,168,76,0.22)',
  gold: '#C9A84C', goldDim: '#8a6f2e', goldSoft: 'rgba(201,168,76,0.10)',
  goldGlow: 'rgba(201,168,76,0.08)',
  text: '#F0EDE6', textSub: '#a8a49a', textMuted: '#7d7a72',
  green: '#6dba98', greenSoft: 'rgba(109,186,152,0.10)',
  coral: '#c97a5a', coralSoft: 'rgba(201,122,90,0.10)',
  slate: '#9a9890', slateSoft: 'rgba(154,152,144,0.10)',
  onGold: '#141414', // text that sits ON a gold fill
};

export const LIGHT = {
  bg: '#faf8f2', surface: '#ffffff', surfaceHover: '#f4f1e9', elevated: '#f2efe6',
  border: '#e2ddcf', borderGold: 'rgba(154,110,16,0.28)',
  gold: '#8a6210', goldDim: '#6e4e00', goldSoft: 'rgba(154,110,16,0.09)',
  goldGlow: 'rgba(154,110,16,0.07)',
  text: '#1c1a14', textSub: '#585349', textMuted: '#7a7060',
  green: '#207a5b', greenSoft: 'rgba(32,122,91,0.09)',
  coral: '#a05030', coralSoft: 'rgba(160,80,48,0.08)',
  slate: '#6f675c', slateSoft: 'rgba(111,103,92,0.09)',
  onGold: '#ffffff',
};

/* Theme context — provides { c, isDark, setIsDark, fx } app-wide.
   fx tier: "full" = all motion, "lite" = static. Auto-detected at load
   (LaunchPad tier.js / PeerReview pattern); localStorage `se-fx` is a QA override. */
export const ThemeContext = createContext({ c: DARK, isDark: true, setIsDark: () => {}, fx: 'full' });
export const useTheme = () => useContext(ThemeContext);

export function detectFx() {
  try {
    const ov = localStorage.getItem('se-fx');
    if (ov === 'full' || ov === 'lite') return ov;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = navigator.connection?.saveData;
    const mem = navigator.deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    return (reduced || saveData || mem <= 2 || cores <= 2) ? 'lite' : 'full';
  } catch {
    return 'full';
  }
}

/* Font stacks — always with real fallbacks. A bare "Playfair Display" silently
   renders as Times if the webfont is slow, which is what made the type look
   amateur in the first build. */
export const FONT_DISPLAY = "'Playfair Display', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
export const FONT_UI = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
