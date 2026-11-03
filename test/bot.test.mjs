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
test('a bot confirms with whoever accepted its offer, and gives up once everyone declined or after a while',()=>{
  const {g}=play({count:3,seed:9,players:Array(3).fill(bot),until:g=>g.phase==='action'&&g.role===1});const a=g.active,[b,c]=[(a+1)%3,(a+2)%3],o=(accepted,declined)=>({...structuredClone(g),offers:[{id:'x',from:a,to:null,give:{...emptyHand(),wood:1},want:{...emptyHand(),ore:1},accepted,declined}]});
  assert.deepEqual(decide(view(o([b],[c]),a),rng()),{type:'confirmOffer',offerId:'x',player:b});
  assert.deepEqual(decide(view(o([],[b,c]),a),rng()),{type:'cancelOffer',offerId:'x'});
  assert.ok(decide(view(o([],[b]),a),rng(),{offerAge:3000}).wait>0,'waits for the last answer');
  assert.deepEqual(decide(view(o([],[b]),a),rng(),{offerAge:25000}),{type:'cancelOffer',offerId:'x'});
});
test('the fallback move is legal in every phase a game passes through',()=>{
  play({count:4,seed:21,players:Array(4).fill((g,p,random,ctx)=>{const c=fallback(view(g,p));if(c?.type==='end'&&g.phase==='action'&&random(3))return bot(g,p,random,ctx);return c;}),limit:600,check:conserved});
});
