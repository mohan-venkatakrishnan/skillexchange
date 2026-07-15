import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { DARK, LIGHT, ThemeContext, detectFx, useTheme, FONT_DISPLAY, FONT_UI } from './tokens/theme';
import GlobalStyles from './GlobalStyles.jsx';
import Logo from './components/Logo.jsx';
import { Ic } from './components/Icons.jsx';
import NodeField from './components/NodeField.jsx';
import AuthModal from './components/AuthModal.jsx';
import Loader from './components/Loader.jsx';
import { GoldButton } from './components/ui.jsx';
import { getSession, signOut, handleOAuthCallback, AUTH_EVENT } from './lib/auth.js';
import HomePage from './pages/HomePage.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';
import SkillDetailPage from './pages/SkillDetailPage.jsx';
import PublishPage from './pages/PublishPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import GetVerifiedPage from './pages/GetVerifiedPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import MyProfilePage from './pages/MyProfilePage.jsx';
import PublicProfilePage from './pages/PublicProfilePage.jsx';
import CreateSkillPage from './pages/CreateSkillPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

const NAV = [
  { path: '/', label: 'Home', pub: true },
  { path: '/marketplace', label: 'Marketplace', pub: true },
  { path: '/create', label: 'Create a Skill', pub: true },
  { path: '/leaderboard', label: 'Leaderboard', pub: true },
  { path: '/verify', label: 'Get Verified', pub: true },
  { path: '/library', label: 'My Library', pub: false },
  { path: '/profile', label: 'My Profile', pub: false },
];

const THEME_KEY = 'se_theme';

/* Fade + 8px lift page transition (~200ms). transform must be "none" at rest:
   any transform on this wrapper would make it the containing block for its
   position:fixed descendants (nav, NodeField) and turn them into scrollers. */
function TransitionedRoutes({ user, onShowAuth, onLogout }) {
  const location = useLocation();
  const [shown, setShown] = useState(location);
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (location.pathname === shown.pathname && location.search === shown.search) { setShown(location); return; }
    // Same-page query changes (marketplace filters) must not fade the page.
    if (location.pathname === shown.pathname) { setShown(location); return; }
    setOut(true);
    const t = setTimeout(() => { setShown(location); setOut(false); window.scrollTo(0, 0); }, 200);
    return () => clearTimeout(t);
  }, [location, shown]);

  const showAuth = onShowAuth;
  return (
    <div style={{ opacity: out ? 0 : 1, transform: out ? 'translateY(8px)' : 'none', transition: 'opacity 0.2s ease, transform 0.2s ease' }}>
      <Routes location={shown}>
        <Route path="/" element={<HomePage user={user} onShowAuth={showAuth} />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/skills/:id" element={<SkillDetailPage user={user} onShowAuth={showAuth} />} />
        <Route path="/create" element={<CreateSkillPage user={user} onShowAuth={showAuth} />} />
        <Route path="/publish" element={user ? <PublishPage /> : <AuthGate onShowAuth={showAuth} />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/verify" element={<GetVerifiedPage user={user} onShowAuth={showAuth} />} />
        <Route path="/library" element={user ? <LibraryPage /> : <AuthGate onShowAuth={showAuth} />} />
        <Route path="/profile" element={user ? <MyProfilePage user={user} onLogout={onLogout} onShowAuth={showAuth} /> : <AuthGate onShowAuth={showAuth} />} />
        <Route path="/u/:username" element={<PublicProfilePage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

/* OAuth code-grant landing: exchange the code, then return the user to
   wherever they were when they hit sign-in — never dump them on the homepage. */
function AuthCallback() {
  const { c } = useTheme();
  const nav = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) { nav('/', { replace: true }); return; }
    const back = sessionStorage.getItem('se_return_to') || '/';
    sessionStorage.removeItem('se_return_to');
    handleOAuthCallback(code).then(
      () => nav(back, { replace: true }),
      e => setError(e.message),
    );
  }, [nav]);
  if (error) {
    return (
      <div style={{ position: 'relative', zIndex: 1, padding: '90px 20px', textAlign: 'center', fontFamily: FONT_UI }}>
        <p style={{ color: c.coral, marginBottom: 16 }}>{error}</p>
        <GoldButton onClick={() => nav('/')}>Back to Home</GoldButton>
      </div>
    );
  }
  return <div style={{ position: 'relative', zIndex: 1 }}><Loader label="Signing you in…" pad="22vh 24px" mark={48} /></div>;
}

function AuthGate({ onShowAuth }) {
  const { c } = useTheme();
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100vh - 52px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', fontFamily: FONT_UI }} className="fade-up">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Logo size={44} /></div>
        <p style={{ color: c.text, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Sign in to continue</p>
        <p style={{ color: c.textMuted, fontSize: 13, marginBottom: 20 }}>You'll come straight back to this page.</p>
        <GoldButton onClick={onShowAuth}>Sign In</GoldButton>
      </div>
    </div>
  );
}

function Shell() {
  const { c, isDark, setIsDark } = useTheme();
  const nav = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => getSession());
  const [showAuth, setShowAuth] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // One global auth event: session cleared anywhere (401, sign-out) → UI stands down.
  useEffect(() => {
    const sync = () => setUser(getSession());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(AUTH_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  // Remember where the user was, so sign-in returns them there (incl. the
  // full-page Google redirect, which loses React state entirely).
  const openAuth = useCallback(() => {
    sessionStorage.setItem('se_return_to', location.pathname + location.search);
    setShowAuth(true);
  }, [location]);

  const handleLogin = useCallback((session) => {
    setUser(session);
    setShowAuth(false);
    const back = sessionStorage.getItem('se_return_to');
    sessionStorage.removeItem('se_return_to');
    if (back && back !== location.pathname + location.search) nav(back);
  }, [nav, location]);

  const handleLogout = useCallback(() => { signOut(); setUser(null); nav('/'); }, [nav]);

  const requireAuthNav = (path) => {
    if (user) { nav(path); return; }
    sessionStorage.setItem('se_return_to', path);
    setShowAuth(true);
  };

  const active = location.pathname.startsWith('/skills/') || location.pathname.startsWith('/u/') ? '/marketplace' : location.pathname;
  const visibleNav = NAV.filter(n => n.pub || user);
  const navBtn = (n, mobile = false) => (
    <button key={n.path} onClick={() => (n.pub ? nav(n.path) : requireAuthNav(n.path))}
      style={{ background: active === n.path ? c.goldSoft : 'transparent', border: 'none', borderRadius: 7, padding: mobile ? '11px 12px' : '6px 11px', fontFamily: FONT_UI, fontSize: mobile ? 14 : 12.5, fontWeight: active === n.path ? 600 : 400, color: active === n.path ? c.gold : mobile ? c.text : c.textSub, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, textAlign: mobile ? 'left' : 'center', width: mobile ? '100%' : undefined, transition: 'color 0.15s' }}
      onMouseEnter={e => { if (active !== n.path) e.currentTarget.style.color = c.text; }}
      onMouseLeave={e => { if (active !== n.path) e.currentTarget.style.color = mobile ? c.text : c.textSub; }}>
      {n.label}
    </button>
  );

  return (
    <>
      <NodeField />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin} />}

      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: c.bg, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', padding: '0 clamp(12px,3vw,22px)', height: 52, gap: 10 }}>
        <button onClick={() => nav('/')} aria-label="Skill Exchange home"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: 6, display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <Logo size={26} />
          <span className="nav-brand-text" style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: c.gold, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>Skill Exchange</span>
        </button>

        <div className="nav-desktop-links">{visibleNav.map(n => navBtn(n))}</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
          <button onClick={() => setIsDark(d => !d)} aria-label="Toggle theme" data-tip={isDark ? 'Light theme' : 'Dark theme'}
            style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 7, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {isDark ? <Ic.Sun s={13} c={c.textSub} /> : <Ic.Moon s={13} c={c.textSub} />}
          </button>
          {user
            ? <button onClick={() => nav('/profile')} data-testid="nav-user"
                style={{ background: c.goldSoft, border: `1px solid ${c.gold}`, borderRadius: 7, padding: '5px 12px', fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: c.gold, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {user.username}
              </button>
            : <button onClick={openAuth} data-testid="nav-signin"
                style={{ background: `linear-gradient(135deg,${c.gold},${c.goldDim})`, color: c.onGold, border: 'none', borderRadius: 7, padding: '7px 15px', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Sign In
              </button>}
          <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu"
            style={{ background: menuOpen ? c.goldSoft : 'none', border: `1px solid ${c.border}`, borderRadius: 7, width: 32, height: 30, cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 14, display: 'flex', flexDirection: 'column', gap: 3, margin: '0 auto' }}>
              <span style={{ height: 1.5, background: c.text, borderRadius: 1 }} />
              <span style={{ height: 1.5, background: c.text, borderRadius: 1 }} />
              <span style={{ height: 1.5, background: c.text, borderRadius: 1 }} />
            </div>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div style={{ position: 'sticky', top: 52, zIndex: 99, background: c.bg, borderBottom: `1px solid ${c.border}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 12px 24px rgba(0,0,0,0.25)' }}>
          {visibleNav.map(n => navBtn(n, true))}
        </div>
      )}

      <TransitionedRoutes user={user} onShowAuth={openAuth} onLogout={handleLogout} />

      <footer style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${c.border}`, padding: '18px clamp(16px,4vw,40px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 56, background: c.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Logo size={20} />
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: c.gold }}>Skill Exchange</span>
        </div>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, textAlign: 'center' }}>Every skill ships with proof it works</span>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted }}>skillexchange.tapdot.org</span>
      </footer>
    </>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem(THEME_KEY) !== 'light');
  const [fx] = useState(detectFx);
  useEffect(() => { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); }, [isDark]);
  const c = isDark ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ c, isDark, setIsDark, fx }}>
      <div className={fx === 'lite' ? 'fx-lite' : undefined} style={{ background: c.bg, color: c.text, minHeight: '100vh', transition: 'background 0.3s' }}>
        <GlobalStyles />
        <Shell />
      </div>
    </ThemeContext.Provider>
  );
}
