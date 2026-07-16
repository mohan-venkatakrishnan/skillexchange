import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../tokens/theme';

/* Count-up that fires once when scrolled into view. Parses the numeric part
   out of a formatted stat ("90+", "~17h", "4.7★") and animates 0→N while
   preserving the prefix/suffix, so a static "90+" becomes a ticking one.
   Holds still for fx-lite / reduced-motion — shows the final value instantly. */
export default function CountUp({ value, duration = 1100, style }) {
  const { fx } = useTheme();
  const lite = fx === 'lite';
  const ref = useRef(null);
  const raf = useRef(0);
  const [display, setDisplay] = useState(() => (lite ? value : null));

  // Split "~17h" → prefix "~", number 17, suffix "h". Non-numeric → render as-is.
  const m = String(value ?? '').match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/s);

  useEffect(() => {
    if (lite || !m) { setDisplay(value); return; }
    const el = ref.current;
    if (!el) return;
    const prefix = m[1];
    const target = parseFloat(m[2].replace(/,/g, ''));
    const decimals = (m[2].split('.')[1] || '').length;
    const suffix = m[3];

    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const tick = (ts) => {
        if (!start) start = ts;
        const t = Math.min(1, (ts - start) / duration);
        // easeOutCubic — fast then settles, reads as a real counter
        const eased = 1 - Math.pow(1 - t, 3);
        const n = target * eased;
        const shown = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString();
        setDisplay(`${prefix}${shown}${suffix}`);
        if (t < 1) raf.current = requestAnimationFrame(tick);
        else setDisplay(value); // land exactly on the formatted original
      };
      raf.current = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf.current); };
  }, [value, duration, lite]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reserve the final width so the layout doesn't jitter as digits grow.
  return (
    <span ref={ref} style={{ display: 'inline-block', fontVariantNumeric: 'tabular-nums', ...style }}>
      {display ?? ' '}
    </span>
  );
}
