import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,addPlayer,apply,view,legalRoads,legalSettlements,routeLength,routePath,produce,score,tradeRatio,R,emptyHand,upgrade,pending} from '../lib/engine.mjs';
import {makeBoard,COLORS} from '../lib/board.mjs';
function rng(seed=8){return n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};}
function fixture(n=4,setup='fixed',map=n>4?'extended':'base'){let g=newGame('test',map,setup);for(let i=0;i<n;i++){addPlayer(g,`id${i}`,`Player ${i}`);g.players[i].ready=true;}const r=rng();return order(apply(g,0,{type:'start'},r),r);}
// Everyone rolls for the first turn until a single highest roll decides it.
function order(g,r=rng()){while(g.phase==='order'){const p=g.order.candidates.find(p=>!g.order.done.includes(p));g=apply(g,p,{type:'firstRoll'},r);}return g;}
const action=(g,p,c,random=rng())=>{const next=apply(g,p,c,random);next.revision=g.revision+1;return next;};
function give(g,p,resource,n){g.bank[resource]-=n;g.players[p].hand[resource]+=n;}
function clear(g){g.board.vertices.forEach(v=>v.building=null);g.board.edges.forEach(e=>e.owner=null);g.players.forEach(p=>{p.hand=emptyHand();p.cards=[];});g.bank=Object.fromEntries(R.map(r=>[r,g.map==='extended'?24:19]));g.active=0;g.primary=0;g.phase='action';return g;}
function conserved(g){for(const r of R)assert.equal(g.bank[r]+g.players.reduce((s,p)=>s+p.hand[r],0),g.map==='extended'?24:19,r);assert.ok(g.players.every(p=>R.every(r=>p.hand[r]>=0)));}

test('board graph counts, terrain inventories, reciprocal edges and legal ports',()=>{
  for(const expanded of [false,true])for(const variable of [false,true]){
    const b=makeBoard(expanded,variable,rng());assert.equal(b.hexes.length,expanded?30:19);assert.equal(b.vertices.length,expanded?80:54);assert.equal(b.edges.length,expanded?109:72);
    const counts=Object.fromEntries([...R,'desert'].map(r=>[r,b.hexes.filter(h=>h.resource===r).length]));assert.deepEqual(counts,expanded?{wood:6,brick:5,wool:6,wheat:6,ore:5,desert:2}:{wood:4,brick:3,wool:4,wheat:4,ore:3,desert:1});
    b.edges.forEach(e=>{assert.ok(e.vertices.every(v=>b.vertices[v].edges.includes(e.id)));assert.ok(e.hexes.length>=1&&e.hexes.length<=2);});
    assert.equal(new Set(b.ports.flatMap(p=>p.vertices)).size,b.ports.length*2);
  }
});
test('all supported fixed games start with two settlements, roads and resources per player',()=>{
  for(const n of [2,3,4,5,6]){const g=fixture(n);assert.equal(g.phase,'preRoll');g.players.forEach((p,i)=>{assert.equal(g.board.vertices.filter(v=>v.building?.owner===i).length,2);assert.equal(g.board.edges.filter(e=>e.owner===i).length,2);assert.equal(Object.values(p.hand).reduce((a,b)=>a+b),3);});assert.equal(g.board.vertices.filter(v=>v.building?.owner===-1).length,n===5?2:0);conserved(g);}
});
test('starting resources name the hexes they came from, in fixed and variable setup',()=>{
  for(const setup of ['fixed','variable']){let g=fixture(4,setup);while(g.phase.startsWith('setup')){const p=g.active;g=action(g,p,{type:'settlement',vertex:legalSettlements(g,p,true)[0]});g=action(g,p,{type:'road',edge:legalRoads(g,p,g.anchor)[0]});}
    const grants=g.events.filter(e=>e.kind==='gain'||e.gain);assert.equal(grants.length,4,setup);
    for(const e of grants){const res=e.res||e.gain,tally=emptyHand();for(const x of e.gains){assert.equal(x.p,e.p);assert.equal(g.board.hexes[x.hex].resource,x.r);tally[x.r]+=x.n;}assert.deepEqual(tally,res,setup);}}
});
test('variable snake placement completes at every player count and obeys distance',()=>{
  for(const n of [2,3,4,5,6]){let g=fixture(n,'variable');const start=g.active,seen=[];while(g.phase.startsWith('setup')){seen.push(g.active);const p=g.active;g=action(g,p,{type:'settlement',vertex:legalSettlements(g,p,true)[0]});g=action(g,p,{type:'road',edge:legalRoads(g,p,g.anchor)[0]});}assert.deepEqual(seen,[...Array(n)].map((_,i)=>(start+i)%n).concat([...Array(n)].map((_,i)=>(start+n-1-i)%n)));assert.equal(g.active,start);conserved(g);}
});
test('invalid commands are atomic and out-of-turn building is rejected',()=>{const g=fixture(),before=structuredClone(g);assert.throws(()=>action(g,(g.active+1)%4,{type:'road',edge:0}),/turn/);assert.deepEqual(g,before);assert.throws(()=>action(g,g.active,{type:'end'}),/Finish/);});
test('production shortages deny multiple claimants but give remaining stock to one',()=>{
  const g=clear(fixture()),h=g.board.hexes.find(h=>h.resource==='ore');h.number=6;g.board.hexes.filter(x=>x!==h&&x.resource==='ore').forEach(x=>x.number=2);
  g.board.vertices[h.vertices[0]].building={owner:0,kind:'city'};g.board.vertices[h.vertices[2]].building={owner:1,kind:'settlement'};g.bank.ore=2;produce(g,6);assert.equal(g.players[0].hand.ore,0);assert.equal(g.players[1].hand.ore,0);
  g.board.vertices[h.vertices[2]].building=null;g.bank.ore=1;produce(g,6);assert.equal(g.players[0].hand.ore,1);assert.equal(g.bank.ore,0);
});
test('seven requires exact discards before moving robber and hides stolen identity',()=>{
  let g=fixture();g.phase='preRoll';give(g,0,'wood',9);const p=g.active;g=action(g,p,{type:'roll'},(()=>{let i=0;return ()=>[2,3][i++];})());assert.equal(g.phase,'discard');assert.throws(()=>action(g,p,{type:'robber',hex:1}),/Move|Finish/);
  for(let i=0;i<g.count;i++)if(g.discards[i]){let left=g.discards[i],b=emptyHand();for(const r of R){b[r]=Math.min(g.players[i].hand[r],left);left-=b[r];}g=action(g,i,{type:'discard',resources:b});}
  assert.equal(g.phase,'robber');assert.throws(()=>action(g,p,{type:'robber',hex:g.robber}),/different/);const target=g.board.hexes.find(h=>h.id!==g.robber&&h.vertices.some(v=>{const owner=g.board.vertices[v].building?.owner;return owner>=0&&owner!==p;}));g=action(g,p,{type:'robber',hex:target.id});if(g.phase==='steal')g=action(g,p,{type:'steal',player:g.victims[0]});assert.equal(g.phase,'action');conserved(g);
});
test('an offer leaves the table once every other player has declined it, and only then',()=>{
  const start=count=>{const g=clear(fixture(count));give(g,0,'wood',1);give(g,1,'ore',1);return action(g,0,{type:'offer',offerId:'o1',give:{wood:1},want:{ore:1}});},ids=g=>g.offers.map(o=>o.id),all=(g,ps)=>ps.reduce((g,p)=>action(g,p,{type:'declineOffer',offerId:'o1'}),g);
  for(const count of [2,4,5,6]){const others=Array.from({length:count-1},(_,i)=>i+1);let g=all(start(count),others.slice(0,-1));if(count>2)assert.deepEqual(ids(g),['o1'],'one answer short: still open');g=all(g,others.slice(-1));assert.deepEqual(ids(g),[],`${count} players: the last decline removes it`);assert.deepEqual(pending(g),[0]);const e=g.events.at(-1);assert.deepEqual([e.kind,e.p,e.from,e.declined],['cancel',0,0,true]);}
  // Accepting holds it open; withdrawing that acceptance can be the last decline.
  let g=all(start(4),[2,3]);g=action(g,1,{type:'acceptOffer',offerId:'o1'});assert.deepEqual(ids(g),['o1'],'someone is still willing');g=action(g,1,{type:'declineOffer',offerId:'o1'});assert.deepEqual(ids(g),[]);
  // A counter isn't a decline, and it outlives the offer it answered.
  g=start(4);give(g,3,'ore',1);g=action(g,3,{type:'offer',offerId:'c1',counterTo:'o1',give:{ore:1},want:{wood:1}});g=all(g,[1,2]);assert.deepEqual(ids(g),['o1','c1'],'the player who countered has not declined');
  g=action(g,3,{type:'declineOffer',offerId:'o1'});assert.deepEqual(ids(g),['c1'],'the counter stays');g=action(g,0,{type:'acceptOffer',offerId:'c1'});assert.equal(g.players[0].hand.ore,1);assert.equal(g.offers.length,0);conserved(g);
});
test('domestic trades reject gifts and same resources, exchange atomically, and clear offers',()=>{
  let g=clear(fixture());give(g,0,'wood',2);give(g,1,'ore',1);give(g,2,'ore',1);assert.throws(()=>action(g,0,{type:'offer',give:{wood:1},want:{}}),/gifts/);assert.throws(()=>action(g,0,{type:'offer',give:{wood:2},want:{wood:1}}),/different/);
  g=action(g,0,{type:'offer',offerId:'trade001',give:{wood:2},want:{ore:1}});g=action(g,1,{type:'acceptOffer',offerId:'trade001'});assert.equal(g.players[1].hand.wood,0,'accepting only marks willingness');
  g=action(g,2,{type:'acceptOffer',offerId:'trade001'});assert.deepEqual(g.offers[0].accepted,[1,2]);assert.throws(()=>action(g,0,{type:'confirmOffer',offerId:'trade001',player:3}),/not accepted/);assert.throws(()=>action(g,1,{type:'confirmOffer',offerId:'trade001',player:2}),/not accepted/);
  g=action(g,2,{type:'declineOffer',offerId:'trade001'});assert.deepEqual([g.offers[0].accepted,g.offers[0].declined],[[1],[2]],'an accept can be withdrawn');assert.equal(g.events.at(-1).answer,'withdraw');
  g=action(g,0,{type:'confirmOffer',offerId:'trade001',player:1});assert.equal(g.players[1].hand.wood,2);assert.equal(g.players[0].hand.ore,1);assert.equal(g.offers.length,0);conserved(g);
  assert.deepEqual(g.events.at(-1),{id:g.events.at(-1).id,turn:g.turn,kind:'trade',p:0,with:1,give:{...emptyHand(),wood:2},want:{...emptyHand(),ore:1}});
  give(g,0,'wheat',1);give(g,1,'ore',1);give(g,2,'wool',1);assert.throws(()=>action(g,1,{type:'offer',offerId:'own',give:{ore:1},want:{wood:1}}),/counter/,'only the current player starts trades');
  g=action(g,0,{type:'offer',offerId:'trade002',give:{wheat:1},want:{ore:1}});g=action(g,1,{type:'offer',offerId:'counter1',counterTo:'trade002',give:{ore:1},want:{ore:0,wheat:1,brick:0}});g=action(g,2,{type:'offer',offerId:'counter2',counterTo:'trade002',give:{wool:1},want:{wheat:1}});
  assert.deepEqual(g.offers.map(o=>[o.id,o.to,o.counterTo]),[['trade002',null,undefined],['counter1',0,'trade002'],['counter2',0,'trade002']]);
  assert.throws(()=>action(g,2,{type:'acceptOffer',offerId:'counter1'}),/cannot answer/,'counters are for the current player only');
  g=action(g,0,{type:'declineOffer',offerId:'counter2'});assert.deepEqual(g.offers.map(o=>o.id),['trade002','counter1'],'declining one counter keeps the others');
  assert.throws(()=>action(g,2,{type:'cancelOffer',offerId:'trade002'}),/cannot cancel/);
  g=action(g,0,{type:'acceptOffer',offerId:'counter1'});assert.equal(g.players[0].hand.ore,2,'the current player completes a counter by accepting it');assert.equal(g.players[1].hand.wheat,1);assert.equal(g.offers.length,0);conserved(g);
  g=action(g,0,{type:'offer',offerId:'trade003',give:{ore:1},want:{wool:1}});assert.throws(()=>action(g,1,{type:'acceptOffer',offerId:'trade003'}),/requested resources/);
  g=action(g,2,{type:'acceptOffer',offerId:'trade003'});g.players[2].hand.wool--;g.bank.wool++;assert.throws(()=>action(g,0,{type:'confirmOffer',offerId:'trade003',player:2}),/no longer/,'resources are checked again on confirm');
});
test('robber steals at once from a single victim and only thief and victim learn the resource',()=>{
  let g=clear(fixture());g.phase='robber';g.resumePhase='action';const h=g.board.hexes.find(h=>h.id!==g.robber);g.board.vertices[h.vertices[0]].building={owner:1,kind:'settlement'};give(g,1,'brick',1);
  g=action(g,0,{type:'robber',hex:h.id});assert.equal(g.phase,'action');assert.equal(g.players[0].hand.brick,1);conserved(g);
  const e=g.events.at(-1);assert.deepEqual([e.kind,e.p,e.from,e.secret.r],['steal',0,1,'brick']);
  assert.equal(view(g,0).events.at(-1).secret.r,'brick');assert.equal(view(g,1).events.at(-1).secret.r,'brick');assert.equal(view(g,2).events.at(-1).secret,undefined);
  g.phase='robber';g.resumePhase='action';const k=g.board.hexes.find(x=>x.id!==g.robber&&x.vertices.length);g.board.vertices[k.vertices[0]].building={owner:1,kind:'settlement'};g.board.vertices[k.vertices[3]].building={owner:2,kind:'settlement'};give(g,1,'wool',1);give(g,2,'wool',1);
  g=action(g,0,{type:'robber',hex:k.id});assert.equal(g.phase,'steal','two victims still need a choice');assert.deepEqual(g.victims.toSorted(),[1,2]);
});
test('history records production per hex, purchases privately, and awards',()=>{
  let g=clear(fixture());g.phase='preRoll';const h=g.board.hexes.find(h=>h.resource==='wood'&&h.id!==g.robber);g.board.hexes.forEach(x=>{if(x.number===8)x.number=3;});h.number=8;g.board.vertices[h.vertices[0]].building={owner:1,kind:'city'};g.board.vertices[h.vertices[2]].building={owner:2,kind:'settlement'};
  g=action(g,0,{type:'roll'},(()=>{let i=0;return ()=>[3,3][i++];})());const roll=g.events.at(-1);assert.deepEqual(roll.dice,[4,4]);assert.deepEqual(roll.gains.toSorted((a,b)=>a.p-b.p),[{p:1,hex:h.id,r:'wood',n:2},{p:2,hex:h.id,r:'wood',n:1}]);assert.deepEqual(roll.short,[]);
  give(g,0,'ore',1);give(g,0,'wool',1);give(g,0,'wheat',1);g=action(g,0,{type:'buyCard'});const buy=g.events.at(-1);assert.equal(buy.kind,'buy');assert.ok(buy.secret.card);assert.deepEqual(buy.secret.to,[0]);
  assert.equal(view(g,1).events.at(-1).secret,undefined);assert.ok(view(g,1).events.every(e=>!e.secret),'no other seat sees any secret');
  g.players[0].knights=2;g.players[0].cards=[{id:'k',type:'knight',bought:-1}];g=action(g,0,{type:'playCard',card:'k'});assert.ok(g.events.some(e=>e.kind==='award'&&e.award==='army'&&e.p===0&&e.from===null));
  assert.ok(g.events.every((e,i)=>!i||e.id===g.events[i-1].id+1),'event ids increase by one');
});
test('bank rates follow owned ports and bank shortage rolls back payment',()=>{
  let g=clear(fixture());const port=g.board.ports.find(p=>p.resource==='wood');g.board.vertices[port.vertices[0]].building={owner:0,kind:'settlement'};assert.equal(tradeRatio(g,0,'wood'),2);give(g,0,'wood',4);g=action(g,0,{type:'bank',give:'wood',want:'ore'});assert.equal(g.players[0].hand.ore,1);conserved(g);g.bank.ore=0;const before=structuredClone(g);assert.throws(()=>action(g,0,{type:'bank',give:'wood',want:'ore'}),/supply/);assert.deepEqual(g,before);
});
test('paired turns alternate, restrict trades, and age development cards across roles',()=>{
  for(const n of [5,6]){let g=fixture(n);const primary=g.active;g.phase='action';g=action(g,primary,{type:'end'});const second=(primary+3)%n;assert.equal(g.active,second);assert.equal(g.role,2);assert.equal(g.phase,'action');assert.throws(()=>action(g,second,{type:'roll'}),/roll/);assert.throws(()=>action(g,second,{type:'offer',give:{wood:1},want:{ore:1}}),/unavailable/);
    g.players[second].cards.push({id:'old',type:'knight',bought:g.turn-1});g=action(g,second,{type:'playCard',card:'old'});assert.equal(g.phase,'robber');assert.equal(g.players[second].knights,1);g.phase='action';g=action(g,second,{type:'end'});assert.equal(g.active,(primary+1)%n);assert.equal(g.role,1);assert.equal(g.phase,'preRoll');}
});
test('development cards enforce purchase timing and one per turn; VP cannot be played',()=>{let g=clear(fixture());g.players[0].cards=[{id:'new',type:'knight',bought:g.turn},{id:'vp',type:'vp',bought:0},{id:'a',type:'monopoly',bought:0},{id:'b',type:'invention',bought:0}];assert.throws(()=>action(g,0,{type:'playCard',card:'new'}),/cannot/);assert.throws(()=>action(g,0,{type:'playCard',card:'vp'}),/cannot/);give(g,1,'wood',3);g=action(g,0,{type:'playCard',card:'a'});g=action(g,0,{type:'monopoly',resource:'wood'});assert.equal(g.players[0].hand.wood,3);assert.throws(()=>action(g,0,{type:'playCard',card:'b'}),/one/);conserved(g);});
test('Invention honors the supply and restores pre-roll phase',()=>{let g=clear(fixture());g.phase='preRoll';g.players[0].cards=[{id:'a',type:'invention',bought:0}];g=action(g,0,{type:'playCard',card:'a'});g=action(g,0,{type:'invention',resources:{wood:1,wheat:1}});assert.equal(g.phase,'preRoll');assert.equal(g.players[0].hand.wheat,1);conserved(g);});
test('free roads enforce connection and stop when all pieces are used',()=>{let g=fixture();const p=g.active;g.phase='action';g.players[p].cards=[{id:'a',type:'roads',bought:0}];g=action(g,p,{type:'playCard',card:'a'});const hand=structuredClone(g.players[p].hand);g=action(g,p,{type:'road',edge:legalRoads(g,p)[0]});g=action(g,p,{type:'road',edge:legalRoads(g,p)[0]});assert.equal(g.phase,'action');assert.deepEqual(g.players[p].hand,hand);assert.equal(g.board.edges.filter(e=>e.owner===p).length,4);});
test('longest route counts edges once through loops and stops at opposing settlements',()=>{const g=clear(fixture()),h=g.board.hexes[9];h.edges.forEach(e=>g.board.edges[e].owner=0);assert.equal(routeLength(g,0),6);g.board.vertices[h.vertices[0]].building={owner:1,kind:'settlement'};assert.equal(routeLength(g,0),6);g.board.vertices[h.vertices[3]].building={owner:1,kind:'settlement'};assert.equal(routeLength(g,0),3);});
test('the longest route path is one continuous trail of the owner’s roads and is in every view',()=>{const g=clear(fixture()),h=g.board.hexes[9];h.edges.forEach(e=>g.board.edges[e].owner=0);
  const spur=g.board.vertices[h.vertices[0]].edges.find(e=>!h.edges.includes(e));g.board.edges[spur].owner=0;g.board.vertices[h.vertices[3]].building={owner:1,kind:'settlement'};
  const path=routePath(g,0);assert.equal(path.length,routeLength(g,0));assert.equal(new Set(path).size,path.length);assert.ok(path.every(e=>g.board.edges[e].owner===0));
  for(let i=1;i<path.length;i++){const [a,b]=[path[i-1],path[i]].map(e=>g.board.edges[e].vertices);assert.ok(a.some(v=>b.includes(v)),'consecutive edges share a vertex');}
  assert.deepEqual(view(g,2).players[0].routeEdges,path);});
test('branches do not sum all arms into a continuous route',()=>{const g=clear(fixture()),v=g.board.vertices.find(v=>v.edges.length===3);v.edges.forEach(e=>g.board.edges[e].owner=0);assert.equal(routeLength(g,0),2);});
test('private views exclude opponents hands, deck and hidden victory points',()=>{const g=fixture();g.players[1].cards.push({id:'secret',type:'vp',bought:0});const v=view(g,0);assert.equal(v.players[1].cards,undefined);assert.equal(v.players[1].hand,undefined);assert.equal(v.deck,undefined);assert.equal(v.players[1].score,2);assert.equal(view(g,1).players[1].score,3);assert.equal(JSON.stringify(v).includes('secret'),false);});
test('winning is immediate only during your own portion, including a newly bought VP',()=>{let g=clear(fixture(6));g.players[0].cards=Array.from({length:9},(_,i)=>({id:`v${i}`,type:'vp',bought:0}));g.deck=['vp'];give(g,0,'ore',1);give(g,0,'wool',1);give(g,0,'wheat',1);g=action(g,0,{type:'buyCard'});assert.equal(g.phase,'finished');assert.equal(g.winner,0);assert.equal(score(g,0,true),10);assert.equal(g.active,0);});

test('random valid sequences preserve inventory and can resume serialized state',()=>{for(const n of [2,3,4,5,6]){let g=fixture(n),rand=rng(100+n);for(let step=0;step<160;step++){const p=g.active;if(g.phase==='preRoll')g=action(g,p,{type:'roll'},rand);else if(g.phase==='discard'){for(let i=0;i<n;i++)if(g.discards[i]){let left=g.discards[i],b=emptyHand();for(const r of R){b[r]=Math.min(left,g.players[i].hand[r]);left-=b[r];}g=action(g,i,{type:'discard',resources:b},rand);}}else if(g.phase==='robber')g=action(g,p,{type:'robber',hex:(g.robber+1)%g.board.hexes.length},rand);else if(g.phase==='steal')g=action(g,p,{type:'steal',player:g.victims[0]},rand);else if(g.phase==='action'){const roads=legalRoads(g,p);if(roads.length&&g.players[p].hand.wood&&g.players[p].hand.brick&&rand(3)===0)g=action(g,p,{type:'road',edge:roads[rand(roads.length)]},rand);else g=action(g,p,{type:'end'},rand);}else break;conserved(g);g=JSON.parse(JSON.stringify(g));}}});

test('the map sets seats, board, supply and deck; the host starts once two or more are ready',()=>{
  const lobby=map=>{const g=newGame('test',map,'variable');return g;};
  assert.throws(()=>newGame('test','huge'),/base or extended/);
  for(const [map,seats,hexes,supply,deck] of [['base',4,19,19,25],['extended',6,30,24,34]]){
    let g=lobby(map);assert.equal(g.seats,seats);for(let i=0;i<seats;i++)addPlayer(g,`id${i}`,`P${i}`);
    assert.throws(()=>addPlayer(g,'extra','Extra'),/full/,`${map} holds ${seats}`);
    g=lobby(map);addPlayer(g,'a','A');g.players[0].ready=true;
    assert.throws(()=>apply(g,0,{type:'start'},rng()),/At least two/,'one player cannot start');
    addPlayer(g,'b','B');assert.throws(()=>apply(g,0,{type:'start'},rng()),/everyone must be ready/);
    g.players[1].ready=true;g=order(apply(g,0,{type:'start'},rng()));
    assert.equal(g.count,2);assert.equal(g.board.hexes.length,hexes);assert.equal(g.bank.wood,supply);assert.equal(g.deck.length,deck);
  }
});

test('the host changes the table settings in the lobby; points to win, discard limit and friendly robber apply in play',()=>{
  let g=newGame('test');for(const n of ['A','B','C','D','E'].slice(0,4))addPlayer(g,n,n);g.players.forEach(p=>p.ready=true);
  assert.throws(()=>apply(g,1,{type:'settings',goal:8},rng()),/Only the host/);
  for(const bad of [{goal:4},{goal:21},{limit:6},{limit:13},{goal:'9'},{map:'huge'},{setup:'odd'},{friendly:'yes'}])assert.throws(()=>apply(g,0,{type:'settings',...bad},rng()));
  g=apply(g,0,{type:'settings',map:'extended',setup:'fixed',goal:6,limit:9,friendly:true},rng());
  assert.deepEqual([g.map,g.seats,g.setup,g.goal,g.limit,g.friendly],['extended',6,'fixed',6,9,true]);
  assert.deepEqual(g.players.map(p=>p.ready),[true,false,false,false],'a change asks the others to ready up again');
  g.players.forEach(p=>p.ready=true);g=apply(g,0,{type:'settings',goal:6},rng());assert.ok(g.players.every(p=>p.ready),'an unchanged value keeps everyone ready');
  addPlayer(g,'E','E');assert.throws(()=>apply(g,0,{type:'settings',map:'base'},rng()),/Too many players/);
  // Discard limit: 9 cards is fine with a limit of 9, 10 is not.
  let h=clear(fixture(3));h.goal=10;h.limit=9;h.players[0].hand.wood=9;h.bank.wood-=9;h.players[1].hand.brick=10;h.bank.brick-=10;h.phase='preRoll';
  const seven=()=>{let k=0;return n=>[2,3][k++]??0;};h=apply(h,0,{type:'roll'},seven());assert.deepEqual(h.discards,[0,5,0]);
  // Points to win: 6 points ends the game when the goal is 6.
  let w=clear(fixture(3));w.goal=6;w.phase='action';for(const v of w.board.vertices.filter(v=>v.hexes.length===3).filter((v,i)=>i%7===0).slice(0,3))v.building={owner:0,kind:'city'};w.players[0].hand={wood:1,brick:1,wool:0,wheat:0,ore:0};
  w=apply(w,0,{type:'end'},rng());assert.equal(w.phase,'finished');assert.equal(w.winner,0);
  // Friendly robber: a player with 2 points or fewer is never a victim.
  let r=clear(fixture(3));r.friendly=true;r.phase='robber';r.resumePhase='action';const hex=r.board.hexes.find(x=>x.id!==r.robber);const [v1,v2]=hex.vertices.filter((_,i)=>i%2===0);
  r.board.vertices[v1].building={owner:1,kind:'settlement'};r.board.vertices[v2].building={owner:2,kind:'city'};for(const v of r.board.vertices.filter(v=>!v.building).slice(0,2))v.building={owner:2,kind:'settlement'};
  r.players[1].hand.ore=1;r.players[2].hand.ore=1;r.bank.ore-=2;r=apply(r,0,{type:'robber',hex:hex.id},rng());assert.equal(r.players[2].hand.ore,0,'the 4-point player is robbed');assert.equal(r.players[1].hand.ore,1,'the 1-point player is spared');
  const re=apply({...structuredClone(w),phase:'finished'},0,{type:'rematch'},rng());assert.deepEqual([re.goal,re.limit,re.friendly],[6,7,false],'a rematch keeps the settings');
});

test('everyone rolls for the first turn in any order; only tied players roll again',()=>{
  let g=newGame('test','base','variable');for(const n of ['A','B','C'])addPlayer(g,n,n);g.players.forEach(p=>p.ready=true);g=apply(g,0,{type:'start'},rng());
  assert.equal(g.phase,'order');const dice=list=>{let k=0;return ()=>list[k++]-1;};
  assert.throws(()=>apply(g,0,{type:'roll'},rng()),/cannot roll now/);
  g=apply(g,2,{type:'firstRoll'},dice([6,5]));assert.throws(()=>apply(g,2,{type:'firstRoll'},rng()),/already rolled/);
  g=apply(g,0,{type:'firstRoll'},dice([2,2]));g=apply(g,1,{type:'firstRoll'},dice([5,6]));
  assert.equal(g.phase,'order');assert.deepEqual(g.order.candidates,[1,2]);assert.equal(g.order.round,2);assert.deepEqual(g.events.at(-1),{...g.events.at(-1),kind:'tie',players:[1,2],total:11});
  assert.throws(()=>apply(g,0,{type:'firstRoll'},rng()),/already rolled/,'players outside the tie wait');
  g=apply(g,1,{type:'firstRoll'},dice([3,1]));g=apply(g,2,{type:'firstRoll'},dice([1,1]));
  assert.equal(g.phase,'setupSettlement');assert.equal(g.active,1);assert.equal(g.primary,1);assert.deepEqual(g.setupOrder,[1,2,0,0,2,1]);
  assert.deepEqual(g.events.filter(e=>e.kind==='order').map(e=>[e.p,e.round,e.dice[0]+e.dice[1]]),[[2,1,11],[0,1,4],[1,1,11],[1,2,4],[2,2,2]]);assert.equal(g.events.at(-1).kind,'first');
  // A fixed island places its pieces once the starting player is known.
  let h=newGame('test','base','fixed');for(const n of ['A','B'])addPlayer(h,n,n);h.players.forEach(p=>p.ready=true);h=apply(h,0,{type:'start'},rng());
  assert.equal(h.board.vertices.filter(v=>v.building).length,0);h=apply(h,0,{type:'firstRoll'},dice([1,1]));h=apply(h,1,{type:'firstRoll'},dice([6,6]));
  assert.equal(h.phase,'preRoll');assert.equal(h.active,1);assert.equal(h.board.vertices.filter(v=>v.building).length,4);
});

test('extended map with four players uses classic turns; paired turns need five or six',()=>{
  let g=fixture(4,'fixed','extended');assert.equal(g.board.hexes.length,30);
  const first=g.active;g=apply({...g,phase:'action'},first,{type:'end'},rng());
  assert.equal(g.role,1);assert.equal(g.active,(first+1)%4,'the next player takes a full turn');
  assert.equal(g.board.vertices.filter(v=>v.building?.owner===-1).length,0,'unused fixed positions stay empty, without neutral blockers');
  let h=fixture(6,'fixed','extended');const p=h.active;h=apply({...h,phase:'action'},p,{type:'end'},rng());assert.equal(h.role,2);
});

test('saves from before map selection keep their implied map',()=>{
  assert.deepEqual([upgrade({count:5,players:[]}).map,upgrade({count:5,players:[]}).seats],['extended',6]);
  assert.deepEqual([upgrade({count:3,players:[]}).map,upgrade({count:3,players:[]}).seats],['base',4]);
  const current=newGame('test','extended');assert.equal(upgrade(structuredClone(current)).seats,6);
});
test('the host fills seats with bots named “(Bot)”, removes them, and they stay ready through settings and rematch',()=>{
  let g=newGame('test','base');addPlayer(g,'h','Marko');assert.throws(()=>addPlayer(g,'x','Ana (Bot)'),/Only bots/);assert.throws(()=>addPlayer(g,'x','Ana (bot) '),/Only bots/);addPlayer(g,'t','Talbot');g.players.pop();addPlayer(g,'b','Guest');
  assert.throws(()=>apply(g,1,{type:'addBot'},rng()),/host/);for(let i=0;i<2;i++)g=apply(g,0,{type:'addBot'},rng(i+3));
  const bots=g.players.filter(p=>p.bot);assert.equal(bots.length,2);assert.ok(bots.every(p=>p.ready&&/^\w+ \(Bot\)$/.test(p.name)&&p.id.startsWith('bot-')));assert.ok(!bots.some(p=>p.name==='Marko (Bot)'),'a bot never takes a player’s first name');
  assert.throws(()=>apply(g,0,{type:'addBot'},rng()),/full/);assert.throws(()=>apply(g,0,{type:'removeBot',player:1},rng()),/not a bot/);
  const kept=g.players.map(p=>p.color);g=apply(g,0,{type:'removeBot',player:2},rng());assert.equal(g.players.length,3);assert.deepEqual(g.players.map(p=>p.color),kept.toSpliced(2,1),'nobody is recoloured');
  g.players[1].ready=true;g=apply(g,0,{type:'settings',goal:8},rng());assert.equal(g.players[1].ready,false);assert.equal(g.players[2].ready,true,'bots stay ready');
  assert.equal(view(g,0).players[2].bot,true);
  g.players.forEach(p=>p.ready=true);g=order(apply(g,0,{type:'start'},rng()));assert.throws(()=>apply(g,0,{type:'addBot'},rng()),/host/);
  g.phase='finished';g=apply(g,0,{type:'rematch'},rng());assert.equal(g.players[2].bot,true);assert.equal(g.players[2].ready,true);assert.equal(g.players[1].ready,false);
});
test('a bot can play for another player until they come back; pending lists who owes a decision',()=>{
  let g=fixture(3,'variable');assert.deepEqual(pending(g),[g.active]);const other=(g.active+1)%3;
  assert.throws(()=>apply(g,other,{type:'takeover',player:other},rng()),/another/);g=apply(g,g.active,{type:'takeover',player:other},rng());
  assert.equal(g.players[other].auto,true);assert.equal(view(g,0).players[other].auto,true);assert.throws(()=>apply(g,g.active,{type:'takeover',player:other},rng()),/another/);
  assert.equal(g.events.at(-1).kind,'takeover');assert.throws(()=>apply(g,g.active,{type:'release'},rng()),/No bot/);
  g=apply(g,other,{type:'release'},rng());assert.equal(g.players[other].auto,undefined);assert.equal(g.events.at(-1).kind,'release');
  assert.throws(()=>apply(g,g.active,{type:'takeover',player:String(other)},rng()),/another/);g=apply(g,other,{type:'takeover',player:other,auto:true},rng());assert.equal(g.events.at(-1).by,null);g.phase='finished';g=apply(g,other,{type:'release'},rng());assert.equal(g.players[other].auto,undefined,'a player can come back after the game ended');
  g=clear(fixture(4));g.offers=[{id:'o',from:0,to:null,give:{...emptyHand(),wood:1},want:{...emptyHand(),ore:1},accepted:[1],declined:[2]}];assert.deepEqual(pending(g),[0,3]);
  g.role=2;assert.deepEqual(pending(g),[0]);g.role=1;g.phase='discard';g.discards=[0,4,0,3];assert.deepEqual(pending(g),[1,3]);
  g.phase='order';g.order={candidates:[0,2,3],done:[2]};assert.deepEqual(pending(g),[0,3]);
});
test('new tables are public; visibility leaves everyone ready, old saves stay private, and rematch keeps it',()=>{
  let g=newGame('t');assert.equal(g.public,true);addPlayer(g,'a','A');addPlayer(g,'b','B');g=apply(g,1,{type:'ready'},rng());
  g=apply(g,0,{type:'settings',public:false},rng());assert.equal(g.public,false);assert.equal(g.players[1].ready,true);assert.equal(view(g,1).public,false);
  assert.throws(()=>apply(g,0,{type:'settings',public:'yes'},rng()),/Invalid setting/);assert.throws(()=>apply(g,1,{type:'settings',public:true},rng()),/Only the host/);
  const old=newGame('o');delete old.public;assert.equal(upgrade(old).public,false);
  const f=fixture(2);f.public=false;f.phase='finished';assert.equal(apply(f,0,{type:'rematch'},rng()).public,false);
});
test('the host removes people from the lobby, but not themselves, bots or anyone once the game starts',()=>{
  let g=newGame('t');['A','B','C'].forEach((n,i)=>addPlayer(g,'id'+i,n));g=apply(g,0,{type:'addBot'},rng());
  for(const player of [0,3,4,-1,1.5,'1',undefined])assert.throws(()=>apply(g,0,{type:'kick',player},rng()),/another player/);
  assert.throws(()=>apply(g,1,{type:'kick',player:2},rng()),/Only the host/);
  const kept=g.players.map(p=>p.color);g=apply(g,0,{type:'kick',player:1},rng());assert.deepEqual(g.players.map(p=>p.id),['id0','id2',g.players[2].id]);assert.ok(g.players[2].bot);assert.deepEqual(g.players.map(p=>p.color),kept.toSpliced(1,1),'nobody is recoloured');
  assert.throws(()=>apply(fixture(3),0,{type:'kick',player:1},rng()),/before the game starts/);
});
test('players pick a free colour or take a bot’s, new seats get the first free one, and colours last into the game and the rematch',()=>{
  let g=newGame('t');addPlayer(g,'a','A');addPlayer(g,'b','B');assert.deepEqual(g.players.map(p=>p.color),COLORS.slice(0,2));g.players[1].ready=true;
  for(const color of ['red',undefined,7])assert.throws(()=>apply(g,0,{type:'color',color},rng()),/one of the colours/);
  assert.throws(()=>apply(g,0,{type:'color',color:COLORS[0]},rng()),/already your colour/);
  g=apply(g,0,{type:'color',color:COLORS[2]},rng());assert.equal(g.players[0].color,COLORS[2]);assert.equal(g.players[1].ready,true,'a colour changes no rule, so nobody un-readies');
  g=apply(g,1,{type:'color',color:COLORS[4]},rng());assert.equal(g.players[1].ready,true);assert.equal(g.players[1].color,COLORS[4]);
  addPlayer(g,'c','C');assert.equal(g.players[2].color,COLORS[0],'the first free colour, in palette order');
  g=apply(g,0,{type:'addBot'},rng());assert.equal(g.players[3].color,COLORS[1]);
  g=apply(g,2,{type:'color',color:COLORS[1]},rng());assert.equal(g.players[2].color,COLORS[1]);assert.equal(g.players[3].color,COLORS[0],'the bot takes the colour you left');assert.ok(g.players[3].ready);
  assert.deepEqual(view(g,1).colors.map(c=>c.hex),COLORS);assert.equal(view(g,1).colors[1].name,'Red');
  g.players.forEach(p=>p.ready=true);const chosen=g.players.map(p=>p.color);g=apply(g,0,{type:'start'},rng());assert.deepEqual(g.players.map(p=>p.color),chosen);assert.equal(view(g,0).colors,undefined);
  assert.throws(()=>apply(g,0,{type:'color',color:COLORS[5]},rng()),/before the game starts/);
  g.phase='finished';g=apply(g,0,{type:'rematch'},rng());assert.deepEqual(g.players.map(p=>p.color),chosen);
});
test('asking a person for their colour: they accept or decline, you can withdraw, and a request ends when either colour changes',()=>{
  const table=()=>{const g=newGame('t','extended');['A','B','C','D'].forEach((n,i)=>addPlayer(g,'id'+i,n));return g;},ask=(g,p,q)=>apply(g,p,{type:'color',color:g.players[q].color},rng()),answer=(g,p,from,accept)=>apply(g,p,{type:'colorAnswer',from,accept},rng());
  let g=table();g.players[1].ready=true;const [a,b,c]=g.players.map(p=>p.color);
  g=ask(g,0,1);assert.deepEqual(g.swaps,[{from:'id0',to:'id1'}]);assert.equal(g.players[0].color,a,'asking changes nothing yet');assert.deepEqual(view(g,2).swaps,g.swaps);
  assert.throws(()=>answer(g,2,'id0',true),/withdrawn/);assert.throws(()=>answer(g,0,'id0',true),/withdrawn/);assert.throws(()=>answer(g,1,'id2',true),/withdrawn/);
  let d=answer(g,1,'id0',false);assert.deepEqual(d.swaps,[]);assert.equal(d.players[1].color,b);
  d=answer(g,1,'id0',true);assert.deepEqual([d.players[0].color,d.players[1].color],[b,a]);assert.deepEqual(d.swaps,[]);assert.equal(d.players[1].ready,true,'a ready player who accepts stays ready');
  d=apply(g,0,{type:'colorCancel'},rng());assert.deepEqual(d.swaps,[]);assert.deepEqual(apply(d,0,{type:'colorCancel'},rng()).swaps,[],'withdrawing twice is harmless');
  d=ask(g,0,2);assert.deepEqual(d.swaps,[{from:'id0',to:'id2'}],'a new request replaces the old one');
  d=ask(ask(g,2,1),3,1);assert.equal(d.swaps.length,3,'someone can have several requests');d=answer(d,1,'id2',true);assert.deepEqual(d.swaps,[],'accepting one ends the others, their colour is gone');assert.equal(d.players[1].color,c);
  d=apply(g,0,{type:'color',color:COLORS[5]},rng());assert.deepEqual(d.swaps,[],'the asker picked another colour');
  d=apply(g,1,{type:'color',color:COLORS[5]},rng());assert.deepEqual(d.swaps,[],'the colour asked for moved');
  d=apply(g,0,{type:'kick',player:1},rng());assert.deepEqual(d.swaps,[]);d=apply(ask(g,2,3),0,{type:'kick',player:3},rng());assert.deepEqual(d.swaps,[{from:'id0',to:'id1'}],'only the leaver’s requests end');
  d=apply(ask(table(),1,2),0,{type:'kick',player:1},rng());assert.deepEqual(d.swaps,[]);
  d=structuredClone(g);d.players.forEach(p=>p.ready=true);const started=apply(d,0,{type:'start'},rng());assert.deepEqual(started.swaps,[],'starting ends open requests');assert.throws(()=>answer(started,1,'id0',true),/before the game/);assert.throws(()=>apply(started,0,{type:'colorCancel'},rng()),/before the game/);
  const old=newGame('o');delete old.swaps;assert.deepEqual(upgrade(old).swaps,[]);
});
test('a fixed five-player game keeps chosen colours while spots are still drawn, with the sixth spot neutral',()=>{
  for(const seed of [1,2,3]){let g=newGame('t','extended','fixed');for(let i=0;i<5;i++){addPlayer(g,'id'+i,'P'+i);g.players[i].ready=true;}
    g=apply(g,0,{type:'color',color:COLORS[5]},rng());const chosen=g.players.map(p=>p.color);g=order(apply(g,0,{type:'start'},rng(seed)),rng(seed));
    assert.deepEqual(g.players.map(p=>p.color),chosen);assert.equal(new Set(chosen).size,5);assert.equal(g.board.vertices.filter(v=>v.building?.owner===-1).length,2);}
  const spots=seed=>{let g=newGame('t','extended','fixed');for(let i=0;i<5;i++){addPlayer(g,'id'+i,'P'+i);g.players[i].ready=true;}g=order(apply(g,0,{type:'start'},rng(seed)),rng(seed));return g.board.vertices.filter(v=>v.building?.owner===0).map(v=>v.id).join();};
  assert.ok(new Set([1,2,3,4,5,6,7,8].map(spots)).size>1,'starting spots are still shuffled');
});
test('a request is limited to what the other players hold between them, counters included',()=>{
  const post=(g,p,want,extra={})=>action(g,p,{type:'offer',offerId:'n'+p,give:{wood:1},want,...extra});
  let g=clear(fixture());give(g,0,'wood',2);assert.throws(()=>post(g,0,{ore:1}),/No other player/,'all in the supply');
  give(g,0,'ore',3);assert.throws(()=>action(g,0,{type:'offer',offerId:'n',give:{wood:1},want:{ore:1}}),/No other player/,'the rest in your own hand');
  give(g,1,'ore',2);give(g,2,'ore',1);assert.throws(()=>post(g,0,{ore:4}),/No other player/,'more than are out');assert.equal(post(g,0,{ore:3}).offers.length,1,'the sum of several hands');
  assert.deepEqual([0,1,3].map(p=>view(g,p).others.ore),[3,4,6],'counted for each seat without its own hand');
  g=clear(fixture());give(g,0,'wheat',1);give(g,1,'ore',1);give(g,1,'wood',1);g=action(g,0,{type:'offer',offerId:'b',give:{wheat:1},want:{ore:1}});
  assert.throws(()=>action(g,1,{type:'offer',offerId:'c',counterTo:'b',give:{wood:1},want:{brick:1}}),/No other player/,'a counter too');assert.equal(action(g,1,{type:'offer',offerId:'c',counterTo:'b',give:{wood:1},want:{wheat:1}}).offers.length,2);
  conserved(g);
});
