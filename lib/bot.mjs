import { R, costs, emptyHand, legalSettlements, legalRoads } from './engine.mjs';
// A bot plays one seat from that seat's own view (the snapshot a human client gets), so it never sees hidden cards or the deck.
// It plays like an average player: it plans one build ahead, picks among good options with a little chance, and doesn't count cards.
// decide(v,random,ctx) returns one command, or {wait:ms} while its own offer still lacks answers (ctx.offerAge: ms since posted; it stops waiting at 20 s).
const sum=h=>Object.values(h).reduce((a,b)=>a+b,0);
const pips=n=>n?6-Math.abs(7-n):0;
const own=(v,p,kind)=>v.board.vertices.filter(x=>x.building?.owner===p&&(!kind||x.building.kind===kind));
// Pick from the best few, leaning on the best: what a decent player does without agonising.
function pickTop(list,score,random,top=3){const ranked=list.map(x=>[x,score(x)]).sort((a,b)=>b[1]-a[1]).slice(0,top);if(!ranked.length)return undefined;const w=[6,3,1].slice(0,ranked.length),t=random(w.reduce((a,b)=>a+b,0));let acc=0;for(let i=0;i<ranked.length;i++){acc+=w[i];if(t<acc)return ranked[i][0];}return ranked[0][0];}
// Pips per resource from a player's buildings (cities double), ignoring the robber's hex.
function production(v,p){const out=emptyHand();for(const x of own(v,p))for(const h of x.hexes.map(i=>v.board.hexes[i]))if(h.resource!=='desert'&&h.id!==v.robber)out[h.resource]+=pips(h.number)*(x.building.kind==='city'?2:1);return out;}
// How good an empty intersection is for this player: production, new resource types, a fitting port.
function spotValue(v,p,id,prod=production(v,p)){const x=v.board.vertices[id];let s=0;
  for(const h of x.hexes.map(i=>v.board.hexes[i])){if(h.resource==='desert')continue;const n=pips(h.number)*(h.id===v.robber?.4:1);s+=n;if(!prod[h.resource])s+=1.2;if(h.resource==='brick'||h.resource==='wood')s+=.2*n;}
  const port=v.board.ports.find(o=>o.vertices.includes(id));if(port)s+=port.resource==='any'?1.2:prod[port.resource]>=5?2.5:.6;return s;}
// The best open spot reachable through free edges from this player's network, and the first road towards it.
function roadPlan(v,p){const b=v.board,start=new Set();for(const e of b.edges)if(e.owner===p)e.vertices.forEach(n=>start.add(n));for(const x of own(v,p))start.add(x.id);
  const blocked=n=>b.vertices[n].building&&b.vertices[n].building.owner!==p,open=new Set(legalSettlements(v,p,true)),prod=production(v,p);
  const seen=new Map([...start].filter(n=>!blocked(n)).map(n=>[n,{d:0,first:null}])),queue=[...seen.keys()];let best=null;
  while(queue.length){const n=queue.shift(),{d,first}=seen.get(n);if(d>=4)continue;for(const id of b.vertices[n].edges){const e=b.edges[id];if(e.owner!==null)continue;const m=e.vertices.find(k=>k!==n);if(seen.has(m)||blocked(m))continue;const step={d:d+1,first:first??id};seen.set(m,step);queue.push(m);
    if(open.has(m)){const score=spotValue(v,p,m,prod)-2.2*step.d;if(!best||score>best.score)best={spot:m,edge:step.first,d:step.d,score};}}}
  return best;}
// The next thing worth building, judged by what it is worth and how many cards are still missing for it.
function options(v,p){const me=v.players[p],left={road:15-v.board.edges.filter(e=>e.owner===p).length,settlement:5-own(v,p,'settlement').length,city:4-own(v,p,'city').length},plan=roadPlan(v,p),out=[];
  const missing=cost=>Object.entries(cost).reduce((s,[r,n])=>s+Math.max(0,n-me.hand[r]),0);
  if(v.legal.cities.length&&left.city)out.push({type:'city',worth:10,cost:costs.city,vertex:v.legal.cities.map(id=>[id,spotValue(v,p,id)]).sort((a,b)=>b[1]-a[1])[0][0]});
  if(v.legal.settlements.length&&left.settlement)out.push({type:'settlement',worth:10.5,cost:costs.settlement,vertex:v.legal.settlements.map(id=>[id,spotValue(v,p,id)]).sort((a,b)=>b[1]-a[1])[0][0]});
  else if(plan&&left.road&&left.settlement)out.push({type:'road',worth:7.5-plan.d*.5,cost:costs.road,edge:plan.edge});
  if(v.deckCount)out.push({type:'buyCard',worth:5,cost:costs.development});
  for(const o of out){o.missing=missing(o.cost);o.score=o.worth-2.4*o.missing;}
  return out.sort((a,b)=>b.score-a.score);}
const need=t=>({...emptyHand(),...(t?.cost||{})});
const canPay=(hand,cost)=>Object.entries(cost).every(([r,n])=>hand[r]>=n);
// Supply trades that complete the cost from cards the target doesn't use, or null if they can't.
function supplyTrades(v,p,cost){const hand={...v.players[p].hand},want=need({cost}),trades=[];
  for(let k=0;k<4;k++){const short=R.find(r=>hand[r]<want[r]&&v.bank[r]>trades.filter(t=>t.want===r).length);if(!short)break;const give=R.filter(r=>hand[r]-want[r]>=v.ratios[r]).sort((a,b)=>(hand[b]-want[b])/v.ratios[b]-(hand[a]-want[a])/v.ratios[a])[0];if(!give)return null;hand[give]-=v.ratios[give];hand[short]++;trades.push({give,want:short});}
  return canPay(hand,want)?trades:null;}
const mine=(v,p,kinds)=>v.events.filter(e=>e.turn===v.turn&&e.p===p&&kinds.includes(e.kind)).length;
// Whether a trade is worth taking: it brings a missing card, keeps the cards the target needs, isn't lopsided against the bot,
// and doesn't help someone about to win. One good trade in eight is turned down anyway, as people do.
function acceptable(v,p,give,get,from,random){const me=v.players[p],t=options(v,p)[0],want=need(t);if(!R.every(r=>me.hand[r]>=give[r]))return false;
  if((v.players[from]?.score??0)>=v.goal-2)return false;
  const helps=R.some(r=>get[r]&&me.hand[r]<want[r]),keeps=R.every(r=>!give[r]||me.hand[r]-give[r]>=want[r]);
  return helps&&keeps&&sum(give)<=sum(get)+1&&random(8)>0;}
function devPlay(v,p,random){const me=v.players[p];if(me.played||!['preRoll','action'].includes(v.phase))return null;const ready=type=>me.cards.find(c=>c.type===type&&c.bought!==v.turn);
  const knight=ready('knight');if(knight){const hit=v.board.hexes[v.robber].vertices.some(i=>v.board.vertices[i].building?.owner===p)&&v.board.hexes[v.robber].number,others=Math.max(0,...v.players.map((x,i)=>i===p?0:x.knights));if(hit||(v.awards.army!==p&&me.knights+1>=3&&me.knights+1>others))return {type:'playCard',card:knight.id};}
  if(v.phase!=='action')return null;
  const t=options(v,p)[0];
  const roads=ready('roads');if(roads&&roadPlan(v,p)&&legalRoads(v,p).length)return {type:'playCard',card:roads.id};
  const inv=ready('invention');if(inv&&t&&t.missing>=1&&t.missing<=2)return {type:'playCard',card:inv.id};
  const mono=ready('monopoly');if(mono&&t&&t.missing>=2&&random(3)===0)return {type:'playCard',card:mono.id};
  return null;}
function robberHex(v,p,random){const lead=Math.max(...v.players.map(x=>x.score));
  return pickTop(v.board.hexes.filter(h=>h.id!==v.robber&&h.resource!=='desert'),h=>{let s=0;for(const i of h.vertices){const b=v.board.vertices[i].building;if(!b||b.owner<0)continue;if(b.owner===p)return -100;const o=v.players[b.owner];s+=pips(h.number)*(b.kind==='city'?2:1)*(o.score===lead?1.5:1)+(o.resourceCount?1:0);}return s;},random,2).id;}
export function decide(v,random,ctx={}){const p=v.me,me=v.players[p];
  if(v.phase==='order')return {type:'firstRoll'};
  if(v.phase==='discard'){const left=v.discards[p],want=need(options(v,p)[0]),hand={...me.hand},out=emptyHand();for(let k=0;k<left;k++){const r=R.filter(r=>hand[r]>0).sort((a,b)=>(hand[b]-want[b])-(hand[a]-want[a])||hand[b]-hand[a])[0];hand[r]--;out[r]++;}return {type:'discard',resources:out};}
  // Not this bot's turn: it only answers offers made to it.
  if(v.active!==p){const o=v.offers.find(o=>o.from===v.active&&(o.to===null||o.to===p)&&!(o.accepted??[]).includes(p)&&!(o.declined??[]).includes(p));return o?{type:acceptable(v,p,o.want,o.give,o.from,random)?'acceptOffer':'declineOffer',offerId:o.id}:null;}
  if(v.phase==='setupSettlement'){const prod=production(v,p);return {type:'settlement',vertex:pickTop(v.legal.settlements,id=>spotValue(v,p,id,prod),random)};}
  if(v.phase==='setupRoad'){const open=legalSettlements(v,p,true),prod=production(v,p);return {type:'road',edge:pickTop(v.legal.roads,id=>{const w=v.board.edges[id].vertices.find(n=>n!==v.anchor);return Math.max(0,...open.filter(s=>s===w||v.board.vertices[s].edges.some(e=>v.board.edges[e].vertices.includes(w))).map(s=>spotValue(v,p,s,prod)));},random,2)};}
  if(v.phase==='preRoll')return devPlay(v,p,random)??{type:'roll'};
  if(v.phase==='robber')return {type:'robber',hex:robberHex(v,p,random)};
  if(v.phase==='steal')return {type:'steal',player:v.victims.toSorted((a,b)=>v.players[b].score-v.players[a].score||v.players[b].resourceCount-v.players[a].resourceCount)[0]};
  if(v.phase==='monopoly'){const want=need(options(v,p)[0]);return {type:'monopoly',resource:R.toSorted((a,b)=>(want[b]-me.hand[b])-(want[a]-me.hand[a])||v.bank[a]-v.bank[b])[0]};}
  if(v.phase==='invention'){const want=need(options(v,p)[0]),out=emptyHand();for(let k=0;k<Math.min(2,sum(v.bank));k++){const r=R.filter(r=>v.bank[r]>out[r]).sort((a,b)=>(want[b]-me.hand[b]-out[b])-(want[a]-me.hand[a]-out[a]))[0];out[r]++;}return {type:'invention',resources:out};}
  if(v.phase==='freeRoads'){const plan=roadPlan(v,p),legal=v.legal.roads;return {type:'road',edge:plan&&legal.includes(plan.edge)?plan.edge:legal[random(legal.length)]};}
  if(v.phase!=='action')return {type:'end'};
  if(mine(v,p,['build','buy','bank','offer','play'])>=30)return {type:'end'};
  // Its own open offer: hear everyone out first (accepted, declined, or a counter they didn't take back), or give them 20 s. Then trade with the lowest score
  // who accepted; failing that, settle counters one by one, and failing that, take the offer back. Without an open offer a counter is answered at once.
  const offer=v.offers.find(o=>o.from===p),yes=offer?.accepted??[],no=offer?.declined??[],thisTurn=e=>e.turn===v.turn,countered=i=>v.events.some(e=>thisTurn(e)&&e.kind==='offer'&&e.counter&&e.p===i)&&!v.events.some(e=>thisTurn(e)&&e.kind==='cancel'&&e.p===i&&e.from===i);
  if(offer&&(ctx.offerAge??0)<20000&&v.players.some((_,i)=>i!==p&&!yes.includes(i)&&!no.includes(i)&&!countered(i)))return {wait:Math.max(400,20000-(ctx.offerAge??0))};
  if(yes.length)return {type:'confirmOffer',offerId:offer.id,player:yes.toSorted((a,b)=>v.players[a].score-v.players[b].score)[0]};
  const counter=v.offers.find(o=>o.from!==p&&o.to===p);if(counter)return {type:acceptable(v,p,counter.want,counter.give,counter.from,random)?'acceptOffer':'declineOffer',offerId:counter.id};
  if(offer)return {type:'cancelOffer',offerId:offer.id};
  const card=devPlay(v,p,random);if(card)return card;
  const list=options(v,p),target=list[0],want=need(target);
  if(target&&!target.missing)return {...(target.type==='buyCard'?{type:'buyCard'}:{type:target.type,...(target.vertex!==undefined?{vertex:target.vertex}:{edge:target.edge})})};
  // Something cheaper that doesn't eat into the target's cards.
  for(const o of list.slice(1))if(!o.missing&&o.type!=='buyCard'&&R.every(r=>me.hand[r]-(o.cost[r]||0)>=Math.min(me.hand[r],want[r])))return {type:o.type,...(o.vertex!==undefined?{vertex:o.vertex}:{edge:o.edge})};
  if(target&&mine(v,p,['bank'])<3){const trades=supplyTrades(v,p,target.cost);if(trades?.length)return {type:'bank',...trades[0]};}
  // One simple offer to the table per turn: a spare card for a missing one.
  if(target&&v.role===1&&target.missing<=2&&!mine(v,p,['offer'])&&random(2)===0){const get=R.find(r=>me.hand[r]<want[r]),give=R.filter(r=>me.hand[r]>want[r]).sort((a,b)=>(me.hand[b]-want[b])-(me.hand[a]-want[a]))[0];if(get&&give)return {type:'offer',give:{...emptyHand(),[give]:1},want:{...emptyHand(),[get]:1}};}
  // Holding too much for a 7: spend on a development card, or trade toward anything else it could build.
  if(sum(me.hand)>v.limit){if(v.deckCount&&canPay(me.hand,costs.development))return {type:'buyCard'};if(mine(v,p,['bank'])<5)for(const o of list.slice(1)){const trades=supplyTrades(v,p,o.cost);if(trades?.length)return {type:'bank',...trades[0]};}}
  return {type:'end'};}
// The plainest legal move for the phase, used if decide() ever fails, so a bot can never stall the table.
export function fallback(v){const p=v.me,me=v.players[p];
  if(v.phase==='order')return {type:'firstRoll'};
  if(v.phase==='discard'){let left=v.discards[p];const out=emptyHand();for(const r of R){out[r]=Math.min(left,me.hand[r]);left-=out[r];}return {type:'discard',resources:out};}
  if(v.active!==p){const o=v.offers.find(o=>(o.to===null||o.to===p)&&o.from!==p&&!(o.declined??[]).includes(p));return o?{type:'declineOffer',offerId:o.id}:null;}
  const counter=v.offers.find(o=>o.to===p);if(counter)return {type:'declineOffer',offerId:counter.id};const offer=v.offers.find(o=>o.from===p);if(offer)return {type:'cancelOffer',offerId:offer.id};
  return {setupSettlement:()=>({type:'settlement',vertex:v.legal.settlements[0]}),setupRoad:()=>({type:'road',edge:v.legal.roads[0]}),freeRoads:()=>({type:'road',edge:v.legal.roads[0]}),preRoll:()=>({type:'roll'}),robber:()=>({type:'robber',hex:v.board.hexes.find(h=>h.id!==v.robber).id}),steal:()=>({type:'steal',player:v.victims[0]}),monopoly:()=>({type:'monopoly',resource:'wood'}),invention:()=>{let left=Math.min(2,sum(v.bank));const out=emptyHand();for(const r of R){out[r]=Math.min(left,v.bank[r]);left-=out[r];}return {type:'invention',resources:out};}}[v.phase]?.()??{type:'end'};}
