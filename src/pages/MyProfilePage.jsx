import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_HEAD, FONT_UI } from '../tokens/theme';
import SkillCard from '../components/SkillCard.jsx';
import Loader from '../components/Loader.jsx';
import { Ic } from '../components/Icons.jsx';
import { PageWrap, VerifiedStamp, SellerBdg, Stars, Downloads } from '../components/Shared.jsx';
import { Card, GoldButton, GhostButton, Input, Textarea, Avatar, AvatarUpload, ErrorBox, EmptyState } from '../components/ui.jsx';
import UsernameField, { USERNAME_RE } from '../components/UsernameField.jsx';
import { LIMITS } from '../data/limits.js';
import { SELLER_PCT } from '../data/pricing.js';
import * as api from '../lib/api.js';
import { refreshProfile } from '../lib/auth.js';
import useFetch from '../lib/useFetch.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function MyProfilePage({ user, onLogout, onShowAuth }) {
  const { c } = useTheme();
  const nav = useNavigate();
  const [showAccount, setShowAccount] = useState(false);
  const [editing, setEditing] = useState(false);
  const [handleDismissed, setHandleDismissed] = useState(false);
  const me = useFetch(() => api.getMe(), [user?.username]);

  if (me.loading) return <PageWrap><Loader label="Loading your profile" /></PageWrap>;
  if (me.error) return <PageWrap><ErrorBox message={me.error} onRetry={me.retry} /></PageWrap>;

  const p = me.data;
  const skills = p.skills || [];
  const published = skills.filter(s => s.status === 'approved' || !s.status);
  const pending = skills.filter(s => s.status && s.status !== 'approved');
  const totalDownloads = skills.reduce((s, x) => s + (Number(x.downloads) || 0), 0);
  const rated = skills.filter(x => Number(x.reviews) > 0);
  const totalReviews = rated.reduce((s, x) => s + Number(x.reviews), 0);
  const avgRating = rated.length ? rated.reduce((s, x) => s + Number(x.rating), 0) / rated.length : 0;

  if (showAccount) return <AccountPane profile={p} onBack={() => setShowAccount(false)} onLogout={onLogout} onShowAuth={onShowAuth} />;

  return (
    <PageWrap>
      <div style={{ maxWidth: 940, margin: '0 auto', padding: '26px clamp(16px,4vw,40px) 56px' }}>

        {/* ── Header: avatar + identity share one top edge; the Account button
             is pinned to the same row, not floating loose as before. ── */}
        <div className="fade-up profile-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 22, marginBottom: 28 }}>
          <AvatarUpload name={p.name} src={p.avatarUrl} size={84}
            onPick={f => uploadAvatar(f, me.retry)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 5 }}>
              <h1 style={{ fontFamily: FONT_HEAD, fontSize: 'clamp(21px,3vw,27px)', fontWeight: 700, color: c.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{p.name}</h1>
              {p.verified && <VerifiedStamp size={22} />}
            </div>
            <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.gold, margin: '0 0 10px' }}>
              @{p.username}{p.location && <span style={{ color: c.textMuted }}> · {p.location}</span>}
            </p>
            {p.bio && <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textSub, margin: '0 0 12px', lineHeight: 1.6, maxWidth: 620 }}>{p.bio}</p>}
            <div className="profile-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(p.badges || []).map(b => <SellerBdg key={b} b={b} />)}
              <GhostButton size="sm" onClick={() => setEditing(e => !e)} testId="edit-profile">
                {editing ? 'Close editor' : 'Edit profile'}
              </GhostButton>
            </div>
          </div>
          <GhostButton size="sm" onClick={() => setShowAccount(true)} testId="account-btn">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ic.User s={13} c={c.textSub} /> Account</span>
          </GhostButton>
        </div>

        {/* A handle WE invented is a loose end the user never chose. Burying the
            fix inside a collapsed editor made it undiscoverable — so it gets its
            own card, above the fold, until it's dealt with. Dismissible: it's a
            nudge, not a wall. */}
        {p.usernameAutoDerived && !editing && !handleDismissed && (
          <Card className="fade-up" style={{ marginBottom: 24, background: `linear-gradient(160deg, ${c.goldSoft}, transparent 70%)`, borderColor: c.gold }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 5 }}>Pick your username</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, lineHeight: 1.6 }}>
                  We gave you <span style={{ color: c.gold, fontWeight: 600 }}>@{p.username}</span> as a unique starter handle when you signed up.
                  Make it yours — you can change it <strong style={{ color: c.text }}>once</strong>, then it's your permanent profile URL.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <GoldButton onClick={() => setEditing(true)} testId="claim-handle-cta">Choose a handle</GoldButton>
                <GhostButton size="sm" onClick={() => setHandleDismissed(true)}>Later</GhostButton>
              </div>
            </div>
          </Card>
        )}

        {editing && <ProfileEditor profile={p} onSaved={() => { setEditing(false); me.retry(); }} onCancel={() => setEditing(false)} />}

        {/* ── Stats ── */}
        <div className="fade-up-d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 32 }}>
          <Stat label={skills.length === 1 ? 'Skill' : 'Skills'}>
            <span style={{ fontFamily: FONT_UI, fontSize: 20, fontWeight: 700, color: c.text }}>{skills.length}</span>
          </Stat>
          {totalDownloads > 0 && <Stat label="All-time"><Downloads count={totalDownloads} size={15} /></Stat>}
          <Stat label="Average rating"><Stars rating={avgRating} count={totalReviews} size={12} /></Stat>
        </div>

        {/* ── Skills ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 19, fontWeight: 700, color: c.text, margin: 0, letterSpacing: '-0.01em' }}>My skills</h2>
          <GhostButton size="sm" onClick={() => nav('/publish')}>+ Publish new</GhostButton>
        </div>

        {skills.length === 0 ? (
          <EmptyState title="You haven't published a skill yet"
            body={`Package a workflow you've already built, prove it with the project it shipped, and keep ${SELLER_PCT} of every sale.`}
            action={<GoldButton onClick={() => nav('/publish')}>Publish your first skill</GoldButton>} />
        ) : (
          <>
            {pending.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>In review</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 16 }}>
                  {pending.map(s => (
                    <div key={s.id} style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, fontFamily: FONT_UI, fontSize: 10, fontWeight: 600, color: c.coral, background: c.coralSoft, border: `1px solid ${c.coral}40`, borderRadius: 20, padding: '2px 9px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.status}</span>
                      <SkillCard skill={s} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {published.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 16 }}>
                {published.map((s, i) => <SkillCard key={s.id} skill={s} className={i < 8 ? 'fade-up-d2' : undefined} />)}
              </div>
            )}
          </>
        )}

        {!p.verified && (
          <Card className="fade-up" style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', background: `linear-gradient(160deg, ${c.goldSoft}, transparent 70%)`, borderColor: c.borderGold }}>
            <VerifiedStamp size={38} animate={false} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 4 }}>Get the Verified Creator badge</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, lineHeight: 1.6 }}>A human reviews your proof of concept. Verified skills earn buyer trust and become eligible for featured placement.</div>
            </div>
            <GoldButton onClick={() => nav('/verify')}>Apply</GoldButton>
          </Card>
        )}

        <style>{`
          @media (max-width: 620px) {
            .profile-head { flex-direction: column; align-items: center; text-align: center; }
            .profile-head > div { width: 100%; }
            .profile-actions { justify-content: center; }
          }
        `}</style>
      </div>
    </PageWrap>
  );
}

async function uploadAvatar(file, done) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { alert('Photo must be a PNG, JPG or WebP.'); return; }
  if (file.size > MAX_AVATAR_BYTES) { alert('Photo is over 2MB — pick a smaller one.'); return; }
  try { await api.uploadAvatar(file); done(); }
  catch (e) { alert(e.message || 'Upload failed. Try again.'); }
}

function Stat({ label, children }) {
  const { c } = useTheme();
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ minHeight: 26, display: 'flex', alignItems: 'center' }}>{children}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, marginTop: 4, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function ProfileEditor({ profile, onSaved, onCancel }) {
  const { c } = useTheme();
  const [name, setName] = useState(profile.name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [location, setLocation] = useState(profile.location || '');
  const [handle, setHandle] = useState(profile.username || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saveHandle = async () => {
    if (!USERNAME_RE.test(handle)) { setError('Username: 3-24 characters, lowercase letters, numbers, underscores.'); return; }
    setBusy(true); setError('');
    try { await api.changeUsername(handle); await refreshProfile(); onSaved(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!name.trim()) { setError('Name cannot be empty.'); return; }
    setBusy(true); setError('');
    try {
      await api.updateProfile({ name: name.trim(), bio: bio.trim(), location: location.trim() });
      await refreshProfile(); // the nav reads the session, not this form
      onSaved();
    }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="fade-up" style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: c.gold, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Edit profile</div>
      <Input label="Display name" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Your name" testId="profile-name" maxLength={LIMITS.name} />
      <Input label="Location" hint="optional" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Mumbai, India" testId="profile-location" maxLength={LIMITS.location} />
      <Textarea label="Bio" hint="optional" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="What do you build?" testId="profile-bio" maxLength={LIMITS.bio} />

      {/* Signing in with Google never asks for a handle, so we derive one from
          the email. That is our choice, not the user's — so they get exactly
          one change to fix it. A handle they picked themselves stays permanent. */}
      {profile.usernameAutoDerived ? (
        <div style={{ background: c.goldSoft, border: `1px solid ${c.borderGold}`, borderRadius: 10, padding: 14, margin: '0 0 16px' }}>
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: c.textSub, margin: '0 0 12px', lineHeight: 1.55 }}>
            We picked <span style={{ color: c.gold, fontWeight: 600 }}>@{profile.username}</span> from your email when you signed in with Google.
            You can change it <strong style={{ color: c.text }}>once</strong> — after that it's permanent.
          </p>
          <UsernameField value={handle} onChange={v => { setHandle(v); setError(''); }} label="Choose your handle" testId="profile-username" />
          {/* Primary action — a GhostButton vanished into the gold panel it
              sits on, and this is the once-only thing people came here for. */}
          <GoldButton full disabled={busy || handle === profile.username || !handle} testId="profile-username-save"
            onClick={saveHandle}>
            {busy ? 'Claiming…' : handle && handle !== profile.username ? `Claim @${handle} →` : 'Choose a new handle above'}
          </GoldButton>
        </div>
      ) : (
        <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, margin: '-6px 0 16px' }}>
          Your username <span style={{ color: c.text }}>@{profile.username}</span> is permanent and can't be changed.
        </p>
      )}
      {error && <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.coral, margin: '0 0 14px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <GoldButton onClick={save} disabled={busy} testId="profile-save">{busy ? 'Saving…' : 'Save changes'}</GoldButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </Card>
  );
}

function AccountPane({ profile, onBack, onLogout, onShowAuth }) {
  const { c } = useTheme();
  return (
    <PageWrap>
      <div className="fade-up" style={{ maxWidth: 420, margin: '0 auto', padding: '64px clamp(16px,4vw,40px)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Avatar name={profile.name} src={profile.avatarUrl} size={72} />
        </div>
        <h2 style={{ fontFamily: FONT_HEAD, fontSize: 23, fontWeight: 700, color: c.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{profile.name}</h2>
        <p style={{ fontFamily: FONT_UI, fontSize: 13, color: c.textMuted, margin: '0 0 34px' }}>@{profile.username}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <GhostButton full onClick={onBack}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ic.User s={15} c={c.textSub} /> Continue as {profile.username}</span>
          </GhostButton>
          <GhostButton full onClick={() => { onLogout(); onShowAuth(); }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ic.User s={15} c={c.textSub} /> Switch account</span>
          </GhostButton>
          <button onClick={onLogout} data-testid="sign-out"
            style={{ background: c.coralSoft, border: `1px solid ${c.coral}40`, color: c.coral, borderRadius: 10, padding: '12px', fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ic.LogOut s={15} c={c.coral} /> Sign out
          </button>
        </div>
        <p style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, marginTop: 26 }}>Skill Exchange · skillexchange.tapdot.org</p>
      </div>
    </PageWrap>
  );
}
