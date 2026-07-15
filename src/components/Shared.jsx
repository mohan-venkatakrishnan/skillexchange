import { Ic } from './Icons.jsx';

// ── VERIFIED STAMP ──
export function VerifiedStamp({ size = 28, T }) {
  return (
    <span style={{display:"inline-flex",flexShrink:0,alignItems:"center",justifyContent:"center",width:size,height:size,minWidth:size,minHeight:size,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,boxShadow:`0 0 0 2px ${T.bg},0 0 0 3.5px ${T.gold}55`,animation:"stampIn 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
      <Ic.Shield s={size*0.55} c={T.bg}/>
    </span>
  );
}

// ── SHARED ──
export function Stars({ rating, count, T }) {
  const r = Number(rating) || 0;
  return (
    <span style={{display:"flex",alignItems:"center",gap:3}}>
      {[1,2,3,4,5].map(i=><Ic.Star key={i} s={11} c={T.gold} filled={i<=Math.round(r)}/>)}
      {count!==undefined&&<span style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginLeft:2}}>{r.toFixed(1)}{count!==""&&` (${count})`}</span>}
    </span>
  );
}

export function Bdg({ icon, label, color, T }) {
  const c=color||T.gold;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${c}16`,border:`1px solid ${c}35`,borderRadius:20,padding:"3px 10px",fontFamily:"Inter",fontSize:10,fontWeight:600,color:c,letterSpacing:"0.04em",textTransform:"uppercase"}}>{icon}{label}</span>;
}

export function SkillBdg({ label, T }) {
  if(!label) return null;
  const c=label.startsWith("#1")?T.gold:label==="Top Rated"?T.green:label==="Most Downloaded"?T.slate:T.coral;
  return <Bdg label={label} color={c} T={T}/>;
}

export function PTag({ p, T }) {
  const colors={Claude:T.gold,ChatGPT:T.green,Gemini:T.slate,Cursor:T.coral,Copilot:"#7aabdc"};
  const c=colors[p]||T.muted;
  return <span style={{fontFamily:"JetBrains Mono",fontSize:10,fontWeight:500,color:c,background:`${c}14`,border:`1px solid ${c}28`,borderRadius:4,padding:"2px 7px"}}>{p}</span>;
}

export function TimeSaved({ hours, T }) {
  if(!hours) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,background:T.goldSoft,border:`1px solid ${T.gold}30`,borderRadius:6,padding:"3px 8px",fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.gold}}>
      <Ic.Clock s={11} c={T.gold}/>~{hours}h saved<span style={{fontFamily:"Inter",fontSize:9,fontWeight:400,color:T.muted}}>est.</span>
    </span>
  );
}

export function SellerBdg({ b, T }) {
  if(b==="Verified Creator") return <Bdg icon={<Ic.Shield s={10} c={T.gold}/>} label="Verified Creator" color={T.gold} T={T}/>;
  if(b==="Top Seller") return <Bdg icon={<Ic.Crown s={10} c={T.coral}/>} label="Top Seller" color={T.coral} T={T}/>;
  return null;
}

export function BuilderIcon({ b, T }) {
  if(b==="Crown") return <Ic.Crown s={14} c={T.gold}/>;
  if(b==="Flame") return <Ic.Flame s={14} c={T.coral}/>;
  if(b==="Gem")   return <Ic.Gem s={14} c={T.green}/>;
  if(b==="Bolt")  return <Ic.Bolt s={14} c={T.slate}/>;
  return null;
}

export function PageWrap({ children }) {
  return <div style={{position:"relative",zIndex:1,minHeight:"calc(100vh - 52px)"}}>{children}</div>;
}

// ── FETCH-STATE HELPERS (loading / empty / error — UX contract) ──
export function Loading({ T, verb = "Loading" }) {
  return (
    <div role="status" style={{textAlign:"center",padding:"60px 0",color:T.muted,fontFamily:"Inter",fontSize:13}}>
      <style>{`@keyframes seSpin{to{transform:rotate(360deg)}}`}</style>
      <span style={{display:"inline-block",width:18,height:18,border:`2px solid ${T.borderSub}`,borderTopColor:T.gold,borderRadius:"50%",animation:"seSpin 0.8s linear infinite",verticalAlign:"middle",marginRight:10}}/>
      {verb}…
    </div>
  );
}

export function ErrorBox({ T, message, onRetry }) {
  return (
    <div style={{textAlign:"center",padding:"48px 16px",fontFamily:"Inter"}}>
      <p style={{color:T.coral,fontSize:13,marginBottom:14}}>{message}</p>
      {onRetry&&<button onClick={onRetry} style={{background:"none",border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"8px 20px",cursor:"pointer",fontFamily:"Inter",fontSize:13}}>Retry</button>}
    </div>
  );
}
