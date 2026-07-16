import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_HEAD, FONT_UI } from '../tokens/theme';
import { Card, Avatar, Reveal } from './ui.jsx';
import { Downloads, BuilderIcon } from './Shared.jsx';
import SkillIcon from './SkillIcon.jsx';

/* A compact, no-podium echo of the leaderboard for the landing page: the same
   rank / mark / name / metric row as LeaderboardPage, in two columns.
   Takes already-fetched data — the caller owns the request, so the home page's
   single `leaderboard` fetch feeds this without a second round trip. */
export default function LeaderboardPreview({ builders = [], skills = [], limit = 5 }) {
  const b = builders.slice(0, limit);
  const s = skills.slice(0, limit);
  if (!b.length && !s.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, maxWidth: 860, margin: '0 auto' }}>
      {b.length > 0 && (
        <Column title="Top builders" delay={1}>
          {b.map((e, i) => (
            <BuilderRow key={e.rank ?? e.name} entry={e} last={i === b.length - 1} />
          ))}
        </Column>
      )}
      {s.length > 0 && (
        <Column title="Top skills" delay={2}>
          {s.map((x, i) => (
            <SkillRow key={x.rank ?? x.skillId} skill={x} last={i === s.length - 1} />
          ))}
        </Column>
      )}
    </div>
  );
}

function Column({ title, delay, children }) {
  const { c } = useTheme();
  return (
    <Reveal delay={delay} style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: c.textSub, margin: '0 0 12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {title}
      </h3>
      <Card style={{ padding: 0, overflow: 'hidden', flex: 1 }}>{children}</Card>
    </Reveal>
  );
}

function Rank({ n }) {
  const { c } = useTheme();
  return (
    <span style={{ fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, color: n === 1 ? c.gold : c.textMuted, width: 20, flexShrink: 0 }}>
      {n}
    </span>
  );
}

const rowStyle = (c, last) => ({
  display: 'flex', alignItems: 'center', gap: 11,
  padding: '11px 15px', borderBottom: last ? 'none' : `1px solid ${c.border}`,
  cursor: 'pointer', transition: 'background 0.14s',
});

const nameStyle = (c) => ({
  fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: c.text,
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
});

function Row({ onOpen, last, children }) {
  const { c } = useTheme();
  return (
    <div role="link" tabIndex={0} onClick={onOpen} onKeyDown={ev => { if (ev.key === 'Enter') onOpen(); }}
      style={rowStyle(c, last)}
      onMouseEnter={ev => { ev.currentTarget.style.background = c.surfaceHover; }}
      onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}>
      {children}
    </div>
  );
}

function BuilderRow({ entry: e, last }) {
  const { c } = useTheme();
  const nav = useNavigate();
  return (
    <Row last={last} onOpen={() => nav(`/u/${e.name}`)}>
      <Rank n={e.rank} />
      <Avatar name={e.name} src={e.avatarUrl} size={28} />
      <span style={nameStyle(c)}>{e.name}</span>
      <BuilderIcon b={e.badge} />
      {e.sales > 0 && (
        <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, whiteSpace: 'nowrap' }}>
          {e.sales.toLocaleString()} {e.sales === 1 ? 'sale' : 'sales'}
        </span>
      )}
    </Row>
  );
}

function SkillRow({ skill: s, last }) {
  const { c } = useTheme();
  const nav = useNavigate();
  return (
    <Row last={last} onOpen={() => nav(`/skills/${s.skillId}`)}>
      <Rank n={s.rank} />
      <SkillIcon skill={{ id: s.skillId, title: s.title, category: s.category, iconUrl: s.iconUrl }} size={28} radius={8} />
      <span style={nameStyle(c)}>{s.title}</span>
      <Downloads count={s.downloads} size={11.5} />
    </Row>
  );
}
