import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import SkillCard from '../components/SkillCard.jsx';
import { PageWrap, Stars, BuilderIcon, Loading, ErrorBox } from '../components/Shared.jsx';
import { CATEGORIES } from '../data/constants.js';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function HomePage({ T, user, onShowAuth }) {
  const nav = useNavigate();
  const stats = useFetch(() => api.getStats(), []);
  const skills = useFetch(() => api.listSkills(), []);
  const lb = useFetch(() => api.getLeaderboard(), []);
  const featured = (skills.data || []).filter(s => s.featured);

  return (
    <PageWrap>
      <div>
        {/* Hero */}
        <div style={{padding:"80px 40px 64px",textAlign:"center",borderBottom:`1px solid ${T.border}`}}>
          <div style={{animation:"fadeUp 0.6s ease both"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><Logo size={56} T={T}/></div>
            <h1 style={{fontFamily:"Playfair Display",fontSize:"clamp(1.8rem,5vw,3rem)",fontWeight:700,color:T.text,margin:"0 0 4px",lineHeight:1.15}}>Where AI builders</h1>
            <h1 style={{fontFamily:"Playfair Display",fontSize:"clamp(1.8rem,5vw,3rem)",fontWeight:700,margin:"0 0 18px",lineHeight:1.15,color:T.gold}}>share their edge</h1>
            <p style={{fontFamily:"Inter",fontSize:16,color:T.muted,margin:"0 0 32px",maxWidth:520,marginLeft:"auto",marginRight:"auto",lineHeight:1.65}}>The GitHub for AI skills — buy and sell reusable workflows that power real products</p>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>nav("/marketplace")} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:10,padding:"13px 30px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:`0 4px 20px ${T.gold}28`}}>Browse Skills</button>
              {user
                ? <button onClick={()=>nav("/publish")} style={{background:"transparent",color:T.gold,border:`1.5px solid ${T.gold}`,borderRadius:10,padding:"13px 30px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer"}}>Publish a Skill</button>
                : <button onClick={()=>onShowAuth()} style={{background:"transparent",color:T.gold,border:`1.5px solid ${T.gold}`,borderRadius:10,padding:"13px 30px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer"}}>Sign In to Publish</button>
              }
            </div>
            <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:16}}>{user?`Browse free · Publish or buy anytime · Every skill ships with proof it works`:`Browse free · Sign in to buy or publish · Every skill ships with proof it works`}</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:"flex",justifyContent:"center",gap:"clamp(20px,4vw,48px)",padding:"18px clamp(16px,4vw,40px)",borderBottom:`1px solid ${T.border}`,background:T.surface,flexWrap:"wrap"}}>
          {[[stats.data?.skills??"—","Skills Published"],[stats.data?.downloads??"—","Downloads"],[stats.data?.builders??"—","Builders"],[stats.data?.avgRating??"—","Avg Rating"]].map(([v,l])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontFamily:"Inter",fontSize:22,fontWeight:700,color:T.gold}}>{v}</div>
              <div style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Featured */}
        <div style={{padding:"44px clamp(16px,4vw,40px) 28px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <h2 style={{fontFamily:"Playfair Display",fontSize:"clamp(18px,3vw,22px)",color:T.text,margin:0}}>✦ Featured Skills</h2>
            <button onClick={()=>nav("/marketplace")} style={{background:"none",border:"none",color:T.gold,fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>View all →</button>
          </div>
          {skills.loading?<Loading T={T} verb="Loading featured skills"/>
            :skills.error?<ErrorBox T={T} message={skills.error} onRetry={skills.retry}/>
            :featured.length===0?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted,textAlign:"center",padding:"24px 0"}}>No featured skills yet — <span onClick={()=>nav("/marketplace")} style={{color:T.gold,cursor:"pointer"}}>browse the marketplace</span>.</p>
            :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
              {featured.map(s=><SkillCard key={s.id} skill={s} T={T}/>)}
            </div>
          }
        </div>

        {/* Categories */}
        <div style={{padding:"0 clamp(16px,4vw,40px) 44px"}}>
          <h2 style={{fontFamily:"Playfair Display",fontSize:"clamp(18px,3vw,22px)",color:T.text,marginBottom:18}}>Browse by Category</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10}}>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>nav(`/marketplace?cat=${encodeURIComponent(c)}`)} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:"13px 10px",textAlign:"center",cursor:"pointer",fontFamily:"Inter",fontSize:12,fontWeight:500,color:T.muted,transition:"all 0.18s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.color=T.gold;e.currentTarget.style.background=T.goldSoft;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.borderSub;e.currentTarget.style.color=T.muted;e.currentTarget.style.background=T.surface;}}>{c}</button>
            ))}
          </div>
        </div>

        {/* Leaderboard snippet */}
        <div style={{padding:"0 clamp(16px,4vw,40px) 60px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
            <h2 style={{fontFamily:"Playfair Display",fontSize:"clamp(18px,3vw,22px)",color:T.text,margin:0}}>Top Builders</h2>
            <button onClick={()=>nav("/leaderboard")} style={{background:"none",border:"none",color:T.gold,fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Full leaderboard →</button>
          </div>
          {lb.loading?<Loading T={T} verb="Loading leaderboard"/>
            :lb.error?<ErrorBox T={T} message={lb.error} onRetry={lb.retry}/>
            :(lb.data?.builders||[]).length===0?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted,textAlign:"center",padding:"24px 0"}}>No builders ranked yet — be the first to publish.</p>
            :<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              {lb.data.builders.slice(0,3).map((e,i)=>(
                <div key={e.rank} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderBottom:i<2?`1px solid ${T.borderSub}`:"none"}}>
                  <span style={{fontFamily:"Inter",fontSize:12,fontWeight:600,color:i===0?T.gold:T.muted,width:22}}>#{e.rank}</span>
                  <BuilderIcon b={e.badge} T={T}/>
                  <span onClick={()=>nav(`/u/${e.name}`)} style={{fontFamily:"Inter",fontWeight:600,color:T.text,flex:1,cursor:"pointer"}} onMouseEnter={ev=>ev.target.style.color=T.gold} onMouseLeave={ev=>ev.target.style.color=T.text}>{e.name}</span>
                  <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{e.sales} sales</span>
                  <Stars rating={e.rating} T={T}/>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </PageWrap>
  );
}
