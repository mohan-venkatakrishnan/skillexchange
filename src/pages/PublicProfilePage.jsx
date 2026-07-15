import { useParams, useNavigate } from 'react-router-dom';
import SkillCard from '../components/SkillCard.jsx';
import { PageWrap, VerifiedStamp, SellerBdg, Loading, ErrorBox } from '../components/Shared.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function PublicProfilePage({ T }) {
  const { username } = useParams();
  const nav = useNavigate();
  const profile = useFetch(() => api.getProfile(username), [username]);

  if (profile.loading) return <PageWrap><Loading T={T} verb="Loading profile"/></PageWrap>;
  if (profile.error) return <PageWrap><ErrorBox T={T} message={profile.error} onRetry={profile.retry}/></PageWrap>;
  const p = profile.data;

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:800,margin:"0 auto"}}>
        <button onClick={()=>nav(-1)} style={{background:"none",border:"none",color:T.muted,fontFamily:"Inter",fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:28,flexWrap:"wrap"}}>
          <div style={{width:60,height:60,minWidth:60,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{p.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
              <h1 style={{fontFamily:"Playfair Display",fontSize:22,color:T.text,margin:0}}>{p.name}</h1>
              {p.verified&&<VerifiedStamp size={24} T={T}/>}
            </div>
            <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,margin:"0 0 6px"}}>@{p.username}{p.location?` · ${p.location}`:""}</p>
            <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:"0 0 10px"}}>{p.bio}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(p.badges||[]).map(b=><SellerBdg key={b} b={b} T={T}/>)}</div>
          </div>
        </div>
        <h2 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,marginBottom:16}}>Published Skills</h2>
        {(p.skills||[]).length===0
          ?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No skills published yet.</p>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>{p.skills.map(s=><SkillCard key={s.id} skill={s} T={T}/>)}</div>
        }
      </div>
    </PageWrap>
  );
}
