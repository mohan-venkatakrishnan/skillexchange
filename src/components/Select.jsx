import { useState, useRef, useEffect } from 'react';
import { useTheme, FONT_UI } from '../tokens/theme';

/* Theme-matched dropdown — a native <select> popup renders in the OS chrome
   (white, system font) and cannot be styled to the gold theme. Keyboard:
   Enter/Space/↓ opens, ↑/↓ move, Enter selects, Esc closes; outside click closes. */
export default function Select({ value, onChange, options, ariaLabel, minWidth = 150, full = false, size = 'md' }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const current = options.find(o => o.value === value) ?? options[0];
  const pad = size === 'sm' ? '7px 11px' : '10px 13px';
  const fs = size === 'sm' ? 12 : 13;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => { if (open) setActive(Math.max(0, options.findIndex(o => o.value === value))); }, [open, value, options]);

  const choose = (v) => { onChange(v); setOpen(false); };
  const onKey = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[active].value); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: full ? 'block' : 'inline-block', width: full ? '100%' : undefined }}>
      <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(o => !o)} onKeyDown={onKey}
        style={{ background: c.surface, border: `1px solid ${open ? c.gold : c.border}`, color: c.text, borderRadius: 10, padding: pad, fontSize: fs, fontFamily: FONT_UI, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', minWidth: full ? '100%' : minWidth, width: full ? '100%' : undefined, transition: 'border-color 0.15s' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current?.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gold} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 120, minWidth: '100%', width: 'max-content', maxHeight: 280, overflowY: 'auto', background: c.surface, border: `1px solid ${c.borderGold}`, borderRadius: 10, padding: 5, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', animation: 'spotlightIn 0.14s ease' }}>
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <button key={o.value} type="button" role="option" aria-selected={isSel}
                onClick={() => choose(o.value)} onMouseEnter={() => setActive(i)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, width: '100%', textAlign: 'left', background: i === active ? c.surfaceHover : 'transparent', border: 'none', color: isSel ? c.gold : c.textSub, borderRadius: 7, padding: '8px 10px', fontSize: fs, fontFamily: FONT_UI, cursor: 'pointer', fontWeight: isSel ? 600 : 400, whiteSpace: 'nowrap' }}>
                {o.label}
                {isSel && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
