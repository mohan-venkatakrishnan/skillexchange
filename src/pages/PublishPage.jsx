import { useState, useRef } from 'react';
import { useTheme, FONT_DISPLAY, FONT_UI, FONT_MONO } from '../tokens/theme';
import { PageWrap, VerifiedStamp } from '../components/Shared.jsx';
import { GoldButton, GhostButton, Card, Label, Input, Textarea } from '../components/ui.jsx';
import Select from '../components/Select.jsx';
import { Ic } from '../components/Icons.jsx';
import { CATEGORIES, PLATFORMS } from '../data/constants.js';
import * as api from '../lib/api.js';

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2MB, matches the UI copy
const STEPS = ['Details', 'Proof of Concept', 'Pricing'];
const EMPTY_FORM = {
  title: '', category: '', description: '', usage: '', platforms: [],
  price: 'free', amount: '', pocUrl: '', timeSaved: '', file: null, screenshot: null,
};

const CATEGORY_OPTIONS = [{ value: '', label: 'Select category' }, ...CATEGORIES.map(x => ({ value: x, label: x }))];

export default function PublishPage() {
  const { c } = useTheme();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };
  const toggleP = p => set('platforms', form.platforms.includes(p) ? form.platforms.filter(x => x !== p) : [...form.platforms, p]);

  /* ── Validation (messages preserved verbatim) ── */
  const validateStep1 = () => {
    if (!form.title.trim()) return 'Skill title is required.';
    if (!form.category) return 'Pick a category.';
    if (!form.description.trim()) return 'Description is required.';
    if (!form.usage.trim()) return '“How to use this skill” is required.';
    if (!form.timeSaved || Number(form.timeSaved) <= 0) return 'Estimated time saved is required.';
    if (form.platforms.length === 0) return 'Select at least one platform.';
    if (!form.file) return 'Upload your SKILL.md file.';
    return null;
  };
  const validateStep2 = () => {
    if (!/^https?:\/\/.+\..+/.test(form.pocUrl.trim())) return 'A valid project URL is required — proof of concept is enforced.';
    if (!form.screenshot) return 'A cover screenshot is required.';
    return null;
  };
  const validateStep3 = () => {
    if (form.price === 'paid' && (!form.amount || Number(form.amount) < 1)) return 'Paid skills need a price of at least $1.';
    return null;
  };

  const goStep2 = () => { const e = validateStep1(); if (e) { setError(e); return; } setError(''); setStep(2); };
  const goStep3 = () => { const e = validateStep2(); if (e) { setError(e); return; } setError(''); setStep(3); };

  const submit = async () => {
    const e = validateStep3(); if (e) { setError(e); return; }
    setBusy(true); setError('');
    try {
      await api.publishSkill(form);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Publishing failed. Your form is intact — try again.');
    } finally {
      setBusy(false);
    }
  };

  const onScreenshot = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setError('Screenshot must be a PNG or JPG.'); return; }
    if (file.size > MAX_SCREENSHOT_BYTES) { setError('Screenshot is over 2MB — export a smaller one.'); return; }
    set('screenshot', file);
  };

  /* ── Done state ── */
  if (done) return (
    <PageWrap>
      <div className="fade-up" style={{ maxWidth: 560, margin: '0 auto', padding: '96px clamp(16px,4vw,40px)', textAlign: 'center' }}>
        <div style={{ marginBottom: 26, display: 'flex', justifyContent: 'center' }}><VerifiedStamp size={56} /></div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, color: c.text, margin: '0 0 14px', letterSpacing: '-0.02em' }}>Skill Submitted!</h2>
        <p style={{ fontFamily: FONT_UI, fontSize: 14, color: c.textMuted, lineHeight: 1.7, margin: '0 0 30px' }}>
          Your skill is under review. We'll verify the proof of concept and notify you within 48 hours.
        </p>
        <GhostButton onClick={() => { setDone(false); setStep(1); setForm(EMPTY_FORM); }}>Publish Another</GhostButton>
      </div>
    </PageWrap>
  );

  return (
    <PageWrap>
      <div style={{ maxWidth: 660, margin: '0 auto', padding: '34px clamp(16px,4vw,40px) 64px' }}>
        {/* ── Header ── */}
        <div className="fade-up" style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.gold, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Step {step} of 3</div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(24px,3.2vw,31px)', color: c.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Publish a Skill</h1>
          <p style={{ fontFamily: FONT_UI, fontSize: 14, color: c.textMuted, margin: '10px 0 0', lineHeight: 1.65 }}>Share your workflow. Earn from every download.</p>
        </div>

        <Stepper step={step} />

        {error && (
          <div data-testid="publish-error" className="fade-up"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontFamily: FONT_UI, fontSize: 12.5, lineHeight: 1.55, color: c.coral, background: c.coralSoft, border: `1px solid ${c.coral}40`, borderRadius: 10, padding: '11px 14px', margin: '0 0 20px' }}>
            <span style={{ marginTop: 1, flexShrink: 0 }}><Ic.X s={13} c={c.coral} /></span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Step 1 — Details ── */}
        {step === 1 && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <Card style={{ padding: 26 }}>
              <SectionTitle title="Skill details" sub="What it does, and who it's for." />

              <Input label="Skill Title *" value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="e.g. PDF Generation Skill" testId="pub-title" />

              <div style={{ marginBottom: 16 }}>
                <Label>Category *</Label>
                <div data-testid="pub-category">
                  <Select full value={form.category} onChange={v => set('category', v)} options={CATEGORY_OPTIONS} ariaLabel="Category" />
                </div>
              </div>

              <Textarea label="Description *" rows={4} value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="What does this skill do?" testId="pub-description" />

              <Textarea label="How to use this skill *" hint="required" rows={3} value={form.usage} onChange={e => set('usage', e.target.value)}
                placeholder="Step-by-step instructions..." testId="pub-usage" />

              <div style={{ marginBottom: 16 }}>
                <Input label="Estimated time saved (hours) *" type="number" min="0.5" step="0.5" value={form.timeSaved}
                  onChange={e => set('timeSaved', e.target.value)} placeholder="e.g. 6" testId="pub-timesaved"
                  style={{ maxWidth: 170 }} />
                <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, margin: '-8px 0 0', lineHeight: 1.5 }}>
                  Shown as “~{form.timeSaved || '?'}h saved · seller estimate” on your listing.
                </p>
              </div>

              <div>
                <Label>Works with *</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PLATFORMS.map(p => {
                    const on = form.platforms.includes(p);
                    return (
                      <button key={p} type="button" onClick={() => toggleP(p)} aria-pressed={on}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: on ? c.goldSoft : 'transparent', border: `1px solid ${on ? c.gold : c.border}`, color: on ? c.gold : c.textSub, borderRadius: 8, padding: '7px 14px', fontFamily: FONT_UI, fontSize: 12.5, fontWeight: on ? 600 : 400, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s, background 0.15s' }}
                        onMouseEnter={e => { if (!on) { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.color = c.gold; } }}
                        onMouseLeave={e => { if (!on) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textSub; } }}>
                        {on && <Ic.Check s={11} c={c.gold} />}{p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card style={{ padding: 26 }}>
              <SectionTitle title="The skill file" sub="The SKILL.md document buyers download." />
              <Label>Upload SKILL.md *</Label>
              <FileDrop file={form.file} accept=".md,text/markdown" testId="pub-file" onPick={f => set('file', f)}
                idle="Click to upload SKILL.md" hint="Markdown (.md)" icon={<Ic.Download s={18} c={c.gold} />} />
            </Card>

            <GoldButton full size="lg" onClick={goStep2} testId="pub-continue-1">Continue →</GoldButton>
          </div>
        )}

        {/* ── Step 2 — Proof of Concept ── */}
        {step === 2 && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: c.goldSoft, border: `1px solid ${c.borderGold}`, borderRadius: 12, padding: '15px 17px' }}>
              <span style={{ marginTop: 1, flexShrink: 0 }}><Ic.Shield s={16} c={c.gold} /></span>
              <div>
                <h3 style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: c.gold, margin: '0 0 5px', letterSpacing: '-0.01em' }}>Proof of concept is required</h3>
                <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: 0, lineHeight: 1.6 }}>
                  Every skill must ship with evidence it works. Buyers see the real project your skill powered.
                </p>
              </div>
            </div>

            <Card style={{ padding: 26 }}>
              <SectionTitle title="Show it working" sub="A live project URL and a screenshot of it in use." />

              <Input label="Project URL *" hint="enforced" mono value={form.pocUrl} onChange={e => set('pocUrl', e.target.value)}
                placeholder="https://yourproject.com" testId="pub-pocurl" style={{ fontSize: 12.5 }} />

              <Label>Cover Screenshot *</Label>
              <FileDrop file={form.screenshot} accept="image/png,image/jpeg" testId="pub-screenshot" onPick={onScreenshot} tall
                idle="Click to upload a screenshot" hint="PNG or JPG, max 2MB" icon={<Ic.Search s={18} c={c.gold} />} />
            </Card>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}><GhostButton full size="lg" onClick={() => { setError(''); setStep(1); }}>← Back</GhostButton></div>
              <div style={{ flex: 2 }}><GoldButton full size="lg" onClick={goStep3} testId="pub-continue-2">Continue →</GoldButton></div>
            </div>
          </div>
        )}

        {/* ── Step 3 — Pricing ── */}
        {step === 3 && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <Card style={{ padding: 26 }}>
              <SectionTitle title="Pricing" sub="One-time payment. You keep 90% of every sale." />

              <div style={{ display: 'flex', gap: 12, marginBottom: form.price === 'paid' ? 22 : 0 }}>
                {[
                  { key: 'free', label: 'Free', desc: 'Build your reputation' },
                  { key: 'paid', label: 'Paid', desc: 'Earn per download' },
                ].map(p => {
                  const on = form.price === p.key;
                  return (
                    <button key={p.key} type="button" onClick={() => set('price', p.key)} aria-pressed={on}
                      style={{ flex: 1, textAlign: 'left', background: on ? c.goldSoft : 'transparent', border: `1.5px solid ${on ? c.gold : c.border}`, borderRadius: 12, padding: '15px 17px', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = c.gold; }}
                      onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = c.border; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                        <span style={{ width: 13, height: 13, borderRadius: '50%', border: `1.5px solid ${on ? c.gold : c.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.gold }} />}
                        </span>
                        <span style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: on ? c.gold : c.text }}>{p.label}</span>
                      </div>
                      <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, paddingLeft: 20 }}>{p.desc}</div>
                    </button>
                  );
                })}
              </div>

              {form.price === 'paid' && (
                <div className="fade-up">
                  <Input label="Price (USD) *" type="number" min="1" value={form.amount}
                    onChange={e => set('amount', e.target.value)} placeholder="e.g. 5" testId="pub-amount" style={{ maxWidth: 200 }} />
                  {form.amount && (
                    <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: '-8px 0 0' }}>
                      You earn <span style={{ color: c.green, fontFamily: FONT_MONO, fontWeight: 600 }}>${(form.amount * 0.9).toFixed(2)}</span> per sale
                    </p>
                  )}
                </div>
              )}
            </Card>

            <Card style={{ padding: 24, background: c.elevated }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>What happens next</div>
              {[
                'Skill submitted for review',
                'Skill Exchange verifies proof of concept',
                'Skill goes live within 48 hours',
                'You get notified and start earning',
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i < 3 ? 11 : 0, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 600, color: c.gold, marginTop: 1, flexShrink: 0 }}>0{i + 1}</span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textSub, lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </Card>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}><GhostButton full size="lg" onClick={() => { setError(''); setStep(2); }}>← Back</GhostButton></div>
              <div style={{ flex: 2 }}><GoldButton full size="lg" onClick={submit} disabled={busy} testId="pub-submit">{busy ? 'Uploading…' : 'Submit Skill ✦'}</GoldButton></div>
            </div>
          </div>
        )}
      </div>
    </PageWrap>
  );
}

/* ── Refined stepper: numbered nodes joined by a progress rail ── */
function Stepper({ step }) {
  const { c } = useTheme();
  return (
    <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 26 }}>
      {STEPS.map((s, i) => {
        const n = i + 1;
        const state = step > n ? 'done' : step === n ? 'current' : 'todo';
        const col = state === 'done' ? c.green : state === 'current' ? c.gold : c.border;
        return (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{ position: 'absolute', top: 13, right: '50%', width: '100%', height: 1.5, background: step > i ? c.green : c.border, transition: 'background 0.25s' }} />
            )}
            <div style={{ position: 'relative', zIndex: 1, width: 27, height: 27, borderRadius: '50%', display: 'grid', placeItems: 'center', background: state === 'todo' ? c.surface : state === 'done' ? c.greenSoft : c.goldSoft, border: `1.5px solid ${col}`, transition: 'border-color 0.25s, background 0.25s' }}>
              {state === 'done'
                ? <Ic.Check s={12} c={c.green} />
                : <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: state === 'current' ? c.gold : c.textMuted }}>{n}</span>}
            </div>
            <span style={{ fontFamily: FONT_UI, fontSize: 11.5, fontWeight: state === 'current' ? 600 : 400, color: state === 'current' ? c.gold : state === 'done' ? c.textSub : c.textMuted, marginTop: 9, textAlign: 'center', letterSpacing: '-0.01em' }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ title, sub }) {
  const { c } = useTheme();
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: c.text, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
      {sub && <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: '5px 0 0', lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}

/* ── Dashed gold dropzone — filename + green check once chosen ── */
function FileDrop({ file, accept, onPick, testId, idle, hint, icon, tall = false }) {
  const { c } = useTheme();
  const ref = useRef(null);
  const chosen = !!file;
  return (
    <div role="button" tabIndex={0} onClick={() => ref.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click(); } }}
      style={{ border: `1.5px dashed ${chosen ? c.green : c.borderGold}`, background: chosen ? c.greenSoft : 'transparent', borderRadius: 12, padding: tall ? '30px 20px' : '24px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', outline: 'none' }}
      onMouseEnter={e => { if (!chosen) { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.background = c.goldSoft; } }}
      onMouseLeave={e => { if (!chosen) { e.currentTarget.style.borderColor = c.borderGold; e.currentTarget.style.background = 'transparent'; } }}>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} data-testid={testId}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 9 }}>
        {chosen ? <Ic.Check s={18} c={c.green} /> : icon}
      </div>
      <div style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: chosen ? 600 : 500, color: chosen ? c.green : c.text, wordBreak: 'break-all' }}>
        {chosen ? file.name : idle}
      </div>
      <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, marginTop: 4 }}>
        {chosen ? 'Click to replace' : hint}
      </div>
    </div>
  );
}
