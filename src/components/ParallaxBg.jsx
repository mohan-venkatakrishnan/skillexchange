// ── GLOBAL PARALLAX BACKGROUND ── (verbatim from prototype)
export default function ParallaxBg({ T }) {
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
