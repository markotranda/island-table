import http from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { newGame, addPlayer, apply, view } from './lib/engine.mjs';

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
const read=id=>{const row=db.prepare('SELECT state FROM rooms WHERE id=?').get(id);if(!row)throw Object.assign(new Error('Room not found. Check the invitation code.'),{status:404});return JSON.parse(row.state);};
const save=g=>db.prepare('INSERT INTO rooms(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(g.id,JSON.stringify(g));
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function session(req,id){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))throw Object.assign(new Error('Rejoin this room using your saved seat.'),{status:401});const row=db.prepare('SELECT player FROM sessions WHERE token=? AND room=?').get(tokenHash(token),id);if(!row)throw Object.assign(new Error('Invalid seat credential.'),{status:401});return row.player;}
function broadcast(g){for(const c of clients.get(g.id)||[]){const p=g.players.findIndex(pl=>pl.id===c.player);if(p>=0)c.res.write(`data: ${JSON.stringify({...view(g,p),online:[...new Set([...(clients.get(g.id)||[])].map(s=>s.player))]})}\n\n`);}}
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
        const b=await body(req);const result=transaction(()=>{const g=newGame(randomBytes(6).toString('hex'),b.count,b.setup);return register(g,b.name);});return json(res,201,result);
      }
      const match=url.pathname.match(/^\/api\/rooms\/([a-f0-9]{12})(?:\/(join|events|commands))?$/);if(!match)return json(res,404,{error:'Endpoint not found.'});
      const [,id,action]=match;
      if(action==='join'&&req.method==='POST'){const b=await body(req);const result=transaction(()=>register(read(id),b.name));broadcast(read(id));return json(res,201,result);}
      const player=session(req,id),g=read(id),p=g.players.findIndex(pl=>pl.id===player);
      if(p<0)throw new Error('Seat not found.');
      if(action==='events'&&req.method==='GET') {
        const set=clients.get(id)||new Set();if(set.size>=24)throw new Error('Too many open tabs for this room.');
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');
        const client={res,player};set.add(client);clients.set(id,set);broadcast(g);
        const keepalive=setInterval(()=>res.write(': heartbeat\n\n'),15000);
        req.on('close',()=>{clearInterval(keepalive);set.delete(client);if(!set.size)clients.delete(id);else broadcast(read(id));});return;
      }
      if(!action&&req.method==='GET')return json(res,200,view(g,p));
      if(action==='commands'&&req.method==='POST') {
        const b=await body(req);if(typeof b.id!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(b.id))throw new Error('Invalid command identifier.');
        let next;
        transaction(()=>{
          const current=read(id);
          if(db.prepare('SELECT 1 FROM commands WHERE room=? AND player=? AND id=?').get(id,player,b.id)){next=current;return;}
          if(b.revision!==current.revision)throw Object.assign(new Error('The board changed. Your view has refreshed; try again.'),{status:409});
          next=apply(current,p,{...b.command,offerId:b.command?.offerId??b.id},randomInt);next.revision=current.revision+1;save(next);db.prepare('INSERT INTO commands VALUES(?,?,?)').run(id,player,b.id);
        });
        broadcast(next);return json(res,200,view(next,p));
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
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Island Table ready at http://localhost:${server.address().port}`));
function shutdown(){for(const set of clients.values())for(const c of set)c.res.end();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
