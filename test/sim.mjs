import {newGame,addPlayer,apply,view,pending,legalRoads,legalSettlements,legalCities,tradeRatio,costs,R,emptyHand} from '../lib/engine.mjs';
import {decide} from '../lib/bot.mjs';
// Test-only helpers: a seeded random source, the simple scripted player the match tests started with, and a loop that plays a
// whole game through real commands, asking each seat's player (bot or scripted) whenever pending() says it owes a decision.
export function rng(seed=1){return n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);};}
// The scripted player decides from the full state; it never trades with other players and only answers offers by declining.
export function scripted(g,p,random){const pl=g.players[p],can=cost=>Object.entries(cost).every(([r,n])=>pl.hand[r]>=n);
  if(g.phase==='order')return {type:'firstRoll'};
  if(g.phase==='discard'){let left=g.discards[p],b=emptyHand();for(const r of R.toSorted((a,b)=>pl.hand[b]-pl.hand[a])){b[r]=Math.min(left,pl.hand[r]);left-=b[r];}return {type:'discard',resources:b};}
  if(g.active!==p){const o=g.offers.find(o=>o.from===g.active&&(o.to===null||o.to===p)&&!(o.declined??[]).includes(p));return o&&{type:'declineOffer',offerId:o.id};}
  const counter=g.offers.find(o=>o.to===p);if(counter)return {type:'declineOffer',offerId:counter.id};
  if(g.phase==='setupSettlement'){const quality=v=>g.board.vertices[v].hexes.reduce((s,id)=>s+(g.board.hexes[id].number?6-Math.abs(7-g.board.hexes[id].number):0),0);return {type:'settlement',vertex:legalSettlements(g,p,true).sort((a,b)=>quality(b)-quality(a))[0]};}
  if(g.phase==='setupRoad')return {type:'road',edge:legalRoads(g,p,g.anchor)[0]};
  if(g.phase==='preRoll')return {type:'roll'};
  if(g.phase==='robber')return {type:'robber',hex:g.board.hexes.filter(h=>h.id!==g.robber).sort((a,b)=>{const quality=h=>h.vertices.reduce((s,v)=>{const owner=g.board.vertices[v].building?.owner;return s+(owner===p?-10:owner>=0?3:0);},0);return quality(b)-quality(a);})[0].id};
  if(g.phase==='steal')return {type:'steal',player:g.victims[random(g.victims.length)]};
  if(g.phase==='monopoly')return {type:'monopoly',resource:R.toSorted((a,b)=>g.players.reduce((s,pl,i)=>s+(i===p?0:pl.hand[b]-pl.hand[a]),0))[0]};
  if(g.phase==='invention'){const resources=emptyHand();for(let i=0;i<2;i++){const r=R.filter(r=>g.bank[r]>resources[r]).sort((a,b)=>(pl.hand[a]+resources[a])-(pl.hand[b]+resources[b]))[0];if(r)resources[r]++;}return {type:'invention',resources};}
  if(g.phase==='freeRoads'){const roads=legalRoads(g,p);return {type:'road',edge:roads[random(roads.length)]};}
  const card=pl.cards.find(c=>c.type!=='vp'&&c.bought!==g.turn);if(card&&!pl.played)return {type:'playCard',card:card.id};
  const settlements=legalSettlements(g,p),cities=legalCities(g,p),roads=legalRoads(g,p),cityCount=g.board.vertices.filter(v=>v.building?.owner===p&&v.building.kind==='city').length;
  const options=[...(settlements.length?[{type:'settlement',vertex:settlements[0],cost:costs.settlement}]:[]),...(cities.length&&cityCount<4?[{type:'city',vertex:cities[0],cost:costs.city}]:[]),...(g.deck.length?[{type:'buyCard',cost:costs.development}]:[]),...(roads.length?[{type:'road',edge:roads[random(roads.length)],cost:costs.road}]:[])];
  const affordable=options.find(o=>can(o.cost));if(affordable){const {cost,...c}=affordable;return c;}
  for(const o of options){const want=R.find(r=>pl.hand[r]<(o.cost[r]||0)&&g.bank[r]>0);const give=R.find(r=>r!==want&&pl.hand[r]-(o.cost[r]||0)>=tradeRatio(g,p,r));if(want&&give)return {type:'bank',want,give};}
  return {type:'end'};}
export const bot=(g,p,random,ctx)=>decide(JSON.parse(JSON.stringify(view(g,p))),random,ctx);
// Plays a game to the end. players[i] is bot or scripted. Simulated time moves one second per command, which ages open offers.
export function play({count,players,seed=1,map=count>4?'extended':'base',setup='variable',check=()=>{},limit=20000,until=()=>false}){const random=rng(seed);
  let g=newGame('sim',map,setup);for(let p=0;p<count;p++){addPlayer(g,String(p),`P${p}`);g.players[p].ready=true;}g=apply(g,0,{type:'start'},random);
  let clock=0,commands=0;const posted=new Map();
  while(g.phase!=='finished'&&commands<limit&&!until(g)){let moved=false,waits=[];
    for(const o of g.offers)if(!posted.has(o.id))posted.set(o.id,clock);
    const order=pending(g);for(let i=order.length-1;i>0;i--){const j=random(i+1);[order[i],order[j]]=[order[j],order[i]];}
    for(const p of order){const c=players[p](g,p,random,{offerAge:(clock-(posted.get(g.offers.find(o=>o.from===p)?.id)??clock))*1000});if(!c)continue;if(c.wait){waits.push(c.wait);continue;}
      g=apply(g,p,{...c,offerId:c.offerId??`o${commands}`},random);g.revision++;commands++;clock++;check(g,p,c);moved=true;if(commands%40===0)g=JSON.parse(JSON.stringify(g));break;}
    if(!moved){if(!waits.length)throw new Error(`Nobody can move in ${g.phase}`);clock+=Math.ceil(Math.min(...waits)/1000);}}
  return {g,commands};}
// Moves cards between the supply and a hand so totals stay conserved.
export function setHand(g,p,hand){for(const r of R){g.bank[r]+=g.players[p].hand[r]-(hand[r]??0);g.players[p].hand[r]=hand[r]??0;}}
