import { useNavigate } from 'react-router-dom';
import { PageWrap, TimeSaved, Loading, ErrorBox } from '../components/Shared.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function LibraryPage({ T }) {
  const nav = useNavigate();
  const lib = useFetch(() => api.getLibrary(), []);

  const download = async (s) => {
    const { url } = await api.downloadSkill(s.id);
    const a = document.createElement('a');
    a.href = url; a.download = `${s.title.replace(/[^a-z0-9]+/gi, '-')}-SKILL.md`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:24,color:T.text,margin:"0 0 6px"}}>My Library</h1>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,marginBottom:24}}>Skills you've purchased or downloaded.</p>
        {lib.loading?<Loading T={T} verb="Loading your library"/>
          :lib.error?<ErrorBox T={T} message={lib.error} onRetry={lib.retry}/>
          :(lib.data||[]).length===0
          ?<div style={{textAlign:"center",padding:"60px 0",color:T.muted,fontFamily:"Inter"}}>No skills yet. <button onClick={()=>nav("/marketplace")} style={{background:"none",border:"none",color:T.gold,cursor:"pointer",fontFamily:"Inter",fontSize:13}}>Browse →</button></div>
          :<div style={{display:"flex",flexDirection:"column",gap:12}}>
            {lib.data.map(s=>(
              <div key={s.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18,display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:T.slate,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.category}</div>
                  <div style={{fontFamily:"Playfair Display",fontSize:16,fontWeight:600,color:T.text,marginBottom:4}}>{s.title}</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>by {s.author} · {s.price===0?"Free":`$${s.price} purchased`}</span>
                    <TimeSaved hours={s.timeSaved} T={T}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <button onClick={()=>nav(`/skills/${s.id}`)} style={{background:"none",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:6,padding:"7px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer"}}>View</button>
                  <button onClick={()=>download(s)} style={{background:`linear-gradient(135deg,${T.green},#2a9a78)`,color:"#fff",border:"none",borderRadius:6,padding:"7px 14px",fontFamily:"Inter",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><Ic.Download s={12} c="#fff"/>Download</button>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </PageWrap>
  );
}
