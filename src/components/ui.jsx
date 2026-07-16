import { useRef, useState, useEffect } from 'react';
import { useTheme, FONT_UI, FONT_DISPLAY, FONT_MONO } from '../tokens/theme';

/* Scroll-triggered fade-up reveal. Fires once when the element first enters
   the viewport — not a per-frame scroll handler. */
export function Reveal({ children, delay = 0, style, className = '' }) {
  const { fx } = useTheme();
  const lite = fx === 'lite';
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown || lite) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); obs.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [lite, shown]);
  const visible = shown || lite;
  return (
    <div ref={ref} className={`${visible ? (delay ? `fade-up-d${delay}` : 'fade-up') : ''} ${className}`.trim()}
      style={{ opacity: visible ? undefined : 0, ...style }}>
      {children}
    </div>
  );
}

/* Centered page section — the LaunchPad/PeerReview house measure. */
export function Section({ children, id, style, max = 1100, pad = '86px 24px' }) {
  return (
    <section id={id} style={{ padding: pad, position: 'relative', zIndex: 1, ...style }}>
      <div style={{ maxWidth: max, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, sub }) {
  const { c } = useTheme();
  return (
    <Reveal style={{ textAlign: 'center', marginBottom: 44 }}>
      {eyebrow && <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.gold, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>{eyebrow}</div>}
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(25px, 3.6vw, 36px)', fontWeight: 700, color: c.text, letterSpacing: '-0.02em', margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontFamily: FONT_UI, fontSize: 15, color: c.textMuted, lineHeight: 1.7, maxWidth: 560, margin: '12px auto 0' }}>{sub}</p>}
    </Reveal>
  );
}

/* ── Buttons ── */
export function GoldButton({ children, onClick, full, size = 'md', disabled = false, type = 'button', title, testId }) {
  const { c } = useTheme();
  return (
    <button type={type} onClick={disabled ? undefined : onClick} disabled={disabled} title={title} data-testid={testId}
      style={{
        opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto',
        background: `linear-gradient(135deg, ${c.gold}, ${c.goldDim})`, border: 'none',
        borderRadius: 10, padding: size === 'lg' ? '14px 32px' : size === 'sm' ? '8px 16px' : '11px 24px',
        color: c.onGold, fontFamily: FONT_UI, fontSize: size === 'lg' ? 15 : size === 'sm' ? 13 : 14, fontWeight: 700,
        cursor: 'pointer', boxShadow: `0 0 24px ${c.goldGlow}`, width: full ? '100%' : 'auto',
        transition: 'transform 0.15s, box-shadow 0.2s', letterSpacing: '-0.01em',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 28px ${c.gold}33`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 0 24px ${c.goldGlow}`; }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, full, size = 'md', disabled = false, title, testId }) {
  const { c } = useTheme();
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} title={title} data-testid={testId}
      style={{
        opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? 'none' : 'auto',
        background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 10,
        padding: size === 'lg' ? '13px 30px' : size === 'sm' ? '8px 16px' : '11px 24px',
        color: c.textSub, fontFamily: FONT_UI, fontSize: size === 'lg' ? 15 : size === 'sm' ? 13 : 14,
        fontWeight: 500, cursor: 'pointer', width: full ? '100%' : 'auto', transition: 'border-color 0.2s, color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.color = c.gold; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textSub; }}>
      {children}
    </button>
  );
}

/* ── Surfaces ── */
export function Card({ children, style, className, onClick, hover = false, testId }) {
  const { c } = useTheme();
  return (
    <div className={className} onClick={onClick} data-testid={testId}
      style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20, transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s', cursor: onClick ? 'pointer' : undefined, ...style }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 34px ${c.goldGlow}`; } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } : undefined}>
      {children}
    </div>
  );
}

/* ── Form controls ── */
const fieldBase = (c) => ({
  width: '100%', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
  padding: '11px 13px', fontSize: 13, color: c.text, fontFamily: FONT_UI,
  transition: 'border-color 0.15s', boxSizing: 'border-box', outline: 'none',
});

export function Label({ children, hint }) {
  const { c } = useTheme();
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: c.textSub, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}{hint && <span style={{ color: c.coral, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
    </label>
  );
}

/* Counter shown once the user is close enough to the limit to care — a
   permanent counter on every field is noise, and a field that silently stops
   accepting input is worse. Turns amber near the cap. */
function CharCount({ value = '', limit }) {
  const { c } = useTheme();
  if (!limit) return null;
  const len = String(value).length;
  if (len < limit * 0.7) return null;
  const atCap = len >= limit;
  return (
    <span style={{ fontFamily: FONT_UI, fontSize: 11, color: atCap ? c.coral : c.textMuted, marginLeft: 'auto' }}>
      {len}/{limit}
    </span>
  );
}

export function Input({ label, hint, value, onChange, placeholder, mono, type = 'text', style, testId, onKeyDown, max, min, step, autoFocus, maxLength }) {
  const { c } = useTheme();
  return (
    <div style={{ marginBottom: label ? 16 : 0 }}>
      {(label || maxLength) && (
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          {label && <Label hint={hint}>{label}</Label>}
          <CharCount value={value} limit={maxLength} />
        </div>
      )}
      <input value={value} onChange={onChange} placeholder={placeholder} type={type} data-testid={testId}
        onKeyDown={onKeyDown} max={max} min={min} step={step} autoFocus={autoFocus} maxLength={maxLength}
        style={{ ...fieldBase(c), fontFamily: mono ? FONT_MONO : FONT_UI, ...style }} />
    </div>
  );
}

export function Textarea({ label, hint, value, onChange, placeholder, rows = 4, style, testId, maxLength }) {
  const { c } = useTheme();
  return (
    <div style={{ marginBottom: label ? 16 : 0 }}>
      {(label || maxLength) && (
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          {label && <Label hint={hint}>{label}</Label>}
          <CharCount value={value} limit={maxLength} />
        </div>
      )}
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} data-testid={testId} maxLength={maxLength}
        style={{ ...fieldBase(c), resize: 'vertical', lineHeight: 1.6, ...style }} />
    </div>
  );
}

/* ── Checkbox ──
   A themed toggle, not a native <input type=checkbox>. Two reasons:
   1. It's the last OS-chrome form control — everything else here is themed.
   2. A *controlled* native checkbox whose state lives in the URL bounces: the
      click sets .checked synchronously, React snaps it back to the current
      prop, then the async router update flips it again. That transient
      desync is visible to users on a slow update and made `.check()` fail
      ~25% of the time. Driving aria-checked from state has no such window. */
export function Checkbox({ checked, onChange, label, testId }) {
  const { c } = useTheme();
  return (
    <button type="button" role="checkbox" aria-checked={checked} data-testid={testId}
      onClick={() => onChange(!checked)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontFamily: FONT_UI, fontSize: 12.5, color: checked ? c.gold : c.textSub, transition: 'color 0.14s' }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.color = c.text; }}
      onMouseLeave={e => { if (!checked) e.currentTarget.style.color = c.textSub; }}>
      <span aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0, borderRadius: 4, border: `1.5px solid ${checked ? c.gold : c.border}`, background: checked ? c.gold : 'transparent', display: 'grid', placeItems: 'center', transition: 'background 0.14s, border-color 0.14s' }}>
        {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.onGold} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
      </span>
      {label}
    </button>
  );
}

/* ── Avatar — uploaded photo (URL/data URL) or gold initial ── */
export function Avatar({ name = '?', src, size = 36, style }) {
  const { c } = useTheme();
  if (src) {
    return <div style={{ width: size, height: size, minWidth: size, borderRadius: '50%', backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', border: `1px solid ${c.borderGold}`, flexShrink: 0, ...style }} />;
  }
  return (
    <div style={{ width: size, height: size, minWidth: size, borderRadius: '50%', background: `linear-gradient(135deg, ${c.gold}, ${c.goldDim})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_DISPLAY, fontSize: size * 0.4, fontWeight: 700, color: c.onGold, border: `1px solid ${c.borderGold}`, flexShrink: 0, ...style }}>
      {(name[0] || '?').toUpperCase()}
    </div>
  );
}

/* Avatar with an upload affordance — click to pick an image file. */
export function AvatarUpload({ name, src, size = 76, onPick, busy }) {
  const { c } = useTheme();
  const ref = useRef(null);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <Avatar name={name} src={src} size={size} />
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} data-testid="avatar-input"
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()} title="Change photo" data-testid="avatar-upload"
        style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%', background: c.surface, border: `1px solid ${c.borderGold}`, color: c.gold, cursor: busy ? 'wait' : 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>
        {busy
          ? <span style={{ fontSize: 10 }}>…</span>
          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>}
      </button>
    </div>
  );
}

/* ── Page furniture ── */
export function PageTitle({ eyebrow, title, sub, center = false, style }) {
  const { c } = useTheme();
  return (
    <div className="fade-up" style={{ marginBottom: 28, textAlign: center ? 'center' : 'left', ...style }}>
      {eyebrow && <div style={{ fontSize: 11, color: c.gold, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{eyebrow}</div>}
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 700, color: c.text, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>{title}</h1>
      {sub && <p style={{ fontSize: 14, color: c.textMuted, marginTop: 9, lineHeight: 1.65, maxWidth: center ? 620 : undefined, marginLeft: center ? 'auto' : undefined, marginRight: center ? 'auto' : undefined }}>{sub}</p>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  const { c } = useTheme();
  return (
    <div style={{ textAlign: 'center', padding: '56px 16px', fontFamily: FONT_UI }}>
      <p style={{ color: c.coral, fontSize: 14, marginBottom: 16 }}>{message}</p>
      {onRetry && <GhostButton onClick={onRetry}>Retry</GhostButton>}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  const { c } = useTheme();
  return (
    <div style={{ textAlign: 'center', padding: '64px 16px', fontFamily: FONT_UI }}>
      <p style={{ color: c.text, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</p>
      {body && <p style={{ color: c.textMuted, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>{body}</p>}
      {action}
    </div>
  );
}
