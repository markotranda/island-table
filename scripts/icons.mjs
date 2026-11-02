// Generates the resource icon sprite: each icon is a 64x64 <symbol> built from flat tones (base, shade, highlight) with a warm outline,
// wrapped in a cream halo so it separates from terrain of a similar colour.
const f=n=>+n.toFixed(2);
const INK='#33261a';
const ellipse=(cx,cy,rx,ry,deg,fill,extra='')=>`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(deg)} ${f(cx)} ${f(cy)})" fill="${fill}"${extra}/>`;
const poly=(pts,fill,extra='')=>`<polygon points="${pts}" fill="${fill}"${extra}/>`;
const OUT=`stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const sparkle=(x,y,r,fill='#ffffff')=>`<path d="M${x},${y-r} Q${x+r*0.18},${y-r*0.18} ${x+r},${y} Q${x+r*0.18},${y+r*0.18} ${x},${y+r} Q${x-r*0.18},${y+r*0.18} ${x-r},${y} Q${x-r*0.18},${y-r*0.18} ${x},${y-r}Z" fill="${fill}"/>`;

function pine(x,base,h,w,{light,mid,dark,trunk,trunkDark}){
  // Three stacked tiers drawn bottom-up: base tone, a shaded right half and a lit band on the left edge. Tops jitter slightly so it feels hand drawn.
  const tiers=[[0.42,1,0.6],[0.2,0.78,-0.7],[0,0.52,0.4]];let s=`<rect x="${f(x-w*0.11)}" y="${f(base-h*0.2)}" width="${f(w*0.22)}" height="${f(h*0.2)}" fill="${trunk}" ${OUT}/><rect x="${f(x)}" y="${f(base-h*0.2+1)}" width="${f(w*0.1)}" height="${f(h*0.2-2)}" fill="${trunkDark}"/>`;
  for(const [top,bot,jit] of tiers){const ty=base-h+top*h*0.8,by=base-h*0.2-(1-bot)*h*0.55,hw=w/2*bot,tx=x+jit;
    s+=poly(`${f(tx)},${f(ty)} ${f(x+hw)},${f(by)} ${f(x-hw)},${f(by)}`,mid,` ${OUT}`)+poly(`${f(tx)},${f(ty+1.5)} ${f(x+hw-2)},${f(by-1.2)} ${f(tx+1)},${f(by-1.2)}`,dark)+poly(`${f(tx-0.6)},${f(ty+2.5)} ${f(x-hw+2.6)},${f(by-1.3)} ${f(x-hw*0.5)},${f(by-1.3)}`,light);}
  return s;
}
const wood=()=>pine(22,53,40,22,{light:'#86bd64',mid:'#3e7a3c',dark:'#2c5e30',trunk:'#7b4b2a',trunkDark:'#5a3520'})+pine(39,58,51,30,{light:'#9fd07a',mid:'#4f9346',dark:'#367138',trunk:'#8a5530',trunkDark:'#633b22'});

function brick(x,y,fill,lit,shade,side){
  // A brick in 3/4 view: lit top face, front face with highlight and shaded lip, and a dark right side on row ends.
  const w=17,h=9.5,d=2.6;return poly(`${x},${y} ${x+d},${y-d} ${x+w+d},${y-d} ${x+w},${y}`,lit,` ${OUT}`)+(side?poly(`${x+w},${y} ${x+w+d},${y-d} ${x+w+d},${y+h-d} ${x+w},${y+h}`,shade,` ${OUT}`):'')
    +`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.2" fill="${fill}" ${OUT}/><rect x="${x+1.3}" y="${y+h-3.2}" width="${w-2.6}" height="2" rx="1" fill="${shade}"/>`;}
const B=['#c4572f','#e8946a','#93391c'],L=['#d36a3c','#f0a47a','#a2441f'],D=['#b04b28','#d98058','#84321a'];
const bricks=()=>[[4,47,B,0],[22,47,L,0],[40,47,D,1],[13,36.5,D,0],[31,36.5,B,1],[22,26,L,1]].map(([x,y,[a,b,c],side])=>brick(x,y,a,b,c,side)).join('');

function wool(){
  const puffs=[[25,32,9],[32,24.5,9.5],[42,25,9.5],[50,32,8.5],[45,41,9],[33,42,9],[38,33,11]];
  const legs=[28,34,42,48].map(x=>`<rect x="${x}" y="46" width="4.4" height="10" rx="1.8" fill="#4a3f38" ${OUT}/>`).join('');
  return legs
    +puffs.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r+1.7}" fill="${INK}"/>`).join('')
    +puffs.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#e6dac2"/>`).join('')
    +puffs.map(([x,y,r])=>`<circle cx="${x-1.5}" cy="${y-1.9}" r="${r-2.3}" fill="#fbf7ee"/>`).join('')
    +`<path d="M35,31 q2.5,-3.5 5,0 M42,39 q2.5,-3.5 5,0" stroke="#cbbd9f" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    // Head forward and large enough to read at small sizes: ears, face, light muzzle, bright eye.
    +ellipse(10.5,27,2.5,4.9,-55,'#4a3f38',` ${OUT}`)+ellipse(20.5,25.8,2.3,4.5,35,'#4a3f38',` ${OUT}`)
    +ellipse(15,34.5,7.2,8.6,-14,'#4a3f38',` ${OUT}`)+ellipse(12.7,39.8,4.1,2.9,-14,'#75665a')
    +`<circle cx="14.2" cy="32.2" r="2.1" fill="#fbf7ee"/><circle cx="14.6" cy="32.5" r="1" fill="${INK}"/><ellipse cx="11" cy="39.3" rx="1.2" ry=".8" fill="${INK}"/>`;
}

function wheat(){
  // Three stalks fanning from a red twine tie. Each head is a long, narrow column of grains with one shared outline (scalloped edge) and awns.
  const tie={x:32,y:42},stalks=[[[18,8],[25,58]],[[32,4],[32,59]],[[46,8],[39,58]]];let stems='',awns='',outline='',grains='';
  for(const [[tx,ty],[bx,by]] of stalks){
    const d=`M${bx},${by} Q${tie.x+(bx-tie.x)*0.3},${tie.y+4} ${tie.x+(tx-tie.x)*0.12},${tie.y} T${tx},${ty+18}`;
    stems+=`<path d="${d}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#e0b04a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    const dx=tx-tie.x,dy=ty-tie.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=-uy,ny=ux,ang=Math.atan2(uy,ux)*180/Math.PI+90;
    const g=[];for(let k=4;k>=0;k--){const px=tx-ux*(k*3.5+3.4),py=ty-uy*(k*3.5+3.4);g.push([px+nx*2.4,py+ny*2.4,ang-24,'#f2c94c'],[px-nx*2.4,py-ny*2.4,ang+24,'#d39a2b']);}
    g.push([tx,ty+0.5,ang,'#f7d86e']);
    for(const turn of [-28,0,28]){const a=Math.atan2(uy,ux)+turn*Math.PI/180,sx=tx-ux*(turn?4:0),sy=ty-uy*(turn?4:0),ex=sx+Math.cos(a)*7,ey=sy+Math.sin(a)*7;
      awns+=`<path d="M${f(sx)},${f(sy)} L${f(ex)},${f(ey)}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M${f(sx)},${f(sy)} L${f(ex)},${f(ey)}" stroke="#b8862e" stroke-width="1.8" stroke-linecap="round"/>`;}
    outline+=g.map(([x,y,a])=>ellipse(x,y,3.8,5.6,a,INK)).join('');grains+=g.map(([x,y,a,c])=>ellipse(x,y,2.3,4.1,a,c)).join('');
  }
  return stems+awns+outline+grains+`<rect x="24.5" y="39" width="15" height="6.5" rx="2.4" fill="#b5452e" ${OUT}/><rect x="26.2" y="40.4" width="11.6" height="1.9" rx=".9" fill="#d86a4f"/>`;
}

function rock(pts,lit,shade,rim){return poly(pts,'#5d6a7c',` ${OUT}`)+poly(lit,'#a3b3c4')+poly(shade,'#3c4553')+`<polyline points="${rim}" fill="none" stroke="#dfe7ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;}
const ore=()=>rock('7,57 11,43 20,38 28,45 30,57','12,44 20,39.5 22.5,44.5 14.5,48.5','22.5,44.5 27.5,45.5 29,55.5 19.5,55.5','12.4,43.3 20,38.9')
  +rock('17,57 21,30 34,16 48,26 53,57','22,31 34,17.5 33,34 20.5,45','33,34 47.5,27 52,55.5 34,55.5','22,30.4 33.8,17.6 46.6,26.6')
  +rock('40,57 44,41 53,36.5 59,45 58,57','44.5,42 53,38 52,45 44,49','52,45 58.3,46 57.5,55.5 47.5,55.5','44.6,41.4 52.8,37.4 58.2,44.8')
  // Gold nuggets sit flush on lit facets (no dark rim, so they never read as holes).
  +[[27,30,1.2],[47,42.5,1]].map(([x,y,k])=>poly([[-2,-1.6],[0.8,-2.1],[2.3,-0.2],[1.2,1.7],[-1.9,1.3]].map(([a,b])=>`${f(x+a*k*1.1)},${f(y+b*k)}`).join(' '),'#e8c35a',` stroke="#8a6a1e" stroke-width="1" stroke-linejoin="round"`)+poly([[2.3,-0.2],[1.2,1.7],[-1.9,1.3],[0.4,0.3]].map(([a,b])=>`${f(x+a*k*1.1)},${f(y+b*k)}`).join(' '),'#b08a2e')+`<circle cx="${f(x-0.6*k)}" cy="${f(y-0.7*k)}" r=".8" fill="#fff4c4"/>`).join('')
  +sparkle(29,26,3.6)+sparkle(50,42,2.6,'#eef4fa');

const desert=()=>
  // A low, wide dune: shaded lee slope on the right, lit crest, wind ripples on the lit face, sun rising behind the crest.
  `<circle cx="44" cy="31" r="7.5" fill="#f2c14e" ${OUT}/><circle cx="42.3" cy="29.3" r="3.3" fill="#f8dc8a"/>`
  +`<path d="M4,52 Q14,44 24,40 Q33,36.5 40,39.5 Q50,44 60,52 Q32,59 4,52 Z" fill="#d9b06a" ${OUT}/>`
  +`<path d="M33.5,37.6 Q37.5,38 40,39.5 Q50,44 59.4,51.6 Q46,55.6 33,55.6 Q37,46 33.5,37.6 Z" fill="#a87838"/>`
  +`<path d="M10,49 Q18,43 25,40 Q30,38.2 33.5,37.8" stroke="#f3dfa6" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
  +`<path d="M11,52.5 Q20,47.6 29,48.6 M17,46.4 Q23.5,43.4 30,44" stroke="#c79a52" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;

export const ICONS={wood,brick:bricks,wool,wheat,ore,desert};
const HALO=`<filter id="ico-halo" x="-15%" y="-15%" width="130%" height="130%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.6" result="grown"/><feFlood flood-color="#fbf3df"/><feComposite in2="grown" operator="in" result="halo"/><feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
export function sprite(){return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${HALO}</defs>${Object.entries(ICONS).map(([k,fn])=>`<symbol id="ico-${k}" viewBox="0 0 64 64"><g filter="url(#ico-halo)">${fn()}</g></symbol>`).join('')}</svg>`;}

// node scripts/icons.mjs  → regenerates the sprite inlined in public/index.html (between the resource-icon comment and #app).
if(import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
  const fs=await import('node:fs'),file=new URL('../public/index.html',import.meta.url),html=fs.readFileSync(file,'utf8');
  const start=html.indexOf('<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"'),end=html.indexOf('</svg>',start)+6;
  if(start<0)throw new Error('Sprite not found in index.html');
  fs.writeFileSync(file,html.slice(0,start)+sprite()+html.slice(end));console.log('Updated public/index.html');
}
