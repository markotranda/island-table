import { RESOURCES as R, COLORS, makeBoard, shuffle, commonVertex } from './board.mjs';
export { R };
export const costs={road:{wood:1,brick:1},settlement:{wood:1,brick:1,wool:1,wheat:1},city:{ore:3,wheat:2},development:{ore:1,wool:1,wheat:1}};
export const emptyHand=()=>Object.fromEntries(R.map(r=>[r,0]));
const sum=h=>Object.values(h).reduce((a,b)=>a+b,0);
function ensure(ok,message) { if(!ok)throw new Error(message); }
// Saves from before map selection chose a player count up front, which also implied the map.
export function upgrade(g){if(!g.map){g.map=g.count>4?'extended':'base';g.seats=MAPS[g.map].seats;}return g;}
// The map sets the board, supply, deck and seat limit; count is the number actually playing, fixed when the host starts.
export const MAPS={base:{seats:4},extended:{seats:6}};
export function newGame(id, map='base', setup='variable') {
  ensure(Object.hasOwn(MAPS,map),'Choose the base or extended island.');
  ensure(['variable','fixed'].includes(setup),'Unknown setup.');
  return {id,map,seats:MAPS[map].seats,count:0,setup,rulesVersion:'2025-v1',players:[],phase:'lobby',revision:0,events:[],offers:[],awards:{route:null,army:null},turn:0,primary:0,active:0,role:1,winner:null};
}
export function addPlayer(g,id,name) {
  ensure(g.phase==='lobby'&&g.players.length<g.seats,'This room is full or has already started.');
  ensure(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=24,'Use a name between 1 and 24 characters.');
  ensure(!g.players.some(p=>p.name.toLowerCase()===name.trim().toLowerCase()),'That name is already taken.');
  const p={id,name:name.trim(),color:COLORS[g.players.length],ready:false,hand:emptyHand(),cards:[],knights:0,played:false};
  g.players.push(p); return p;
}
function log(g,text){g.events.push({turn:g.turn,text});if(g.events.length>160)g.events.shift();}
export function legalSettlements(g,p,setup=false) {
  if(g.board.vertices.filter(v=>v.building?.owner===p&&v.building.kind==='settlement').length>=5)return [];
  return g.board.vertices.filter(v=>!v.building&&v.edges.every(e=>g.board.edges[e].vertices.every(n=>!g.board.vertices[n].building))&&(setup||v.edges.some(e=>g.board.edges[e].owner===p))).map(v=>v.id);
}
export function legalRoads(g,p,anchor=null) {
  if(g.board.edges.filter(e=>e.owner===p).length>=15)return [];
  return g.board.edges.filter(e=>e.owner===null&&(anchor!==null?e.vertices.includes(anchor):e.vertices.some(n=>{
    const v=g.board.vertices[n];return v.building?v.building.owner===p:v.edges.some(i=>g.board.edges[i].owner===p);
  }))).map(e=>e.id);
}
export function legalCities(g,p) {return g.board.vertices.filter(v=>v.building?.owner===p&&v.building.kind==='settlement').map(v=>v.id);}
export function routeLength(g,p) {
  function walk(vertex,used) {
    const v=g.board.vertices[vertex];
    if(used.size&&v.building&&v.building.owner!==p)return 0;
    let best=0;
    for(const id of v.edges) {const e=g.board.edges[id];if(e.owner!==p||used.has(id))continue;used.add(id);best=Math.max(best,1+walk(e.vertices.find(n=>n!==vertex),used));used.delete(id);}
    return best;
  }
  return Math.max(0,...g.board.vertices.map(v=>walk(v.id,new Set())));
}
export function score(g,p,privateScore=false) {
  return g.board.vertices.reduce((s,v)=>s+(v.building?.owner===p?(v.building.kind==='city'?2:1):0),0)+(g.awards.route===p?2:0)+(g.awards.army===p?2:0)+(privateScore?g.players[p].cards.filter(c=>c.type==='vp').length:0);
}
function awards(g) {
  for(const [key,min,values] of [['route',5,g.players.map((_,i)=>routeLength(g,i))],['army',3,g.players.map(p=>p.knights)]]) {
    const max=Math.max(...values), old=g.awards[key];
    if(max<min)g.awards[key]=null;
    else if(old===null||values[old]!==max){const leaders=values.flatMap((v,i)=>v===max?[i]:[]);g.awards[key]=leaders.length===1?leaders[0]:null;}
  }
  if(!['setupSettlement','setupRoad','lobby'].includes(g.phase)&&score(g,g.active,true)>=10) {g.winner=g.active;g.phase='finished';g.offers=[];log(g,`${g.players[g.active].name} wins with ${score(g,g.active,true)} points!`);}
}
function take(g,p,r,n) {ensure(R.includes(r)&&g.bank[r]>=n,'The supply does not have those resources.');g.bank[r]-=n;g.players[p].hand[r]+=n;}
function pay(g,p,cost) {ensure(Object.entries(cost).every(([r,n])=>g.players[p].hand[r]>=n),'You do not have enough resources.');for(const [r,n] of Object.entries(cost)){g.players[p].hand[r]-=n;g.bank[r]+=n;}}
function resources(g,p,v) {for(const h of g.board.vertices[v].hexes){const r=g.board.hexes[h].resource;if(r!=='desert')take(g,p,r,1);}}
function begin(g,p,role) {g.active=p;g.role=role;g.turn++;g.players[p].played=false;g.phase=role===1?'preRoll':'action';g.offers=[];awards(g);}
function start(g,random) {
  ensure(g.players.length>=2&&g.players.every(p=>p.ready),'At least two players must join, and everyone must be ready.');
  g.count=g.players.length;const large=g.map==='extended';
  g.board=makeBoard(large,g.setup==='variable',random);g.bank=Object.fromEntries(R.map(r=>[r,large?24:19]));
  g.deck=shuffle([...Array(large?20:14).fill('knight'),...Array(large?3:2).fill('monopoly'),...Array(large?3:2).fill('invention'),...Array(large?3:2).fill('roads'),...Array(5).fill('vp')],random);
  g.robber=g.board.hexes.find(h=>h.resource==='desert').id;
  let candidates=g.players.map((_,i)=>i), rolls=[];
  while(candidates.length>1){rolls=candidates.map(p=>({p,roll:random(6)+random(6)+2}));const max=Math.max(...rolls.map(r=>r.roll));candidates=rolls.filter(r=>r.roll===max).map(r=>r.p);}
  g.primary=candidates[0];g.active=g.primary;
  log(g,`${g.players[g.primary].name} won the starting roll.`);
  if(g.setup==='fixed') {
    const base=[[[10,11,15],[13,14,17]],[[12,13,16],[1,2,5]],[[5,6,10],[3,4,8]],[[14,15,18],[8,9,13]]];
    const big=[[{hex:17,corner:2},[15,16,21]],[{hex:3,corner:3},[13,14,19]],[{hex:23,corner:2},[14,15,20]],[{hex:6,corner:1},[9,10,15]],[{hex:26,corner:2},[20,21,25]],[{hex:0,corner:0},[8,9,14]]];
    const placements=large?big:base;
    const directions=large?[[210,270],[30,150],[210,150],[150,270],[210,30],[90,270]]:[[150,150],[150,150],[270,30],[150,210]];
    const seats=g.count===5?shuffle([0,1,2,3,4,5],random):[0,1,2,3,4,5];
    if(g.count===5)g.players.forEach((pl,i)=>{pl.color=COLORS[seats[i]];});
    placements.forEach((pair,color)=>{const p=seats.indexOf(color);if(p>=g.count&&g.count!==5)return;pair.forEach((hs,k)=>{
      const v=Array.isArray(hs)?commonVertex(g.board,hs):g.board.vertices[g.board.hexes[hs.hex].vertices[hs.corner]];ensure(v,'Invalid fixed layout.');v.building={owner:p<g.count?p:-1,kind:'settlement'};
      if(p<g.count){const angle=directions[color][k]*Math.PI/180;const edge=v.edges.map(i=>g.board.edges[i]).filter(e=>e.owner===null).sort((a,b)=>{const distance=e=>{const w=g.board.vertices[e.vertices.find(n=>n!==v.id)];return -((w.x-v.x)*Math.cos(angle)+(w.y-v.y)*Math.sin(angle));};return distance(a)-distance(b);})[0];edge.owner=p;if(k===1)resources(g,p,v.id);}
    });});
    begin(g,g.primary,1);
  } else {const forward=g.players.map((_,i)=>(g.primary+i)%g.count);g.setupOrder=[...forward,...forward.toReversed()];g.setupIndex=0;g.phase='setupSettlement';}
}
export function produce(g,roll) {
  for(const r of R) {
    const claims=g.players.map((_,p)=>g.board.hexes.filter(h=>h.number===roll&&h.resource===r&&h.id!==g.robber).reduce((s,h)=>s+h.vertices.reduce((n,v)=>{const b=g.board.vertices[v].building;return n+(b?.owner===p?(b.kind==='city'?2:1):0);},0),0));
    const total=sum(claims), receivers=claims.filter(Boolean).length;
    if(g.bank[r]>=total)claims.forEach((n,p)=>take(g,p,r,n));
    else if(receivers===1)take(g,claims.findIndex(Boolean),r,g.bank[r]);
  }
}
function validateBundle(bundle) {ensure(bundle&&typeof bundle==='object'&&!Array.isArray(bundle)&&Object.keys(bundle).every(r=>R.includes(r)),'Invalid resource selection.');const result=emptyHand();for(const r of R){const n=bundle[r]??0;ensure(Number.isInteger(n)&&n>=0&&n<=120,'Invalid resource count.');result[r]=n;}return result;}
function finishRobber(g){g.phase=g.resumePhase??'action';delete g.resumePhase;delete g.victims;}
export function apply(input,p,cmd,random) {
  const g=structuredClone(input);ensure(Number.isInteger(p)&&g.players[p],'Unknown player.');ensure(cmd&&typeof cmd.type==='string','Invalid action.');
  const player=g.players[p], active=p===g.active;
  if(cmd.type==='ready'){ensure(g.phase==='lobby','Game already started.');player.ready=!player.ready;return g;}
  if(cmd.type==='start'){ensure(p===0&&g.phase==='lobby','Only the host can start.');start(g,random);return g;}
  if(cmd.type==='rematch'){ensure(p===0&&g.phase==='finished','Only the host can start a rematch after a game.');const next=newGame(g.id,g.map,g.setup);g.players.forEach(pl=>addPlayer(next,pl.id,pl.name));next.revision=g.revision;return next;}
  ensure(g.board&&g.phase!=='finished','The game is not accepting moves.');
  if(cmd.type==='discard') {
    ensure(g.phase==='discard'&&g.discards[p]>0,'You do not need to discard.');const bundle=validateBundle(cmd.resources);ensure(sum(bundle)===g.discards[p],`Choose exactly ${g.discards[p]} resources.`);pay(g,p,bundle);g.discards[p]=0;log(g,`${player.name} discarded resources.`);if(g.discards.every(n=>n===0))g.phase='robber';return g;
  }
  if(cmd.type==='offer') {
    ensure(g.phase==='action'&&g.role===1,'Player trading is unavailable in this phase.');
    const give=validateBundle(cmd.give),want=validateBundle(cmd.want);
    ensure(sum(give)>0&&sum(want)>0&&R.every(r=>!(give[r]&&want[r])),'Offer different resources on each side; gifts are not allowed.');
    ensure(R.every(r=>player.hand[r]>=give[r]),'You do not have the offered resources.');
    ensure(g.offers.length<12,'Resolve existing offers first.');
    g.offers.push({id:cmd.offerId,from:p,to:active?null:g.active,give,want});return g;
  }
  if(cmd.type==='cancelOffer'){const o=g.offers.find(o=>o.id===cmd.offerId);ensure(o&&(o.from===p||active),'You cannot cancel this offer.');g.offers=g.offers.filter(x=>x!==o);return g;}
  if(cmd.type==='acceptOffer') {
    ensure(g.phase==='action'&&g.role===1,'Trading is unavailable.');const o=g.offers.find(o=>o.id===cmd.offerId);
    ensure(o&&o.from!==p&&(o.from===g.active||p===g.active)&&(o.to===null||o.to===p),'You cannot accept this offer.');
    ensure(R.every(r=>g.players[o.from].hand[r]>=o.give[r]&&player.hand[r]>=o.want[r]),'One player no longer has the resources.');
    for(const r of R){g.players[o.from].hand[r]+=o.want[r]-o.give[r];player.hand[r]+=o.give[r]-o.want[r];}
    g.offers=[];log(g,`${player.name} traded with ${g.players[o.from].name}.`);return g;
  }
  ensure(active,'Wait for your turn.');
  if(cmd.type==='settlement'&&g.phase==='setupSettlement') {
    ensure(legalSettlements(g,p,true).includes(cmd.vertex),'Choose a legal intersection.');g.board.vertices[cmd.vertex].building={owner:p,kind:'settlement'};g.anchor=cmd.vertex;g.phase='setupRoad';if(g.setupIndex>=g.count)resources(g,p,cmd.vertex);return g;
  }
  if(cmd.type==='road'&&g.phase==='setupRoad') {
    ensure(legalRoads(g,p,g.anchor).includes(cmd.edge),'Place a road beside your new settlement.');g.board.edges[cmd.edge].owner=p;g.setupIndex++;
    if(g.setupIndex===g.setupOrder.length){delete g.anchor;begin(g,g.primary,1);}else{g.active=g.setupOrder[g.setupIndex];g.phase='setupSettlement';}return g;
  }
  if(cmd.type==='roll') {
    ensure(g.phase==='preRoll','You cannot roll now.');g.dice=[random(6)+1,random(6)+1];const total=sum(g.dice);log(g,`${player.name} rolled ${total}.`);
    if(total===7){g.discards=g.players.map(pl=>sum(pl.hand)>7?Math.floor(sum(pl.hand)/2):0);g.phase=g.discards.some(Boolean)?'discard':'robber';g.resumePhase='action';}
    else {produce(g,total);g.phase='action';}return g;
  }
  if(cmd.type==='robber') {
    ensure(g.phase==='robber'&&g.board.hexes[cmd.hex]&&cmd.hex!==g.robber,'Move the robber to a different hex.');g.robber=cmd.hex;
    g.victims=[...new Set(g.board.hexes[cmd.hex].vertices.map(v=>g.board.vertices[v].building?.owner).filter(n=>Number.isInteger(n)&&n>=0&&n!==p&&sum(g.players[n].hand)>0))];
    log(g,`${player.name} moved the robber.`);if(g.victims.length)g.phase='steal';else finishRobber(g);return g;
  }
  if(cmd.type==='steal') {
    ensure(g.phase==='steal'&&g.victims.includes(cmd.player),'Choose an eligible player.');const victim=g.players[cmd.player],cards=R.flatMap(r=>Array(victim.hand[r]).fill(r));const r=cards[random(cards.length)];victim.hand[r]--;player.hand[r]++;log(g,`${player.name} stole one resource from ${victim.name}.`);finishRobber(g);return g;
  }
  if(cmd.type==='playCard') {
    ensure(['preRoll','action'].includes(g.phase)&&!player.played,'You may play one development card before rolling or during your action phase.');
    const i=player.cards.findIndex(c=>c.id===cmd.card);ensure(i>=0,'Card not found.');const c=player.cards[i];ensure(c.type!=='vp'&&c.bought!==g.turn,'That card cannot be played now.');
    player.cards.splice(i,1);player.played=true;g.resumePhase=g.phase;log(g,`${player.name} played ${c.type==='roads'?'Road Building':c.type}.`);
    if(c.type==='knight'){player.knights++;g.phase='robber';}
    if(c.type==='monopoly')g.phase='monopoly';
    if(c.type==='invention')g.phase='invention';
    if(c.type==='roads'){g.phase='freeRoads';g.freeRoads=2;if(!legalRoads(g,p).length)finishRobber(g);}
    awards(g);return g;
  }
  if(cmd.type==='monopoly'){ensure(g.phase==='monopoly'&&R.includes(cmd.resource),'Choose one resource type.');for(let i=0;i<g.count;i++)if(i!==p){player.hand[cmd.resource]+=g.players[i].hand[cmd.resource];g.players[i].hand[cmd.resource]=0;}finishRobber(g);return g;}
  if(cmd.type==='invention'){ensure(g.phase==='invention','Invention is not active.');const b=validateBundle(cmd.resources);ensure(sum(b)===Math.min(2,sum(g.bank)),'Choose two available resources.');for(const r of R)take(g,p,r,b[r]);finishRobber(g);return g;}
  if(cmd.type==='road'&&g.phase==='freeRoads'){ensure(legalRoads(g,p).includes(cmd.edge),'Choose a legal road.');g.board.edges[cmd.edge].owner=p;g.freeRoads--;if(!g.freeRoads||!legalRoads(g,p).length)finishRobber(g);awards(g);return g;}
  ensure(g.phase==='action','Finish the current action first.');
  if(cmd.type==='bank') {
    ensure(R.includes(cmd.give)&&R.includes(cmd.want)&&cmd.give!==cmd.want,'Select two different resources.');const ratio=tradeRatio(g,p,cmd.give);pay(g,p,{[cmd.give]:ratio});take(g,p,cmd.want,1);log(g,`${player.name} traded with the supply.`);
  } else if(cmd.type==='road') {ensure(legalRoads(g,p).includes(cmd.edge),'Choose a legal road.');pay(g,p,costs.road);g.board.edges[cmd.edge].owner=p;log(g,`${player.name} built a road.`);
  } else if(cmd.type==='settlement') {ensure(legalSettlements(g,p).includes(cmd.vertex),'Choose a legal settlement location.');pay(g,p,costs.settlement);g.board.vertices[cmd.vertex].building={owner:p,kind:'settlement'};log(g,`${player.name} built a settlement.`);
  } else if(cmd.type==='city') {ensure(legalCities(g,p).includes(cmd.vertex)&&g.board.vertices.filter(v=>v.building?.owner===p&&v.building.kind==='city').length<4,'Choose one of your settlements; maximum four cities.');pay(g,p,costs.city);g.board.vertices[cmd.vertex].building.kind='city';log(g,`${player.name} built a city.`);
  } else if(cmd.type==='buyCard') {ensure(g.deck.length,'No development cards remain.');pay(g,p,costs.development);player.cards.push({type:g.deck.pop(),bought:g.turn,id:`${g.turn}-${g.revision}-${p}`});log(g,`${player.name} bought a development card.`);
  } else if(cmd.type==='end') {awards(g);if(g.phase==='finished')return g;if(g.count>4&&g.role===1)begin(g,(g.primary+3)%g.count,2);else{g.primary=(g.primary+1)%g.count;begin(g,g.primary,1);}
  } else throw new Error('Unknown action.');
  awards(g);return g;
}
export function tradeRatio(g,p,r) {return g.board.ports.reduce((ratio,port)=>port.vertices.some(v=>g.board.vertices[v].building?.owner===p)?Math.min(ratio,port.resource===r?2:port.resource==='any'?3:4):ratio,4);}
export function view(g,p) {
  const out=structuredClone(g);delete out.deck;
  out.me=p;out.deckCount=g.deck?.length??0;
  out.players=g.players.map((pl,i)=>({id:pl.id,name:pl.name,color:pl.color,ready:pl.ready,knights:pl.knights,played:pl.played,resourceCount:sum(pl.hand),cardCount:pl.cards.length,...(g.board?{score:score(g,i,i===p||g.phase==='finished'),route:routeLength(g,i)}:{}),...(i===p||g.phase==='finished'?{hand:pl.hand,cards:pl.cards}:{})}));
  if(g.board){out.legal={roads:legalRoads(g,p,g.phase==='setupRoad'?g.anchor:null),settlements:legalSettlements(g,p,g.phase==='setupSettlement'),cities:legalCities(g,p)};out.ratios=Object.fromEntries(R.map(r=>[r,tradeRatio(g,p,r)]));}
  return out;
}
