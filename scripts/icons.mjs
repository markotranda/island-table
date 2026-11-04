// Generates the icon sprite (resource art, plus the interface icons in UI below). Resource icons: each icon is a 64x64 <symbol> built from flat tones (base, shade, highlight) with a warm outline,
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

// Interface icons from Font Awesome Free 6.7.2 (https://fontawesome.com), CC BY 4.0, copied as path data: [viewBox width, path].
// Referenced as #ui-<key>; they take the text colour (fill="currentColor").
export const UI={
  'arrow':[448,'M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z'], // arrow-right
  'swap':[448,'M438.6 150.6c12.5-12.5 12.5-32.8 0-45.3l-96-96c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.7 96 32 96C14.3 96 0 110.3 0 128s14.3 32 32 32l306.7 0-41.4 41.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l96-96zm-333.3 352c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 416 416 416c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0 41.4-41.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3l96 96z'], // arrow-right-arrow-left
  'external':[512,'M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z'], // arrow-up-right-from-square
  'bank':[512,'M243.4 2.6l-224 96c-14 6-21.8 21-18.7 35.8S16.8 160 32 160l0 8c0 13.3 10.7 24 24 24l400 0c13.3 0 24-10.7 24-24l0-8c15.2 0 28.3-10.7 31.3-25.6s-4.8-29.9-18.7-35.8l-224-96c-8-3.4-17.2-3.4-25.2 0zM128 224l-64 0 0 196.3c-.6 .3-1.2 .7-1.8 1.1l-48 32c-11.7 7.8-17 22.4-12.9 35.9S17.9 512 32 512l448 0c14.1 0 26.5-9.2 30.6-22.7s-1.1-28.1-12.9-35.9l-48-32c-.6-.4-1.2-.7-1.8-1.1L448 224l-64 0 0 192-40 0 0-192-64 0 0 192-48 0 0-192-64 0 0 192-40 0 0-192zM256 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64z'], // building-columns
  'check':[448,'M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z'], // check
  'dice':[640,'M274.9 34.3c-28.1-28.1-73.7-28.1-101.8 0L34.3 173.1c-28.1 28.1-28.1 73.7 0 101.8L173.1 413.7c28.1 28.1 73.7 28.1 101.8 0L413.7 274.9c28.1-28.1 28.1-73.7 0-101.8L274.9 34.3zM200 224a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zM96 200a24 24 0 1 1 0 48 24 24 0 1 1 0-48zM224 376a24 24 0 1 1 0-48 24 24 0 1 1 0 48zM352 200a24 24 0 1 1 0 48 24 24 0 1 1 0-48zM224 120a24 24 0 1 1 0-48 24 24 0 1 1 0 48zm96 328c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-192c0-35.3-28.7-64-64-64l-114.3 0c11.6 36 3.1 77-25.4 105.5L320 413.8l0 34.2zM480 328a24 24 0 1 1 0 48 24 24 0 1 1 0-48z'], // dice
  'handshake':[640,'M323.4 85.2l-96.8 78.4c-16.1 13-19.2 36.4-7 53.1c12.9 17.8 38 21.3 55.3 7.8l99.3-77.2c7-5.4 17-4.2 22.5 2.8s4.2 17-2.8 22.5l-20.9 16.2L512 316.8 512 128l-.7 0-3.9-2.5L434.8 79c-15.3-9.8-33.2-15-51.4-15c-21.8 0-43 7.5-60 21.2zm22.8 124.4l-51.7 40.2C263 274.4 217.3 268 193.7 235.6c-22.2-30.5-16.6-73.1 12.7-96.8l83.2-67.3c-11.6-4.9-24.1-7.4-36.8-7.4C234 64 215.7 69.6 200 80l-72 48 0 224 28.2 0 91.4 83.4c19.6 17.9 49.9 16.5 67.8-3.1c5.5-6.1 9.2-13.2 11.1-20.6l17 15.6c19.5 17.9 49.9 16.6 67.8-2.9c4.5-4.9 7.8-10.6 9.9-16.5c19.4 13 45.8 10.3 62.1-7.5c17.9-19.5 16.6-49.9-2.9-67.8l-134.2-123zM16 128c-8.8 0-16 7.2-16 16L0 352c0 17.7 14.3 32 32 32l32 0c17.7 0 32-14.3 32-32l0-224-80 0zM48 320a16 16 0 1 1 0 32 16 16 0 1 1 0-32zM544 128l0 224c0 17.7 14.3 32 32 32l32 0c17.7 0 32-14.3 32-32l0-208c0-8.8-7.2-16-16-16l-80 0zm32 208a16 16 0 1 1 32 0 16 16 0 1 1 -32 0z'], // handshake
  'house':[576,'M575.8 255.5c0 18-15 32.1-32 32.1l-32 0 .7 160.2c0 2.7-.2 5.4-.5 8.1l0 16.2c0 22.1-17.9 40-40 40l-16 0c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1L416 512l-24 0c-22.1 0-40-17.9-40-40l0-24 0-64c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32 14.3-32 32l0 64 0 24c0 22.1-17.9 40-40 40l-24 0-31.9 0c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2l-16 0c-22.1 0-40-17.9-40-40l0-112c0-.9 0-1.9 .1-2.8l0-69.7-32 0c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z'], // house
  'trophy':[576,'M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z'], // trophy
  'sound-on':[640,'M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zm-60.5 74.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z'], // volume-high
  'sound-off':[576,'M301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3zM425 167l55 55 55-55c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-55 55 55 55c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-55-55-55 55c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l55-55-55-55c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0z'], // volume-xmark
  'bell':[448,'M224 0c-17.7 0-32 14.3-32 32l0 19.2C119 66 64 130.6 64 208l0 18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S19.4 416 32 416l384 0c12.6 0 24-7.4 29.2-18.9s3.1-25-5.3-34.4l-7.4-8.3C401.3 319.2 384 273.9 384 226.8l0-18.8c0-77.4-55-142-128-156.8L256 32c0-17.7-14.3-32-32-32zm45.3 493.3c12-12 18.7-28.3 18.7-45.3l-64 0-64 0c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7z'],
  'close':[384,'M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z'], // xmark
};
export const ICONS={wood,brick:bricks,wool,wheat,ore,desert};
const HALO=`<filter id="ico-halo" x="-15%" y="-15%" width="130%" height="130%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.6" result="grown"/><feFlood flood-color="#fbf3df"/><feComposite in2="grown" operator="in" result="halo"/><feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
export function sprite(){return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${HALO}</defs>${Object.entries(ICONS).map(([k,fn])=>`<symbol id="ico-${k}" viewBox="0 0 64 64"><g filter="url(#ico-halo)">${fn()}</g></symbol>`).join('')}${Object.entries(UI).map(([k,[w,d]])=>`<symbol id="ui-${k}" viewBox="0 0 ${w} 512"><path fill="currentColor" d="${d}"/></symbol>`).join('')}</svg>`;}

// node scripts/icons.mjs  → regenerates the sprite inlined in public/index.html (between the resource-icon comment and #app).
if(import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
  const fs=await import('node:fs'),file=new URL('../public/index.html',import.meta.url),html=fs.readFileSync(file,'utf8');
  const start=html.indexOf('<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"'),end=html.indexOf('</svg>',start)+6;
  if(start<0)throw new Error('Sprite not found in index.html');
  fs.writeFileSync(file,html.slice(0,start)+sprite()+html.slice(end));console.log('Updated public/index.html');
}
