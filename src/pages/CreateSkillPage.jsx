import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrap } from '../components/Shared.jsx';
import { CATEGORIES, PH, PT } from '../data/constants.js';

export default function CreateSkillPage({ T, user, onShowAuth }) {
  const nav = useNavigate();
  const [platform,setPlatform]=useState("Claude");
  const [category,setCategory]=useState("Coding");
  const [desc,setDesc]=useState("");
  const [ts,setTs]=useState("");
  const [copied,setCopied]=useState(false);
  const [generated,setGenerated]=useState(false);
  const prompt=PT[platform](category,desc,ts);
  const handleCopy=()=>{navigator.clipboard.writeText(prompt).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};
  const lbl={fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"};
  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:780,margin:"0 auto"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:26,color:T.text,margin:"0 0 6px"}}>Create a Skill</h1>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,marginBottom:32,lineHeight:1.6}}>Not sure how to write a SKILL.md? Choose your AI platform and we'll generate a prompt you can paste to create one instantly.</p>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:22,marginBottom:24}}>
          <h2 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,margin:"0 0 12px"}}>What is a skill file?</h2>
          <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,lineHeight:1.7,margin:"0 0 14px"}}>A skill file (SKILL.md) is a structured instruction document you paste at the start of an AI session. It tells the AI your tech stack, coding conventions, patterns to follow, and mistakes to avoid — so every session starts with full context.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
            {[{icon:"⚡",title:"Saves time",desc:"No more re-explaining your stack"},{icon:"🎯",title:"Consistent output",desc:"AI follows your exact patterns"},{icon:"💰",title:"Earn from it",desc:"Get paid for every download"}].map(c=>(
              <div key={c.title} style={{background:T.elevated,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:20,marginBottom:6}}>{c.icon}</div>
                <div style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,marginBottom:4}}>{c.title}</div>
                <div style={{fontFamily:"Inter",fontSize:12,color:T.muted,lineHeight:1.5}}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:24,marginBottom:24}}>
          <h2 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,margin:"0 0 20px"}}>✦ Skill Prompt Generator</h2>
          <div style={{marginBottom:20}}>
            <label style={lbl}>Step 1 — Choose your AI platform</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {Object.keys(PH).map(p=>(
                <button key={p} onClick={()=>setPlatform(p)} style={{background:platform===p?T.goldSoft:T.elevated,border:`1.5px solid ${platform===p?T.gold:T.borderSub}`,color:platform===p?T.gold:T.muted,borderRadius:8,padding:"8px 16px",fontFamily:"Inter",fontSize:13,fontWeight:platform===p?600:400,cursor:"pointer",transition:"all 0.15s"}}>{p}</button>
              ))}
            </div>
            {platform&&<p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:8,lineHeight:1.5}}>💡 {PH[platform].note}</p>}
          </div>
          <div style={{marginBottom:20}}>
            <label style={lbl}>Step 2 — Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={{...inp,cursor:"pointer",maxWidth:260}}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div style={{marginBottom:20}}>
            <label style={lbl}>Step 3 — What does your skill do? <span style={{color:T.muted,fontWeight:400,textTransform:"none"}}>one line</span></label>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder={`e.g. "builds Chrome extensions with MV3 and on-device AI"`} style={inp}/>
          </div>
          <div style={{marginBottom:24}}>
            <label style={lbl}>Step 4 — Estimated time saved (hours)</label>
            <input type="number" min="0.5" step="0.5" value={ts} onChange={e=>setTs(e.target.value)} placeholder="e.g. 6" style={{...inp,maxWidth:140}}/>
          </div>
          <button onClick={()=>setGenerated(true)} data-testid="generate-prompt" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"12px 28px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:`0 4px 16px ${T.gold}22`}}>Generate Prompt ✦</button>
        </div>
        {generated&&(
          <>
            <div style={{background:T.surface,border:`1px solid ${T.gold}40`,borderRadius:14,overflow:"hidden",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${T.borderSub}`,background:T.goldSoft,flexWrap:"wrap",gap:10}}>
                <div>
                  <span style={{fontFamily:"Inter",fontSize:12,fontWeight:700,color:T.gold}}>Your {platform} prompt</span>
                  <span style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginLeft:10}}>Paste into {PH[platform].name}</span>
                </div>
                <button onClick={handleCopy} style={{background:copied?T.green:T.gold,color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontFamily:"Inter",fontSize:12,fontWeight:700,cursor:"pointer",transition:"background 0.2s",minWidth:70}}>{copied?"✓ Copied":"Copy"}</button>
              </div>
              <pre style={{margin:0,padding:"18px 20px",fontFamily:"JetBrains Mono",fontSize:12,color:T.text,lineHeight:1.7,overflowX:"auto",whiteSpace:"pre-wrap",wordBreak:"break-word",background:"transparent"}}>{prompt}</pre>
            </div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:22}}>
              <h3 style={{fontFamily:"Playfair Display",fontSize:16,color:T.text,margin:"0 0 16px"}}>What to do next</h3>
              {[{n:"01",t:`Copy the prompt`,d:`Paste it into a new ${platform} session.`},{n:"02",t:"Run the prompt",d:`${PH[platform].name} will generate your SKILL.md. Tweak any specifics.`},{n:"03",t:"Save your SKILL.md",d:"Save the output and test it in a real AI session."},{n:"04",t:"Publish and earn",d:"Publish on Skill Exchange with a proof of concept project URL."}].map((s,i)=>(
                <div key={i} style={{display:"flex",gap:14,marginBottom:i<3?14:0,alignItems:"flex-start"}}>
                  <span style={{fontFamily:"Inter",fontSize:11,fontWeight:700,color:T.gold,marginTop:1,flexShrink:0}}>{s.n}</span>
                  <div><div style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,marginBottom:2}}>{s.t}</div><div style={{fontFamily:"Inter",fontSize:12,color:T.muted,lineHeight:1.5}}>{s.d}</div></div>
                </div>
              ))}
              <div style={{marginTop:20,display:"flex",gap:10,flexWrap:"wrap"}}>
                <button onClick={()=>{user?nav("/publish"):onShowAuth();}} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px 22px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Publish Your Skill →</button>
                <button onClick={()=>nav("/marketplace")} style={{background:"transparent",color:T.muted,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:"11px 22px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Browse skills</button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageWrap>
  );
}
