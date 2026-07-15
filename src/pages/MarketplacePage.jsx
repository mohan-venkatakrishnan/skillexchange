import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SkillCard from '../components/SkillCard.jsx';
import { PageWrap, Loading, ErrorBox } from '../components/Shared.jsx';
import { Ic } from '../components/Icons.jsx';
import { CATEGORIES, PLATFORMS } from '../data/constants.js';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function MarketplacePage({ T }) {
  const [params, setParams] = useSearchParams();
  const [search,setSearch]=useState("");
  const [catSearch,setCatSearch]=useState("");
  const [catOpen,setCatOpen]=useState(false);
  const cat = params.get('cat') || 'All';
  const setCat = c => setParams(c==='All'?{}:{cat:c}, {replace:true});
  const [platform,setPlatform]=useState("All");
  const [price,setPrice]=useState("All");
  const [verifiedOnly,setVerifiedOnly]=useState(false);
  const [sort,setSort]=useState("featured");
  const skills = useFetch(() => api.listSkills(), []);

  const filteredCats=["All",...CATEGORIES].filter(c=>c.toLowerCase().includes(catSearch.toLowerCase()));
  const results=(skills.data||[]).filter(s=>{
    if(search&&!s.title.toLowerCase().includes(search.toLowerCase())&&!s.description.toLowerCase().includes(search.toLowerCase())) return false;
    if(cat!=="All"&&s.category!==cat) return false;
    if(platform!=="All"&&!s.platforms.includes(platform)) return false;
    if(price==="Free"&&s.price!==0) return false;
    if(price==="Paid"&&s.price===0) return false;
    if(verifiedOnly&&!s.verified) return false;
    return true;
  }).sort((a,b)=>sort==="rating"?b.rating-a.rating:sort==="downloads"?b.downloads-a.downloads:sort==="time"?b.timeSaved-a.timeSaved:sort==="price-asc"?a.price-b.price:sort==="price-desc"?b.price-a.price:(b.featured?1:0)-(a.featured?1:0));

  const pillH=32; // consistent height for every filter control
  const pill=(active,label,onClick)=>(
    <button key={label} onClick={onClick} style={{background:active?T.goldSoft:"transparent",border:`1px solid ${active?T.gold:T.borderSub}`,color:active?T.gold:T.muted,borderRadius:20,height:pillH,padding:"0 13px",fontFamily:"Inter",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.15s",display:"inline-flex",alignItems:"center",flexShrink:0}}>{label}</button>
  );

  return (
    <PageWrap>
      <div onClick={()=>catOpen&&setCatOpen(false)} style={{padding:"28px clamp(16px,4vw,40px)"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:"clamp(20px,3vw,24px)",color:T.text,margin:"0 0 18px"}}>Browse Skills</h1>
        <div style={{position:"relative",marginBottom:14}}>
          <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}><Ic.Search s={15} c={T.muted}/></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search skills..." data-testid="marketplace-search" style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px 11px 40px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
        </div>

        {/* Row 1 — category, platform */}
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flexShrink:0}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setCatOpen(o=>!o)} style={{background:cat!=="All"?T.goldSoft:"transparent",border:`1px solid ${cat!=="All"?T.gold:T.borderSub}`,color:cat!=="All"?T.gold:T.muted,borderRadius:20,height:pillH,padding:"0 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
              {cat==="All"?"Category":cat}<span style={{fontSize:8}}>▼</span>
            </button>
            {catOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,width:"min(200px,88vw)",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,0.25)",overflow:"hidden"}}>
                <div style={{padding:8}}><input value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="Search..." autoFocus style={{width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontFamily:"Inter",fontSize:12,boxSizing:"border-box",outline:"none"}}/></div>
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  {filteredCats.map(c=><div key={c} onClick={()=>{setCat(c);setCatOpen(false);setCatSearch("");}} style={{padding:"8px 14px",fontFamily:"Inter",fontSize:12,color:cat===c?T.gold:T.text,background:cat===c?T.goldSoft:"transparent",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=T.elevated} onMouseLeave={e=>e.currentTarget.style.background=cat===c?T.goldSoft:"transparent"}>{c}</div>)}
                </div>
              </div>
            )}
          </div>
          <div style={{width:1,height:18,background:T.borderSub,flexShrink:0}}/>
          {["All",...PLATFORMS].map(p=>pill(platform===p,p,()=>setPlatform(p)))}
        </div>

        {/* Row 2 — price, verified, sort (own row so it never detaches) */}
        <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
          {["All","Free","Paid"].map(p=>pill(price===p,`${p}${p!=="All"&&price===p?"":""}`,()=>setPrice(p)))}
          <div style={{width:1,height:18,background:T.borderSub,flexShrink:0}}/>
          {pill(verifiedOnly,"✦ Verified",()=>setVerifiedOnly(v=>!v))}
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{marginLeft:"auto",background:T.surface,border:`1px solid ${T.borderSub}`,color:T.text,borderRadius:20,height:pillH,padding:"0 12px",fontFamily:"Inter",fontSize:12,cursor:"pointer",outline:"none",flexShrink:0}}>
            <option value="featured">Featured</option><option value="rating">Top Rated</option>
            <option value="downloads">Most Downloaded</option><option value="time">Most Time Saved</option>
            <option value="price-asc">Price ↑</option><option value="price-desc">Price ↓</option>
          </select>
        </div>

        {skills.loading?<Loading T={T} verb="Loading skills"/>
          :skills.error?<ErrorBox T={T} message={skills.error} onRetry={skills.retry}/>
          :<>
            <p style={{fontFamily:"Inter",fontSize:12,color:T.muted,marginBottom:16}} data-testid="results-count">{results.length} skill{results.length!==1?"s":""} found{cat!=="All"?` in ${cat}`:""}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
              {results.map(s=><SkillCard key={s.id} skill={s} T={T}/>)}
              {results.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:T.muted,fontFamily:"Inter"}}>No skills match your filters.</div>}
            </div>
          </>
        }
      </div>
    </PageWrap>
  );
}
