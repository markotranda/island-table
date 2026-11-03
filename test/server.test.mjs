import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {once} from 'node:events';
mkdirSync('tmp',{recursive:true});

test('HTTP rooms: authentication, idempotency, live private views, stale revisions and restart persistence',async()=>{
  let dir=mkdtempSync(resolve('tmp','server-test-'));let child,base;
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Server did not start')),10000);child.stdout.on('data',d=>{text+=d;const m=text.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});child.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exit '+code));});});}
  async function stop(){const exited=once(child,'exit');child.kill();await exited;}
  async function req(path,token,body){const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};}
  let controller;
  try{
    await start();const config=(await req('/api/config')).body;assert.ok(config.inviteOrigin===null||/^http:\/\/(?!127\.|localhost)[^/]+:\d+$/.test(config.inviteOrigin),'invites never point at loopback');const host=(await req('/api/rooms',null,{name:'Host',map:'base',setup:'fixed'})).body;const path=`/api/rooms/${host.room}`;
    const a=(await req(path+'/join',null,{name:'Guest A'})).body,b=(await req(path+'/join',null,{name:'Guest B'})).body;const seats=[host,a,b];
    assert.equal((await req(path)).status,401);assert.equal((await req(path,'a'.repeat(64))).status,401);
    let g=(await req(path,host.token)).body;
    const command=async(p,type,extra={})=>{const id=crypto.randomUUID(),payload={id,revision:g.revision,command:{type,...extra}};const result=await req(path+'/commands',seats[p].token,payload);assert.equal(result.status,200,JSON.stringify(result.body));g=result.body;return payload;};
    const payload=await command(0,'ready');const revision=g.revision;assert.equal((await req(path+'/commands',host.token,payload)).body.revision,revision);assert.equal((await req(path,host.token)).body.players[0].ready,true);
    await command(1,'ready');await command(2,'ready');assert.equal((await req(path+'/commands',host.token,{id:crypto.randomUUID(),revision:0,command:{type:'start'}})).status,409);await command(0,'start');assert.equal(g.phase,'order');while(g.phase==='order')await command(g.order.candidates.find(p=>!g.order.done.includes(p)),'firstRoll');assert.equal(g.phase,'preRoll');assert.equal((await req(path+'/join',null,{name:'Late'})).status,400,'no joining once the game has started');assert.equal(g.players[1].hand,undefined);assert.equal(g.deck,undefined);
    controller=new AbortController();const stream=await fetch(base+path+'/events',{headers:{Authorization:`Bearer ${host.token}`},signal:controller.signal});assert.equal(stream.status,200);const reader=stream.body.getReader();let data='';while(!data.includes('data: '))data+=new TextDecoder().decode((await reader.read()).value);assert.match(data,/"me":0/);assert.equal(data.includes('"deck":'),false);controller.abort();
    const active=g.active;await command(active,'roll');const snapshot=(await req(path,host.token)).body;await stop();await start();assert.deepEqual((await req(path,host.token)).body,snapshot);
    assert.equal((await req('/health')).status,200);
    const origin=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://not-the-game.example','Content-Type':'application/json'},body:'{}'});assert.equal(origin.status,403);
    const source=new DatabaseSync(resolve(dir,'games.sqlite')),backup=resolve(dir,'backup.sqlite');source.prepare('VACUUM INTO ?').run(backup);source.close();await stop();
    dir=mkdtempSync(resolve('tmp','restored-test-'));copyFileSync(backup,resolve(dir,'games.sqlite'));await start();assert.deepEqual((await req(path,host.token)).body,snapshot);
  }finally{controller?.abort();if(child&&child.exitCode===null)await stop();}
});
test('HTTP bots: they play their own seats, stand in for an offline player, and hand the seat back on return',async()=>{
  const {decide}=await import('../lib/bot.mjs');const dir=mkdtempSync(resolve('tmp','bots-test-'));
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir,BOT_PACE:'0.02',BOT_AWAY:'1500'},stdio:['ignore','pipe','pipe']});child.stderr.on('data',d=>process.stderr.write(d));
  const base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Server did not start')),10000);child.stdout.on('data',d=>{text+=d;const m=text.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});});
  const req=async(path,token,body)=>{const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
  const send=async(path,token,type,extra={})=>{for(let k=0;k<20;k++){const g=(await req(path,token)).body,r=await req(path+'/commands',token,{id:crypto.randomUUID(),revision:g.revision,command:{type,...extra}});if(r.status!==409)return r;}throw new Error('always stale');};
  const until=async(path,token,ok,ms=20000,label=String(ok))=>{const end=Date.now()+ms;while(Date.now()<end){const g=(await req(path,token)).body;if(ok(g))return g;await new Promise(r=>setTimeout(r,50));}throw new Error('timed out: '+label);};
  const streams=[];const listen=async(path,token)=>{const c=new AbortController();streams.push(c);const res=await fetch(base+path+'/events',{headers:{Authorization:`Bearer ${token}`},signal:c.signal});(async()=>{for await(const _ of res.body);})().catch(()=>{});return c;};
  // An unread stream would be garbage-collected and closed, so each one keeps reading in the background.
  try{
    // A host with two bots: the bots roll, place and take turns on their own; the host plays by asking the bot code for its moves.
    const host=(await req('/api/rooms',null,{name:'Marko'})).body,path=`/api/rooms/${host.room}`;
    for(let i=0;i<2;i++)assert.equal((await send(path,host.token,'addBot')).status,200);
    let g=(await req(path,host.token)).body;assert.deepEqual(g.players.map(p=>!!p.bot),[false,true,true]);assert.ok(g.players.slice(1).every(p=>p.ready&&/ \(Bot\)$/.test(p.name)&&p.name!=='Marko (Bot)'));
    await send(path,host.token,'ready');await send(path,host.token,'start');
    const end=Date.now()+30000;while(Date.now()<end){g=(await req(path,host.token)).body;if(g.turn>=9)break;const mine=g.phase==='order'?!g.order.done.includes(0)&&g.order.candidates.includes(0):g.phase==='discard'?g.discards[0]>0:g.active===0||g.offers.some(o=>o.from===g.active&&!(o.accepted??[]).includes(0)&&!(o.declined??[]).includes(0));
      if(mine){const c=decide(g,n=>Math.floor(Math.random()*n),{offerAge:60000});if(c&&!c.wait)await req(path+'/commands',host.token,{id:crypto.randomUUID(),revision:g.revision,command:c});}else await new Promise(r=>setTimeout(r,30));}
    assert.ok(g.turn>=9,`stuck at turn ${g.turn} in ${g.phase}`);for(const p of [1,2]){assert.ok(g.events.some(e=>e.kind==='roll'&&e.p===p),`bot ${p} rolled`);}
    assert.ok(g.board.vertices.filter(v=>v.building?.owner>0).length>=4,'bots placed their settlements');
    // Two people: the guest has no live connection, so the host can let a bot play for them; nobody can for a connected player.
    const a=(await req('/api/rooms',null,{name:'Host'})).body,room=`/api/rooms/${a.room}`,b=(await req(room+'/join',null,{name:'Guest'})).body;
    await send(room,a.token,'ready');await send(room,b.token,'ready');await send(room,a.token,'start');
    const hostStream=await listen(room,a.token);let guest=await listen(room,b.token);
    assert.match((await send(room,a.token,'takeover',{player:1})).body.error,/still connected/);
    assert.equal((await send(room,b.token,'takeover',{player:1,auto:true})).status,400,'clients cannot use the automatic takeover');
    guest.abort();await until(room,a.token,g=>g.players[1].auto,8000);g=(await req(room,a.token)).body;
    assert.equal(g.events.find(e=>e.kind==='takeover').by,null,'taken over automatically while the game waited on them');
    await until(room,a.token,g=>g.order?.done.includes(1)||g.phase!=='order');
    guest=await listen(room,b.token);await until(room,a.token,g=>!g.players[1].auto);
    guest.abort();await new Promise(r=>setTimeout(r,200));assert.equal((await send(room,a.token,'takeover',{player:1})).status,200);assert.equal((await req(room,b.token)).body.players[1].auto,true);
    await send(room,b.token,'ready').catch(()=>{});assert.equal((await req(room,b.token)).body.players[1].auto,undefined,'acting again takes the seat back');
    hostStream.abort();
  }finally{for(const c of streams)c.abort();child.kill();await once(child,'exit');}
});
