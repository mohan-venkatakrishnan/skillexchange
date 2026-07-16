import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_HEAD, FONT_UI, FONT_MONO } from '../tokens/theme';
import { PageWrap } from '../components/Shared.jsx';
import { GoldButton, GhostButton, Card, Label, Input } from '../components/ui.jsx';
import Select from '../components/Select.jsx';
import { Ic } from '../components/Icons.jsx';
import { CATEGORIES, PH, PT } from '../data/constants.js';

const CATEGORY_OPTIONS = CATEGORIES.map(x => ({ value: x, label: x }));

const BENEFITS = [
  { icon: 'Bolt', title: 'Distilled, not invented', desc: 'It comes out of code that already works' },
  { icon: 'Gem', title: 'Proven by the project', desc: 'Your shipped URL is the proof of concept' },
  { icon: 'Crown', title: 'Earn from it', desc: 'Work you already did, sold again and again' },
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

  // The steps diverge on one fact: whether the tool can open your files itself.
  // Everything downstream of that — cd into the folder vs. paste the code in —
  // is the step people skip, so it leads and it gets the callout.
  const local = PH[platform].readsProject;
  const STEPS = local
    ? [
        { n: '01', t: 'Open your project folder first', d: `cd into the project you want to sell the skill for, then start ${PH[platform].name} there. This is the step people miss — run it anywhere else and it invents a generic guide instead of reading your code.`, key: true },
        { n: '02', t: 'Paste the prompt', d: `${PH[platform].name} will read your stack, your conventions and your fixes, and ask you about anything the code doesn't explain. Answer honestly — that's where the value is.` },
        { n: '03', t: 'Save SKILL.md and test it', d: 'Save the output, then start a fresh session with only that file and rebuild a small slice of the project. If the AI still needs hand-holding, the skill is missing something — feed the gap back in.' },
        { n: '04', t: 'Publish with the project as proof', d: 'Publish on Skill Exchange using the URL of the project it came from. That shipped project is your proof of concept.' },
      ]
    : [
        { n: '01', t: 'Give it your code first', d: `${PH[platform].name} can't see your project folder. Paste in your dependency manifest and 2-3 real source files — or upload the repo — before you send the prompt. Skip this and you'll get a generic guide, not your skill.`, key: true },
        { n: '02', t: 'Paste the prompt', d: 'It will ask for anything it still needs. Answer from what you actually did, including the mistakes you had to fix.' },
        { n: '03', t: 'Save SKILL.md and test it', d: 'Save the output, then start a fresh session with only that file and rebuild a small slice of the project. If the AI still needs hand-holding, the skill is missing something — feed the gap back in.' },
        { n: '04', t: 'Publish with the project as proof', d: 'Publish on Skill Exchange using the URL of the project it came from. That shipped project is your proof of concept.' },
      ];

  return (
    <PageWrap>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '34px clamp(16px,4vw,40px) 64px' }}>
        {/* ── Header ── */}
        <div className="fade-up" style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.gold, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Skill Builder</div>
          <h1 style={{ fontFamily: FONT_HEAD, fontSize: 'clamp(24px,3.2vw,31px)', color: c.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>You already solved it once</h1>
          <p style={{ fontFamily: FONT_UI, fontSize: 14, color: c.textMuted, margin: '10px 0 0', lineHeight: 1.7, maxWidth: 620 }}>
            Have a project you've already shipped, but no idea how to turn it into something sellable? Answer three questions below and we'll generate a prompt. Run it in your project folder and your AI reads the code you actually wrote, then writes the SKILL.md other builders can buy.
          </p>
        </div>

        {/* ── What is a skill file ── */}
        <Card className="fade-up-d1" style={{ padding: 26, marginBottom: 22 }}>
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 19, color: c.text, margin: '0 0 12px', letterSpacing: '-0.01em' }}>What is a skill file?</h2>
          <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, lineHeight: 1.75, margin: '0 0 12px' }}>
            A skill file (SKILL.md) is a structured instruction document you paste at the start of an AI session. It carries the stack, the conventions, the patterns to follow and the mistakes to avoid — so the next session starts where your last project ended.
          </p>
          <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, lineHeight: 1.75, margin: '0 0 20px' }}>
            The good ones aren't written from scratch — they're <strong style={{ color: c.text, fontWeight: 600 }}>distilled from work you've already done</strong>. The stack you settled on, the workaround you found at 2am, the approach you tried and threw away: that's the part nobody can invent, and it's the part buyers pay for. Which is why the generator below reads your project rather than asking you to imagine a skill.
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
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 19, color: c.text, margin: '0 0 6px', letterSpacing: '-0.01em' }}>✦ Skill Prompt Generator</h2>
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: c.textMuted, lineHeight: 1.7, margin: '0 0 24px' }}>
            Tell us about the project you've already built. You'll get a prompt that makes your AI read that project and write the skill behind it.
          </p>

          <div style={{ marginBottom: 24 }}>
            <Label>Step 1 — Which AI will read your project?</Label>
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
            <Label hint="one line">Step 3 — What is the project you built?</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={`e.g. "a Chrome extension that summarises pages with on-device AI"`} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <Label hint="your estimate">Step 4 — Hours this would save someone starting fresh</Label>
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
                  <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted }}>{local ? `Run in ${PH[platform].name}, inside your project folder` : `Paste into ${PH[platform].name}, after your code`}</span>
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
              <h3 style={{ fontFamily: FONT_HEAD, fontSize: 17, color: c.text, margin: '0 0 18px', letterSpacing: '-0.01em' }}>What to do next</h3>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', gap: 14, marginBottom: i < STEPS.length - 1 ? 16 : 0, alignItems: 'flex-start', ...(s.key ? { background: c.goldSoft, border: `1px solid ${c.borderGold}`, borderRadius: 10, padding: '14px 16px', margin: '0 -2px 16px' } : null) }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: c.gold, marginTop: 2, flexShrink: 0 }}>{s.n}</span>
                  <div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: s.key ? c.gold : c.text, marginBottom: 3 }}>{s.t}</div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: s.key ? c.textSub : c.textMuted, lineHeight: 1.55 }}>{s.d}</div>
                    {s.key && local && (
                      <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: c.gold, marginTop: 8 }}>cd ~/path/to/your-project</div>
                    )}
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
