import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI } from '../tokens/theme';
import SkillIcon from './SkillIcon.jsx';
import { VerifiedStamp, Stars, SkillBdg, PTag, TimeSaved, Downloads, Price } from './Shared.jsx';

/* Chrome Web Store-shaped listing card: icon rail on the left, title block,
   then a hairline-separated meta footer. Roomy by design — the first build
   crammed five stacked rows into 18px of padding. */
export default function SkillCard({ skill, className }) {
  const { c } = useTheme();
  const nav = useNavigate();
  return (
    <div data-testid="skill-card" className={className} onClick={() => nav(`/skills/${skill.id}`)}
      role="link" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') nav(`/skills/${skill.id}`); }}
      style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 18, cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s', minHeight: 172 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 34px ${c.goldGlow}`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <SkillIcon skill={skill} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, fontWeight: 600, color: c.text, margin: 0, lineHeight: 1.32, flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {skill.title}
            </h3>
            {skill.verified && <VerifiedStamp size={20} animate={false} />}
          </div>
          <div style={{ marginTop: 5, fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: c.slate, fontSize: 10 }}>{skill.category}</span>
            <span style={{ margin: '0 6px' }}>·</span>
            <span onClick={e => { e.stopPropagation(); nav(`/u/${skill.author}`); }}
              style={{ color: c.gold, cursor: 'pointer' }}>{skill.author}</span>
          </div>
        </div>
      </div>

      {/* NO flex:1 here — a flex-grown box makes -webkit-line-clamp clip at the
          box height instead of the line count, letting a third line ghost
          through. Height is pinned to exactly two lines; the footer is pushed
          down with margin-top:auto instead. */}
      <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: 0, lineHeight: 1.55, height: '2.8em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {skill.description}
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {skill.skillBadge && <SkillBdg label={skill.skillBadge} />}
        <TimeSaved hours={skill.timeSaved} compact />
        {skill.platforms.slice(0, 2).map(p => <PTag key={p} p={p} />)}
        {skill.platforms.length > 2 && <span style={{ fontFamily: FONT_UI, fontSize: 10, color: c.textMuted }}>+{skill.platforms.length - 2}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: `1px solid ${c.border}`, paddingTop: 12, marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Stars rating={skill.rating} count={skill.reviews} />
          <Downloads count={skill.downloads} />
        </div>
        <Price dollars={skill.price} size={14} />
      </div>
    </div>
  );
}
