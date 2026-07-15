import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI } from '../tokens/theme';
import { PageWrap, Stars, Bdg, BuilderIcon, TimeSaved, Downloads } from '../components/Shared.jsx';
import { Card, PageTitle, ErrorBox, EmptyState, GhostButton, Avatar } from '../components/ui.jsx';
import SkillIcon from '../components/SkillIcon.jsx';
import Loader from '../components/Loader.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

const TABS = [
  { id: 'builders', label: 'Top Builders' },
  { id: 'skills', label: 'Top Skills' },
];

export default function LeaderboardPage() {
  const { c } = useTheme();
  const nav = useNavigate();
  const [tab, setTab] = useState('builders');
  const lb = useFetch(() => api.getLeaderboard(), []);

  const builders = lb.data?.builders || [];
  const skills = lb.data?.skills || [];

  return (
    <PageWrap>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '26px clamp(16px,4vw,40px) 48px' }}>
        <PageTitle eyebrow="All-time" title="Leaderboard"
          sub="Ranked by real sales and downloads across the exchange. Recomputed nightly — no self-reported numbers." />

        <div className="fade-up" style={{ marginBottom: 26 }}>
          <Segmented value={tab} onChange={setTab} options={TABS} />
        </div>

        {lb.loading ? <Loader label="Loading rankings" />
          : lb.error ? <ErrorBox message={lb.error} onRetry={lb.retry} />
          : tab === 'builders' ? (
            builders.length === 0 ? (
              <EmptyState title="No builders ranked yet"
                body="The leaderboard fills up as skills sell. Publish one and you could be the first name here."
                action={<GhostButton onClick={() => nav('/publish')}>Publish a skill</GhostButton>} />
            ) : (
              <>
                <Podium builders={builders} onOpen={u => nav(`/u/${u}`)} />
                <RankList>
                  {builders.map((e, i) => (
                    <BuilderRow key={e.rank ?? e.name} entry={e} last={i === builders.length - 1} onOpen={() => nav(`/u/${e.name}`)} />
                  ))}
                </RankList>
              </>
            )
          ) : (
            skills.length === 0 ? (
              <EmptyState title="No skills ranked yet"
                body="Skills enter the ranking once they start being downloaded."
                action={<GhostButton onClick={() => nav('/marketplace')}>Browse the marketplace</GhostButton>} />
            ) : (
              <RankList>
                {skills.map((s, i) => (
                  <SkillRow key={s.rank ?? s.skillId} skill={s} last={i === skills.length - 1}
                    onOpen={() => nav(`/skills/${s.skillId}`)} onAuthor={() => nav(`/u/${s.author}`)} />
                ))}
              </RankList>
            )
          )}

        {/* ── Badge explainer ── */}
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: c.text, margin: '40px 0 14px', letterSpacing: '-0.01em' }}>
          Seller badges
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
          {[
            { icon: <Ic.Crown s={10} c={c.coral} />, label: 'Top Seller', color: c.coral, desc: 'Highest total sales on the exchange. Recomputed nightly from real purchases.' },
            { icon: <Ic.Shield s={10} c={c.gold} />, label: 'Verified Creator', color: c.gold, desc: 'Proof of concept manually reviewed by Skill Exchange. Never automated.' },
          ].map(b => (
            <Card key={b.label} className="fade-up">
              <Bdg icon={b.icon} label={b.label} color={b.color} />
              <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: '10px 0 0', lineHeight: 1.6 }}>{b.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </PageWrap>
  );
}

/* ── Segmented control ── one track, one active pill; keyboard-navigable tabs. */
function Segmented({ value, onChange, options }) {
  const { c } = useTheme();
  return (
    <div role="tablist" aria-label="Leaderboard view"
      style={{ display: 'inline-flex', gap: 2, background: c.elevated, border: `1px solid ${c.border}`, borderRadius: 11, padding: 3 }}>
      {options.map(o => {
        const active = o.id === value;
        return (
          <button key={o.id} role="tab" aria-selected={active} data-testid={`lb-tab-${o.id}`}
            onClick={() => onChange(o.id)}
            style={{
              background: active ? `linear-gradient(135deg, ${c.gold}, ${c.goldDim})` : 'transparent',
              border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer',
              fontFamily: FONT_UI, fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? c.onGold : c.textSub, letterSpacing: '-0.01em',
              boxShadow: active ? `0 2px 14px ${c.goldGlow}` : 'none',
              transition: 'color 0.15s, background 0.2s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = c.text; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = c.textSub; }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Podium — renders 2nd · 1st · 3rd, and degrades cleanly below three builders. */
function Podium({ builders, onOpen }) {
  const { c } = useTheme();
  const order = podiumOrder(builders);
  if (!order.some(Boolean)) return null;
  const HEIGHTS = [104, 140, 82];

  return (
    <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 30, flexWrap: 'wrap' }}>
      {order.map((e, i) => {
        if (!e) return null;
        const first = e.rank === 1;
        return (
          <div key={e.rank ?? e.name} style={{ flex: '1 1 130px', maxWidth: 172, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 9 }}>
              <Avatar name={e.name} src={e.avatarUrl} size={first ? 54 : 42} />
            </div>
            <button onClick={() => onOpen(e.name)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT_DISPLAY, fontSize: first ? 15.5 : 13, fontWeight: 700, color: first ? c.gold : c.text, letterSpacing: '-0.01em', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={ev => { ev.currentTarget.style.color = c.gold; }}
              onMouseLeave={ev => { ev.currentTarget.style.color = first ? c.gold : c.text; }}>
              {e.name}
            </button>
            <div style={{ minHeight: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '5px 0 8px' }}>
              <Stars rating={e.rating} count={e.reviews} showEmpty={false} />
            </div>
            <div style={{
              height: HEIGHTS[i],
              background: first ? `linear-gradient(180deg, ${c.goldSoft}, transparent)` : c.surface,
              border: `1px solid ${first ? c.gold : c.border}`,
              borderBottom: 'none', borderRadius: '12px 12px 0 0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
              boxShadow: first ? `0 -6px 30px ${c.goldGlow}` : 'none',
            }}>
              <BuilderIcon b={e.badge} />
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: first ? 30 : 22, fontWeight: 700, color: first ? c.gold : c.textSub, lineHeight: 1 }}>
                {e.rank}
              </span>
              <span style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted }}>
                {e.sales?.toLocaleString?.() ?? e.sales} {e.sales === 1 ? 'sale' : 'sales'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Ranked list shell — hairline separators, no inner padding on the card. */
function RankList({ children }) {
  return <Card className="fade-up" style={{ padding: 0, overflow: 'hidden' }}>{children}</Card>;
}

function Rank({ n }) {
  const { c } = useTheme();
  const top = n <= 3;
  return (
    <span style={{ fontFamily: FONT_DISPLAY, fontSize: top ? 15 : 13, fontWeight: 700, color: top ? c.gold : c.textMuted, width: 26, flexShrink: 0, textAlign: 'center' }}>
      {n}
    </span>
  );
}

const rowStyle = (c, last) => ({
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '15px 20px', borderBottom: last ? 'none' : `1px solid ${c.border}`,
  cursor: 'pointer', transition: 'background 0.14s',
});

function BuilderRow({ entry: e, last, onOpen }) {
  const { c } = useTheme();
  return (
    <div role="link" tabIndex={0} onClick={onOpen} onKeyDown={ev => { if (ev.key === 'Enter') onOpen(); }}
      style={rowStyle(c, last)}
      onMouseEnter={ev => { ev.currentTarget.style.background = c.surfaceHover; }}
      onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}>
      <Rank n={e.rank} />
      <Avatar name={e.name} src={e.avatarUrl} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
          <BuilderIcon b={e.badge} />
        </div>
        <div style={{ marginTop: 3 }}>
          <Stars rating={e.rating} count={e.reviews} showEmpty={false} />
        </div>
      </div>
      <span style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textSub, whiteSpace: 'nowrap' }}>
        <strong style={{ color: c.text, fontWeight: 600 }}>{e.sales?.toLocaleString?.() ?? e.sales}</strong> {e.sales === 1 ? 'sale' : 'sales'}
      </span>
    </div>
  );
}

function SkillRow({ skill: s, last, onOpen, onAuthor }) {
  const { c } = useTheme();
  return (
    <div role="link" tabIndex={0} onClick={onOpen} onKeyDown={ev => { if (ev.key === 'Enter') onOpen(); }}
      style={rowStyle(c, last)}
      onMouseEnter={ev => { ev.currentTarget.style.background = c.surfaceHover; }}
      onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}>
      <Rank n={s.rank} />
      <SkillIcon skill={{ id: s.skillId, title: s.title, category: s.category, iconUrl: s.iconUrl }} size={40} radius={10} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
        <div style={{ marginTop: 3, fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted }}>
          by <span onClick={ev => { ev.stopPropagation(); onAuthor(); }} style={{ color: c.gold, cursor: 'pointer' }}>{s.author}</span>
        </div>
      </div>
      <div className="lb-row-meta" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <TimeSaved hours={s.timeSaved} compact />
        <Downloads count={s.downloads} size={12} />
        <Stars rating={s.rating} count={s.reviews} showEmpty={false} />
      </div>
    </div>
  );
}

// Podium renders 2nd, 1st, 3rd — gracefully handles fewer than 3 builders.
function podiumOrder(builders) {
  return [builders[1], builders[0], builders[2]];
}
