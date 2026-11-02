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
    await start();const config=(await req('/api/config')).body;assert.ok(config.inviteOrigin===null||/^http:\/\/(?!127\.|localhost)[^/]+:\d+$/.test(config.inviteOrigin),'invites never point at loopback');const host=(await req('/api/rooms',null,{name:'Host',count:3,setup:'fixed'})).body;const path=`/api/rooms/${host.room}`;
    const a=(await req(path+'/join',null,{name:'Guest A'})).body,b=(await req(path+'/join',null,{name:'Guest B'})).body;const seats=[host,a,b];
    assert.equal((await req(path)).status,401);assert.equal((await req(path,'a'.repeat(64))).status,401);
    assert.equal((await req(path+'/join',null,{name:'Fourth'})).status,400);
    let g=(await req(path,host.token)).body;
    const command=async(p,type,extra={})=>{const id=crypto.randomUUID(),payload={id,revision:g.revision,command:{type,...extra}};const result=await req(path+'/commands',seats[p].token,payload);assert.equal(result.status,200,JSON.stringify(result.body));g=result.body;return payload;};
    const payload=await command(0,'ready');const revision=g.revision;assert.equal((await req(path+'/commands',host.token,payload)).body.revision,revision);assert.equal((await req(path,host.token)).body.players[0].ready,true);
    await command(1,'ready');await command(2,'ready');assert.equal((await req(path+'/commands',host.token,{id:crypto.randomUUID(),revision:0,command:{type:'start'}})).status,409);await command(0,'start');assert.equal(g.phase,'preRoll');assert.equal(g.players[1].hand,undefined);assert.equal(g.deck,undefined);
    controller=new AbortController();const stream=await fetch(base+path+'/events',{headers:{Authorization:`Bearer ${host.token}`},signal:controller.signal});assert.equal(stream.status,200);const reader=stream.body.getReader();let data='';while(!data.includes('data: '))data+=new TextDecoder().decode((await reader.read()).value);assert.match(data,/"me":0/);assert.equal(data.includes('"deck":'),false);controller.abort();
    const active=g.active;await command(active,'roll');const snapshot=(await req(path,host.token)).body;await stop();await start();assert.deepEqual((await req(path,host.token)).body,snapshot);
    assert.equal((await req('/health')).status,200);
    const origin=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://not-the-game.example','Content-Type':'application/json'},body:'{}'});assert.equal(origin.status,403);
    const source=new DatabaseSync(resolve(dir,'games.sqlite')),backup=resolve(dir,'backup.sqlite');source.prepare('VACUUM INTO ?').run(backup);source.close();await stop();
    dir=mkdtempSync(resolve('tmp','restored-test-'));copyFileSync(backup,resolve(dir,'games.sqlite'));await start();assert.deepEqual((await req(path,host.token)).body,snapshot);
  }finally{controller?.abort();if(child&&child.exitCode===null)await stop();}
});
