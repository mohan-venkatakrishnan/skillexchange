import { useState, useRef } from 'react';
import Logo from './Logo.jsx';
import { Ic } from './Icons.jsx';
import { signIn, signUp, confirmSignUp, signInWithGoogle } from '../lib/auth.js';
import { checkUsername } from '../lib/api.js';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function AuthModal({ onClose, onLogin, T }) {
  const [tab,setTab]=useState("signin");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [uname,setUname]=useState("");
  const [unameStatus,setUnameStatus]=useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [needsConfirm,setNeedsConfirm]=useState(false);
  const [code,setCode]=useState("");
  const checkTimer=useRef(null);

  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};

  const onUnameChange=(v)=>{
    const val=v.toLowerCase().trim();
    setUname(val);
    setError("");
    clearTimeout(checkTimer.current);
    if(!val){setUnameStatus(null);return;}
    if(!USERNAME_RE.test(val)){setUnameStatus('invalid');return;}
    setUnameStatus('checking');
    checkTimer.current=setTimeout(async()=>{
      try{
        const {available}=await checkUsername(val);
        setUnameStatus(available?'available':'taken');
      }catch{setUnameStatus(null);/* availability re-checked server-side at signup */}
    },350);
  };

  const submit=async()=>{
    setError("");
    if(tab==="signup"){
      if(unameStatus==='invalid'||!USERNAME_RE.test(uname)){setError("Username: 3-24 chars, lowercase letters, numbers, underscores.");return;}
      if(unameStatus==='taken'){setError("That username is taken.");return;}
    }
    if(!email||!pw){setError("Email and password are required.");return;}
    setBusy(true);
    try{
      const session = tab==="signin"
        ? await signIn({email,password:pw})
        : await signUp({username:uname,email,password:pw});
      onLogin(session);
    }catch(e){
      if(e.code==='UserNotConfirmedException'){setNeedsConfirm(true);}
      else setError(friendlyAuthError(e));
    }finally{setBusy(false);}
  };

  const submitConfirm=async()=>{
    setBusy(true);setError("");
    try{
      await confirmSignUp({email,code});
      const session=await signIn({email,password:pw});
      onLogin(session);
    }catch(e){setError(friendlyAuthError(e));}
    finally{setBusy(false);}
  };

  const unameHint = unameStatus==='checking'?{t:"Checking availability…",c:T.muted}
    : unameStatus==='available'?{t:"✓ Available",c:T.green}
    : unameStatus==='taken'?{t:"✗ Taken",c:T.coral}
    : unameStatus==='invalid'?{t:"3-24 chars: a-z, 0-9, _",c:T.coral}
    : null;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:18,padding:32,width:360,maxWidth:"92vw",boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><Logo size={26} T={T}/><h2 style={{fontFamily:"Playfair Display",fontSize:19,color:T.text,margin:0}}>{needsConfirm?"Confirm your email":tab==="signin"?"Welcome back":"Join Skill Exchange"}</h2></div>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer"}}><Ic.X s={16} c={T.muted}/></button>
        </div>

        {needsConfirm ? (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <p style={{fontFamily:"Inter",fontSize:12,color:T.muted,margin:0,lineHeight:1.5}}>We emailed a confirmation code to <span style={{color:T.text}}>{email}</span>.</p>
            <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Confirmation code" style={inp}/>
            {error&&<p style={{fontFamily:"Inter",fontSize:12,color:T.coral,margin:0}}>{error}</p>}
            <button disabled={busy} onClick={submitConfirm} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:busy?"wait":"pointer",opacity:busy?0.7:1}}>
              {busy?"Confirming…":"Confirm & Sign In"}
            </button>
          </div>
        ) : (
          <>
            <button onClick={()=>{signInWithGoogle();/* mock mode resolves synchronously */const s=JSON.parse(localStorage.getItem('se_session')||'null');if(s?.mock)onLogin(s);}} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:T.elevated,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:"11px",fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,cursor:"pointer",marginBottom:14}}>
              <Ic.Google s={16}/> Continue with Google
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{flex:1,height:1,background:T.borderSub}}/><span style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>or</span><div style={{flex:1,height:1,background:T.borderSub}}/>
            </div>
            <div style={{display:"flex",gap:0,marginBottom:14,background:T.elevated,borderRadius:8,padding:3}}>
              {["signin","signup"].map(t=><button key={t} onClick={()=>{setTab(t);setError("");}} style={{flex:1,background:tab===t?T.surface:"transparent",border:"none",borderRadius:6,padding:"7px",fontFamily:"Inter",fontSize:12,fontWeight:tab===t?600:400,color:tab===t?T.text:T.muted,cursor:"pointer"}}>{t==="signin"?"Sign In":"Sign Up"}</button>)}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {tab==="signup"&&(
                <div>
                  <input value={uname} onChange={e=>onUnameChange(e.target.value)} placeholder="Choose a unique username" style={inp} data-testid="signup-username"/>
                  {unameHint&&<p style={{fontFamily:"Inter",fontSize:11,color:unameHint.c,margin:"5px 2px 0"}}>{unameHint.t}</p>}
                </div>
              )}
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={inp} data-testid="auth-email"/>
              <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="Password" type="password" style={inp} data-testid="auth-password" onKeyDown={e=>e.key==='Enter'&&submit()}/>
              {error&&<p style={{fontFamily:"Inter",fontSize:12,color:T.coral,margin:0}} data-testid="auth-error">{error}</p>}
              <button disabled={busy} onClick={submit} data-testid="auth-submit" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:busy?"wait":"pointer",marginTop:2,opacity:busy?0.7:1}}>
                {busy?(tab==="signin"?"Signing in…":"Creating account…"):(tab==="signin"?"Sign In":"Create Account")}
              </button>
            </div>
            {tab==="signup"&&<p style={{fontFamily:"Inter",fontSize:11,color:T.muted,textAlign:"center",margin:"12px 0 0"}}>Username is permanent and must be unique.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function friendlyAuthError(e) {
  const code = e.code || '';
  if (code.includes('NotAuthorized')) return 'Wrong email or password.';
  if (code.includes('UsernameExists')) return 'An account with this email already exists. Sign in instead.';
  if (code.includes('InvalidPassword')) return 'Password needs 8+ characters with upper, lower, and a number.';
  if (code.includes('UserNotFound')) return 'No account found with that email. Sign up instead.';
  if (code.includes('CodeMismatch')) return "That code didn't match. Check the email and try again.";
  if (code.includes('LimitExceeded') || code.includes('TooManyRequests')) return 'Too many attempts. Wait a minute and try again.';
  return e.message || 'Sign-in failed. Please try again.';
}
