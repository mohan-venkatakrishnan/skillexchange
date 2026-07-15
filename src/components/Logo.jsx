export default function Logo({ size = 32, T }) {
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
