import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme, FONT_HEAD, FONT_UI } from '../tokens/theme';
import Logo from './Logo.jsx';
import { Ic } from './Icons.jsx';
import { GoldButton, Input } from './ui.jsx';
import { LIMITS } from '../data/limits.js';
import UsernameField, { USERNAME_RE } from './UsernameField.jsx';
import { signIn, signUp, confirmSignUp, signInWithGoogle, refreshProfile } from '../lib/auth.js';

export default function AuthModal({ onClose, onLogin }) {
  const { c } = useTheme();
  const [tab, setTab] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [uname, setUname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finish = async (session) => {
    // The handle lives in DynamoDB; pull it before the nav paints.
    const full = await refreshProfile().catch(() => session);
    onLogin(full || session);
  };

  const submit = async () => {
    setError('');
    if (tab === 'signup') {
      if (!name.trim() || name.trim().length < 2) { setError('Tell us your name — buyers see it on your listings.'); return; }
      if (!USERNAME_RE.test(uname)) { setError('Username: 3–24 characters, lowercase letters, numbers, underscores.'); return; }
    }
    if (!email.trim() || !pw) { setError('Email and password are required.'); return; }
    setBusy(true);
    try {
      const session = tab === 'signin'
        ? await signIn({ email: email.trim(), password: pw })
        : await signUp({ username: uname, email: email.trim(), password: pw, name: name.trim() });
      await finish(session);
    } catch (e) {
      if (e.code?.includes('UserNotConfirmed')) setNeedsConfirm(true);
      else setError(friendlyAuthError(e));
    } finally { setBusy(false); }
  };

  const submitConfirm = async () => {
    setBusy(true); setError('');
    try {
      await confirmSignUp({ email: email.trim(), code: code.trim() });
      await finish(await signIn({ email: email.trim(), password: pw }));
    } catch (e) { setError(friendlyAuthError(e)); }
    finally { setBusy(false); }
  };

  const google = () => {
    signInWithGoogle(); // full-page redirect in live mode
    const s = JSON.parse(localStorage.getItem('se_session') || 'null');
    if (s?.mock) onLogin(s); // mock mode resolves synchronously
  };

  return createPortal(
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.66)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'overlayIn 0.15s ease', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(400px, 96vw)', background: c.surface, border: `1px solid ${c.borderGold}`, borderRadius: 18, padding: 30, boxShadow: '0 24px 80px rgba(0,0,0,0.55)', animation: 'spotlightIn 0.2s cubic-bezier(0.16,1,0.3,1)', margin: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={26} />
            <h2 style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 700, color: c.text, margin: 0, letterSpacing: '-0.02em' }}>
              {needsConfirm ? 'Confirm your email' : tab === 'signin' ? 'Welcome back' : 'Join Skill Exchange'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
            <Ic.X s={15} c={c.textMuted} />
          </button>
        </div>

        {needsConfirm ? (
          <>
            <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
              We emailed a confirmation code to <span style={{ color: c.text }}>{email}</span>.
            </p>
            <Input label="Confirmation code" value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" autoFocus
              onKeyDown={e => e.key === 'Enter' && submitConfirm()} />
            {error && <ErrLine c={c} text={error} />}
            <GoldButton full disabled={busy} onClick={submitConfirm}>{busy ? 'Confirming…' : 'Confirm & sign in'}</GoldButton>
          </>
        ) : (
          <>
            <button onClick={google}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: c.elevated, border: `1px solid ${c.border}`, borderRadius: 10, padding: '11px', fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: c.text, cursor: 'pointer', marginBottom: 16, transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = c.gold}
              onMouseLeave={e => e.currentTarget.style.borderColor = c.border}>
              <Ic.Google s={16} /> Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted }}>or</span>
              <div style={{ flex: 1, height: 1, background: c.border }} />
            </div>

            <div style={{ display: 'flex', gap: 3, marginBottom: 18, background: c.elevated, border: `1px solid ${c.border}`, borderRadius: 10, padding: 3 }}>
              {[['signin', 'Sign In'], ['signup', 'Sign Up']].map(([id, label]) => {
                const on = tab === id;
                return (
                  <button key={id} onClick={() => { setTab(id); setError(''); }}
                    style={{ flex: 1, background: on ? `linear-gradient(135deg,${c.gold},${c.goldDim})` : 'transparent', border: 'none', borderRadius: 7, padding: '8px', fontFamily: FONT_UI, fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? c.onGold : c.textSub, cursor: 'pointer', transition: 'background 0.18s, color 0.18s' }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {tab === 'signup' && (
              <>
                <Input label="Your name" value={name} onChange={e => { setName(e.target.value); setError(''); }}
                  placeholder="e.g. Mohan Venkatakrishnan" testId="signup-name" maxLength={LIMITS.name} />
                <UsernameField value={uname} onChange={v => { setUname(v); setError(''); }}
                  hint="Permanent and unique — it becomes your profile URL." />
              </>
            )}

            <Input label="Email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="you@example.com" testId="auth-email" />
            <Input label="Password" type="password" value={pw} onChange={e => { setPw(e.target.value); setError(''); }} placeholder={tab === 'signup' ? '8+ chars, upper, lower, number' : '••••••••'} testId="auth-password"
              onKeyDown={e => e.key === 'Enter' && submit()} />

            {error && <ErrLine c={c} text={error} />}
            <GoldButton full disabled={busy} onClick={submit} testId="auth-submit">
              {busy ? (tab === 'signin' ? 'Signing in…' : 'Creating account…') : (tab === 'signin' ? 'Sign In' : 'Create Account')}
            </GoldButton>
            <p style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, textAlign: 'center', margin: '14px 0 0', lineHeight: 1.5 }}>
              {tab === 'signup' ? 'Your username is permanent. Browsing stays free — you only need an account to buy or publish.' : "We'll bring you straight back to where you were."}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ErrLine({ c, text }) {
  return (
    <p data-testid="auth-error" style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontFamily: FONT_UI, fontSize: 12, color: c.coral, background: c.coralSoft, border: `1px solid ${c.coral}35`, borderRadius: 8, padding: '9px 11px', margin: '0 0 14px', lineHeight: 1.5 }}>
      {text}
    </p>
  );
}

function friendlyAuthError(e) {
  const code = e.code || '';
  if (code.includes('NotAuthorized')) return 'Wrong email or password.';
  if (code.includes('UsernameExists')) return 'An account with this email already exists. Sign in instead.';
  if (code.includes('InvalidPassword')) return 'Password needs 8+ characters with an uppercase, a lowercase and a number.';
  if (code.includes('UserNotFound')) return 'No account found with that email. Sign up instead.';
  if (code.includes('CodeMismatch')) return "That code didn't match. Check the email and try again.";
  if (code.includes('ExpiredCode')) return 'That code expired. Request a new one by signing up again.';
  if (code.includes('LimitExceeded') || code.includes('TooManyRequests')) return 'Too many attempts. Wait a minute and try again.';
  if (/username/i.test(e.message || '')) return e.message.replace(/^PreSignUp failed with error /, '').replace(/\.$/, '') + '.';
  return e.message || 'Sign-in failed. Please try again.';
}
