export const RESOURCES = ['wood', 'brick', 'wool', 'wheat', 'ore'];
export const COLORS = ['#4886d8', '#df5b55', '#e9a448', '#e4e5dc', '#8b6bc5', '#459d77'];
export const BASE_NUMBERS = [5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11];
export const LARGE_NUMBERS = [2,5,4,6,3,9,8,11,11,10,6,3,8,4,8,10,11,12,10,5,4,9,5,9,12,3,2,6];
const base = [['desert',0],['wheat',8],['wool',11],['brick',6],['wool',3],['wood',4],['ore',9],['wood',10],['wheat',5],['brick',12],['wood',11],['wool',5],['wheat',2],['brick',9],['ore',4],['wood',8],['ore',6],['wheat',3],['wool',10]];
const large = [['wheat',10],['wool',6],['desert',0],['brick',6],['wheat',2],['ore',9],['wheat',11],['wood',3],['ore',11],['wood',5],['wheat',10],['wool',4],['desert',0],['wool',5],['wheat',4],['brick',6],['wool',3],['brick',8],['wood',12],['ore',10],['wool',2],['brick',4],['wood',11],['wood',8],['wheat',3],['ore',9],['wheat',5],['brick',9],['wool',12],['brick',8]];
// Terrain transcribed from the 2025 expansion's fixed board diagram.
large[0][0]='brick'; large[6][0]='brick'; large[15][0]='ore';
large[17][0]='wheat'; large[25][0]='wood'; large[29][0]='ore';
export function shuffle(a, random) { for (let i=a.length-1;i>0;i--) { const j=random(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
export function makeBoard(expanded, variable, random) {
  const rows = expanded ? [3,4,5,6,5,4,3] : [3,4,5,4,3];
  const board = { hexes: [], vertices: [], edges: [], ports: [] };
  const vertices = new Map(), edges = new Map();
  const preset = expanded ? large : base;
  let id=0;
  rows.forEach((length,row) => {
    for(let col=0;col<length;col++) {
      const x=(col-(length-1)/2)*Math.sqrt(3)*52, y=(row-(rows.length-1)/2)*78;
      const h={id:id++, x,y,resource:preset[id-1][0],number:preset[id-1][1],vertices:[],edges:[]};
      for(let k=0;k<6;k++) {
        const angle=(60*k-30)*Math.PI/180, vx=x+52*Math.cos(angle), vy=y+52*Math.sin(angle);
        const key=`${Math.round(vx*1000)},${Math.round(vy*1000)}`;
        if(!vertices.has(key)) { const v={id:board.vertices.length,x:vx,y:vy,hexes:[],edges:[],building:null}; vertices.set(key,v.id); board.vertices.push(v); }
        const v=board.vertices[vertices.get(key)]; v.hexes.push(h.id); h.vertices.push(v.id);
      }
      for(let k=0;k<6;k++) {
        const pair=[h.vertices[k],h.vertices[(k+1)%6]].sort((a,b)=>a-b), key=pair.join(',');
        if(!edges.has(key)) { const e={id:board.edges.length,vertices:pair,hexes:[],owner:null}; edges.set(key,e.id); board.edges.push(e); pair.forEach(v=>board.vertices[v].edges.push(e.id)); }
        const e=board.edges[edges.get(key)]; e.hexes.push(h.id); h.edges.push(e.id);
      }
      board.hexes.push(h);
    }
  });
  if(variable) {
    const terrain=shuffle(preset.map(h=>h[0]),random);
    board.hexes.forEach((h,i)=>{h.resource=terrain[i]; h.number=0;});
    // Peel perimeter rings counterclockwise, beginning at the upper-right corner.
    const remaining=new Set(board.hexes.map(h=>h.id)), order=[];
    while(remaining.size) {
      const ring=board.hexes.filter(h=>remaining.has(h.id) && h.edges.some(e=>board.edges[e].hexes.length===1 || board.edges[e].hexes.some(n=>!remaining.has(n))));
      const cx=ring.reduce((s,h)=>s+h.x,0)/ring.length, cy=ring.reduce((s,h)=>s+h.y,0)/ring.length;
      const angle=h=>(Math.atan2(-(h.y-cy),h.x-cx)-Math.PI/3+Math.PI*2)%(Math.PI*2);
      ring.sort((a,b)=>angle(a)-angle(b)); ring.forEach(h=>{order.push(h);remaining.delete(h.id);});
    }
    let n=0; const numbers=expanded?LARGE_NUMBERS:BASE_NUMBERS;
    order.forEach(h=>{if(h.resource!=='desert')h.number=numbers[n++];});
  }
  const coast=board.edges.filter(e=>e.hexes.length===1).sort((a,b)=>{
    const angle=e=>Math.atan2(board.vertices[e.vertices[0]].y+board.vertices[e.vertices[1]].y,board.vertices[e.vertices[0]].x+board.vertices[e.vertices[1]].x);
    return angle(a)-angle(b);
  });
  const ports=expanded?[[0,4,'any'],[1,5,'wool'],[6,5,'any'],[17,0,'any'],[26,0,'brick'],[29,0,'any'],[29,2,'wood'],[27,2,'any'],[23,3,'wool'],[18,3,'wheat'],[7,3,'ore']]:[[0,4,'any'],[1,5,'wool'],[6,5,'any'],[11,0,'any'],[18,0,'brick'],[18,2,'wood'],[16,2,'any'],[12,3,'wheat'],[3,3,'ore']];
  // A rotation keeps the coast's port spacing intact. Terrain and number setup
  // remain independent; fixed games use the printed coastal layout.
  const offset=variable?random(coast.length):0;
  ports.forEach(([hex,side,resource])=>{const original=board.hexes[hex].edges[side];const e=coast[(coast.findIndex(e=>e.id===original)+offset)%coast.length];board.ports.push({resource,vertices:e.vertices,edge:e.id});});
  return board;
}
export function commonVertex(board, hexes) { return board.vertices.find(v=>hexes.every(h=>v.hexes.includes(h))); }
