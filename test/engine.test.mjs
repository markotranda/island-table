import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,addPlayer,apply,view,legalRoads,legalSettlements,routeLength,produce,score,tradeRatio,R,emptyHand,upgrade} from '../lib/engine.mjs';
import {makeBoard} from '../lib/board.mjs';
function rng(seed=8){return n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};}
function fixture(n=4,setup='fixed',map=n>4?'extended':'base'){let g=newGame('test',map,setup);for(let i=0;i<n;i++){addPlayer(g,`id${i}`,`Player ${i}`);g.players[i].ready=true;}return apply(g,0,{type:'start'},rng());}
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
test('domestic trades reject gifts and same resources, exchange atomically, and clear offers',()=>{
  let g=clear(fixture());give(g,0,'wood',2);give(g,1,'ore',1);assert.throws(()=>action(g,0,{type:'offer',give:{wood:1},want:{}}),/gifts/);assert.throws(()=>action(g,0,{type:'offer',give:{wood:2},want:{wood:1}}),/different/);
  g=action(g,0,{type:'offer',offerId:'trade001',give:{wood:2},want:{ore:1}});g=action(g,1,{type:'acceptOffer',offerId:'trade001'});assert.equal(g.players[1].hand.wood,2);assert.equal(g.players[0].hand.ore,1);assert.equal(g.offers.length,0);conserved(g);
  give(g,1,'ore',1);give(g,2,'wool',1);g=action(g,1,{type:'offer',offerId:'trade002',give:{ore:1},want:{wood:1}});g=action(g,2,{type:'offer',offerId:'trade003',give:{wool:1},want:{wood:1}});
  g=action(g,0,{type:'cancelOffer',offerId:'trade003'});assert.deepEqual(g.offers.map(o=>o.id),['trade002'],'cancelling one offer keeps the others');
  assert.throws(()=>action(g,2,{type:'cancelOffer',offerId:'trade002'}),/cannot cancel/);
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
    g.players[1].ready=true;g=apply(g,0,{type:'start'},rng());
    assert.equal(g.count,2);assert.equal(g.board.hexes.length,hexes);assert.equal(g.bank.wood,supply);assert.equal(g.deck.length,deck);
  }
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
