import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,view,R,emptyHand} from '../lib/engine.mjs';
import {decide,fallback} from '../lib/bot.mjs';
import {play,bot,scripted,rng,setHand} from './sim.mjs';
const conserved=g=>{for(const r of R){assert.equal(g.bank[r]+g.players.reduce((s,pl)=>s+pl.hand[r],0),g.map==='extended'?24:19,r);assert.ok(g.players.every(pl=>pl.hand[r]>=0));}};

test('bots finish whole games at every table size using only legal commands from their own view',()=>{
  for(const count of [2,3,4,5,6])for(const seed of [11,12]){const {g}=play({count,seed,players:Array(count).fill(bot),check:conserved});
    assert.equal(g.phase,'finished',`${count} bots, seed ${seed}`);assert.ok(g.turn>15&&g.turn<(count>4?260:200),`${count} bots took ${g.turn} turns`);}
});
test('a bot decides the same whatever the hidden cards are: other hands and the deck never reach it',()=>{
  for(const seed of [3,4,5]){const {g}=play({count:4,seed,players:Array(4).fill(bot),until:g=>g.phase==='action'&&g.turn>12});const p=g.active,other=structuredClone(g);
    for(const [i,pl] of other.players.entries())if(i!==p){const n=R.reduce((s,r)=>s+pl.hand[r],0),hand=emptyHand();for(let k=0;k<n;k++)hand[R[(k+i)%5]]++;pl.hand=hand;pl.cards=pl.cards.map(c=>({...c,type:c.type==='vp'?'knight':'vp'}));}
    other.deck.reverse();assert.deepEqual(decide(view(other,p),rng(seed)),decide(view(g,p),rng(seed)));}
});
test('bots play sensibly: they beat the simple scripted player most of the time, without being unbeatable',()=>{
  let wins=0,games=0;for(let seed=1;seed<=24;seed++){const seats=seed%2?[bot,scripted,bot,scripted]:[scripted,bot,scripted,bot],{g}=play({count:4,seed,players:seats});assert.equal(g.phase,'finished');games++;if(seats[g.winner]===bot)wins++;}
  // The scripted player is weak (random roads, any card at once), so this shows sense, not strength; it must still win sometimes.
  assert.ok(wins/games>=.55&&wins<games,`bots won ${wins} of ${games}`);
});
test('a bot accepts a trade that brings a card it needs and declines one that costs a card it needs',()=>{
  const {g}=play({count:3,seed:7,players:Array(3).fill(bot),until:g=>g.phase==='action'&&g.role===1});const a=g.active,b=(a+1)%3;
  setHand(g,b,{ore:3,wheat:1,wood:1});setHand(g,a,{wheat:2,ore:1,wood:1});const always=n=>n-1;
  let s=apply(g,a,{type:'offer',give:{...emptyHand(),wheat:1},want:{...emptyHand(),wood:1},offerId:'good'},always);
  assert.deepEqual(decide(view(s,b),always),{type:'acceptOffer',offerId:'good'});
  s=apply(g,a,{type:'offer',give:{...emptyHand(),wood:1},want:{...emptyHand(),ore:1},offerId:'bad'},always);
  assert.deepEqual(decide(view(s,b),always),{type:'declineOffer',offerId:'bad'});
});
test('a bot hears every player out before it chooses, for at most 20 s',()=>{
  const {g}=play({count:4,seed:9,players:Array(4).fill(bot),until:g=>g.phase==='action'&&g.role===1}),a=g.active,[b,c,d]=[1,2,3].map(n=>(a+n)%4),base=()=>{const s=structuredClone(g);s.offers=[];setHand(s,a,{wood:1});return apply(s,a,{type:'offer',offerId:'x',give:{...emptyHand(),wood:1},want:{...emptyHand(),ore:1}},rng());},always=n=>n-1;
  const answer=(s,p,type)=>{setHand(s,p,{ore:1});return apply(s,p,{type,offerId:'x'},rng());},counter=(s,p)=>{setHand(s,p,{...s.players[p].hand,wheat:1});return apply(s,p,{type:'offer',offerId:'cx',counterTo:'x',give:{...emptyHand(),wheat:1},want:{...emptyHand(),wood:1}},rng());};
  // An early accept waits for the others, and a later acceptor with a lower score wins.
  let s=answer(base(),b,'acceptOffer');assert.ok(decide(view(s,a),rng(),{offerAge:3000}).wait>0,'one player accepted, two are silent');
  s=answer(s,c,'declineOffer');assert.ok(decide(view(s,a),rng(),{offerAge:3000}).wait>0,'one player is still silent');
  assert.deepEqual(decide(view(s,a),rng(),{offerAge:25000}),{type:'confirmOffer',offerId:'x',player:b},'a silent player does not hold the table up past 20 s');
  const low=view(answer(s,d,'acceptOffer'),a);low.players[b].score=5;low.players[d].score=1;assert.deepEqual(decide(low,rng(),{offerAge:3000}),{type:'confirmOffer',offerId:'x',player:d},'everyone answered: the lower score');
  // A counter is an answer, and it waits its turn: accepting it would end the trade too.
  s=counter(base(),b);assert.ok(decide(view(s,a),rng(),{offerAge:3000}).wait>0,'a counter with two players silent');
  s=answer(answer(s,c,'declineOffer'),d,'declineOffer');let v=view(s,a);assert.ok(['acceptOffer','declineOffer'].includes(decide(v,rng(),{offerAge:3000}).type)&&decide(v,rng(),{offerAge:3000}).offerId==='cx','everyone answered: the counter is settled');
  const accepted=view(answer(s,c,'acceptOffer'),a);assert.deepEqual(decide(accepted,rng(),{offerAge:3000}),{type:'confirmOffer',offerId:'x',player:c},'its own terms come before a counter');
  s=apply(s,a,{type:'declineOffer',offerId:'cx'},rng());assert.deepEqual(decide(view(s,a),rng(),{offerAge:3000}),{type:'cancelOffer',offerId:'x'},'a declined counter still counts as an answer');
  // A counter the player took back is no answer; they may yet accept.
  s=answer(answer(counter(base(),b),c,'declineOffer'),d,'declineOffer');s=apply(s,b,{type:'cancelOffer',offerId:'cx'},rng());assert.ok(decide(view(s,a),rng(),{offerAge:3000}).wait>0,'a withdrawn counter');
  // Without an open offer of its own there is nothing to wait for.
  s=answer(counter(base(),b),c,'declineOffer');s=apply(s,a,{type:'cancelOffer',offerId:'x'},rng());assert.ok(['acceptOffer','declineOffer'].includes(decide(view(s,a),always,{offerAge:0}).type),'guard: a lone counter is answered at once');
});
test('a bot confirms with whoever accepted its offer once everyone answered, and gives up once everyone declined or after a while',()=>{
  const {g}=play({count:3,seed:9,players:Array(3).fill(bot),until:g=>g.phase==='action'&&g.role===1});const a=g.active,[b,c]=[(a+1)%3,(a+2)%3],o=(accepted,declined)=>({...structuredClone(g),offers:[{id:'x',from:a,to:null,give:{...emptyHand(),wood:1},want:{...emptyHand(),ore:1},accepted,declined}]});
  assert.deepEqual(decide(view(o([b],[c]),a),rng()),{type:'confirmOffer',offerId:'x',player:b});
  assert.deepEqual(decide(view(o([],[b,c]),a),rng()),{type:'cancelOffer',offerId:'x'});
  assert.ok(decide(view(o([],[b]),a),rng(),{offerAge:3000}).wait>0,'waits for the last answer');
  assert.deepEqual(decide(view(o([],[b]),a),rng(),{offerAge:25000}),{type:'cancelOffer',offerId:'x'});
});
test('the fallback move is legal in every phase a game passes through',()=>{
  play({count:4,seed:21,players:Array(4).fill((g,p,random,ctx)=>{const c=fallback(view(g,p));if(c?.type==='end'&&g.phase==='action'&&random(3))return bot(g,p,random,ctx);return c;}),limit:600,check:conserved});
});
test('a bot only asks for cards another player can have, moving on to its next need',()=>{
  const {g}=play({count:3,seed:7,players:Array(3).fill(bot),until:g=>g.phase==='action'&&g.role===1});const a=g.active,[b,c]=[(a+1)%3,(a+2)%3],zero=()=>0,asked=o=>R.find(r=>o.want[r]);
  setHand(g,a,{wool:3});for(const p of [b,c])setHand(g,p,Object.fromEntries(R.map(r=>[r,1])));
  const first=decide(view(g,a),zero);assert.equal(first.type,'offer');const r=asked(first);for(const p of [b,c])setHand(g,p,{...g.players[p].hand,[r]:0});
  const next=decide(view(g,a),zero);assert.equal(next.type,'offer');assert.notEqual(asked(next),r);apply(g,a,{...next,offerId:'n'},zero);
  for(const p of [b,c])setHand(g,p,{});assert.notEqual(decide(view(g,a),zero).type,'offer','nothing to ask for when nobody holds anything');
});
