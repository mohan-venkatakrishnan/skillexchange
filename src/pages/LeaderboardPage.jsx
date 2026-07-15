import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrap, Stars, Bdg, BuilderIcon, TimeSaved, Loading, ErrorBox } from '../components/Shared.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function LeaderboardPage({ T }) {
  const nav = useNavigate();
  const [tab,setTab]=useState("builders");
  const lb = useFetch(() => api.getLeaderboard(), []);

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:760,margin:"0 auto"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:24,color:T.text,margin:"0 0 6px"}}>Leaderboard</h1>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,marginBottom:24}}>All-time rankings.</p>
        <div style={{display:"flex",marginBottom:28,background:T.surface,borderRadius:10,padding:3,border:`1px solid ${T.border}`,width:"fit-content"}}>
          {[["builders","Top Builders"],["skills","Top Skills"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{background:tab===id?T.goldSoft:"transparent",border:`1px solid ${tab===id?T.gold:"transparent"}`,borderRadius:7,padding:"8px 22px",fontFamily:"Inter",fontSize:13,fontWeight:tab===id?600:400,color:tab===id?T.gold:T.muted,cursor:"pointer"}}>{label}</button>
          ))}
        </div>

        {lb.loading?<Loading T={T} verb="Loading rankings"/>
          :lb.error?<ErrorBox T={T} message={lb.error} onRetry={lb.retry}/>
          :<>
        {tab==="builders"&&((lb.data?.builders||[]).length===0
          ?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No builders ranked yet — publish a skill to appear here.</p>
          :<>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:10,marginBottom:32,flexWrap:"wrap"}}>
              {podiumOrder(lb.data.builders).map((e,i)=>{
                if(!e) return null;
                const h=[112,148,88][i];const isFirst=e.rank===1;
                return (
                  <div key={e.rank} style={{textAlign:"center",flex:"1 1 100px",maxWidth:155}}>
                    <div onClick={()=>nav(`/u/${e.name}`)} style={{fontFamily:"Playfair Display",fontSize:isFirst?15:12,color:isFirst?T.gold:T.muted,marginBottom:6,fontWeight:700,cursor:"pointer"}}>{e.name}</div>
                    <div style={{marginBottom:5}}><Stars rating={e.rating} T={T}/></div>
                    <div style={{height:h,background:isFirst?T.goldSoft:T.surface,border:`1px solid ${isFirst?T.gold:T.borderSub}`,borderRadius:"8px 8px 0 0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
                      <BuilderIcon b={e.badge} T={T}/>
                      <span style={{fontFamily:"Inter",fontSize:isFirst?26:20,fontWeight:700,color:isFirst?T.gold:T.muted}}>#{e.rank}</span>
                      <span style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>{e.sales} sales</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
              {lb.data.builders.map((e,i)=>(
                <div key={e.rank} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderBottom:i<lb.data.builders.length-1?`1px solid ${T.borderSub}`:"none"}}>
                  <span style={{fontFamily:"Inter",fontSize:12,fontWeight:600,color:i===0?T.gold:T.muted,width:24}}>#{e.rank}</span>
                  <BuilderIcon b={e.badge} T={T}/>
                  <span onClick={()=>nav(`/u/${e.name}`)} style={{fontFamily:"Inter",fontWeight:600,color:T.text,flex:1,cursor:"pointer"}} onMouseEnter={ev=>ev.target.style.color=T.gold} onMouseLeave={ev=>ev.target.style.color=T.text}>{e.name}</span>
                  <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{e.sales} sales</span>
                  <Stars rating={e.rating} T={T}/>
                </div>
              ))}
            </div>
          </>
        )}
        {tab==="skills"&&((lb.data?.skills||[]).length===0
          ?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No skills ranked yet.</p>
          :<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
            {lb.data.skills.map((s,i)=>(
              <div key={s.rank} onClick={()=>nav(`/skills/${s.skillId}`)} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",borderBottom:i<lb.data.skills.length-1?`1px solid ${T.borderSub}`:"none",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.elevated}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontFamily:"Inter",fontSize:12,fontWeight:600,color:i===0?T.gold:T.muted,width:24}}>#{s.rank}</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"Inter",fontWeight:600,color:T.text,fontSize:13}}>{s.title}</div>
                  <div style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>by <span onClick={e=>{e.stopPropagation();nav(`/u/${s.author}`);}} style={{color:T.gold,cursor:"pointer"}}>{s.author}</span></div>
                </div>
                <TimeSaved hours={s.timeSaved} T={T}/>
                <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{s.downloads} dl</span>
                <Stars rating={s.rating} T={T}/>
              </div>
            ))}
          </div>
        )}
        </>}

        <h3 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,margin:"32px 0 14px"}}>Seller Badges</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
          {[{icon:<Ic.Crown s={12} c={T.coral}/>,label:"Top Seller",desc:"Highest total sales",color:T.coral},{icon:<Ic.Shield s={12} c={T.gold}/>,label:"Verified Creator",desc:"Manually verified by Skill Exchange",color:T.gold}].map(b=>(
            <div key={b.label} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:10,padding:14}}>
              <Bdg icon={b.icon} label={b.label} color={b.color} T={T}/>
              <p style={{fontFamily:"Inter",fontSize:12,color:T.muted,margin:"8px 0 0"}}>{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </PageWrap>
  );
}

// Podium renders 2nd, 1st, 3rd — gracefully handles fewer than 3 builders.
function podiumOrder(builders) {
  return [builders[1], builders[0], builders[2]];
}
