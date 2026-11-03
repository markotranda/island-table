import http from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { newGame, addPlayer, apply, view, upgrade, pending } from './lib/engine.mjs';
import { decide, fallback } from './lib/bot.mjs';

const root=dirname(fileURLToPath(import.meta.url)), data=resolve(process.env.DATA_DIR||resolve(root,'data'));
mkdirSync(data,{recursive:true});
const db=new DatabaseSync(resolve(data,'games.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, room TEXT NOT NULL, player TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands(room TEXT NOT NULL, player TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(room,player,id));');
const clients=new Map(), rates=new Map();
// Invites opened from localhost must point friends at this computer's LAN address. Inside a container the interfaces are Docker's own, so PUBLIC_ORIGIN is required there.
const loopback=host=>/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i.test(host||'');
function lanAddress(){if(existsSync('/.dockerenv'))return null;const skip=/vEthernet|WSL|docker|^br-|^veth|VirtualBox|VMware|Hyper-V|Bluetooth|Loopback|Tailscale|ZeroTier/i;const all=Object.entries(networkInterfaces()).filter(([n])=>!skip.test(n)).flatMap(([,a])=>a).filter(a=>a.family==='IPv4'&&!a.internal);return (all.find(a=>/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))||all[0])?.address||null;}
function inviteOrigin(req){if(process.env.PUBLIC_ORIGIN)return process.env.PUBLIC_ORIGIN;const host=req.headers.host||'';if(!loopback(host))return `http://${host}`;const ip=lanAddress(),port=host.match(/:(\d+)$/)?.[1];return ip?`http://${ip}${port&&port!=='80'?':'+port:''}`:null;}
const tokenHash=t=>createHash('sha256').update(t).digest('hex');
const read=id=>{const row=db.prepare('SELECT state FROM rooms WHERE id=?').get(id);if(!row)throw Object.assign(new Error('Room not found. Check the invitation code.'),{status:404});return upgrade(JSON.parse(row.state));};
const save=g=>db.prepare('INSERT INTO rooms(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(g.id,JSON.stringify(g));
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function session(req,id){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))throw Object.assign(new Error('Rejoin this room using your saved seat.'),{status:401});const row=db.prepare('SELECT player FROM sessions WHERE token=? AND room=?').get(tokenHash(token),id);if(!row)throw Object.assign(new Error('Invalid seat credential.'),{status:401});return row.player;}
function broadcast(g){for(const c of clients.get(g.id)||[]){const p=g.players.findIndex(pl=>pl.id===c.player);if(p>=0)c.res.write(`data: ${JSON.stringify({...view(g,p),online:[...new Set([...(clients.get(g.id)||[])].map(s=>s.player))]})}\n\n`);}}
// Bots: after every change, a room where a bot (or a bot standing in for an offline player) owes a move gets one timer. When it fires,
// each such seat is asked in turn, from its own view and the state read inside the transaction, and the first real move is applied.
// The pause lets people follow along; BOT_PACE scales it (tests run them fast).
const pace=Number(process.env.BOT_PACE??1),timers=new Map(),offerSeen=new Map(),away=new Map(),watched=new Set(),started=Date.now(),awayMs=Number(process.env.BOT_AWAY??60000);
const online=id=>new Set([...(clients.get(id)||[])].map(c=>c.player)),plays=pl=>pl&&(pl.bot||pl.auto);
const PAUSE={order:700,setupSettlement:1500,setupRoad:900,preRoll:1100,discard:1000,robber:1400,steal:900,monopoly:900,invention:900,freeRoads:900};
function commit(id,fn){let next=null;transaction(()=>{const current=read(id);next=fn(current);if(!next)return;next.revision=current.revision+1;save(next);});if(next){broadcast(next);wake(id);}return next;}
function wake(id,ms){watched.add(id);clearTimeout(timers.get(id));timers.delete(id);let g;try{g=read(id);}catch{return;}if(!pending(g).some(p=>plays(g.players[p])))return;const t=setTimeout(()=>{timers.delete(id);step(id);},ms??Math.round((PAUSE[g.phase]??900)*pace));t.unref();timers.set(id,t);}
function step(id){let moved=null,wait=null;
  try{transaction(()=>{const g=read(id),now=Date.now(),seen=offerSeen.get(id)??new Map();offerSeen.set(id,seen);for(const o of g.offers)if(!seen.has(o.id))seen.set(o.id,now);for(const k of seen.keys())if(!g.offers.some(o=>o.id===k))seen.delete(k);
    for(const p of pending(g)){if(!plays(g.players[p]))continue;const v=view(g,p),own=g.offers.find(o=>o.from===p);let c,next;
      try{c=decide(v,randomInt,{offerAge:own?(now-seen.get(own.id))/(pace||1):0});}catch(e){console.error(`Bot in room ${id} failed to decide:`,e);c=fallback(v);}
      if(!c)continue;if(c.wait){wait=Math.min(wait??c.wait,c.wait);continue;}
      try{next=apply(g,p,{...c,offerId:c.offerId??randomBytes(8).toString('hex')},randomInt);}catch(e){console.error(`Bot in room ${id} made an illegal move:`,JSON.stringify(c),e.message);try{const f=fallback(v);next=f&&apply(g,p,{...f,offerId:f.offerId??randomBytes(8).toString('hex')},randomInt);}catch(e2){console.error(`Bot fallback in room ${id} failed:`,e2.message);}}
      if(next){next.revision=g.revision+1;save(next);moved=next;return;}}
  });}catch(e){console.error(`Bot step in room ${id} failed:`,e);}
  // A failed bot leaves the room alone until the next change instead of retrying in a loop.
  if(moved){broadcast(moved);wake(id);}else if(wait!==null)wake(id,Math.max(50,Math.round(wait*pace)));}
// A bot stands in for a player the game waits on (their turn, a discard, the starting roll) once they have been offline for a minute,
// as long as someone else is still at the table to see it. BOT_AWAY (ms) changes the minute for tests.
const offlineFor=(id,pid)=>online(id).has(pid)?0:Date.now()-(away.get(id)?.get(pid)??started);
const waitsOn=g=>g.phase==='action'?[g.active]:pending(g);
const presence=setInterval(()=>{for(const id of watched){try{const g=read(id);if(['lobby','finished'].includes(g.phase))continue;const here=online(id);
  for(const p of waitsOn(g)){const pl=g.players[p];if(plays(pl)||offlineFor(id,pl.id)<awayMs||!g.players.some(o=>!o.bot&&o.id!==pl.id&&here.has(o.id)))continue;commit(id,c=>{const t=c.players[p];return t&&!plays(t)&&offlineFor(id,t.id)>=awayMs?apply(c,p,{type:'takeover',player:p,auto:true},randomInt):null;});break;}}catch{watched.delete(id);}}},Math.min(5000,awayMs/2));presence.unref();
function release(id,p){return commit(id,g=>g.players[p]?.auto?apply(g,p,{type:'release'},randomInt):null);}
function register(g,name){const token=randomBytes(32).toString('hex'),id=randomBytes(12).toString('hex');addPlayer(g,id,name);g.revision++;db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),g.id,id);save(g);return {room:g.id,token};}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw Object.assign(new Error('Request too large.'),{status:413});}try{return JSON.parse(text||'{}');}catch{throw new Error('Invalid JSON.');}}
function rate(req){const ip=req.socket.remoteAddress,now=Date.now();let bucket=rates.get(ip);if(!bucket||bucket.until<now){bucket={count:0,until:now+60000};rates.set(ip,bucket);}if(++bucket.count>600)throw Object.assign(new Error('Too many requests. Please wait a moment.'),{status:429});}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health')return json(res,200,{ok:true});
    if(url.pathname==='/api/config')return json(res,200,{inviteOrigin:inviteOrigin(req)});
    if(url.pathname.startsWith('/api/')) {
      rate(req);
      if(req.headers.origin){const allowed=[process.env.PUBLIC_ORIGIN,`http://${req.headers.host}`];if(!allowed.includes(req.headers.origin))throw Object.assign(new Error('Origin is not allowed.'),{status:403});}
      if(req.method==='POST'&&url.pathname==='/api/rooms') {
        const b=await body(req);const result=transaction(()=>{const g=newGame(randomBytes(6).toString('hex'),b.map,b.setup);return register(g,b.name);});return json(res,201,result);
      }
      const match=url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})(?:\/(join|events|commands))?$/);if(!match)return json(res,404,{error:'Endpoint not found.'});
      const [,id,action]=match;
      if(action==='join'&&req.method==='POST'){const b=await body(req);const result=transaction(()=>register(read(id),b.name));broadcast(read(id));watched.add(id);return json(res,201,result);}
      const player=session(req,id),g=read(id),p=g.players.findIndex(pl=>pl.id===player);
      if(p<0)throw new Error('Seat not found.');
      if(action==='events'&&req.method==='GET') {
        const set=clients.get(id)||new Set();if(set.size>=24)throw new Error('Too many open tabs for this room.');
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');
        const client={res,player};set.add(client);clients.set(id,set);watched.add(id);
        // Coming back takes the seat back from a bot standing in.
        if(!(g.players[p].auto&&release(id,p)))broadcast(g);
        const keepalive=setInterval(()=>res.write(': heartbeat\n\n'),15000);
        req.on('close',()=>{clearInterval(keepalive);set.delete(client);if(!set.size)clients.delete(id);if(!online(id).has(player)){const m=away.get(id)??new Map();m.set(player,Date.now());away.set(id,m);}if(clients.has(id))broadcast(read(id));});return;
      }
      if(!action&&req.method==='GET')return json(res,200,view(g,p));
      if(action==='commands'&&req.method==='POST') {
        const b=await body(req);if(typeof b.id!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(b.id))throw new Error('Invalid command identifier.');
        // A player acting again takes their seat back first, in its own commit, so a stale command doesn't undo the return.
        if(g.players[p].auto)release(id,p);
        let next;
        transaction(()=>{
          const current=read(id);
          if(db.prepare('SELECT 1 FROM commands WHERE room=? AND player=? AND id=?').get(id,player,b.id)){next=current;return;}
          if(b.revision!==current.revision)throw Object.assign(new Error('The board changed. Your view has refreshed; try again.'),{status:409});
          const cmd={...b.command,offerId:b.command?.offerId??b.id};delete cmd.auto;
          if(cmd.type==='takeover'&&online(id).has(current.players[cmd.player]?.id))throw new Error('They are still connected.');
          next=apply(current,p,cmd,randomInt);next.revision=current.revision+1;save(next);db.prepare('INSERT INTO commands VALUES(?,?,?)').run(id,player,b.id);
        });
        broadcast(next);wake(id);return json(res,200,view(next,p));
      }
      return json(res,405,{error:'Method not allowed.'});
    }
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
    const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
    const file=files[url.pathname];if(!file)return json(res,404,{error:'Not found.'});
    res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache'});res.end(readFileSync(resolve(root,'public',file[0])));
  }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message||'Request failed.'});else res.end();}
});
const cleanup=setInterval(()=>{for(const [k,v]of rates)if(v.until<Date.now())rates.delete(k);},60000);cleanup.unref();
// Rooms where bots or stand-ins owe a move pick up where they left off after a restart.
for(const {id,state} of db.prepare('SELECT id,state FROM rooms').all()){try{const g=JSON.parse(state);if(!['lobby','finished'].includes(g.phase)&&g.players.some(plays))wake(id);}catch{}}
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Island Table ready at http://localhost:${server.address().port}`));
function shutdown(){for(const set of clients.values())for(const c of set)c.res.end();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
