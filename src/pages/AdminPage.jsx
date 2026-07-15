import { useState, useCallback } from 'react';
import { useTheme, FONT_DISPLAY, FONT_UI, FONT_MONO } from '../tokens/theme';
import { PageWrap } from '../components/Shared.jsx';
import { Card, Input, GoldButton, GhostButton, ErrorBox, EmptyState } from '../components/ui.jsx';
import Select from '../components/Select.jsx';
import Loader from '../components/Loader.jsx';

// Founder-only superadmin tool (hidden route /admin — not in nav).
// Static credentials, checked server-side on every call; kept in
// sessionStorage only (gone when the tab closes).
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const CREDS_KEY = 'se_admin_creds';

const BADGE_OPTIONS = [
  { value: 'Verified Creator', label: 'Verified Creator' },
  { value: 'Top Seller', label: 'Top Seller' },
];
const ACTION_OPTIONS = [
  { value: 'grant', label: 'Grant' },
  { value: 'revoke', label: 'Revoke' },
];

function creds() {
  try { return JSON.parse(sessionStorage.getItem(CREDS_KEY)); } catch { return null; }
}

async function adminFetch(path, opts = {}) {
  const c = creds();
  const res = await fetch(`${API}/admin${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Superadmin-Username': c?.u || '',
      'X-Superadmin-Password': c?.p || '',
      ...opts.headers,
    },
  });
  if (res.status === 401) { sessionStorage.removeItem(CREDS_KEY); throw new Error('Invalid superadmin credentials.'); }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export default function AdminPage() {
  const { c } = useTheme();
  const [loggedIn, setLoggedIn] = useState(() => !!creds());
  return (
    <PageWrap>
      <div style={{ padding: '30px clamp(16px,4vw,40px) 0', maxWidth: 900, margin: '0 auto' }}>
        <div className="fade-up" style={{ marginBottom: 26 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.gold, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 9 }}>Founder access only</div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(22px,3vw,28px)', fontWeight: 700, color: c.text, margin: '0 0 7px', letterSpacing: '-0.02em' }}>Superadmin</h1>
          <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, margin: 0 }}>Moderation queue, badges, and jobs.</p>
        </div>
        {loggedIn
          ? <Panel onAuthFail={() => setLoggedIn(false)} />
          : <Login onOk={() => setLoggedIn(true)} />}
      </div>
    </PageWrap>
  );
}

function Login({ onOk }) {
  const { c } = useTheme();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    sessionStorage.setItem(CREDS_KEY, JSON.stringify({ u, p }));
    try { await adminFetch('/login', { method: 'POST' }); onOk(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="fade-up-d1" style={{ maxWidth: 380, padding: 22 }}>
      <Input label="Superadmin username" value={u} onChange={e => { setU(e.target.value); setError(''); }}
        placeholder="username" testId="admin-user" autoFocus />
      <Input label="Password" type="password" value={p} onChange={e => { setP(e.target.value); setError(''); }}
        placeholder="••••••••" testId="admin-pass" onKeyDown={e => e.key === 'Enter' && submit()} />
      {error && <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.coral, margin: '0 0 14px' }}>{error}</p>}
      <GoldButton onClick={submit} disabled={busy} full testId="admin-login">
        {busy ? 'Checking…' : 'Sign In'}
      </GoldButton>
    </Card>
  );
}

/* Small destructive/affirmative action button — deliberately not GoldButton:
   an approve/reject row needs three equal-weight choices, none of them the
   page's primary call to action. */
function ActionBtn({ tone, onClick, children }) {
  const { c } = useTheme();
  const col = tone === 'green' ? c.green : tone === 'coral' ? c.coral : c.textMuted;
  return (
    <button type="button" onClick={onClick}
      style={{ background: 'transparent', border: `1px solid ${col}55`, color: col, borderRadius: 8, padding: '6px 13px', fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s, border-color 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = `${col}14`; e.currentTarget.style.borderColor = col; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${col}55`; }}>
      {children}
    </button>
  );
}

function Section({ title, count, children }) {
  const { c } = useTheme();
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 12 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: c.text, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
        {count > 0 && (
          <span style={{ fontFamily: FONT_UI, fontSize: 10.5, fontWeight: 700, color: c.gold, background: c.goldSoft, border: `1px solid ${c.gold}35`, borderRadius: 20, padding: '2px 9px' }}>{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/* One queue row — title block on the left, actions on the right. */
function Row({ children, actions }) {
  const { c } = useTheme();
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 9, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', transition: 'border-color 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = c.borderGold; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; }}>
      <div style={{ flex: 1, minWidth: 220 }}>{children}</div>
      <div style={{ display: 'flex', gap: 7 }}>{actions}</div>
    </div>
  );
}

function Panel({ onAuthFail }) {
  const { c } = useTheme();
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [badgeForm, setBadgeForm] = useState({ username: '', badge: 'Verified Creator', action: 'grant' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setQueue(await adminFetch('/queue')); }
    catch (e) { setError(e.message); if (e.message.includes('credentials')) onAuthFail(); }
    finally { setLoading(false); }
  }, [onAuthFail]);

  const act = async (path, label) => {
    setNotice('');
    try { await adminFetch(path, { method: 'POST' }); setNotice(`✓ ${label}`); load(); }
    catch (e) { setError(e.message); }
  };

  const setBadge = async () => {
    setNotice(''); setError('');
    try {
      await adminFetch('/badges', { method: 'POST', body: JSON.stringify(badgeForm) });
      setNotice(`✓ ${badgeForm.action}ed "${badgeForm.badge}" for ${badgeForm.username}`);
    } catch (e) { setError(e.message); }
  };

  if (queue === null && !loading && !error) load();

  const link = { color: c.gold, textDecoration: 'none', wordBreak: 'break-all' };
  const metaLine = { fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, marginTop: 3, lineHeight: 1.5 };

  return (
    <div className="fade-up-d1" style={{ display: 'flex', flexDirection: 'column', gap: 26, paddingBottom: 20 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <GhostButton size="sm" onClick={load}>↻ Refresh queue</GhostButton>
        <GhostButton size="sm" onClick={() => act('/run-badges-job', 'badges job triggered')} testId="run-badges">▶ Run badges job now</GhostButton>
        <div style={{ marginLeft: 'auto' }}>
          <GhostButton size="sm" onClick={() => { sessionStorage.removeItem(CREDS_KEY); onAuthFail(); }}>Sign out</GhostButton>
        </div>
      </div>

      {notice && (
        <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.green, background: c.greenSoft, border: `1px solid ${c.green}35`, borderRadius: 10, padding: '9px 13px', margin: 0 }}>{notice}</p>
      )}
      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loader label="Loading queue…" pad="10vh 24px" />}

      {queue && (
        <>
          <Section title="Pending skills" count={queue.skills.length}>
            {queue.skills.length === 0
              ? <EmptyState title="Queue is empty" body="No skills are waiting on review right now." />
              : queue.skills.map(s => (
                <Row key={s.skillId} actions={<>
                  <ActionBtn tone="green" onClick={() => act(`/skills/${s.skillId}/approve`, `approved "${s.title}"`)}>Approve</ActionBtn>
                  <ActionBtn tone="coral" onClick={() => act(`/skills/${s.skillId}/reject`, `rejected "${s.title}"`)}>Reject</ActionBtn>
                  <ActionBtn tone="muted" onClick={() => act(`/skills/${s.skillId}/flag`, `flagged "${s.title}"`)}>Flag</ActionBtn>
                </>}>
                  <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13.5, color: c.text }}>
                    {s.title}
                    <span style={{ fontWeight: 400, color: c.textMuted }}> · {s.category} · {s.priceCents ? `$${s.priceCents / 100}` : 'Free'}</span>
                  </div>
                  <div style={metaLine}>
                    by <span style={{ color: c.gold }}>{s.sellerUsername}</span> · POC:{' '}
                    <a href={s.pocUrl} target="_blank" rel="noreferrer" style={{ ...link, fontFamily: FONT_MONO, fontSize: 11 }}>{s.pocUrl}</a>
                  </div>
                </Row>
              ))}
          </Section>

          <Section title="Verification applications" count={queue.applications.length}>
            {queue.applications.length === 0
              ? <EmptyState title="No pending applications" body="Verification requests will appear here as they come in." />
              : queue.applications.map(a => (
                <Row key={a.applicationId} actions={<>
                  <ActionBtn tone="green" onClick={() => act(`/verify/${a.applicationId}/approve`, `verified @${a.username}`)}>Approve</ActionBtn>
                  <ActionBtn tone="coral" onClick={() => act(`/verify/${a.applicationId}/reject`, `rejected @${a.username}`)}>Reject</ActionBtn>
                </>}>
                  <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13.5, color: c.text }}>@{a.username}</div>
                  <div style={metaLine}>
                    Skill: <a href={a.skillUrl} target="_blank" rel="noreferrer" style={{ ...link, fontFamily: FONT_MONO, fontSize: 11 }}>{a.skillUrl}</a>
                  </div>
                  {a.note && <div style={{ ...metaLine, color: c.textSub, fontStyle: 'italic' }}>“{a.note}”</div>}
                </Row>
              ))}
          </Section>

          <Section title="Badges">
            <Card style={{ padding: 18 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <Input value={badgeForm.username} onChange={e => setBadgeForm(f => ({ ...f, username: e.target.value }))} placeholder="username" />
                </div>
                <Select ariaLabel="Badge" value={badgeForm.badge} options={BADGE_OPTIONS} minWidth={170}
                  onChange={v => setBadgeForm(f => ({ ...f, badge: v }))} />
                <Select ariaLabel="Action" value={badgeForm.action} options={ACTION_OPTIONS} minWidth={120}
                  onChange={v => setBadgeForm(f => ({ ...f, action: v }))} />
                <GoldButton size="sm" onClick={setBadge} disabled={!badgeForm.username.trim()}>Apply</GoldButton>
              </div>
              <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted, margin: '12px 0 0', lineHeight: 1.5 }}>
                Manual override. The nightly job recomputes Top Seller from sales — a grant here holds until the next run.
              </p>
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
