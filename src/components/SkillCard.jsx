import { useNavigate } from 'react-router-dom';
import { VerifiedStamp, Stars, SkillBdg, PTag, TimeSaved } from './Shared.jsx';

export default function SkillCard({ skill, T }) {
  const nav = useNavigate();
  return (
    <div onClick={()=>nav(`/skills/${skill.id}`)} data-testid="skill-card"
      style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:18,cursor:"pointer",position:"relative",transition:"border-color 0.2s,transform 0.15s,box-shadow 0.2s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 32px ${T.gold}14`;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
      {skill.verified&&<div style={{position:"absolute",top:14,right:14}}><VerifiedStamp size={22} T={T}/></div>}
      <div style={{display:"flex",gap:6,marginBottom:7,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:T.slate,textTransform:"uppercase",letterSpacing:"0.07em"}}>{skill.category}</span>
        {skill.skillBadge&&<SkillBdg label={skill.skillBadge} T={T}/>}
      </div>
      <h3 style={{fontFamily:"Playfair Display",fontSize:15,fontWeight:600,color:T.text,margin:"0 0 6px",paddingRight:skill.verified?28:0,lineHeight:1.3}}>{skill.title}</h3>
      <p style={{fontFamily:"Inter",fontSize:12,color:T.muted,margin:"0 0 10px",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{skill.description}</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>{skill.platforms.map(p=><PTag key={p} p={p} T={T}/>)}</div>
      <div style={{marginBottom:10}}><TimeSaved hours={skill.timeSaved} T={T}/></div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <Stars rating={skill.rating} count={skill.reviews} T={T}/>
        <span style={{fontFamily:"Inter",fontSize:13,fontWeight:700,color:skill.price===0?T.green:T.gold}}>{skill.price===0?"Free":`$${skill.price}`}</span>
      </div>
      <div style={{marginTop:8,fontFamily:"Inter",fontSize:11,color:T.muted}}>
        by <span onClick={e=>{e.stopPropagation();nav(`/u/${skill.author}`);}} style={{color:T.gold,cursor:"pointer"}}>{skill.author}</span> · {skill.downloads} downloads
      </div>
    </div>
  );
}
