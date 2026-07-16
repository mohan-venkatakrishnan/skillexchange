import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme, FONT_UI } from '../tokens/theme';
import { Label } from './ui.jsx';
import { checkUsername } from '../lib/api.js';

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/* Username input with live availability and — when taken — three free handles
   built off the same prefix, so nobody has to guess their way to one. */
export default function UsernameField({ value, onChange, label = 'Username', hint, testId = 'signup-username', autoFocus }) {
  const { c } = useTheme();
  const [status, setStatus] = useState(null); // checking | available | taken | invalid
  const [suggestions, setSuggestions] = useState([]);
  const timer = useRef(null);
  const seq = useRef(0);

  const run = useCallback((val) => {
    clearTimeout(timer.current);
    if (!val) { setStatus(null); setSuggestions([]); return; }
    if (!USERNAME_RE.test(val)) { setStatus('invalid'); setSuggestions([]); return; }
    setStatus('checking');
    timer.current = setTimeout(async () => {
      const mine = ++seq.current; // ignore a slow reply for an older keystroke
      try {
        const r = await checkUsername(val);
        if (seq.current !== mine) return;
        setStatus(r.available ? 'available' : 'taken');
        setSuggestions(r.available ? [] : (r.suggestions || []));
      } catch {
        if (seq.current === mine) { setStatus(null); setSuggestions([]); }
      }
    }, 350);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (raw) => {
    const val = raw.toLowerCase().trim();
    onChange(val);
    run(val);
  };

  const pick = (s) => { onChange(s); setStatus('available'); setSuggestions([]); };

  const tone = status === 'available' ? c.green : (status === 'taken' || status === 'invalid') ? c.coral : c.border;
  const msg = status === 'checking' ? 'Checking availability…'
    : status === 'available' ? '✓ Available'
    : status === 'taken' ? '✗ Already taken'
    : status === 'invalid' ? '3–24 characters: a–z, 0–9, _'
    : hint;

  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{label}</Label>
      <input value={value} onChange={e => set(e.target.value)} data-testid={testId} autoFocus={autoFocus}
        placeholder="Choose a unique handle" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={{ width: '100%', background: c.surface, border: `1px solid ${tone}`, borderRadius: 10, padding: '11px 13px', fontSize: 13, color: c.text, fontFamily: FONT_UI, boxSizing: 'border-box', outline: 'none' }} />
      {msg && (
        <p style={{ fontFamily: FONT_UI, fontSize: 11, color: status ? tone : c.textMuted, margin: '6px 2px 0' }}>{msg}</p>
      )}
      {suggestions.length > 0 && (
        <div data-testid="username-suggestions" style={{ marginTop: 8 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, marginBottom: 6 }}>Available instead:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {suggestions.map(s => (
              <button key={s} type="button" onClick={() => pick(s)}
                style={{ background: c.goldSoft, border: `1px solid ${c.borderGold}`, color: c.gold, borderRadius: 20, padding: '5px 12px', fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = c.gold}
                onMouseLeave={e => e.currentTarget.style.borderColor = c.borderGold}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
