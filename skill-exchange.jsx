import { useState } from "react";

// ── PALETTE ──────────────────────────────────────────────────────
const DARK = {
  bg:        "#141414",
  surface:   "#1e1e1e",
  elevated:  "#272727",
  border:    "rgba(201,168,76,0.18)",
  borderSub: "rgba(255,255,255,0.08)",
  text:      "#f0ede6",
  muted:     "#888880",
  gold:      "#C9A84C",
  goldDim:   "#8a6f2e",
  goldSoft:  "rgba(201,168,76,0.10)",
  green:     "#6dba98",
  coral:     "#c97a5a",
  coralSoft: "rgba(201,122,90,0.10)",
  slate:     "#9a9890",
  slateSoft: "rgba(154,152,144,0.10)",
};
const LIGHT = {
  bg:        "#faf8f2",
  surface:   "#ffffff",
  elevated:  "#f2efe6",
  border:    "rgba(160,120,30,0.18)",
  borderSub: "rgba(0,0,0,0.08)",
  text:      "#1c1a14",
  muted:     "#7a7060",
  gold:      "#9a6e10",
  goldDim:   "#6e4e00",
  goldSoft:  "rgba(154,110,16,0.09)",
  green:     "#2a8a68",
  coral:     "#a05030",
  coralSoft: "rgba(160,80,48,0.08)",
  slate:     "#7a7060",
  slateSoft: "rgba(122,112,96,0.08)",
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');`;

// ── LOGO ──────────────────────────────────────────────────────────
function Logo({ size=32, T }) {
  const nodes=[{cx:20,cy:20},{cx:20,cy:8},{cx:31,cy:14},{cx:31,cy:27},{cx:20,cy:33},{cx:9,cy:27},{cx:9,cy:14}];
  const edges=[[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,2],[2,3],[3,4],[4,5],[5,6],[6,1],[1,3],[2,5]];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      {edges.map(([a,b],i)=>(
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy}
          stroke={i<6?T.gold:T.slate} strokeWidth={i<6?"1.3":"0.8"} strokeOpacity={i<6?"0.85":"0.4"}/>
      ))}
      {nodes.slice(1).map((n,i)=>(
        <circle key={i} cx={n.cx} cy={n.cy} r="2.2" fill={T.surface} stroke={i%2===0?T.gold:T.slate} strokeWidth="1.4"/>
      ))}
      <circle cx="20" cy="20" r="3.2" fill={T.gold}/>
    </svg>
  );
}

// ── ICONS ─────────────────────────────────────────────────────────
const Ic={
  Crown:    ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M2 12h12M2 12L1 5l4 3 3-5 3 5 4-3-1 7H2z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  Flame:    ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 14c-3 0-5-2-5-5 0-2 1-3.5 2-4.5 0 1.5 1 2 1 2 0-2 1.5-4 3-5-.5 2 1 3 1 5 .5-.5.5-2 .5-2C12 6 13 8 13 9c0 3-2 5-5 5z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  Shield:   ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2L3 4v4c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4L8 2z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/><path d="M5.5 8l2 2 3-3" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Star:     ({s=14,c,filled=true})=><svg width={s} height={s} viewBox="0 0 16 16" fill={filled?c:"none"}><path d="M8 1l1.8 3.8 4.2.6-3 3 .7 4.2L8 10.5l-3.7 2.1.7-4.2-3-3 4.2-.6z" stroke={c} strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  Bolt:     ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M9 2L4 9h4l-1 5 5-7H8l1-5z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  Gem:      ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M4 2h8l3 4-7 8-7-8 3-4z" stroke={c} strokeWidth="1.3" strokeLinejoin="round"/><path d="M1 6h14M4 2l3 4M12 2l-3 4" stroke={c} strokeWidth="1.1"/></svg>,
  Sun:      ({s=16,c})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>,
  Moon:     ({s=16,c})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  Google:   ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
  Check:    ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  X:        ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Download: ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Search:   ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke={c} strokeWidth="1.5"/><path d="M11 11l3 3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Clock:    ({s=14,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.4"/><path d="M8 5v3.5l2.5 1.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  LogOut:   ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  User:     ({s=16,c})=><svg width={s} height={s} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke={c} strokeWidth="1.4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>,
};

// ── GLOBAL PARALLAX BACKGROUND ────────────────────────────────────
function ParallaxBg({ T }) {
  const nodes=[
    [4,8,1.6,0.4,7,0,0],[10,25,1.2,0.25,9,1.5,1],[17,14,2,0.5,6.5,0.3,0],[24,55,1,0.2,10,2.2,1],
    [31,7,1.8,0.45,7.2,0.8,0],[38,70,1.3,0.28,9.5,1.8,1],[45,30,1,0.32,8,0.1,0],
    [52,48,2.2,0.5,6.2,1.1,0],[59,12,1,0.25,10,0.6,1],[66,65,1.6,0.4,7.5,2,0],
    [73,28,1,0.28,9,0.4,1],[80,52,1.8,0.45,6.8,2.3,0],[87,18,1,0.25,8.5,1,1],
    [94,42,1.4,0.35,7,0.7,0],[2,68,1.2,0.3,9.2,1.4,1],[20,82,1,0.22,8,1.6,0],
    [50,88,1.5,0.35,10,0.2,1],[76,78,1,0.25,7.2,1.8,0],[96,62,1.7,0.38,8.8,0.5,0],
    [35,40,1,0.18,9.8,2.4,1],[62,5,1.4,0.42,6.8,0.1,0],[12,48,1,0.24,8.4,1.5,1],
    [85,90,1.1,0.3,9,0.4,0],[44,60,1,0.2,10.5,1.9,1],[70,35,1.3,0.32,7.6,0.9,0],
    [28,90,1,0.18,8.8,2.8,1],[55,22,1.6,0.38,7,1.2,0],[90,30,1,0.22,9.6,0.3,1],
  ];
  const clusters=[
    {x:5,  y:8,  dur:12, del:0  },
    {x:88, y:20, dur:10, del:1  },
    {x:80, y:72, dur:14, del:2  },
    {x:8,  y:65, dur:11, del:0.5},
    {x:45, y:85, dur:13, del:1.5},
    {x:60, y:10, dur:10, del:3  },
  ];
  const goldC  = T.gold;
  const slateC = T.slate;
  return (
    <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden"}}>
      <style>{`
        @keyframes twinkle{0%,100%{opacity:var(--op);transform:scale(1)}50%{opacity:calc(var(--op)*0.15);transform:scale(0.5)}}
        @keyframes floatNode{0%,100%{transform:translateY(0)}50%{transform:translateY(-28px)}}
        @keyframes floatNodeB{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
        @keyframes stampIn{from{transform:scale(0.3) rotate(-15deg);opacity:0}to{transform:scale(1) rotate(0deg);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      {nodes.map(([x,y,r,op,dur,del,ci],i)=>(
        <div key={i} style={{
          position:"absolute",left:`${x}%`,top:`${y}%`,
          width:r*2,height:r*2,borderRadius:"50%",
          background:ci===0?goldC:slateC,
          opacity:op,"--op":op,
          animation:`twinkle ${dur}s ${del}s ease-in-out infinite alternate`
        }}/>
      ))}
      {clusters.map((c,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${c.x}%`,top:`${c.y}%`,
          animation:`${i%2===0?"floatNode":"floatNodeB"} ${c.dur}s ${c.del}s ease-in-out infinite`,
          opacity:0.18
        }}>
          <svg width="90" height="80" viewBox="0 0 90 80" fill="none">
            <line x1="45" y1="40" x2="15" y2="15" stroke={i%2===0?goldC:slateC} strokeWidth="1.1"/>
            <line x1="45" y1="40" x2="75" y2="15" stroke={i%2===0?slateC:goldC} strokeWidth="1.1"/>
            <line x1="45" y1="40" x2="75" y2="62" stroke={i%2===0?goldC:slateC} strokeWidth="1.1"/>
            <line x1="45" y1="40" x2="15" y2="62" stroke={i%2===0?slateC:goldC} strokeWidth="1.1"/>
            <line x1="15" y1="15" x2="75" y2="15" stroke={slateC} strokeWidth="0.7"/>
            <line x1="15" y1="62" x2="75" y2="62" stroke={slateC} strokeWidth="0.7"/>
            <line x1="15" y1="15" x2="15" y2="62" stroke={slateC} strokeWidth="0.7"/>
            <line x1="75" y1="15" x2="75" y2="62" stroke={slateC} strokeWidth="0.7"/>
            <circle cx="45" cy="40" r="4.5" fill={goldC}/>
            <circle cx="15" cy="15" r="2.8" fill="none" stroke={goldC} strokeWidth="1.3"/>
            <circle cx="75" cy="15" r="2.8" fill="none" stroke={slateC} strokeWidth="1.3"/>
            <circle cx="75" cy="62" r="2.8" fill="none" stroke={goldC} strokeWidth="1.3"/>
            <circle cx="15" cy="62" r="2.8" fill="none" stroke={slateC} strokeWidth="1.3"/>
          </svg>
        </div>
      ))}
      <div style={{position:"absolute",top:"-10%",left:"20%",width:500,height:400,background:`radial-gradient(ellipse,${goldC}07 0%,transparent 65%)`}}/>
      <div style={{position:"absolute",bottom:"10%",right:"-5%",width:400,height:400,background:`radial-gradient(ellipse,${slateC}06 0%,transparent 65%)`}}/>
      <div style={{position:"absolute",top:"40%",left:"-5%",width:350,height:350,background:`radial-gradient(ellipse,${goldC}05 0%,transparent 65%)`}}/>
    </div>
  );
}

// ── VERIFIED STAMP ────────────────────────────────────────────────
function VerifiedStamp({size=28,T}) {
  return (
    <span style={{display:"inline-flex",flexShrink:0,alignItems:"center",justifyContent:"center",width:size,height:size,minWidth:size,minHeight:size,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,boxShadow:`0 0 0 2px ${T.bg},0 0 0 3.5px ${T.gold}55`,animation:"stampIn 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
      <Ic.Shield s={size*0.55} c={T.bg}/>
    </span>
  );
}

// ── SHARED ────────────────────────────────────────────────────────
function Stars({rating,count,T}) {
  return (
    <span style={{display:"flex",alignItems:"center",gap:3}}>
      {[1,2,3,4,5].map(i=><Ic.Star key={i} s={11} c={T.gold} filled={i<=Math.round(rating)}/>)}
      {count!==undefined&&<span style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginLeft:2}}>{rating.toFixed(1)}{count!==""&&` (${count})`}</span>}
    </span>
  );
}
function Bdg({icon,label,color,T}) {
  const c=color||T.gold;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${c}16`,border:`1px solid ${c}35`,borderRadius:20,padding:"3px 10px",fontFamily:"Inter",fontSize:10,fontWeight:600,color:c,letterSpacing:"0.04em",textTransform:"uppercase"}}>{icon}{label}</span>;
}
function SkillBdg({label,T}) {
  if(!label) return null;
  const c=label.startsWith("#1")?T.gold:label==="Top Rated"?T.green:label==="Most Downloaded"?T.slate:T.coral;
  return <Bdg label={label} color={c} T={T}/>;
}
function PTag({p,T}) {
  const colors={Claude:T.gold,ChatGPT:T.green,Gemini:T.slate,Cursor:T.coral,Copilot:"#7aabdc"};
  const c=colors[p]||T.muted;
  return <span style={{fontFamily:"JetBrains Mono",fontSize:10,fontWeight:500,color:c,background:`${c}14`,border:`1px solid ${c}28`,borderRadius:4,padding:"2px 7px"}}>{p}</span>;
}
function TimeSaved({hours,T}) {
  if(!hours) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,background:T.goldSoft,border:`1px solid ${T.gold}30`,borderRadius:6,padding:"3px 8px",fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.gold}}>
      <Ic.Clock s={11} c={T.gold}/>~{hours}h saved<span style={{fontFamily:"Inter",fontSize:9,fontWeight:400,color:T.muted}}>est.</span>
    </span>
  );
}
function SellerBdg({b,T}) {
  if(b==="Verified Creator") return <Bdg icon={<Ic.Shield s={10} c={T.gold}/>} label="Verified Creator" color={T.gold} T={T}/>;
  if(b==="Top Seller") return <Bdg icon={<Ic.Crown s={10} c={T.coral}/>} label="Top Seller" color={T.coral} T={T}/>;
  return null;
}
function BuilderIcon({b,T}) {
  if(b==="Crown") return <Ic.Crown s={14} c={T.gold}/>;
  if(b==="Flame") return <Ic.Flame s={14} c={T.coral}/>;
  if(b==="Gem")   return <Ic.Gem s={14} c={T.green}/>;
  if(b==="Bolt")  return <Ic.Bolt s={14} c={T.slate}/>;
  return null;
}
function PageWrap({children}) {
  return <div style={{position:"relative",zIndex:1,minHeight:"calc(100vh - 52px)"}}>{children}</div>;
}

// ── DATA ──────────────────────────────────────────────────────────
const CATEGORIES=["Coding","Design","Extension","Desktop","Document","Marketing","Website","Data","DevOps","AI/ML","Testing","Mobile","Other"];
const PLATFORMS=["Claude","ChatGPT","Gemini","Cursor","Copilot"];
const SKILLS=[
  {id:1,title:"PDF Generation Skill",category:"Document",author:"mohan",price:5,rating:4.8,reviews:34,downloads:210,platforms:["Claude","ChatGPT"],verified:true,featured:true,skillBadge:"#1 in Document",timeSaved:6,description:"A complete SKILL.md for generating production-ready PDFs. Covers headers, footers, tables, and image embedding.",pocUrl:"https://tapdot.org",pocScreenshot:true,usage:"Place SKILL.md in your project root. Reference it in your Claude Code session before any PDF task.",sellerBadges:["Verified Creator","Top Seller"]},
  {id:2,title:"Chrome Extension MV3 Skill",category:"Extension",author:"devkraft",price:8,rating:4.6,reviews:22,downloads:98,platforms:["Claude"],verified:true,featured:true,skillBadge:"Top Rated",timeSaved:12,description:"Everything for a MV3 Chrome extension — service worker, offscreen AI, keep-alive, storage schema, sidepanel wiring.",pocUrl:"https://github.com",pocScreenshot:true,usage:"Load into Claude Code at project start. Follow the phased build plan inside the skill.",sellerBadges:["Verified Creator"]},
  {id:3,title:"React UI Design System Skill",category:"Design",author:"aiko_builds",price:0,rating:4.4,reviews:67,downloads:580,platforms:["Claude","ChatGPT","Gemini"],verified:false,featured:false,skillBadge:"Most Downloaded",timeSaved:8,description:"A free skill defining a complete token system — colors, typography, spacing, and component patterns.",pocUrl:"https://github.com",pocScreenshot:true,usage:"Reference before any UI component task. Works with all major AI assistants.",sellerBadges:[]},
  {id:4,title:"Landing Page Copywriting Skill",category:"Marketing",author:"wordsmith_ai",price:3,rating:4.9,reviews:89,downloads:440,platforms:["ChatGPT","Claude","Gemini"],verified:true,featured:true,skillBadge:"#1 in Marketing",timeSaved:4,description:"Generates high-converting SaaS landing page copy — hero, features, pricing, FAQ, CTA.",pocUrl:"https://github.com",pocScreenshot:true,usage:"Paste your product brief into the skill template. AI handles the rest.",sellerBadges:["Top Seller","Verified Creator"]},
  {id:5,title:"FastAPI Backend Scaffold Skill",category:"Coding",author:"backendguru",price:6,rating:4.2,reviews:15,downloads:72,platforms:["Claude","Cursor"],verified:false,featured:false,skillBadge:null,timeSaved:10,description:"Scaffolds a production FastAPI backend with auth, database models, migrations, and Docker setup.",pocUrl:"https://github.com",pocScreenshot:false,usage:"Run in a fresh project folder. Specify your data models in the skill config section.",sellerBadges:[]},
  {id:6,title:"Electron Desktop App Skill",category:"Desktop",author:"mohan",price:4,rating:4.7,reviews:19,downloads:133,platforms:["Claude"],verified:true,featured:false,skillBadge:"New & Notable",timeSaved:16,description:"Full Electron + electron-builder + electron-updater skill. Covers auto-updates via GitHub Releases.",pocUrl:"https://tapdot.org",pocScreenshot:true,usage:"Use at project start in Claude Code. Covers the full desktop packaging lifecycle.",sellerBadges:["Verified Creator"]},
];
const LB_BUILDERS=[
  {rank:1,name:"wordsmith_ai",sales:89,rating:4.9,badge:"Crown"},
  {rank:2,name:"mohan",sales:67,rating:4.8,badge:"Flame"},
  {rank:3,name:"devkraft",sales:44,rating:4.6,badge:"Gem"},
  {rank:4,name:"aiko_builds",sales:38,rating:4.4,badge:"Bolt"},
  {rank:5,name:"backendguru",sales:21,rating:4.2,badge:null},
];
const LB_SKILLS=[
  {rank:1,skillId:3,title:"React UI Design System Skill",author:"aiko_builds",downloads:580,rating:4.4,timeSaved:8},
  {rank:2,skillId:4,title:"Landing Page Copywriting Skill",author:"wordsmith_ai",downloads:440,rating:4.9,timeSaved:4},
  {rank:3,skillId:1,title:"PDF Generation Skill",author:"mohan",downloads:210,rating:4.8,timeSaved:6},
  {rank:4,skillId:6,title:"Electron Desktop App Skill",author:"mohan",downloads:133,rating:4.7,timeSaved:16},
  {rank:5,skillId:2,title:"Chrome Extension MV3 Skill",author:"devkraft",downloads:98,rating:4.6,timeSaved:12},
];
const PROFILES={
  mohan:        {name:"Mohan",username:"mohan",bio:"Solo indie dev building privacy-first developer tools.",location:"Mumbai, India",skills:SKILLS.filter(s=>s.author==="mohan"),badges:["Verified Creator","Top Seller"],verified:true},
  devkraft:     {name:"DevKraft",username:"devkraft",bio:"Chrome extension specialist. MV3 patterns and browser AI.",location:"Bangalore, India",skills:SKILLS.filter(s=>s.author==="devkraft"),badges:["Verified Creator"],verified:true},
  wordsmith_ai: {name:"WordsmithAI",username:"wordsmith_ai",bio:"Copywriting skills for SaaS and indie products.",location:"Remote",skills:SKILLS.filter(s=>s.author==="wordsmith_ai"),badges:["Top Seller","Verified Creator"],verified:true},
  aiko_builds:  {name:"Aiko Builds",username:"aiko_builds",bio:"Design systems and React UI patterns.",location:"Tokyo, Japan",skills:SKILLS.filter(s=>s.author==="aiko_builds"),badges:[],verified:false},
  backendguru:  {name:"BackendGuru",username:"backendguru",bio:"Python and FastAPI backend patterns.",location:"Remote",skills:SKILLS.filter(s=>s.author==="backendguru"),badges:[],verified:false},
};

// ── SKILL CARD ────────────────────────────────────────────────────
function SkillCard({skill,onNavigate,T}) {
  return (
    <div onClick={()=>onNavigate("skill",skill)}
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
        by <span onClick={e=>{e.stopPropagation();onNavigate("publicprofile",PROFILES[skill.author]);}} style={{color:T.gold,cursor:"pointer"}}>{skill.author}</span> · {skill.downloads} downloads
      </div>
    </div>
  );
}

// ── AUTH MODAL ────────────────────────────────────────────────────
function AuthModal({onClose,onLogin,T}) {
  const [tab,setTab]=useState("signin");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [uname,setUname]=useState("");
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:18,padding:32,width:360,maxWidth:"92vw",boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><Logo size={26} T={T}/><h2 style={{fontFamily:"Playfair Display",fontSize:19,color:T.text,margin:0}}>{tab==="signin"?"Welcome back":"Join Skill Exchange"}</h2></div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer"}}><Ic.X s={16} c={T.muted}/></button>
        </div>
        <button onClick={()=>onLogin("Google User","google_user")} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:T.elevated,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:"11px",fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,cursor:"pointer",marginBottom:14}}>
          <Ic.Google s={16}/> Continue with Google
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{flex:1,height:1,background:T.borderSub}}/><span style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>or</span><div style={{flex:1,height:1,background:T.borderSub}}/>
        </div>
        <div style={{display:"flex",gap:0,marginBottom:14,background:T.elevated,borderRadius:8,padding:3}}>
          {["signin","signup"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?T.surface:"transparent",border:"none",borderRadius:6,padding:"7px",fontFamily:"Inter",fontSize:12,fontWeight:tab===t?600:400,color:tab===t?T.text:T.muted,cursor:"pointer"}}>{t==="signin"?"Sign In":"Sign Up"}</button>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {tab==="signup"&&<input value={uname} onChange={e=>setUname(e.target.value)} placeholder="Choose a unique username" style={inp}/>}
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={inp}/>
          <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="Password" type="password" style={inp}/>
          <button onClick={()=>onLogin(uname||email.split("@")[0],uname||email.split("@")[0])} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer",marginTop:2}}>
            {tab==="signin"?"Sign In":"Create Account"}
          </button>
        </div>
        {tab==="signup"&&<p style={{fontFamily:"Inter",fontSize:11,color:T.muted,textAlign:"center",margin:"12px 0 0"}}>Username is permanent and must be unique.</p>}
      </div>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────
function HomePage({onNavigate,T,onRequireAuth,user,onShowAuth}) {
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
              <button onClick={()=>onNavigate("marketplace")} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:10,padding:"13px 30px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:`0 4px 20px ${T.gold}28`}}>Browse Skills</button>
              {user
                ? <button onClick={()=>onNavigate("publish")} style={{background:"transparent",color:T.gold,border:`1.5px solid ${T.gold}`,borderRadius:10,padding:"13px 30px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer"}}>Publish a Skill</button>
                : <button onClick={()=>onShowAuth()} style={{background:"transparent",color:T.gold,border:`1.5px solid ${T.gold}`,borderRadius:10,padding:"13px 30px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer"}}>Sign In to Publish</button>
              }
            </div>
            <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:16}}>{user?`Browse free · Publish or buy anytime · Every skill ships with proof it works`:`Browse free · Sign in to buy or publish · Every skill ships with proof it works`}</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:"flex",justifyContent:"center",gap:"clamp(20px,4vw,48px)",padding:"18px clamp(16px,4vw,40px)",borderBottom:`1px solid ${T.border}`,background:T.surface,flexWrap:"wrap"}}>
          {[["1,240+","Skills Published"],["8,900+","Downloads"],["430+","Builders"],["4.7★","Avg Rating"]].map(([v,l])=>(
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
            <button onClick={()=>onNavigate("marketplace")} style={{background:"none",border:"none",color:T.gold,fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>View all →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
            {SKILLS.filter(s=>s.featured).map(s=><SkillCard key={s.id} skill={s} onNavigate={onNavigate} T={T}/>)}
          </div>
        </div>

        {/* Categories */}
        <div style={{padding:"0 clamp(16px,4vw,40px) 44px"}}>
          <h2 style={{fontFamily:"Playfair Display",fontSize:"clamp(18px,3vw,22px)",color:T.text,marginBottom:18}}>Browse by Category</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10}}>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>onNavigate("marketplace",{cat:c})} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:"13px 10px",textAlign:"center",cursor:"pointer",fontFamily:"Inter",fontSize:12,fontWeight:500,color:T.muted,transition:"all 0.18s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.color=T.gold;e.currentTarget.style.background=T.goldSoft;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.borderSub;e.currentTarget.style.color=T.muted;e.currentTarget.style.background=T.surface;}}>{c}</button>
            ))}
          </div>
        </div>

        {/* Leaderboard snippet */}
        <div style={{padding:"0 clamp(16px,4vw,40px) 60px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
            <h2 style={{fontFamily:"Playfair Display",fontSize:"clamp(18px,3vw,22px)",color:T.text,margin:0}}>Top Builders</h2>
            <button onClick={()=>onNavigate("leaderboard")} style={{background:"none",border:"none",color:T.gold,fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Full leaderboard →</button>
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            {LB_BUILDERS.slice(0,3).map((e,i)=>(
              <div key={e.rank} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderBottom:i<2?`1px solid ${T.borderSub}`:"none"}}>
                <span style={{fontFamily:"Inter",fontSize:12,fontWeight:600,color:i===0?T.gold:T.muted,width:22}}>#{e.rank}</span>
                <BuilderIcon b={e.badge} T={T}/>
                <span onClick={()=>onNavigate("publicprofile",PROFILES[e.name])} style={{fontFamily:"Inter",fontWeight:600,color:T.text,flex:1,cursor:"pointer"}} onMouseEnter={ev=>ev.target.style.color=T.gold} onMouseLeave={ev=>ev.target.style.color=T.text}>{e.name}</span>
                <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{e.sales} sales</span>
                <Stars rating={e.rating} T={T}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

// ── MARKETPLACE ───────────────────────────────────────────────────
function MarketplacePage({onNavigate,T,initCat}) {
  const [search,setSearch]=useState("");
  const [catSearch,setCatSearch]=useState("");
  const [catOpen,setCatOpen]=useState(false);
  const [cat,setCat]=useState(initCat||"All");
  const [platform,setPlatform]=useState("All");
  const [price,setPrice]=useState("All");
  const [verifiedOnly,setVerifiedOnly]=useState(false);
  const [sort,setSort]=useState("featured");
  const filteredCats=["All",...CATEGORIES].filter(c=>c.toLowerCase().includes(catSearch.toLowerCase()));
  const results=SKILLS.filter(s=>{
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
    <button onClick={onClick} style={{background:active?T.goldSoft:"transparent",border:`1px solid ${active?T.gold:T.borderSub}`,color:active?T.gold:T.muted,borderRadius:20,height:pillH,padding:"0 13px",fontFamily:"Inter",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.15s",display:"inline-flex",alignItems:"center",flexShrink:0}}>{label}</button>
  );
  return (
    <PageWrap>
      <div onClick={()=>catOpen&&setCatOpen(false)} style={{padding:"28px clamp(16px,4vw,40px)"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:"clamp(20px,3vw,24px)",color:T.text,margin:"0 0 18px"}}>Browse Skills</h1>
        <div style={{position:"relative",marginBottom:14}}>
          <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}><Ic.Search s={15} c={T.muted}/></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search skills..." style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px 11px 40px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
        </div>

        {/* Row 1 — category, platform, price, verified */}
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
          {["All","Free","Paid"].map(p=>pill(price===p,p,()=>setPrice(p)))}
          <div style={{width:1,height:18,background:T.borderSub,flexShrink:0}}/>
          {pill(verifiedOnly,"✦ Verified",()=>setVerifiedOnly(v=>!v))}
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{marginLeft:"auto",background:T.surface,border:`1px solid ${T.borderSub}`,color:T.text,borderRadius:20,height:pillH,padding:"0 12px",fontFamily:"Inter",fontSize:12,cursor:"pointer",outline:"none",flexShrink:0}}>
            <option value="featured">Featured</option><option value="rating">Top Rated</option>
            <option value="downloads">Most Downloaded</option><option value="time">Most Time Saved</option>
            <option value="price-asc">Price ↑</option><option value="price-desc">Price ↓</option>
          </select>
        </div>

        <p style={{fontFamily:"Inter",fontSize:12,color:T.muted,marginBottom:16}}>{results.length} skill{results.length!==1?"s":""} found{cat!=="All"?` in ${cat}`:""}</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
          {results.map(s=><SkillCard key={s.id} skill={s} onNavigate={onNavigate} T={T}/>)}
          {results.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:T.muted,fontFamily:"Inter"}}>No skills match your filters.</div>}
        </div>
      </div>
    </PageWrap>
  );
}

// ── SKILL DETAIL ──────────────────────────────────────────────────
function SkillDetailPage({skill,onNavigate,user,onShowAuth,T}) {
  const [owned,setOwned]=useState(false);
  const [userRating,setUserRating]=useState(0);
  const [reviewText,setReviewText]=useState("");
  if(!skill) return <PageWrap><div style={{padding:40,textAlign:"center",color:T.muted,fontFamily:"Inter"}}>No skill selected.<br/><button onClick={()=>onNavigate("marketplace")} style={{marginTop:12,background:"none",border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"8px 16px",cursor:"pointer",fontFamily:"Inter"}}>Browse Marketplace</button></div></PageWrap>;
  const canDownload=skill.price===0||owned;
  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:900,margin:"0 auto"}}>
        <button onClick={()=>onNavigate("marketplace")} style={{background:"none",border:"none",color:T.muted,fontFamily:"Inter",fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
        <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 320px"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:T.slate,textTransform:"uppercase",letterSpacing:"0.07em"}}>{skill.category}</span>
                  {skill.skillBadge&&<SkillBdg label={skill.skillBadge} T={T}/>}
                </div>
                <h1 style={{fontFamily:"Playfair Display",fontSize:"clamp(20px,3vw,24px)",color:T.text,margin:"0 0 8px"}}>{skill.title}</h1>
              </div>
              {skill.verified&&<VerifiedStamp size={32} T={T}/>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
              <Stars rating={skill.rating} count={skill.reviews} T={T}/>
              <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{skill.downloads} downloads</span>
              <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>by <span onClick={()=>onNavigate("publicprofile",PROFILES[skill.author])} style={{color:T.gold,cursor:"pointer"}}>{skill.author}</span></span>
            </div>
            {skill.timeSaved&&(
              <div style={{background:T.goldSoft,border:`1px solid ${T.gold}28`,borderRadius:10,padding:"10px 14px",marginBottom:16,display:"inline-flex",alignItems:"center",gap:8}}>
                <Ic.Clock s={16} c={T.gold}/>
                <span style={{fontFamily:"Inter",fontSize:14,fontWeight:600,color:T.gold}}>~{skill.timeSaved} hours saved</span>
                <span style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>· seller estimate</span>
              </div>
            )}
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18}}>{skill.platforms.map(p=><PTag key={p} p={p} T={T}/>)}{skill.sellerBadges.map(b=><SellerBdg key={b} b={b} T={T}/>)}</div>
            <p style={{fontFamily:"Inter",fontSize:14,color:T.muted,lineHeight:1.7,marginBottom:20}}>{skill.description}</p>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginBottom:14}}>
              <h3 style={{fontFamily:"Inter",fontSize:11,fontWeight:700,color:T.gold,margin:"0 0 8px",textTransform:"uppercase",letterSpacing:"0.06em"}}>How to use this skill</h3>
              <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,lineHeight:1.6,margin:0}}>{skill.usage}</p>
            </div>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginBottom:22}}>
              <h3 style={{fontFamily:"Inter",fontSize:11,fontWeight:700,color:T.gold,margin:"0 0 10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Proof of Concept</h3>
              {skill.pocScreenshot&&<div style={{background:T.elevated,borderRadius:8,height:100,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10,border:`1px solid ${T.borderSub}`}}><span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>📸 Cover screenshot</span></div>}
              <a href={skill.pocUrl} target="_blank" rel="noreferrer" style={{fontFamily:"JetBrains Mono",fontSize:12,color:T.gold,textDecoration:"none"}}>{skill.pocUrl} ↗</a>
            </div>
            <h3 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,marginBottom:14}}>Reviews</h3>
            {[{user:"devkraft",rating:5,text:"Saved me hours. The proof of concept alone was worth it."},{user:"aiko_builds",rating:4,text:"Works great with Claude. Would love Gemini support."}].map((r,i)=>(
              <div key={i} style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:14,marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span onClick={()=>onNavigate("publicprofile",PROFILES[r.user]||{name:r.user,username:r.user,bio:"",skills:[],badges:[],verified:false})} style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,cursor:"pointer"}}>{r.user}</span>
                  <Stars rating={r.rating} T={T}/>
                </div>
                <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:0,lineHeight:1.5}}>{r.text}</p>
              </div>
            ))}
            {canDownload&&(
              <div style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:14,marginTop:14}}>
                <h4 style={{fontFamily:"Inter",fontSize:13,fontWeight:600,color:T.text,margin:"0 0 10px"}}>Leave a review</h4>
                <div style={{display:"flex",gap:6,marginBottom:10}}>{[1,2,3,4,5].map(i=><span key={i} onClick={()=>setUserRating(i)} style={{cursor:"pointer"}}><Ic.Star s={18} c={T.gold} filled={i<=userRating}/></span>)}</div>
                <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)} placeholder="What worked well? What could be improved?" style={{width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:6,padding:10,color:T.text,fontFamily:"Inter",fontSize:13,resize:"vertical",minHeight:70,boxSizing:"border-box",outline:"none"}}/>
                <button style={{marginTop:8,background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"7px 16px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Submit Review</button>
              </div>
            )}
          </div>
          {/* Sidebar */}
          <div style={{width:"min(215px,100%)",flexShrink:0}}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:20,position:"sticky",top:20}}>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontFamily:"Inter",fontSize:30,fontWeight:700,color:skill.price===0?T.green:T.gold}}>{skill.price===0?"Free":`$${skill.price}`}</div>
                <div style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>one-time payment</div>
              </div>
              {canDownload
                ?<button style={{width:"100%",background:`linear-gradient(135deg,${T.green},#2a9a78)`,color:"#fff",border:"none",borderRadius:8,padding:"11px 0",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Ic.Download s={14} c="#fff"/>Download Skill</button>
                :<button onClick={()=>{if(!user){onShowAuth();return;}setOwned(true);}} style={{width:"100%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px 0",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8}}>Buy for ${skill.price}</button>
              }
              <div style={{fontFamily:"Inter",fontSize:11,color:T.muted,textAlign:"center",marginBottom:14}}>Secure checkout · Instant download</div>
              <div style={{borderTop:`1px solid ${T.borderSub}`,paddingTop:14}}>
                {[["Category",skill.category],["Time Saved",`~${skill.timeSaved}h est.`],["Downloads",skill.downloads],["Rating",`${skill.rating}/5`],["Reviews",skill.reviews]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{k}</span>
                    <span style={{fontFamily:"Inter",fontSize:12,color:k==="Time Saved"?T.gold:T.text,fontWeight:k==="Time Saved"?600:400}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

// ── PUBLISH ───────────────────────────────────────────────────────
function PublishPage({T}) {
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({title:"",category:"",description:"",usage:"",platforms:[],price:"free",amount:"",pocUrl:"",timeSaved:"",file:null});
  const [done,setDone]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const toggleP=p=>set("platforms",form.platforms.includes(p)?form.platforms.filter(x=>x!==p):[...form.platforms,p]);
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};
  const lbl={fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"};
  if(done) return (
    <PageWrap>
      <div style={{padding:"80px clamp(16px,4vw,40px)",textAlign:"center"}}>
        <div style={{marginBottom:20,display:"flex",justifyContent:"center"}}><VerifiedStamp size={56} T={T}/></div>
        <h2 style={{fontFamily:"Playfair Display",fontSize:26,color:T.text,marginBottom:12}}>Skill Submitted!</h2>
        <p style={{fontFamily:"Inter",fontSize:14,color:T.muted,marginBottom:24}}>Your skill is under review. We'll verify the proof of concept and notify you within 48 hours.</p>
        <button onClick={()=>{setDone(false);setStep(1);}} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:8,padding:"10px 24px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Publish Another</button>
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
        {step===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div><label style={lbl}>Skill Title *</label><input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. PDF Generation Skill" style={inp}/></div>
            <div><label style={lbl}>Category *</label><select value={form.category} onChange={e=>set("category",e.target.value)} style={{...inp,cursor:"pointer"}}><option value="">Select category</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label style={lbl}>Description *</label><textarea value={form.description} onChange={e=>set("description",e.target.value)} placeholder="What does this skill do?" style={{...inp,minHeight:80,resize:"vertical"}}/></div>
            <div><label style={lbl}>How to use this skill * <span style={{color:T.coral}}>required</span></label><textarea value={form.usage} onChange={e=>set("usage",e.target.value)} placeholder="Step-by-step instructions..." style={{...inp,minHeight:70,resize:"vertical"}}/></div>
            <div><label style={lbl}>Estimated time saved (hours) *</label><input type="number" value={form.timeSaved} onChange={e=>set("timeSaved",e.target.value)} placeholder="e.g. 6" min="0.5" step="0.5" style={{...inp,maxWidth:160}}/><p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:5}}>Shown as "~{form.timeSaved||"?"}h saved · seller estimate" on your listing.</p></div>
            <div><label style={lbl}>Works with *</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{PLATFORMS.map(p=><button key={p} onClick={()=>toggleP(p)} style={{background:form.platforms.includes(p)?T.goldSoft:"transparent",border:`1px solid ${form.platforms.includes(p)?T.gold:T.borderSub}`,color:form.platforms.includes(p)?T.gold:T.muted,borderRadius:6,padding:"6px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer"}}>{p}</button>)}</div></div>
            <div><label style={lbl}>Upload SKILL.md *</label><div style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"22px",textAlign:"center",cursor:"pointer"}} onClick={()=>document.getElementById("sf").click()}><input id="sf" type="file" accept=".md" style={{display:"none"}} onChange={e=>set("file",e.target.files[0])}/><div style={{fontFamily:"Inter",fontSize:13,color:form.file?T.green:T.muted}}>{form.file?`✓ ${form.file.name}`:"Click to upload SKILL.md"}</div></div></div>
            <button onClick={()=>setStep(2)} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer"}}>Continue →</button>
          </div>
        )}
        {step===2&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:T.goldSoft,border:`1px solid ${T.gold}35`,borderRadius:10,padding:14}}><h3 style={{fontFamily:"Inter",fontSize:13,fontWeight:700,color:T.gold,margin:"0 0 6px"}}>Proof of concept is required</h3><p style={{fontFamily:"Inter",fontSize:12,color:T.muted,margin:0,lineHeight:1.5}}>Every skill must ship with evidence it works. Buyers see the real project your skill powered.</p></div>
            <div><label style={lbl}>Project URL * <span style={{color:T.coral}}>enforced</span></label><input value={form.pocUrl} onChange={e=>set("pocUrl",e.target.value)} placeholder="https://yourproject.com" style={{...inp,fontFamily:"JetBrains Mono",fontSize:12}}/></div>
            <div><label style={lbl}>Cover Screenshot *</label><div style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"28px",textAlign:"center"}}><div style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>📸 PNG or JPG, max 2MB</div></div></div>
            <div style={{display:"flex",gap:10}}><button onClick={()=>setStep(1)} style={{flex:1,background:"transparent",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:8,padding:"10px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>← Back</button><button onClick={()=>setStep(3)} style={{flex:2,background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Continue →</button></div>
          </div>
        )}
        {step===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div><label style={lbl}>Pricing</label><div style={{display:"flex",gap:10}}>{["free","paid"].map(p=><button key={p} onClick={()=>set("price",p)} style={{flex:1,background:form.price===p?T.goldSoft:"transparent",border:`1.5px solid ${form.price===p?T.gold:T.borderSub}`,color:form.price===p?T.gold:T.muted,borderRadius:8,padding:"13px",fontFamily:"Inter",fontWeight:600,fontSize:13,cursor:"pointer"}}>{p==="free"?"🆓 Free":"💰 Paid"}</button>)}</div></div>
            {form.price==="paid"&&<div><label style={lbl}>Price (USD) *</label><input type="number" value={form.amount} onChange={e=>set("amount",e.target.value)} placeholder="e.g. 5" min="1" style={inp}/>{form.amount&&<p style={{fontFamily:"Inter",fontSize:12,color:T.muted,marginTop:5}}>You earn <span style={{color:T.green}}>${(form.amount*0.9).toFixed(2)}</span> per sale</p>}</div>}
            <div style={{background:T.surface,border:`1px solid ${T.borderSub}`,borderRadius:10,padding:14}}>{["Skill submitted for review","Skill Exchange verifies proof of concept","Skill goes live within 48 hours","You get notified and start earning"].map((t,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:i<3?8:0,alignItems:"flex-start"}}><span style={{fontFamily:"Inter",fontSize:10,fontWeight:600,color:T.gold,marginTop:1}}>0{i+1}</span><span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{t}</span></div>)}</div>
            <div style={{display:"flex",gap:10}}><button onClick={()=>setStep(2)} style={{flex:1,background:"transparent",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:8,padding:"10px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>← Back</button><button onClick={()=>setDone(true)} style={{flex:2,background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Submit Skill ✦</button></div>
          </div>
        )}
      </div>
    </PageWrap>
  );
}

// ── LEADERBOARD ───────────────────────────────────────────────────
function LeaderboardPage({onNavigate,T}) {
  const [tab,setTab]=useState("builders");
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
        {tab==="builders"&&(
          <>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:10,marginBottom:32,flexWrap:"wrap"}}>
              {[LB_BUILDERS[1],LB_BUILDERS[0],LB_BUILDERS[2]].map((e,i)=>{
                const h=[112,148,88][i];const isFirst=e.rank===1;
                return (
                  <div key={e.rank} style={{textAlign:"center",flex:"1 1 100px",maxWidth:155}}>
                    <div onClick={()=>onNavigate("publicprofile",PROFILES[e.name])} style={{fontFamily:"Playfair Display",fontSize:isFirst?15:12,color:isFirst?T.gold:T.muted,marginBottom:6,fontWeight:700,cursor:"pointer"}}>{e.name}</div>
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
              {LB_BUILDERS.map((e,i)=>(
                <div key={e.rank} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderBottom:i<4?`1px solid ${T.borderSub}`:"none"}}>
                  <span style={{fontFamily:"Inter",fontSize:12,fontWeight:600,color:i===0?T.gold:T.muted,width:24}}>#{e.rank}</span>
                  <BuilderIcon b={e.badge} T={T}/>
                  <span onClick={()=>onNavigate("publicprofile",PROFILES[e.name])} style={{fontFamily:"Inter",fontWeight:600,color:T.text,flex:1,cursor:"pointer"}} onMouseEnter={ev=>ev.target.style.color=T.gold} onMouseLeave={ev=>ev.target.style.color=T.text}>{e.name}</span>
                  <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{e.sales} sales</span>
                  <Stars rating={e.rating} T={T}/>
                </div>
              ))}
            </div>
          </>
        )}
        {tab==="skills"&&(
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
            {LB_SKILLS.map((s,i)=>{
              const skill=SKILLS.find(sk=>sk.id===s.skillId);
              return (
                <div key={s.rank} onClick={()=>skill&&onNavigate("skill",skill)} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",borderBottom:i<4?`1px solid ${T.borderSub}`:"none",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.elevated}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{fontFamily:"Inter",fontSize:12,fontWeight:600,color:i===0?T.gold:T.muted,width:24}}>#{s.rank}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"Inter",fontWeight:600,color:T.text,fontSize:13}}>{s.title}</div>
                    <div style={{fontFamily:"Inter",fontSize:11,color:T.muted}}>by <span onClick={e=>{e.stopPropagation();onNavigate("publicprofile",PROFILES[s.author]);}} style={{color:T.gold,cursor:"pointer"}}>{s.author}</span></div>
                  </div>
                  <TimeSaved hours={s.timeSaved} T={T}/>
                  <span style={{fontFamily:"Inter",fontSize:12,color:T.muted}}>{s.downloads} dl</span>
                  <Stars rating={s.rating} T={T}/>
                </div>
              );
            })}
          </div>
        )}
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

// ── GET VERIFIED ──────────────────────────────────────────────────
function GetVerifiedPage({user,onShowAuth,T}) {
  const [applied,setApplied]=useState(false);
  const [url,setUrl]=useState("");
  const [note,setNote]=useState("");
  const steps=[{s:"done",l:"Create an account",d:"Sign up and publish at least one skill."},{s:"done",l:"Publish with proof of concept",d:"Your skill must have a live project URL and cover screenshot."},{s:"active",l:"Apply for verification",d:"Submit your best skill and a note about your work."},{s:"pending",l:"Review by Skill Exchange",d:"We manually check your proof of concept within 48 hours."},{s:"pending",l:"Verified badge granted",d:"Your profile and skills show the Verified Creator badge."}];
  const sc={done:T.green,active:T.gold,pending:T.muted};
  const inp={width:"100%",background:T.elevated,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontFamily:"Inter",fontSize:13,boxSizing:"border-box",outline:"none"};
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
              <div><label style={{fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Your best skill URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Link to your published skill" style={inp}/></div>
              <div><label style={{fontFamily:"Inter",fontSize:11,fontWeight:600,color:T.muted,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Note about your work (optional)</label><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Tell us about the product you built with this skill..." style={{...inp,minHeight:70,resize:"vertical"}}/></div>
              <button onClick={()=>{if(!user){onShowAuth();return;}setApplied(true);}} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Submit Application</button>
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

// ── LIBRARY ───────────────────────────────────────────────────────
function LibraryPage({onNavigate,T}) {
  const owned=SKILLS.filter(s=>s.price===0||s.id===1);
  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)"}}>
        <h1 style={{fontFamily:"Playfair Display",fontSize:24,color:T.text,margin:"0 0 6px"}}>My Library</h1>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,marginBottom:24}}>Skills you've purchased or downloaded.</p>
        {owned.length===0
          ?<div style={{textAlign:"center",padding:"60px 0",color:T.muted,fontFamily:"Inter"}}>No skills yet. <button onClick={()=>onNavigate("marketplace")} style={{background:"none",border:"none",color:T.gold,cursor:"pointer",fontFamily:"Inter",fontSize:13}}>Browse →</button></div>
          :<div style={{display:"flex",flexDirection:"column",gap:12}}>
            {owned.map(s=>(
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
                  <button onClick={()=>onNavigate("skill",s)} style={{background:"none",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:6,padding:"7px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer"}}>View</button>
                  <button style={{background:`linear-gradient(135deg,${T.green},#2a9a78)`,color:"#fff",border:"none",borderRadius:6,padding:"7px 14px",fontFamily:"Inter",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><Ic.Download s={12} c="#fff"/>Download</button>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </PageWrap>
  );
}

// ── PUBLIC PROFILE ────────────────────────────────────────────────
function PublicProfilePage({profile,onNavigate,T}) {
  if(!profile) return <PageWrap><div style={{padding:40,textAlign:"center",color:T.muted,fontFamily:"Inter"}}>Profile not found.</div></PageWrap>;
  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)",maxWidth:800,margin:"0 auto"}}>
        <button onClick={()=>onNavigate("leaderboard")} style={{background:"none",border:"none",color:T.muted,fontFamily:"Inter",fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:28,flexWrap:"wrap"}}>
          <div style={{width:60,height:60,minWidth:60,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{profile.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
              <h1 style={{fontFamily:"Playfair Display",fontSize:22,color:T.text,margin:0}}>{profile.name}</h1>
              {profile.verified&&<VerifiedStamp size={24} T={T}/>}
            </div>
            <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,margin:"0 0 6px"}}>@{profile.username} · {profile.location}</p>
            <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:"0 0 10px"}}>{profile.bio}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{profile.badges.map(b=><SellerBdg key={b} b={b} T={T}/>)}</div>
          </div>
        </div>
        <h2 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,marginBottom:16}}>Published Skills</h2>
        {profile.skills.length===0
          ?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No skills published yet.</p>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>{profile.skills.map(s=><SkillCard key={s.id} skill={s} onNavigate={onNavigate} T={T}/>)}</div>
        }
      </div>
    </PageWrap>
  );
}

// ── MY PROFILE + LOGOUT ───────────────────────────────────────────
function MyProfilePage({user,onNavigate,onLogout,onShowAuth,T}) {
  const [showLogout,setShowLogout]=useState(false);
  const profile=PROFILES[user?.username]||{name:user?.name||"You",username:user?.username||"you",bio:"",location:"",skills:[],badges:[],verified:false};
  const totalDL=profile.skills.reduce((s,x)=>s+x.downloads,0);
  const avgR=profile.skills.length?(profile.skills.reduce((s,x)=>s+x.rating,0)/profile.skills.length).toFixed(1):"—";

  if(showLogout) return (
    <PageWrap>
      <div style={{padding:"60px clamp(16px,4vw,40px)",maxWidth:440,margin:"0 auto",textAlign:"center"}}>
        <div style={{width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display",fontSize:28,fontWeight:700,color:"#fff",margin:"0 auto 16px"}}>{profile.name[0]}</div>
        <h2 style={{fontFamily:"Playfair Display",fontSize:22,color:T.text,margin:"0 0 4px"}}>{profile.name}</h2>
        <p style={{fontFamily:"Inter",fontSize:13,color:T.muted,margin:"0 0 32px"}}>@{profile.username}</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>setShowLogout(false)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:10,padding:"13px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Ic.User s={16} c={T.text}/> Continue as {profile.username}
          </button>
          <button onClick={()=>{onLogout();setShowLogout(false);onShowAuth();}} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.muted,borderRadius:10,padding:"13px",fontFamily:"Inter",fontWeight:500,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Ic.User s={16} c={T.muted}/> Switch Account
          </button>
          <button onClick={()=>{onLogout();setShowLogout(false);}} style={{background:T.coralSoft,border:`1px solid ${T.coral}40`,color:T.coral,borderRadius:10,padding:"13px",fontFamily:"Inter",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Ic.LogOut s={16} c={T.coral}/> Sign Out
          </button>
        </div>
        <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:24}}>Skill Exchange · skillexchange.tapdot.org</p>
      </div>
    </PageWrap>
  );

  return (
    <PageWrap>
      <div style={{padding:"28px clamp(16px,4vw,40px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:28,flexWrap:"wrap"}}>
          <div style={{width:60,height:60,minWidth:60,borderRadius:"50%",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Playfair Display",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{profile.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
              <h1 style={{fontFamily:"Playfair Display",fontSize:22,color:T.text,margin:0}}>{profile.name}</h1>
              {profile.verified&&<VerifiedStamp size={24} T={T}/>}
            </div>
            <p style={{fontFamily:"Inter",fontSize:11,color:T.muted,margin:"0 0 10px"}}>@{profile.username}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{profile.badges.map(b=><SellerBdg key={b} b={b} T={T}/>)}</div>
          </div>
          <button onClick={()=>setShowLogout(true)} style={{background:"none",border:`1px solid ${T.borderSub}`,color:T.muted,borderRadius:8,padding:"7px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <Ic.LogOut s={14} c={T.muted}/> Account
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:28}}>
          {[["Skills",profile.skills.length],["Downloads",totalDL],["Avg Rating",avgR]].map(([l,v])=>(
            <div key={l} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontFamily:"Inter",fontSize:20,fontWeight:700,color:T.text}}>{v}</div>
              <div style={{fontFamily:"Inter",fontSize:11,color:T.muted,marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <h2 style={{fontFamily:"Playfair Display",fontSize:18,color:T.text,margin:0}}>My Skills</h2>
          <button onClick={()=>onNavigate("publish")} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:6,padding:"7px 14px",fontFamily:"Inter",fontSize:12,cursor:"pointer"}}>+ Publish New</button>
        </div>
        {profile.skills.length===0
          ?<p style={{fontFamily:"Inter",fontSize:13,color:T.muted}}>No skills published yet.</p>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,marginBottom:24}}>{profile.skills.map(s=><SkillCard key={s.id} skill={s} onNavigate={onNavigate} T={T}/>)}</div>
        }
        <button onClick={()=>onNavigate("getverified")} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,color:T.gold,borderRadius:8,padding:"10px 20px",fontFamily:"Inter",fontSize:13,fontWeight:600,cursor:"pointer"}}>✦ Get Verified</button>
      </div>
    </PageWrap>
  );
}

// ── CREATE A SKILL ────────────────────────────────────────────────
const PH={
  Claude:  {name:"Claude / Claude Code",note:"Works best in Claude Code. Paste as your first message in a new project session."},
  ChatGPT: {name:"ChatGPT",note:"Paste into a new chat. Ask ChatGPT to save the output as a .md file."},
  Gemini:  {name:"Gemini",note:"Paste into Gemini Advanced. Works well in Google Docs integration too."},
  Cursor:  {name:"Cursor",note:"The output can also be saved as .cursorrules in your project root."},
  Copilot: {name:"GitHub Copilot",note:"Paste into a Copilot Chat session or save as a workspace instruction file."},
};
const PT={
  Claude:  (cat,desc,ts)=>`You are an expert in ${cat.toLowerCase()} development. Generate a SKILL.md file for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Estimated time saved: ~${ts||"?"}h per use

Include these sections:
## 1. Philosophy — core principles and constraints
## 2. Tech Stack — specific tools, libraries, versions
## 3. Patterns — reusable code patterns with real examples
## 4. Anti-patterns — common mistakes to avoid
## 5. Usage — exact steps to use in a Claude Code session
## 6. Example Output — a before/after or sample

Be specific and opinionated. Include real code. This will be used by other developers on Skill Exchange.`,
  ChatGPT: (cat,desc,ts)=>`Act as a senior ${cat.toLowerCase()} expert. Create a SKILL.md file for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Time saved: ~${ts||"?"}h

Sections: 1) Overview & Philosophy 2) Required Tools 3) Core Patterns with code 4) Anti-patterns 5) How to Use 6) Sample Output

Make it specific and actionable. Output as a clean .md file.`,
  Gemini:  (cat,desc,ts)=>`Generate a SKILL.md for:

Skill: ${desc||"[describe what your skill does]"}
Domain: ${cat}
Time saved per use: ~${ts||"?"}h

Sections: Philosophy · Tools & Dependencies · Reusable Patterns · Anti-patterns · Usage Guide · Example

Be opinionated and specific. Generic advice is not useful.`,
  Cursor:  (cat,desc,ts)=>`Generate a .cursorrules compatible SKILL.md for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Time saved: ~${ts||"?"}h

Include: Rules & Philosophy · Stack & Setup · Code Patterns · Anti-patterns · Usage

Be precise. Use real code. Every rule must be actionable.`,
  Copilot: (cat,desc,ts)=>`Create a GitHub Copilot workspace instruction file (SKILL.md) for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Time saved: ~${ts||"?"}h

Sections: 1) Skill Overview 2) Coding Conventions 3) Reusable Patterns 4) Edge Cases 5) How to Use

Include real code examples.`,
};

function CreateSkillPage({onNavigate,onShowAuth,user,T}) {
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
          <button onClick={()=>setGenerated(true)} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"12px 28px",fontFamily:"Inter",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:`0 4px 16px ${T.gold}22`}}>Generate Prompt ✦</button>
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
                <button onClick={()=>{user?onNavigate("publish"):onShowAuth();}} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:8,padding:"11px 22px",fontFamily:"Inter",fontWeight:700,fontSize:13,cursor:"pointer"}}>Publish Your Skill →</button>
                <button onClick={()=>onNavigate("marketplace")} style={{background:"transparent",color:T.muted,border:`1px solid ${T.borderSub}`,borderRadius:8,padding:"11px 22px",fontFamily:"Inter",fontSize:13,cursor:"pointer"}}>Browse skills</button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageWrap>
  );
}

// ── NAV ───────────────────────────────────────────────────────────
const NAV=[
  {id:"home",label:"Home",pub:true},
  {id:"marketplace",label:"Marketplace",pub:true},
  {id:"createskill",label:"Create a Skill",pub:true},
  {id:"leaderboard",label:"Leaderboard",pub:true},
  {id:"getverified",label:"Get Verified",pub:true},
  {id:"library",label:"My Library",pub:false},
  {id:"profile",label:"My Profile",pub:false},
];

// ── APP ───────────────────────────────────────────────────────────
export default function App() {
  const [dark,setDark]=useState(true);
  const T=dark?DARK:LIGHT;
  const [page,setPage]=useState("home");
  const [selSkill,setSelSkill]=useState(null);
  const [selProfile,setSelProfile]=useState(null);
  const [marketCat,setMarketCat]=useState("All");
  const [user,setUser]=useState(null);
  const [showAuth,setShowAuth]=useState(false);
  const [pending,setPending]=useState(null);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);

  const navigate=(p,data)=>{
    if(p==="skill"){setSelSkill(data);setPage("skill");setMobileMenuOpen(false);return;}
    if(p==="publicprofile"){setSelProfile(data);setPage("publicprofile");setMobileMenuOpen(false);return;}
    if(p==="marketplace"&&data?.cat){setMarketCat(data.cat);setPage("marketplace");setMobileMenuOpen(false);return;}
    setPage(p);setMobileMenuOpen(false);
  };
  const showAuth2=()=>{setShowAuth(true);};
  const requireAuth=(cb)=>{if(user){cb();return;}setPending(()=>cb);setShowAuth(true);};
  const handleLogin=(name,username)=>{setUser({name,username});setShowAuth(false);if(pending){pending();setPending(null);}};
  const handleLogout=()=>{setUser(null);setPage("home");setMobileMenuOpen(false);};

  const active=["skill","publicprofile"].includes(page)?"marketplace":page;
  const visibleNav=NAV.filter(n=>n.pub||user);

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text}}>
      <style>{FONTS}</style>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;}
        input:focus,textarea:focus,select:focus{outline:none;border-color:${T.gold}!important;}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        .nav-desktop-links{display:flex;gap:1px;flex:1;overflow-x:auto;min-width:0;}
        .nav-hamburger{display:none;}
        .nav-brand-text{display:inline;}
        @media(max-width:760px){
          .nav-desktop-links{display:none!important;}
          .nav-hamburger{display:flex!important;}
        }
        @media(max-width:420px){
          .nav-brand-text{display:none;}
        }
      `}</style>

      {/* Global parallax background */}
      <ParallaxBg T={T}/>

      {/* Auth modal */}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin} T={T}/>}

      {/* Nav */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:dark?"#141414":"#ffffff",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 clamp(12px,3vw,20px)",height:52,gap:8}}>
        <button onClick={()=>navigate("home")} style={{background:"none",border:"none",cursor:"pointer",padding:0,marginRight:8,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <Logo size={26} T={T}/>
          <span className="nav-brand-text" style={{fontFamily:"Playfair Display",fontSize:15,fontWeight:700,color:T.gold,whiteSpace:"nowrap"}}>Skill Exchange</span>
        </button>

        {/* Desktop nav links */}
        <div className="nav-desktop-links">
          {visibleNav.map(n=>(
            <button key={n.id} onClick={()=>n.pub?navigate(n.id):requireAuth(()=>navigate(n.id))} style={{background:active===n.id?T.goldSoft:"transparent",border:"none",borderRadius:6,padding:"6px 11px",fontFamily:"Inter",fontSize:12,fontWeight:active===n.id?600:400,color:active===n.id?T.gold:T.muted,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{n.label}</button>
          ))}
        </div>

        <div style={{display:"flex",gap:8,alignItems:"center",marginLeft:"auto",flexShrink:0}}>
          <button onClick={()=>setDark(d=>!d)} style={{background:"none",border:`1px solid ${T.borderSub}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",display:"flex",alignItems:"center",flexShrink:0}}>
            {dark?<Ic.Sun s={13} c={T.muted}/>:<Ic.Moon s={13} c={T.muted}/>}
          </button>
          {user
            ?<button onClick={()=>navigate("profile")} style={{background:T.goldSoft,border:`1px solid ${T.gold}`,borderRadius:6,padding:"5px 12px",fontFamily:"Inter",fontWeight:600,fontSize:12,color:T.gold,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{user.username}</button>
            :<button onClick={()=>setShowAuth(true)} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontFamily:"Inter",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>Sign In</button>
          }
          {/* Hamburger — mobile only */}
          <button className="nav-hamburger" onClick={()=>setMobileMenuOpen(o=>!o)} style={{background:mobileMenuOpen?T.goldSoft:"none",border:`1px solid ${T.borderSub}`,borderRadius:6,width:32,height:30,cursor:"pointer",alignItems:"center",justifyContent:"center",flexShrink:0}} aria-label="Menu">
            <div style={{width:14,display:"flex",flexDirection:"column",gap:3,margin:"0 auto"}}>
              <span style={{height:1.5,background:T.text,borderRadius:1}}/>
              <span style={{height:1.5,background:T.text,borderRadius:1}}/>
              <span style={{height:1.5,background:T.text,borderRadius:1}}/>
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {mobileMenuOpen&&(
        <div style={{position:"sticky",top:52,zIndex:99,background:dark?"#141414":"#ffffff",borderBottom:`1px solid ${T.border}`,padding:"8px 12px",display:"flex",flexDirection:"column",gap:2,boxShadow:"0 12px 24px rgba(0,0,0,0.2)"}}>
          {visibleNav.map(n=>(
            <button key={n.id} onClick={()=>n.pub?navigate(n.id):requireAuth(()=>navigate(n.id))} style={{background:active===n.id?T.goldSoft:"transparent",border:"none",borderRadius:6,padding:"11px 12px",fontFamily:"Inter",fontSize:14,fontWeight:active===n.id?600:400,color:active===n.id?T.gold:T.text,cursor:"pointer",textAlign:"left",width:"100%"}}>{n.label}</button>
          ))}
        </div>
      )}

      {/* Pages */}
      {page==="home"&&<HomePage onNavigate={navigate} T={T} onRequireAuth={requireAuth} user={user} onShowAuth={showAuth2}/>}
      {page==="marketplace"&&<MarketplacePage onNavigate={navigate} T={T} initCat={marketCat}/>}
      {page==="skill"&&<SkillDetailPage skill={selSkill} onNavigate={navigate} user={user} onShowAuth={showAuth2} T={T}/>}
      {page==="publish"&&<PublishPage T={T}/>}
      {page==="leaderboard"&&<LeaderboardPage onNavigate={navigate} T={T}/>}
      {page==="getverified"&&<GetVerifiedPage user={user} onShowAuth={showAuth2} T={T}/>}
      {page==="library"&&<LibraryPage onNavigate={navigate} T={T}/>}
      {page==="profile"&&<MyProfilePage user={user} onNavigate={navigate} onLogout={handleLogout} onShowAuth={showAuth2} T={T}/>}
      {page==="publicprofile"&&<PublicProfilePage profile={selProfile} onNavigate={navigate} T={T}/>}
      {page==="createskill"&&<CreateSkillPage onNavigate={navigate} onShowAuth={showAuth2} user={user} T={T}/>}

      {/* Footer */}
      <div style={{position:"relative",zIndex:1,borderTop:`1px solid ${T.border}`,padding:"16px clamp(16px,4vw,40px)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:48,background:dark?"#141414":"#ffffff"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}><Logo size={20} T={T}/><span style={{fontFamily:"Playfair Display",fontSize:13,fontWeight:700,color:T.gold,whiteSpace:"nowrap"}}>Skill Exchange</span></div>
        <span style={{fontFamily:"Inter",fontSize:11,color:T.muted,textAlign:"center"}}>Skill Exchange verifies this · Every skill ships with proof it works</span>
        <span style={{fontFamily:"Inter",fontSize:11,color:T.muted,flexShrink:0}}>skillexchange.tapdot.org</span>
      </div>
    </div>
  );
}
