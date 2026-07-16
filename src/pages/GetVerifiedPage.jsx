import { useState } from 'react';
import { useTheme, FONT_HEAD, FONT_UI } from '../tokens/theme';
import { PageWrap, VerifiedStamp } from '../components/Shared.jsx';
import { Card, Input, Textarea, GoldButton } from '../components/ui.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';

/* Five fixed stages, in order. The first two are satisfied by simply having
   published (the page is reachable only as a next step after that), the third
   is where the visitor stands, and the last two are Skill Exchange's side of
   the deal — manual review, then the badge. */
const STEPS = [
  { state: 'done', label: 'Create an account', detail: 'Sign up and publish at least one skill.' },
  { state: 'done', label: 'Publish with proof of concept', detail: 'Your skill must have a live project URL and cover screenshot.' },
  { state: 'active', label: 'Apply for verification', detail: 'Submit your best skill and a note about your work.' },
  { state: 'pending', label: 'Review by Skill Exchange', detail: 'We manually check your proof of concept within 48 hours.' },
  { state: 'pending', label: 'Verified badge granted', detail: 'Your profile and skills show the Verified Creator badge.' },
];

const MEANS = [
  'Your proof of concept has been manually reviewed',
  'Your skill does exactly what it claims',
  'Buyers see the verified badge on your profile',
  "You're eligible for featured placement",
];

/* One stepper row: a status node in a rail column, then the copy. The rail
   segment below a node takes the *node's* colour when that step is done, so
   the green run reads as a single continuous line of progress. */
function Step({ step, index, last, submitted }) {
  const { c } = useTheme();
  // Once the application is in, step 3 flips from "you're here" to "done".
  const state = submitted && step.state === 'active' ? 'done' : step.state;
  const tone = state === 'done' ? c.green : state === 'active' ? c.gold : c.textMuted;
  const ring = state === 'pending' ? c.border : tone;

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', boxSizing: 'border-box',
          background: state === 'done' ? c.greenSoft : state === 'active' ? c.goldSoft : 'transparent',
          border: `2px solid ${ring}`, display: 'grid', placeItems: 'center',
          boxShadow: state === 'active' ? `0 0 0 4px ${c.goldGlow}` : 'none',
        }}>
          {state === 'done'
            ? <Ic.Check s={14} c={c.green} />
            : <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: tone }}>{index + 1}</span>}
        </div>
        {!last && (
          <div style={{ width: 2, flex: 1, minHeight: 30, marginTop: 4, marginBottom: 4, borderRadius: 1, background: state === 'done' ? c.green : c.border, opacity: state === 'done' ? 0.5 : 1 }} />
        )}
      </div>
      <div style={{ paddingBottom: last ? 0 : 18, paddingTop: 4 }}>
        <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: state === 'pending' ? c.textMuted : c.text, marginBottom: 4 }}>
          {step.label}
          {state === 'active' && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: c.gold, background: c.goldSoft, border: `1px solid ${c.gold}35`, borderRadius: 20, padding: '2px 8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>You're here</span>}
        </div>
        <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, lineHeight: 1.55 }}>{step.detail}</div>
      </div>
    </div>
  );
}

export default function GetVerifiedPage({ user, onShowAuth }) {
  const { c } = useTheme();
  const [applied, setApplied] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!user) { onShowAuth(); return; }
    if (!url.trim()) { setError('Link your best published skill first.'); return; }
    setBusy(true); setError('');
    try {
      await api.applyVerification({ skillUrl: url.trim(), note: note.trim() });
      setApplied(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageWrap>
      <div style={{ padding: '30px clamp(16px,4vw,40px) 0', maxWidth: 660, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
          <VerifiedStamp size={46} />
          <div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 'clamp(22px,3vw,28px)', fontWeight: 700, color: c.text, margin: '0 0 5px', letterSpacing: '-0.02em' }}>Get Verified</h1>
            <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, margin: 0 }}>Earn the Verified Creator badge and build buyer trust.</p>
          </div>
        </div>

        {/* ── What verification means ── */}
        <div className="fade-up-d1" style={{ background: c.goldSoft, border: `1px solid ${c.borderGold}`, borderRadius: 14, padding: 20, marginBottom: 30 }}>
          <h2 style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: c.gold, margin: '0 0 12px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>What verification means</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {MEANS.map(t => (
              <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 2, flexShrink: 0, display: 'flex' }}><Ic.Check s={14} c={c.green} /></span>
                <span style={{ fontFamily: FONT_UI, fontSize: 13, color: c.textSub, lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Progress stepper ── */}
        <h2 className="fade-up-d1" style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 700, color: c.text, margin: '0 0 18px', letterSpacing: '-0.01em' }}>Verification progress</h2>
        <div className="fade-up-d2" style={{ marginBottom: 30 }}>
          {STEPS.map((s, i) => (
            <Step key={s.label} step={s} index={i} last={i === STEPS.length - 1} submitted={applied} />
          ))}
        </div>

        {/* ── Application ── */}
        {!applied ? (
          <Card className="fade-up-d3" style={{ padding: 22 }}>
            <h2 style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: c.text, margin: '0 0 18px', letterSpacing: '-0.01em' }}>Apply for verification</h2>
            <Input label="Your best skill URL" value={url} testId="verify-url"
              onChange={e => { setUrl(e.target.value); setError(''); }}
              placeholder="Link to your published skill" />
            <Textarea label="Note about your work" hint="optional" value={note} rows={3}
              onChange={e => setNote(e.target.value)}
              placeholder="Tell us about the product you built with this skill…" />
            {error && <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.coral, margin: '0 0 14px' }}>{error}</p>}
            <GoldButton onClick={submit} disabled={busy} full testId="verify-submit">
              {busy ? 'Submitting…' : user ? 'Submit Application' : 'Sign in to apply'}
            </GoldButton>
            <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, margin: '12px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
              Every application is reviewed by hand — no automated approvals.
            </p>
          </Card>
        ) : (
          <div className="fade-up" style={{ background: c.goldSoft, border: `1px solid ${c.gold}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <span style={{ width: 46, height: 46, borderRadius: '50%', background: c.greenSoft, border: `2px solid ${c.green}`, display: 'grid', placeItems: 'center' }}>
                <Ic.Check s={22} c={c.green} />
              </span>
            </div>
            <h2 style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: c.text, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Application submitted</h2>
            <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, margin: 0, lineHeight: 1.6 }}>
              We'll review your proof of concept and get back to you within 48 hours.
            </p>
          </div>
        )}
      </div>
    </PageWrap>
  );
}
