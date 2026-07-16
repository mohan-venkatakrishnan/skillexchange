import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI } from '../tokens/theme';
import Logo from '../components/Logo.jsx';
import SkillCard from '../components/SkillCard.jsx';
import Loader from '../components/Loader.jsx';
import { Ic } from '../components/Icons.jsx';
import LeaderboardPreview from '../components/LeaderboardPreview.jsx';
import { PageWrap } from '../components/Shared.jsx';
import { GoldButton, GhostButton, Card, ErrorBox, Reveal, Section, SectionHeading } from '../components/ui.jsx';
import { CATEGORIES } from '../data/constants.js';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

/* How the exchange actually works — the front page has to answer this before
   anyone will trust it with a payment. */
const STEPS_BUY = [
  { n: '01', t: 'Browse by what you build', d: 'Filter by category, AI assistant, and price. Every listing says which stack it targets and roughly how long it saves.' },
  { n: '02', t: 'Check the proof', d: 'No skill lists without a live project URL and a screenshot of it running. You see the real thing the skill built before you pay.' },
  { n: '03', t: 'Pay once, own it', d: 'One-time payment. No subscription, no seats, no expiry. Free skills download instantly.' },
  { n: '04', t: 'Paste and ship', d: 'Drop the SKILL.md into Claude Code, ChatGPT, Cursor, Gemini or Copilot at the start of a session. Your assistant now knows the whole workflow.' },
];
const STEPS_SELL = [
  { n: '01', t: 'Start from a project you already shipped', d: "Already have a SKILL.md? Publish it. If not, Create a Skill gives you a prompt to run inside that project's folder — your assistant reads the code and distils the workflow into one." },
  { n: '02', t: 'Publish with proof', d: 'Project URL and screenshot are mandatory, not optional. That rule is what makes every other listing here worth trusting.' },
  { n: '03', t: 'We review it by hand', d: 'A human checks your proof of concept against your claims. Approved skills go live, usually within 48 hours.' },
  { n: '04', t: 'Keep 90%', d: 'You set the price. The exchange takes 10% on paid sales — nothing else, ever. Your commission rate is locked at the sale.' },
];

const PRINCIPLES = [
  { icon: (c) => <Ic.Shield s={18} c={c.gold} />, t: 'Proof or it doesn\'t list', d: 'Every skill ships with a live project and a screenshot. Enforced at publish time, checked by a human.' },
  { icon: (c) => <Ic.Bolt s={18} c={c.gold} />, t: 'One-time payments', d: 'Buy a skill, own it forever. No subscriptions and no tiers anywhere on the exchange.' },
  { icon: (c) => <Ic.Crown s={18} c={c.gold} />, t: 'Sellers keep 90%', d: 'A flat 10% commission on paid sales, stored per transaction so your rate never changes retroactively.' },
  { icon: (c) => <Ic.Gem s={18} c={c.gold} />, t: 'Every assistant, not just one', d: 'Claude, ChatGPT, Gemini, Cursor and Copilot. Skills declare what they target; you filter on it.' },
];

export default function HomePage({ user, onShowAuth }) {
  const { c } = useTheme();
  const nav = useNavigate();
  const stats = useFetch(() => api.getStats(), [], { key: 'stats' });
  const skills = useFetch(() => api.listSkills(), [], { key: 'skills' });
  const lb = useFetch(() => api.getLeaderboard(), [], { key: 'leaderboard' });
  // Always render a COMPLETE row of 6: a 3+2 grid reads as a mistake. If
  // fewer than six are flagged featured, top up with the most recent so the
  // shelf is full without inventing anything.
  const featured = (() => {
    const all = skills.data || [];
    const picked = all.filter(s => s.featured);
    if (picked.length >= 6) return picked.slice(0, 6);
    const ids = new Set(picked.map(s => s.id));
    const rest = [...all].filter(s => !ids.has(s.id))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return [...picked, ...rest].slice(0, 6);
  })();
  const catCounts = (skills.data || []).reduce((m, s) => { m[s.category] = (m[s.category] || 0) + 1; return m; }, {});

  return (
    <PageWrap>
      {/* ── Hero — centred, 70vh, never the full viewport ── */}
      <section style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '86px 24px 56px', position: 'relative' }}>
        <div style={{ maxWidth: 760, textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div className="float" style={{ marginBottom: 26, display: 'inline-block' }}><Logo size={64} /></div>
          <h1 className="fade-up" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 'clamp(36px, 6vw, 60px)', lineHeight: 1.12, letterSpacing: '-0.025em', color: c.text, margin: '0 0 20px' }}>
            Where AI builders<br /><span style={{ color: c.gold }}>share their edge</span>
          </h1>
          <p className="fade-up-d1" style={{ fontFamily: FONT_UI, fontSize: 17, lineHeight: 1.7, color: c.textSub, maxWidth: 540, margin: '0 auto 34px' }}>
            The GitHub for AI skills — buy and sell the reusable workflows that power real products.
          </p>
          <div className="fade-up-d2" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <GoldButton size="lg" onClick={() => nav('/marketplace')}>Browse skills</GoldButton>
            {user
              ? <GhostButton size="lg" onClick={() => nav('/publish')}>Publish a skill</GhostButton>
              : <GhostButton size="lg" onClick={onShowAuth}>Sign in to publish</GhostButton>}
          </div>
          <p className="fade-up-d3" style={{ fontFamily: FONT_UI, fontSize: 12, color: c.textMuted, marginTop: 18 }}>
            Browsing is free · {user ? 'Publish or buy anytime' : 'Sign in only to buy or publish'} · Every skill ships with proof it works
          </p>
        </div>
      </section>

      {/* ── Stats ── */}
      <div style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, background: c.surface }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'center', gap: 'clamp(24px,5vw,72px)', padding: '22px clamp(16px,4vw,40px)', flexWrap: 'wrap' }}>
          {[[stats.data?.skills, 'Skills published'], [stats.data?.categories, 'Categories'], [stats.data?.builders, 'Builders'], [stats.data?.avgTimeSaved, 'Saved per skill'], [stats.data?.avgRating, 'Average rating']]
            .filter(([v]) => v && v !== '0' && v !== '—')
            .map(([v, l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 23, fontWeight: 700, color: c.gold, letterSpacing: '-0.02em' }}>{v}</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, marginTop: 3 }}>{l}</div>
              </div>
            ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <Section id="how">
        <SectionHeading eyebrow="How the exchange works"
          title="Skills with receipts"
          sub="A skill file teaches your AI assistant one workflow end to end. Here every one of them arrives with evidence it actually shipped something." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.t} delay={Math.min(3, i + 1)}>
              <Card style={{ height: '100%' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: c.goldSoft, border: `1px solid ${c.borderGold}`, display: 'grid', placeItems: 'center', marginBottom: 13 }}>{p.icon(c)}</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 6 }}>{p.t}</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, lineHeight: 1.6 }}>{p.d}</div>
              </Card>
            </Reveal>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 22, marginTop: 30 }}>
          <StepColumn title="If you're buying" steps={STEPS_BUY} accent={c.gold} />
          <StepColumn title="If you're selling" steps={STEPS_SELL} accent={c.green} />
        </div>

        <Reveal style={{ textAlign: 'center', marginTop: 34 }}>
          <GhostButton onClick={() => nav('/create')}>Not sure how to write one? Generate a SKILL.md →</GhostButton>
        </Reveal>
      </Section>

      {/* ── Featured — centred inside the house measure ── */}
      <Section id="featured" style={{ paddingTop: 12 }}>
        <SectionHeading eyebrow="✦ Featured" title="Hand-picked skills"
          sub="Verified proof of concept, clear instructions, real time saved." />
        {skills.loading ? <Loader label="Loading featured skills" />
          : skills.error ? <ErrorBox message={skills.error} onRetry={skills.retry} />
          : featured.length === 0 ? null
          : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
                {featured.map((s, i) => (
                  <Reveal key={s.id} delay={Math.min(3, (i % 3) + 1)} style={{ display: 'flex' }}>
                    <div style={{ width: '100%' }}><SkillCard skill={s} /></div>
                  </Reveal>
                ))}
              </div>
              <Reveal style={{ textAlign: 'center', marginTop: 30 }}>
                <GoldButton onClick={() => nav('/marketplace')}>Browse every skill →</GoldButton>
              </Reveal>
            </>
          )}
      </Section>

      {/* ── Categories ── */}
      <Section id="categories" style={{ paddingTop: 12 }}>
        <SectionHeading eyebrow="Browse" title="Every domain you build in" />
        <Reveal>
          <div className="cat-grid" style={{ display: 'grid', gap: 10 }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => nav(`/marketplace?cat=${encodeURIComponent(cat)}`)}
                style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: '15px 12px', cursor: 'pointer', fontFamily: FONT_UI, fontSize: 13, fontWeight: 500, color: c.textSub, transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.color = c.gold; e.currentTarget.style.background = c.goldSoft; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textSub; e.currentTarget.style.background = c.surface; }}>
                <span>{cat}</span>
                {catCounts[cat] > 0 && <span style={{ fontSize: 11, color: c.textMuted }}>{catCounts[cat]}</span>}
              </button>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── Leaderboard preview — builders and skills, five each ── */}
      <Section id="builders" style={{ paddingTop: 12 }}>
        <SectionHeading eyebrow="Leaderboard" title="Top of the exchange" />
        {lb.loading ? <Loader label="Loading leaderboard" />
          : lb.error ? <ErrorBox message={lb.error} onRetry={lb.retry} />
          : (lb.data?.builders || []).length === 0 && (lb.data?.skills || []).length === 0 ? null
          : (
            <>
              <LeaderboardPreview builders={lb.data?.builders} skills={lb.data?.skills} />
              <Reveal style={{ textAlign: 'center', marginTop: 22 }}>
                <GhostButton onClick={() => nav('/leaderboard')}>Full leaderboard →</GhostButton>
              </Reveal>
            </>
          )}
      </Section>

      {/* ── Closing CTA ── */}
      <Section style={{ paddingTop: 12, paddingBottom: 96 }} max={760}>
        <Reveal>
          <Card style={{ textAlign: 'center', padding: '44px 28px', background: `linear-gradient(160deg, ${c.goldSoft}, transparent 70%)`, borderColor: c.borderGold }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Logo size={40} /></div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(22px,3vw,28px)', color: c.text, margin: '0 0 10px' }}>Sell the workflow you already built</h2>
            <p style={{ fontFamily: FONT_UI, fontSize: 14, color: c.textMuted, lineHeight: 1.7, maxWidth: 460, margin: '0 auto 24px' }}>
              You've already solved it once. Package it as a skill, prove it with the project it shipped, and keep 90% of every sale.
            </p>
            <GoldButton size="lg" onClick={() => (user ? nav('/publish') : onShowAuth())}>
              {user ? 'Publish a skill' : 'Get started — it\'s free'}
            </GoldButton>
          </Card>
        </Reveal>
      </Section>
    </PageWrap>
  );
}

function StepColumn({ title, steps, accent }) {
  const { c } = useTheme();
  return (
    <Reveal>
      <Card style={{ height: '100%' }}>
        <div style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18 }}>{title}</div>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', gap: 14, paddingBottom: i < steps.length - 1 ? 18 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: `1px solid ${accent}55`, background: `${accent}12`, display: 'grid', placeItems: 'center', fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: accent }}>{s.n}</div>
              {i < steps.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 18, background: c.border, marginTop: 5 }} />}
            </div>
            <div style={{ paddingTop: 2 }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: c.text, marginBottom: 4 }}>{s.t}</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, lineHeight: 1.6 }}>{s.d}</div>
            </div>
          </div>
        ))}
      </Card>
    </Reveal>
  );
}
