import { useState, useCallback } from 'react';
import { PageWrap, Loading, ErrorBox } from '../components/Shared.jsx';

// Founder-only superadmin tool (hidden route /admin — not in nav).
// Static credentials, checked server-side on every call; kept in
// sessionStorage only (gone when the tab closes).
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const CREDS_KEY = 'se_admin_creds';

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

export default function AdminPage({ T }) {
  const [loggedIn, setLoggedIn] = useState(() => !!creds());
  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:860,margin:"0 auto"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:24,color:T.text,margin:"0 0 4px"}}>Superadmin</h1>
        <p style={{fontFamily:"Inter",fontSize:12,color:T.muted,marginBottom:24}}>Moderation queue, badges, and jobs. Founder access only.</p>
        {loggedIn ? <Panel T={T} onAuthFail={()=>setLoggedIn(false)}/> : <Login T={T} onOk={()=>setLoggedIn(true)}/>}
      </div>
    </PageWrap>
  );
}

function Login({ T, onOk }) {
  const [u,setU]=useState(""); const [p,setP]=useState("");
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};
  const submit=async()=>{
    setBusy(true);setError("");
    sessionStorage.setItem(CREDS_KEY,JSON.stringify({u,p}));
    try{ await adminFetch('/login',{method:'POST'}); onOk(); }
    catch(e){ setError(e.message); }
    finally{ setBusy(false); }
  };
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:20,maxWidth:360}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input value={u} onChange={e=>setU(e.target.value)} placeholder="Superadmin username" style={inp} data-testid="admin-user"/>
        <input value={p} onChange={e=>setP(e.target.value)} type="password" placeholder="Password" style={inp} data-testid="admin-pass" onKeyDown={e=>e.key==='Enter'&&submit()}/>
        {error&&<p style={{fontFamily:"Inter",fontSize:12,color:T.coral,margin:0}}>{error}</p>}
        <button disabled={busy} onClick={submit} data-testid="admin-login" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:busy?"wait":"pointer"}}>{busy?"Checking…":"Sign In"}</button>
      </div>
    </div>
  );
}

function Panel({ T, onAuthFail }) {
  const [queue,setQueue]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [badgeForm,setBadgeForm]=useState({username:"",badge:"Verified Creator",action:"grant"});
  const inp={background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontFamily:"Inter",fontSize:12,outline:"none"};
  const btn=(color)=>({background:"none",border:`1px solid ${color}`,color,borderRadius:6,padding:"5px 12px",fontFamily:"Inter",fontSize:11,cursor:"pointer"});

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{ setQueue(await adminFetch('/queue')); }
    catch(e){ setError(e.message); if(e.message.includes('credentials')) onAuthFail(); }
    finally{ setLoading(false); }
  },[onAuthFail]);

  const act=async(path,label)=>{
    setNotice("");
    try{ await adminFetch(path,{method:'POST'}); setNotice(`✓ ${label}`); load(); }
    catch(e){ setError(e.message); }
  };

  const setBadge=async()=>{
    setNotice("");setError("");
    try{
      await adminFetch('/badges',{method:'POST',body:JSON.stringify(badgeForm)});
      setNotice(`✓ ${badgeForm.action}ed "${badgeForm.badge}" for ${badgeForm.username}`);
    }catch(e){ setError(e.message); }
  };

  if(queue===null&&!loading&&!error) load();

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button onClick={load} style={btn(T.gold)}>↻ Refresh queue</button>
        <button onClick={()=>act('/run-badges-job','badges job triggered')} style={btn(T.green)} data-testid="run-badges">▶ Run badges job now</button>
        <button onClick={()=>{sessionStorage.removeItem(CREDS_KEY);onAuthFail();}} style={btn(T.muted)}>Sign out</button>
      </div>
      {notice&&<p style={{fontFamily:"Inter",fontSize:12,color:T.green,margin:0}}>{notice}</p>}
      {error&&<ErrorBox T={T} message={error} onRetry={load}/>}
      {loading&&<Loading T={T} verb="Loading queue"/>}

      {queue&&<>
        <section>
          <h2 style={{fontFamily:"Playfair Display",fontSize:17,color:T.text,margin:"0 0 10px"}}>Pending skills ({queue.skills.length})</h2>
          {queue.skills.length===0&&<p style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>Queue is empty.</p>}
          {queue.skills.map(s=>(
            <div key={s.skillId} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:10,padding:14,marginBottom:8,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:220}}>
                <div style={{fontFamily:"Inter",fontWeight:600,fontSize:13,color:T.text}}>{s.title} <span style={{color:T.muted,fontWeight:400}}>· {s.category} · {s.priceCents?`$${s.priceCents/100}`:'Free'}</span></div>
                <div style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>by {s.sellerUsername} · POC: <a href={s.pocUrl} target="_blank" rel="noreferrer" style={{color:T.gold}}>{s.pocUrl}</a></div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>act(`/skills/${s.skillId}/approve`,`approved "${s.title}"`)} style={btn(T.green)}>Approve</button>
                <button onClick={()=>act(`/skills/${s.skillId}/reject`,`rejected "${s.title}"`)} style={btn(T.coral)}>Reject</button>
                <button onClick={()=>act(`/skills/${s.skillId}/flag`,`flagged "${s.title}"`)} style={btn(T.muted)}>Flag</button>
              </div>
            </div>
          ))}
        </section>

        <section>
          <h2 style={{fontFamily:"Playfair Display",fontSize:17,color:T.text,margin:"0 0 10px"}}>Verification applications ({queue.applications.length})</h2>
          {queue.applications.length===0&&<p style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>No pending applications.</p>}
          {queue.applications.map(a=>(
            <div key={a.applicationId} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:10,padding:14,marginBottom:8,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:220}}>
                <div style={{fontFamily:"Inter",fontWeight:600,fontSize:13,color:T.text}}>@{a.username}</div>
                <div style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>Skill: <a href={a.skillUrl} target="_blank" rel="noreferrer" style={{color:T.gold}}>{a.skillUrl}</a>{a.note?` · "${a.note}"`:""}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>act(`/verify/${a.applicationId}/approve`,`verified @${a.username}`)} style={btn(T.green)}>Approve</button>
                <button onClick={()=>act(`/verify/${a.applicationId}/reject`,`rejected @${a.username}`)} style={btn(T.coral)}>Reject</button>
              </div>
            </div>
          ))}
        </section>

        <section>
          <h2 style={{fontFamily:"Playfair Display",fontSize:17,color:T.text,margin:"0 0 10px"}}>Badges</h2>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={badgeForm.username} onChange={e=>setBadgeForm(f=>({...f,username:e.target.value}))} placeholder="username" style={inp}/>
            <select value={badgeForm.badge} onChange={e=>setBadgeForm(f=>({...f,badge:e.target.value}))} style={{...inp,cursor:"pointer"}}>
              <option>Verified Creator</option><option>Top Seller</option>
            </select>
            <select value={badgeForm.action} onChange={e=>setBadgeForm(f=>({...f,action:e.target.value}))} style={{...inp,cursor:"pointer"}}>
              <option value="grant">grant</option><option value="revoke">revoke</option>
            </select>
            <button onClick={setBadge} style={btn(T.gold)}>Apply</button>
          </div>
        </section>
      </>}
    </div>
  );
}
