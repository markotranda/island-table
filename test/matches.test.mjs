import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,addPlayer,apply,legalRoads,legalSettlements,legalCities,tradeRatio,costs,R,emptyHand} from '../lib/engine.mjs';

// Test-only players exercise actual commands; no resource grants or state edits.
for(const count of [2,3,4,5,6])test(`${count} players complete an entire saved-and-restored game`,()=>{
  let seed=143+count;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);};
  let g=newGame('simulation',count>4?'extended':'base','variable');for(let p=0;p<count;p++){addPlayer(g,String(p),`Test ${p}`);g.players[p].ready=true;}g=apply(g,0,{type:'start'},random);
  const send=(p,command)=>{g=apply(g,p,command,random);g.revision++;if(g.revision%25===0)g=JSON.parse(JSON.stringify(g));};
  let actions=0;
  while(g.phase!=='finished'&&actions++<15000){
    const p=g.active,pl=g.players[p],can=cost=>Object.entries(cost).every(([r,n])=>pl.hand[r]>=n);
    if(g.phase==='setupSettlement'){
      const options=legalSettlements(g,p,true).sort((a,b)=>{
        const quality=v=>g.board.vertices[v].hexes.reduce((s,id)=>s+(g.board.hexes[id].number?6-Math.abs(7-g.board.hexes[id].number):0),0);
        return quality(b)-quality(a);
      });send(p,{type:'settlement',vertex:options[0]});
    }else if(g.phase==='setupRoad')send(p,{type:'road',edge:legalRoads(g,p,g.anchor)[0]});
    else if(g.phase==='preRoll')send(p,{type:'roll'});
    else if(g.phase==='discard'){
      for(let i=0;i<count;i++)if(g.discards[i]){let left=g.discards[i],b=emptyHand();for(const r of R.toSorted((a,b)=>g.players[i].hand[b]-g.players[i].hand[a])){b[r]=Math.min(left,g.players[i].hand[r]);left-=b[r];}send(i,{type:'discard',resources:b});}
    }else if(g.phase==='robber')send(p,{type:'robber',hex:g.board.hexes.filter(h=>h.id!==g.robber).sort((a,b)=>{
      const quality=h=>h.vertices.reduce((s,v)=>{const owner=g.board.vertices[v].building?.owner;return s+(owner===p?-10:owner>=0?3:0);},0);return quality(b)-quality(a);
    })[0].id});
    else if(g.phase==='steal')send(p,{type:'steal',player:g.victims[random(g.victims.length)]});
    else if(g.phase==='monopoly')send(p,{type:'monopoly',resource:R.toSorted((a,b)=>g.players.reduce((s,pl,i)=>s+(i===p?0:pl.hand[b]-pl.hand[a]),0))[0]});
    else if(g.phase==='invention'){const resources=emptyHand();for(let i=0;i<2;i++){const r=R.filter(r=>g.bank[r]>resources[r]).sort((a,b)=>(pl.hand[a]+resources[a])-(pl.hand[b]+resources[b]))[0];if(r)resources[r]++;}send(p,{type:'invention',resources});}
    else if(g.phase==='freeRoads')send(p,{type:'road',edge:legalRoads(g,p)[random(legalRoads(g,p).length)]});
    else if(g.phase==='action'){
      const card=pl.cards.find(c=>c.type!=='vp'&&c.bought!==g.turn);
      if(card&&!pl.played){send(p,{type:'playCard',card:card.id});continue;}
      const settlements=legalSettlements(g,p),cities=legalCities(g,p),roads=legalRoads(g,p),cityCount=g.board.vertices.filter(v=>v.building?.owner===p&&v.building.kind==='city').length;
      const options=[...(settlements.length?[{type:'settlement',vertex:settlements[0],cost:costs.settlement}]:[]),...(cities.length&&cityCount<4?[{type:'city',vertex:cities[0],cost:costs.city}]:[]),...(g.deck.length?[{type:'buyCard',cost:costs.development}]:[]),...(roads.length?[{type:'road',edge:roads[random(roads.length)],cost:costs.road}]:[])];
      const affordable=options.find(o=>can(o.cost));if(affordable){send(p,affordable);continue;}
      let trade=null;
      for(const o of options){const want=R.find(r=>pl.hand[r]<(o.cost[r]||0)&&g.bank[r]>0);const give=R.find(r=>r!==want&&pl.hand[r]-(o.cost[r]||0)>=tradeRatio(g,p,r));if(want&&give){trade={type:'bank',want,give};break;}}
      send(p,trade||{type:'end'});
    }else throw new Error(`Unhandled phase ${g.phase}`);
    for(const r of R){assert.equal(g.bank[r]+g.players.reduce((s,pl)=>s+pl.hand[r],0),count>4?24:19);assert.ok(g.bank[r]>=0);}
  }
  assert.equal(g.phase,'finished',`${count} players did not finish after ${actions} actions, turn ${g.turn}`);assert.ok(g.winner>=0);assert.ok(g.turn>10);
});
