import { useState } from 'react';
import { PageWrap, VerifiedStamp } from '../components/Shared.jsx';
import { CATEGORIES, PLATFORMS } from '../data/constants.js';
import * as api from '../lib/api.js';

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2MB, matches the UI copy

export default function PublishPage({ T }) {
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({title:"",category:"",description:"",usage:"",platforms:[],price:"free",amount:"",pocUrl:"",timeSaved:"",file:null,screenshot:null});
  const [done,setDone]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const set=(k,v)=>{setForm(f=>({...f,[k]:v}));setError("");};
  const toggleP=p=>set("platforms",form.platforms.includes(p)?form.platforms.filter(x=>x!==p):[...form.platforms,p]);
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};
  const lbl={fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"};

  const validateStep1=()=>{
    if(!form.title.trim()) return "Skill title is required.";
    if(!form.category) return "Pick a category.";
    if(!form.description.trim()) return "Description is required.";
    if(!form.usage.trim()) return "“How to use this skill” is required.";
    if(!form.timeSaved||Number(form.timeSaved)<=0) return "Estimated time saved is required.";
    if(form.platforms.length===0) return "Select at least one platform.";
    if(!form.file) return "Upload your SKILL.md file.";
    return null;
  };
  const validateStep2=()=>{
    if(!/^https?:\/\/.+\..+/.test(form.pocUrl.trim())) return "A valid project URL is required — proof of concept is enforced.";
    if(!form.screenshot) return "A cover screenshot is required.";
    return null;
  };
  const validateStep3=()=>{
    if(form.price==="paid"&&(!form.amount||Number(form.amount)<1)) return "Paid skills need a price of at least $1.";
    return null;
  };

  const goStep2=()=>{const e=validateStep1();if(e){setError(e);return;}setError("");setStep(2);};
  const goStep3=()=>{const e=validateStep2();if(e){setError(e);return;}setError("");setStep(3);};

  const submit=async()=>{
    const e=validateStep3();if(e){setError(e);return;}
    setBusy(true);setError("");
    try{
      await api.publishSkill(form);
      setDone(true);
    }catch(err){setError(err.message||"Publishing failed. Your form is intact — try again.");}
    finally{setBusy(false);}
  };

  const onScreenshot=(file)=>{
    if(!file)return;
    if(!/^image\/(png|jpeg)$/.test(file.type)){setError("Screenshot must be a PNG or JPG.");return;}
    if(file.size>MAX_SCREENSHOT_BYTES){setError("Screenshot is over 2MB — export a smaller one.");return;}
    set("screenshot",file);
  };

  if(done) return (
    <PageWrap>
      <div style={{padding:"80px clamp(16px,4vw,40px)",textAlign:"center"}}>
        <div style={{marginBottom:20,display:"flex",justifyContent:"center"}}><VerifiedStamp size={56} T={T}/></div>
        <h2 style={{fontFamily:"Playfair Display",fontSize:26,color:T.text,marginBottom:12}}>Skill Submitted!</h2>
        <p style={{fontFamily:"Inter",fontSize:14,color:T.muted,marginBottom:24}}>Your skill is under review. We'll verify the proof of concept and notify you within 48 hours.</p>
        <button onClick={()=>{setDone(false);setStep(1);setForm({title:"",category:"",description:"",usage:"",platforms:[],price:"free",amount:"",pocUrl:"",timeSaved:"",file:null,screenshot:null});}} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:8,padding:"10px 24px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Publish Another</button>
      </div>
    </PageWrap>
  );

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:620,margin:"0 auto"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:24,color:T.text,margin:"0 0 4px"}}>Publish a Skill</h1>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,marginBottom:24}}>Share your workflow. Earn from every download.</p>
        <div style={{display:"flex",gap:8,marginBottom:28}}>
          {["Details","Proof of Concept","Pricing"].map((s,i)=>(
            <div key={s} style={{flex:1,textAlign:"center"}}>
              <div style={{height:3,borderRadius:2,marginBottom:5,background:step>i+1?T.green:step===i+1?T.gold:T.borderSub}}/>
              <span style={{fontFamily:"Inter",fontSize:11,color:step===i+1?T.gold:T.muted}}>{s}</span>
            </div>
          ))}
        </div>

        {error&&<p data-testid="publish-error" style={{fontFamily:"Inter",fontSize:12,color:T.coral,background:T.coralSoft,border:`1px solid ${T.coral}40`,borderRadius:8,padding:"9px 13px",margin:"0 0 16px"}}>{error}</p>}

        {step===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div><label style={lbl}>Skill Title *</label><input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. PDF Generation Skill" style={inp} data-testid="pub-title"/></div>
            <div><label style={lbl}>Category *</label><select value={form.category} onChange={e=>set("category",e.target.value)} style={{...inp,cursor:"pointer"}} data-testid="pub-category"><option value="">Select category</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label style={lbl}>Description *</label><textarea value={form.description} onChange={e=>set("description",e.target.value)} placeholder="What does this skill do?" style={{...inp,minHeight:80,resize:"vertical"}} data-testid="pub-description"/></div>
            <div><label style={lbl}>How to use this skill * <span style={{color:T.coral}}>required</span></label><textarea value={form.usage} onChange={e=>set("usage",e.target.value)} placeholder="Step-by-step instructions..." style={{...inp,minHeight:70,resize:"vertical"}} data-testid="pub-usage"/></div>
            <div><label style={lbl}>Estimated time saved (hours) *</label><input type="number" value={form.timeSaved} onChange={e=>set("timeSaved",e.target.value)} placeholder="e.g. 6" min="0.5" step="0.5" style={{...inp,maxWidth:160}} data-testid="pub-timesaved"/><p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:5}}>Shown as "~{form.timeSaved||"?"}h saved · seller estimate" on your listing.</p></div>
            <div><label style={lbl}>Works with *</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{PLATFORMS.map(p=><button key={p} onClick={()=>toggleP(p)} style={{background:form.platforms.includes(p)?T.goldSoft:"transparent",border:`1px solid ${form.platforms.includes(p)?T.gold:T.borderSub}`,color:form.platforms.includes(p)?T.gold:T.muted,borderRadius:6,padding:"6px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer"}}>{p}</button>)}</div></div>
            <div><label style={lbl}>Upload SKILL.md *</label>
              <div style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"22px",textAlign:"center",cursor:"pointer"}} onClick={()=>document.getElementById("sf").click()}>
                <input id="sf" type="file" accept=".md,text/markdown" style={{display:"none"}} onChange={e=>set("file",e.target.files[0])} data-testid="pub-file"/>
                <div style={{fontFamily:"Inter",fontSize:13,color:form.file?T.green:T.muted}}>{form.file?`✓ ${form.file.name}`:"Click to upload SKILL.md"}</div>
              </div>
            </div>
            <button onClick={goStep2} data-testid="pub-continue-1" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer"}}>Continue →</button>
          </div>
        )}

        {step===2&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:T.goldSoft,border:`1px solid ${T.gold}35`,borderRadius:10,padding:14}}><h3 style={{fontFamily:"Inter",fontSize:13,fontWeight:700,color:T.gold,margin:"0 0 6px"}}>Proof of concept is required</h3><p style={{fontFamily:"Inter",fontSize:12,color:T.muted,margin:0,lineHeight:1.5}}>Every skill must ship with evidence it works. Buyers see the real project your skill powered.</p></div>
            <div><label style={lbl}>Project URL * <span style={{color:T.coral}}>enforced</span></label><input value={form.pocUrl} onChange={e=>set("pocUrl",e.target.value)} placeholder="https://yourproject.com" style={{...inp,fontFamily:"JetBrains Mono",fontSize:12}} data-testid="pub-pocurl"/></div>
            <div><label style={lbl}>Cover Screenshot *</label>
              <div style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"28px",textAlign:"center",cursor:"pointer"}} onClick={()=>document.getElementById("ss").click()}>
                <input id="ss" type="file" accept="image/png,image/jpeg" style={{display:"none"}} onChange={e=>onScreenshot(e.target.files[0])} data-testid="pub-screenshot"/>
                <div style={{fontFamily:"Inter",fontSize:13,color:form.screenshot?T.green:T.muted}}>{form.screenshot?`✓ ${form.screenshot.name}`:"📸 PNG or JPG, max 2MB"}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}><button onClick={()=>{setError("");setStep(1);}} style={{flex:1,background:"transparent",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:8,padding:"10px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>← Back</button><button onClick={goStep3} data-testid="pub-continue-2" style={{flex:2,background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Continue →</button></div>
          </div>
        )}

        {step===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div><label style={lbl}>Pricing</label><div style={{display:"flex",gap:10}}>{["free","paid"].map(p=><button key={p} onClick={()=>set("price",p)} style={{flex:1,background:form.price===p?T.goldSoft:"transparent",border:`1.5px solid ${form.price===p?T.gold:T.borderSub}`,color:form.price===p?T.gold:T.muted,borderRadius:8,padding:"13px",fontFamily:"Inter",fontWeight:600,fontSize:13,cursor:"pointer"}}>{p==="free"?"🆓 Free":"💰 Paid"}</button>)}</div></div>
            {form.price==="paid"&&<div><label style={lbl}>Price (USD) *</label><input type="number" value={form.amount} onChange={e=>set("amount",e.target.value)} placeholder="e.g. 5" min="1" style={inp} data-testid="pub-amount"/>{form.amount&&<p style={{fontFamily:"Inter",fontSize:12,color:T.muted,marginTop:5}}>You earn <span style={{color:T.green}}>${(form.amount*0.9).toFixed(2)}</span> per sale</p>}</div>}
            <div style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:10,padding:14}}>{["Skill submitted for review","Skill Exchange verifies proof of concept","Skill goes live within 48 hours","You get notified and start earning"].map((t,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:i<3?8:0,alignItems:"flex-start"}}><span style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:T.gold,marginTop:1}}>0{i+1}</span><span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{t}</span></div>)}</div>
            <div style={{display:"flex",gap:10}}><button onClick={()=>{setError("");setStep(2);}} style={{flex:1,background:"transparent",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:8,padding:"10px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>← Back</button><button onClick={submit} disabled={busy} data-testid="pub-submit" style={{flex:2,background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:busy?"wait":"pointer",opacity:busy?0.7:1}}>{busy?"Uploading…":"Submit Skill ✦"}</button></div>
          </div>
        )}
      </div>
    </PageWrap>
  );
}
