import { useParams, useNavigate } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI } from '../tokens/theme';
import SkillCard from '../components/SkillCard.jsx';
import { PageWrap, VerifiedStamp, SellerBdg, Stars, Downloads } from '../components/Shared.jsx';
import { Avatar, ErrorBox, EmptyState, GhostButton } from '../components/ui.jsx';
import Loader from '../components/Loader.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

/* One stat cell. Value is a node, not a string, so it can be <Stars>/<Downloads>
   — the components that already know how to render "not yet rated" and how to
   spell "downloads" out in full. */
function Stat({ label, children }) {
  const { c } = useTheme();
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ minHeight: 26, display: 'flex', alignItems: 'center' }}>{children}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, marginTop: 4, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default function PublicProfilePage() {
  const { c } = useTheme();
  const { username } = useParams();
  const nav = useNavigate();
  const profile = useFetch(() => api.getProfile(username), [username]);

  if (profile.loading) return <PageWrap><Loader label="Loading profile…" /></PageWrap>;
  if (profile.error) return <PageWrap><ErrorBox message={profile.error} onRetry={profile.retry} /></PageWrap>;

  const p = profile.data;
  const skills = p.skills || [];
  const badges = p.badges || [];
  const totalDownloads = skills.reduce((s, x) => s + (Number(x.downloads) || 0), 0);
  const rated = skills.filter(x => Number(x.reviews) > 0);
  const totalReviews = rated.reduce((s, x) => s + Number(x.reviews), 0);
  const avgRating = rated.length ? rated.reduce((s, x) => s + Number(x.rating), 0) / rated.length : 0;
  const hasStats = skills.length > 0;

  return (
    <PageWrap>
      <div style={{ padding: '22px clamp(16px,4vw,40px) 0', maxWidth: 900, margin: '0 auto' }}>

        <div className="fade-up" style={{ marginBottom: 18 }}>
          <GhostButton size="sm" onClick={() => nav(-1)}>← Back</GhostButton>
        </div>

        {/* ── Header: avatar column + text column, both aligned to one top edge.
             Stacks (and centres) only below 560px, where a side-by-side split
             leaves the bio too narrow to read. ── */}
        <div className="fade-up profile-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 22, marginBottom: 26 }}>
          <Avatar name={p.name} src={p.avatarUrl} size={82} />
          <div className="profile-head-body" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
              <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(21px,3vw,27px)', fontWeight: 700, color: c.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{p.name}</h1>
              {p.verified && <VerifiedStamp size={22} />}
            </div>
            <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.gold, margin: '0 0 10px' }}>
              @{p.username}
              {p.location && <span style={{ color: c.textMuted }}> · {p.location}</span>}
            </p>
            {p.bio && <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textSub, margin: '0 0 12px', lineHeight: 1.6, maxWidth: 620 }}>{p.bio}</p>}
            {badges.length > 0 && (
              <div className="profile-badges" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {badges.map(b => <SellerBdg key={b} b={b} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        {hasStats && (
          <div className="fade-up-d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 32 }}>
            <Stat label={skills.length === 1 ? 'Skill published' : 'Skills published'}>
              <span style={{ fontFamily: FONT_UI, fontSize: 20, fontWeight: 700, color: c.text }}>{skills.length}</span>
            </Stat>
            {totalDownloads > 0 && (
              <Stat label="All-time">
                <Downloads count={totalDownloads} size={15} />
              </Stat>
            )}
            <Stat label="Average rating">
              <Stars rating={avgRating} count={totalReviews} size={12} />
            </Stat>
          </div>
        )}

        {/* ── Published skills ── */}
        <h2 className="fade-up-d1" style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, color: c.text, margin: '0 0 16px', letterSpacing: '-0.01em' }}>
          Published skills
        </h2>
        {skills.length === 0 ? (
          <EmptyState
            title="No skills published yet"
            body={`${p.name} hasn't put anything on the exchange so far. Check back soon.`}
            action={<GhostButton onClick={() => nav('/marketplace')}>Browse the marketplace</GhostButton>}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(272px,1fr))', gap: 16 }}>
            {skills.map((s, i) => <SkillCard key={s.id} skill={s} className={i < 8 ? 'fade-up-d2' : undefined} />)}
          </div>
        )}

        <style>{`
          @media (max-width: 560px) {
            .profile-head { flex-direction: column; align-items: center; text-align: center; }
            .profile-head-body { width: 100%; }
            .profile-badges { justify-content: center; }
          }
        `}</style>
      </div>
    </PageWrap>
  );
}
