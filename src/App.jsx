import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { DARK, LIGHT, FONTS } from './theme.js';
import Logo from './components/Logo.jsx';
import { Ic } from './components/Icons.jsx';
import ParallaxBg from './components/ParallaxBg.jsx';
import AuthModal from './components/AuthModal.jsx';
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

const NAV=[
  {path:"/",label:"Home",pub:true},
  {path:"/marketplace",label:"Marketplace",pub:true},
  {path:"/create",label:"Create a Skill",pub:true},
  {path:"/leaderboard",label:"Leaderboard",pub:true},
  {path:"/verify",label:"Get Verified",pub:true},
  {path:"/library",label:"My Library",pub:false},
  {path:"/profile",label:"My Profile",pub:false},
];

const THEME_KEY='se_theme';

// SPA preserves scroll across route changes — force top on navigation.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AuthCallback({ T }) {
  const nav = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) { nav('/', { replace: true }); return; }
    handleOAuthCallback(code).then(
      () => nav('/', { replace: true }),
      e => setError(e.message),
    );
  }, [nav]);
  return (
    <div style={{padding:"80px 20px",textAlign:"center",fontFamily:"Inter",color:T.muted,position:"relative",zIndex:1}}>
      {error?<>
        <p style={{color:T.coral}}>{error}</p>
        <button onClick={()=>nav('/')} style={{background:"none",border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"8px 20px",cursor:"pointer",fontFamily:"Inter"}}>Back to Home</button>
      </>:"Signing you in…"}
    </div>
  );
}

export default function App() {
  const [dark,setDark]=useState(()=>localStorage.getItem(THEME_KEY)!=='light');
  const T=dark?DARK:LIGHT;
  const [user,setUser]=useState(()=>getSession());
  const [showAuth,setShowAuth]=useState(false);
  const [pendingPath,setPendingPath]=useState(null);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const nav=useNavigate();
  const location=useLocation();

  useEffect(()=>{localStorage.setItem(THEME_KEY,dark?'dark':'light');},[dark]);
  useEffect(()=>{setMobileMenuOpen(false);},[location.pathname]);

  // One global auth event: session cleared anywhere (401, sign-out) → UI stands down.
  useEffect(()=>{
    const sync=()=>setUser(getSession());
    window.addEventListener(AUTH_EVENT,sync);
    window.addEventListener('storage',sync);
    return ()=>{window.removeEventListener(AUTH_EVENT,sync);window.removeEventListener('storage',sync);};
  },[]);

  const handleLogin=(session)=>{
    setUser(session);
    setShowAuth(false);
    if(pendingPath){nav(pendingPath);setPendingPath(null);}
  };
  const handleLogout=()=>{signOut();setUser(null);nav('/');};
  const requireAuthNav=(path)=>{
    if(user){nav(path);return;}
    setPendingPath(path);
    setShowAuth(true);
  };

  const active=location.pathname.startsWith('/skills/')||location.pathname.startsWith('/u/')?'/marketplace':location.pathname;
  const visibleNav=NAV.filter(n=>n.pub||user);

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text}}>
      <style>{FONTS}</style>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;overflow-x:clip;}
        input:focus,textarea:focus,select:focus{outline:none;border-color:${T.gold}!important;}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        .nav-desktop-links{display:flex;gap:1px;flex:1;overflow-x:auto;min-width:0;}
        .nav-hamburger{display:none;}
        .nav-brand-text{display:inline;}
        @media(max-width:760px){
          .nav-desktop-links{display:none!important;}
          .nav-hamburger{display:flex!important;}
        }
        @media(max-width:420px){
          .nav-brand-text{display:none;}
        }
      `}</style>

      <ScrollToTop/>
      <ParallaxBg T={T}/>

      {showAuth&&<AuthModal onClose={()=>{setShowAuth(false);setPendingPath(null);}} onLogin={handleLogin} T={T}/>}

      {/* Nav */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:dark?"#141414":"#ffffff",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 clamp(12px,3vw,20px)",height:52,gap:8}}>
        <button onClick={()=>nav("/")} style={{background:"none",border:"none",cursor:"pointer",padding:0,marginRight:8,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <Logo size={26} T={T}/>
          <span className="nav-brand-text" style={{fontFamily:"Playfair Display",fontSize:15,fontWeight:700,color:T.gold,whiteSpace:"nowrap"}}>Skill Exchange</span>
        </button>

        <div className="nav-desktop-links">
          {visibleNav.map(n=>(
            <button key={n.path} onClick={()=>n.pub?nav(n.path):requireAuthNav(n.path)} style={{background:active===n.path?T.goldSoft:"transparent",border:"none",borderRadius:6,padding:"6px 11px",fontFamily:"Inter",fontSize:12,fontWeight:active===n.path?600:400,color:active===n.path?T.gold:T.muted,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{n.label}</button>
          ))}
        </div>

        <div style={{display:"flex",gap:8,alignItems:"center",marginLeft:"auto",flexShrink:0}}>
          <button onClick={()=>setDark(d=>!d)} aria-label="Toggle theme" style={{background:"none",border:`1px solid ${T.borderSub}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}}>
            {dark?<Ic.Sun s={13} c={T.muted}/>:<Ic.Moon s={13} c={T.muted}/>}
          </button>
          {user
            ?<button onClick={()=>nav("/profile")} data-testid="nav-user" style={{background:T.goldSoft,border:`1px solid ${T.gold}`,borderRadius:6,padding:"5px 12px",fontFamily:"Inter",fontWeight:600,fontSize:12,color:T.gold,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{user.username}</button>
            :<button onClick={()=>setShowAuth(true)} data-testid="nav-signin" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontFamily:"Inter",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>Sign In</button>
          }
          <button className="nav-hamburger" onClick={()=>setMobileMenuOpen(o=>!o)} style={{background:mobileMenuOpen?T.goldSoft:"none",border:`1px solid ${T.borderSub}`,borderRadius:6,width:32,height:30,cursor:"pointer",alignItems:"center",justifyContent:"center",flexShrink:0}} aria-label="Menu">
            <div style={{width:14,display:"flex",flexDirection:"column",gap:3,margin:"0 auto"}}>
              <span style={{height:1.5,background:T.text,borderRadius:1}}/>
              <span style={{height:1.5,background:T.text,borderRadius:1}}/>
              <span style={{height:1.5,background:T.text,borderRadius:1}}/>
            </div>
          </button>
        </div>
      </nav>

      {mobileMenuOpen&&(
        <div style={{position:"sticky",top:52,zIndex:99,background:dark?"#141414":"#ffffff",borderBottom:`1px solid ${T.border}`,padding:"8px 12px",display:"flex",flexDirection:"column",gap:2,boxShadow:"0 12px 24px rgba(0,0,0,0.2)"}}>
          {visibleNav.map(n=>(
            <button key={n.path} onClick={()=>n.pub?nav(n.path):requireAuthNav(n.path)} style={{background:active===n.path?T.goldSoft:"transparent",border:"none",borderRadius:6,padding:"11px 12px",fontFamily:"Inter",fontSize:14,fontWeight:active===n.path?600:400,color:active===n.path?T.gold:T.text,cursor:"pointer",textAlign:"left",width:"100%"}}>{n.label}</button>
          ))}
        </div>
      )}

      {/* Pages */}
      <Routes>
        <Route path="/" element={<HomePage T={T} user={user} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/marketplace" element={<MarketplacePage T={T}/>}/>
        <Route path="/skills/:id" element={<SkillDetailPage T={T} user={user} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/create" element={<CreateSkillPage T={T} user={user} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/publish" element={user?<PublishPage T={T}/>:<AuthGate T={T} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/leaderboard" element={<LeaderboardPage T={T}/>}/>
        <Route path="/verify" element={<GetVerifiedPage T={T} user={user} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/library" element={user?<LibraryPage T={T}/>:<AuthGate T={T} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/profile" element={user?<MyProfilePage T={T} user={user} onLogout={handleLogout} onShowAuth={()=>setShowAuth(true)}/>:<AuthGate T={T} onShowAuth={()=>setShowAuth(true)}/>}/>
        <Route path="/u/:username" element={<PublicProfilePage T={T}/>}/>
        <Route path="/auth/callback" element={<AuthCallback T={T}/>}/>
        <Route path="/admin" element={<AdminPage T={T}/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>

      {/* Footer */}
      <div style={{position:"relative",zIndex:1,borderTop:`1px solid ${T.border}`,padding:"16px clamp(16px,4vw,40px)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:48,background:dark?"#141414":"#ffffff"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}><Logo size={20} T={T}/><span style={{fontFamily:"Playfair Display",fontSize:13,fontWeight:700,color:T.gold,whiteSpace:"nowrap"}}>Skill Exchange</span></div>
        <span style={{fontFamily:"Inter",fontSize:11,color:T.muted,textAlign:"center"}}>Skill Exchange verifies this · Every skill ships with proof it works</span>
        <span style={{fontFamily:"Inter",fontSize:11,color:T.muted,flexShrink:0}}>skillexchange.tapdot.org</span>
      </div>
    </div>
  );
}

// Signed-out visit to a protected route: honest gate, not a blank page.
function AuthGate({ T, onShowAuth }) {
  return (
    <div style={{position:"relative",zIndex:1,minHeight:"calc(100vh - 52px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{textAlign:"center",fontFamily:"Inter"}}>
        <p style={{color:T.muted,fontSize:14,marginBottom:16}}>Sign in to view this page.</p>
        <button onClick={onShowAuth} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px 28px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Sign In</button>
      </div>
    </div>
  );
}
