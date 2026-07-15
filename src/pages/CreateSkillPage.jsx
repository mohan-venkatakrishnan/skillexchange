import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI, FONT_MONO } from '../tokens/theme';
import { PageWrap } from '../components/Shared.jsx';
import { GoldButton, GhostButton, Card, Label, Input } from '../components/ui.jsx';
import Select from '../components/Select.jsx';
import { Ic } from '../components/Icons.jsx';
import { CATEGORIES, PH, PT } from '../data/constants.js';

const CATEGORY_OPTIONS = CATEGORIES.map(x => ({ value: x, label: x }));

const BENEFITS = [
  { icon: 'Bolt', title: 'Saves time', desc: 'No more re-explaining your stack' },
  { icon: 'Gem', title: 'Consistent output', desc: 'AI follows your exact patterns' },
  { icon: 'Crown', title: 'Earn from it', desc: 'Get paid for every download' },
];

export default function CreateSkillPage({ user, onShowAuth }) {
  const { c } = useTheme();
  const nav = useNavigate();
  const [platform, setPlatform] = useState('Claude');
  const [category, setCategory] = useState('Coding');
  const [desc, setDesc] = useState('');
  const [ts, setTs] = useState('');
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);

  const prompt = PT[platform](category, desc, ts);
  const handleCopy = () => {
    navigator.clipboard.writeText(prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <PageWrap>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '34px clamp(16px,4vw,40px) 64px' }}>
        {/* ── Header ── */}
        <div className="fade-up" style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.gold, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Skill Builder</div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(24px,3.2vw,31px)', color: c.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Create a Skill</h1>
          <p style={{ fontFamily: FONT_UI, fontSize: 14, color: c.textMuted, margin: '10px 0 0', lineHeight: 1.7, maxWidth: 620 }}>
            Not sure how to write a SKILL.md? Choose your AI platform and we'll generate a prompt you can paste to create one instantly.
          </p>
        </div>

        {/* ── What is a skill file ── */}
        <Card className="fade-up-d1" style={{ padding: 26, marginBottom: 22 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 19, color: c.text, margin: '0 0 12px', letterSpacing: '-0.01em' }}>What is a skill file?</h2>
          <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, lineHeight: 1.75, margin: '0 0 20px' }}>
            A skill file (SKILL.md) is a structured instruction document you paste at the start of an AI session. It tells the AI your tech stack, coding conventions, patterns to follow, and mistakes to avoid — so every session starts with full context.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
            {BENEFITS.map(b => {
              const Icon = Ic[b.icon];
              return (
                <div key={b.title} style={{ background: c.elevated, border: `1px solid ${c.border}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ marginBottom: 9 }}><Icon s={17} c={c.gold} /></div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 4 }}>{b.title}</div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 12, color: c.textMuted, lineHeight: 1.55 }}>{b.desc}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Generator ── */}
        <Card className="fade-up-d2" style={{ padding: 26, marginBottom: 22 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 19, color: c.text, margin: '0 0 24px', letterSpacing: '-0.01em' }}>✦ Skill Prompt Generator</h2>

          <div style={{ marginBottom: 24 }}>
            <Label>Step 1 — Choose your AI platform</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.keys(PH).map(p => {
                const on = platform === p;
                return (
                  <button key={p} type="button" onClick={() => setPlatform(p)} aria-pressed={on}
                    style={{ background: on ? c.goldSoft : 'transparent', border: `1.5px solid ${on ? c.gold : c.border}`, color: on ? c.gold : c.textSub, borderRadius: 9, padding: '8px 17px', fontFamily: FONT_UI, fontSize: 13, fontWeight: on ? 600 : 400, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s, background 0.15s' }}
                    onMouseEnter={e => { if (!on) { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.color = c.gold; } }}
                    onMouseLeave={e => { if (!on) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textSub; } }}>
                    {p}
                  </button>
                );
              })}
            </div>
            {platform && (
              <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, margin: '11px 0 0', lineHeight: 1.55 }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}><Ic.Bolt s={12} c={c.gold} /></span>
                {PH[platform].note}
              </p>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <Label>Step 2 — Category</Label>
            <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} ariaLabel="Category" minWidth={260} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <Label hint="one line">Step 3 — What does your skill do?</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={`e.g. "builds Chrome extensions with MV3 and on-device AI"`} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <Label>Step 4 — Estimated time saved (hours)</Label>
            <Input type="number" min="0.5" step="0.5" value={ts} onChange={e => setTs(e.target.value)} placeholder="e.g. 6" style={{ maxWidth: 150 }} />
          </div>

          <GoldButton size="lg" onClick={() => setGenerated(true)} testId="generate-prompt">Generate Prompt ✦</GoldButton>
        </Card>

        {/* ── Output ── */}
        {generated && (
          <>
            <div className="fade-up" style={{ background: c.surface, border: `1px solid ${c.borderGold}`, borderRadius: 14, overflow: 'hidden', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px', borderBottom: `1px solid ${c.borderGold}`, background: c.goldSoft, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: c.gold, letterSpacing: '-0.01em' }}>Your {platform} prompt</span>
                  <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted }}>Paste into {PH[platform].name}</span>
                </div>
                <button type="button" onClick={handleCopy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: copied ? c.greenSoft : 'transparent', border: `1px solid ${copied ? c.green : c.gold}`, color: copied ? c.green : c.gold, borderRadius: 8, padding: '6px 14px', fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s, border-color 0.2s, color 0.2s', minWidth: 88, justifyContent: 'center' }}>
                  {copied ? <><Ic.Check s={12} c={c.green} />Copied</> : <><Ic.Download s={12} c={c.gold} />Copy</>}
                </button>
              </div>
              <pre style={{ margin: 0, padding: '20px 22px', fontFamily: FONT_MONO, fontSize: 12.5, color: c.textSub, lineHeight: 1.8, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: c.elevated, tabSize: 2 }}>
                {prompt}
              </pre>
            </div>

            <Card className="fade-up-d1" style={{ padding: 26 }}>
              <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: c.text, margin: '0 0 18px', letterSpacing: '-0.01em' }}>What to do next</h3>
              {[
                { n: '01', t: 'Copy the prompt', d: `Paste it into a new ${platform} session.` },
                { n: '02', t: 'Run the prompt', d: `${PH[platform].name} will generate your SKILL.md. Tweak any specifics.` },
                { n: '03', t: 'Save your SKILL.md', d: 'Save the output and test it in a real AI session.' },
                { n: '04', t: 'Publish and earn', d: 'Publish on Skill Exchange with a proof of concept project URL.' },
              ].map((s, i) => (
                <div key={s.n} style={{ display: 'flex', gap: 14, marginBottom: i < 3 ? 16 : 0, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: c.gold, marginTop: 2, flexShrink: 0 }}>{s.n}</span>
                  <div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: c.text, marginBottom: 3 }}>{s.t}</div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, lineHeight: 1.55 }}>{s.d}</div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 26, paddingTop: 22, borderTop: `1px solid ${c.border}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <GoldButton onClick={() => { user ? nav('/publish') : onShowAuth(); }}>Publish Your Skill →</GoldButton>
                <GhostButton onClick={() => nav('/marketplace')}>Browse skills</GhostButton>
              </div>
            </Card>
          </>
        )}
      </div>
    </PageWrap>
  );
}
