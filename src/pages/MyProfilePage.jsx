import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SkillCard from '../components/SkillCard.jsx';
import { PageWrap, VerifiedStamp, SellerBdg, Loading, ErrorBox } from '../components/Shared.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function MyProfilePage({ T, user, onLogout, onShowAuth }) {
  const nav = useNavigate();
  const [showLogout,setShowLogout]=useState(false);
  const me = useFetch(() => api.getMe(), [user?.username]);

  if (me.loading) return <PageWrap><Loading T={T} verb="Loading your profile"/></PageWrap>;
  if (me.error) return <PageWrap><ErrorBox T={T} message={me.error} onRetry={me.retry}/></PageWrap>;
  const profile = me.data;
  const totalDL=(profile.skills||[]).reduce((s,x)=>s+x.downloads,0);
  const avgR=(profile.skills||[]).length?((profile.skills.reduce((s,x)=>s+x.rating,0)/profile.skills.length).toFixed(1)):"—";

  if(showLogout) return (
    <PageWrap>
      <div style={{padding:"60px clamp(16px,4vw,40px)",maxWidth:440,margin:"0 auto",textAlign:"center"}}>
        <div style={{width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display",fontSize:28,fontWeight:700,color:"#fff",margin:"0 auto 16px"}}>{profile.name[0]}</div>
        <h2 style={{fontFamily:"Playfair Display",fontSize:22,color:T.text,margin:"0 0 4px"}}>{profile.name}</h2>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:"0 0 32px"}}>@{profile.username}</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>setShowLogout(false)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:10,padding:"13px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Ic.User s={16} c={T.text}/> Continue as {profile.username}
          </button>
          <button onClick={()=>{onLogout();setShowLogout(false);onShowAuth();}} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.muted,borderRadius:10,padding:"13px",fontFamily:"Inter",fontWeight:500,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Ic.User s={16} c={T.muted}/> Switch Account
          </button>
          <button onClick={()=>{onLogout();setShowLogout(false);}} data-testid="sign-out" style={{background:T.coralSoft,border:`1px solid ${T.coral}40`,color:T.coral,borderRadius:10,padding:"13px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Ic.LogOut s={16} c={T.coral}/> Sign Out
          </button>
        </div>
        <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:24}}>Skill Exchange · skillexchange.tapdot.org</p>
      </div>
    </PageWrap>
  );

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:28,flexWrap:"wrap"}}>
          <div style={{width:60,height:60,minWidth:60,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{profile.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
              <h1 style={{fontFamily:"Playfair Display",fontSize:22,color:T.text,margin:0}}>{profile.name}</h1>
              {profile.verified&&<VerifiedStamp size={24} T={T}/>}
            </div>
            <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,margin:"0 0 10px"}}>@{profile.username}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(profile.badges||[]).map(b=><SellerBdg key={b} b={b} T={T}/>)}</div>
          </div>
          <button onClick={()=>setShowLogout(true)} data-testid="account-btn" style={{background:"none",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:8,padding:"7px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <Ic.LogOut s={14} c={T.muted}/> Account
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:28}}>
          {[["Skills",(profile.skills||[]).length],["Downloads",totalDL],["Avg Rating",avgR]].map(([l,v])=>(
            <div key={l} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontFamily:"Inter",fontSize:20,fontWeight:700,color:T.text}}>{v}</div>
              <div style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <h2 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,margin:0}}>My Skills</h2>
          <button onClick={()=>nav("/publish")} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"7px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer"}}>+ Publish New</button>
        </div>
        {(profile.skills||[]).length===0
          ?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No skills published yet.</p>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,marginBottom:24}}>{profile.skills.map(s=><SkillCard key={s.id} skill={s} T={T}/>)}</div>
        }
        <button onClick={()=>nav("/verify")} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:8,padding:"10px 20px",fontFamily:"Inter",fontSize:13,fontWeight:600,cursor:"pointer"}}>✦ Get Verified</button>
      </div>
    </PageWrap>
  );
}
