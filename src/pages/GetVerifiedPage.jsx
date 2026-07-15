import { useState } from 'react';
import { PageWrap, VerifiedStamp } from '../components/Shared.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';

export default function GetVerifiedPage({ T, user, onShowAuth }) {
  const [applied,setApplied]=useState(false);
  const [url,setUrl]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const steps=[{s:"done",l:"Create an account",d:"Sign up and publish at least one skill."},{s:"done",l:"Publish with proof of concept",d:"Your skill must have a live project URL and cover screenshot."},{s:"active",l:"Apply for verification",d:"Submit your best skill and a note about your work."},{s:"pending",l:"Review by Skill Exchange",d:"We manually check your proof of concept within 48 hours."},{s:"pending",l:"Verified badge granted",d:"Your profile and skills show the Verified Creator badge."}];
  const sc={done:T.green,active:T.gold,pending:T.muted};
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};

  const submit=async()=>{
    if(!user){onShowAuth();return;}
    if(!url.trim()){setError("Link your best published skill first.");return;}
    setBusy(true);setError("");
    try{
      await api.applyVerification({skillUrl:url.trim(),note:note.trim()});
      setApplied(true);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  };

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:640,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
          <VerifiedStamp size={44} T={T}/>
          <div>
            <h1 style={{fontFamily:"Playfair Display",fontSize:24,color:T.text,margin:"0 0 4px"}}>Get Verified</h1>
            <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:0}}>Earn the Verified Creator badge and build buyer trust.</p>
          </div>
        </div>
        <div style={{background:T.goldSoft,border:`1px solid ${T.gold}35`,borderRadius:12,padding:18,marginBottom:24}}>
          <h3 style={{fontFamily:"Inter",fontSize:13,fontWeight:700,color:T.gold,margin:"0 0 10px"}}>What verification means</h3>
          {["Your proof of concept has been manually reviewed","Your skill does exactly what it claims","Buyers see the verified badge on your profile","You're eligible for featured placement"].map((t,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:i<3?6:0}}><Ic.Check s={14} c={T.green}/><span style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>{t}</span></div>
          ))}
        </div>
        <h3 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,marginBottom:16}}>Verification progress</h3>
        <div style={{marginBottom:28}}>
          {steps.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:14}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:s.s==="done"?T.green:s.s==="active"?T.goldSoft:T.elevated,border:`2px solid ${sc[s.s]}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {s.s==="done"?<Ic.Check s={13} c="#fff"/>:<span style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:sc[s.s]}}>{i+1}</span>}
                </div>
                {i<4&&<div style={{width:2,height:28,marginTop:2,background:s.s==="done"?T.green:T.borderSub}}/>}
              </div>
              <div style={{paddingBottom:16}}>
                <div style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:s.s==="pending"?T.muted:T.text,marginBottom:3}}>{s.l}</div>
                <div style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        {!applied?(
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:20}}>
            <h3 style={{fontFamily:"Inter",fontSize:14,fontWeight:700,color:T.text,margin:"0 0 16px"}}>Apply for verification</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><label style={{fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Your best skill URL</label><input value={url} onChange={e=>{setUrl(e.target.value);setError("");}} placeholder="Link to your published skill" style={inp} data-testid="verify-url"/></div>
              <div><label style={{fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Note about your work (optional)</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Tell us about the product you built with this skill..." style={{...inp,minHeight:70,resize:"vertical"}}/></div>
              {error&&<p style={{fontFamily:"Inter",fontSize:12,color:T.coral,margin:0}}>{error}</p>}
              <button onClick={submit} disabled={busy} data-testid="verify-submit" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:busy?"wait":"pointer",opacity:busy?0.7:1}}>{busy?"Submitting…":"Submit Application"}</button>
            </div>
          </div>
        ):(
          <div style={{background:T.goldSoft,border:`1px solid ${T.gold}`,borderRadius:12,padding:24,textAlign:"center"}}>
            <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><Ic.Check s={28} c={T.gold}/></div>
            <h3 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,margin:"0 0 8px"}}>Application submitted</h3>
            <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:0}}>We'll review your proof of concept and get back to you within 48 hours.</p>
          </div>
        )}
      </div>
    </PageWrap>
  );
}
