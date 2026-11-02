// Captures design-review screenshots of Island Table in staged, realistic states (home, lobby, setup, mid-game,
// trade, supply, discard, phone, game over). Run from the repo root: node scripts/review-screens.mjs <outDir>
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {launch} from '../test/browser.mjs';
import {legalRoads,legalSettlements,score,R} from '../lib/engine.mjs';
const out=process.argv[2];mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));

mkdirSync('tmp',{recursive:true});const dir=mkdtempSync(resolve('tmp','review-'));
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','inherit']});
const base=await new Promise((ok,fail)=>{let t='';server.stdout.on('data',d=>{t+=d;const m=t.match(/http:\/\/localhost:(\d+)/);if(m)ok(`http://localhost:${m[1]}`);});server.on('exit',c=>fail(new Error('server exit '+c)));});
const browser=await launch();const pages=[];
const shot=async(page,name)=>{await pause(400);writeFileSync(join(out,name+'.png'),await page.screenshot());console.log('captured',name);};
// Stage helper: rewrite the saved game, then reload every screen (same approach as the browser tests' stage() fixture).
async function stage(fn){const db=new DatabaseSync(join(dir,'games.sqlite'));try{const row=db.prepare('SELECT id,state FROM rooms').get(),g=JSON.parse(row.state);fn(g);g.revision++;db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(g),row.id);}finally{db.close();}
  for(const p of pages){await p.reload();await p.waitFor(`document.querySelector('svg.board')`);}}
try{
  const names=['Mara','Tobias','Ines','Jun'];
  for(let i=0;i<4;i++)pages.push(await browser.newPage({width:1440,height:900}));
  const [host]=pages;
  await host.goto(base);await shot(host,'01-home');
  await host.type('#nickname',names[0]);await host.select('#map','base');await host.select('#setup','variable');await host.click('#entry button.primary');await host.waitFor(`document.querySelector('[data-command="ready"]')`);
  const room=await host.eval(`document.querySelector('input[aria-label="Invitation code"]').value`);
  for(let i=1;i<3;i++){await pages[i].goto(`${base}/?room=${room}`);await pages[i].waitFor(`document.querySelector('#code')?.value.length===12`);await pages[i].type('#nickname',names[i]);await pages[i].click('#entry button.primary');await pages[i].waitFor(`document.querySelector('[data-command="ready"]')`);}
  await pages[1].click('[data-command="ready"]');await host.waitFor(`document.body.textContent.includes('Ready ✓')`);await shot(host,'02-lobby');
  const jun=pages[3];await jun.goto(`${base}/?room=${room}`);await jun.waitFor(`document.querySelector('#code')?.value.length===12`);await jun.type('#nickname',names[3]);await jun.click('#entry button.primary');await jun.waitFor(`document.querySelector('[data-command="ready"]')`);
  for(const p of [host,pages[2],jun]){await p.click('[data-command="ready"]');await p.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('Not ready')`);}
  await host.waitFor(`!document.querySelector('[data-command="start"]').disabled`);await host.click('[data-command="start"]');for(const p of pages)await p.waitFor(`document.querySelector('svg.board')`);
  // Setup: click highlighted spots on whichever screen has them; screenshot the first round partway through.
  let placed=0;
  for(let step=0;step<80;step++){if(await Promise.any(pages.map(async p=>(await p.has('[data-command="roll"]'))||Promise.reject())).catch(()=>false))break;
    let acted=false;for(const p of pages)for(const t of ['[data-vertex]','[data-edge]'])if(!acted&&await p.has(t)){const n=await p.eval('document.querySelectorAll(".building,.road").length');await p.click(t);await p.waitFor(`document.querySelectorAll(".building,.road").length>${n}`);acted=true;placed++;if(placed===5){await pause(300);const viewer=pages.find(async q=>await q.has('[data-vertex]'))||p;}}
    if(placed===5&&acted){for(const p of pages)if((await p.has('[data-vertex]'))||(await p.has('[data-edge]'))){await shot(p,'03-setup');break;}}
    if(!acted)await pause(100);}
  // Mid-game: grow every player's network with legal roads, settlements and a city or two, deal hands and development cards, move the robber.
  let viewer=0;
  await stage(g=>{const rand=(()=>{let s=7;return n=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s%n;};})();
    for(let round=0;round<3;round++)for(let p=0;p<4;p++){for(let k=0;k<2;k++){const roads=legalRoads(g,p);if(roads.length)g.board.edges[roads[rand(roads.length)]].owner=p;}
      if(round>0){const spots=legalSettlements(g,p);if(spots.length)g.board.vertices[spots[rand(spots.length)]].building={owner:p,kind:'settlement'};}}
    for(const [p,n] of [[0,2],[1,1],[2,1],[3,0]]){const mine=g.board.vertices.filter(v=>v.building?.owner===p&&v.building.kind==='settlement');for(let i=0;i<n&&i<mine.length;i++)mine[i].building.kind='city';}
    const hand=(p,h)=>{for(const r of R){g.bank[r]+=g.players[p].hand[r];g.players[p].hand[r]=0;}for(const r of R){const n=Math.min(h[r]||0,g.bank[r]);g.bank[r]-=n;g.players[p].hand[r]=n;}};
    hand(0,{wood:2,brick:1,wool:3,wheat:2,ore:3});hand(1,{wood:1,brick:2,wheat:1,ore:1});hand(2,{wool:2,wheat:3,ore:1});hand(3,{wood:3,brick:2,wool:1});
    const deal=(p,type)=>{const i=g.deck.lastIndexOf(type);if(i<0)return;g.deck.splice(i,1);g.players[p].cards.push({type,bought:-1,id:`review-${type}-${p}-${g.players[p].cards.length}`});};
    deal(0,'knight');deal(0,'roads');deal(0,'vp');deal(1,'monopoly');deal(2,'knight');
    g.players[0].knights=3;g.awards.army=0;g.players[2].knights=1;g.deck.splice(g.deck.indexOf('knight'),1);g.deck.splice(g.deck.indexOf('knight'),1);g.deck.splice(g.deck.indexOf('knight'),1);g.deck.splice(g.deck.indexOf('knight'),1);
    const target=g.board.hexes.filter(h=>h.number&&[6,8,5,9].includes(h.number))[0];if(target)g.robber=target.id;
    g.turn=14;g.active=0;g.primary=0;g.phase='action';g.dice=[4,5];g.offers=[];
    for(const t of ['Tobias built a settlement.','Ines traded with the supply.','Jun moved the robber.','Jun stole one resource from Mara.','Mara played a Knight.','Mara rolled 9.'])g.events.push({turn:g.turn,text:t});
    viewer=g.active;});
  const me=pages[viewer];
  // Awards are recalculated when a turn begins; end the active turn and back again is overkill, so screenshot the busy board as is.
  await shot(me,'04-midgame-board');
  // Another player posts a trade offer; the active player sees it, and opens the trade panel.
  const other=pages[(viewer+1)%4];
  await other.click('[data-mode="trade"]');await other.waitFor(`document.getElementById('trade')`);
  await other.eval(`(()=>{const f=document.getElementById('trade');for(const [k,v] of Object.entries({'give-brick':1,'want-ore':1})){const e=f.elements.namedItem(k);e.value=String(v);e.dispatchEvent(new Event('change',{bubbles:true}));}f.requestSubmit();})()`);
  await me.waitFor(`document.querySelector('.offer')`);await shot(me,'05-trade-offer');
  await me.click('[data-mode="trade"]');await me.waitFor(`document.getElementById('trade')`);for(const k of ['give-wool','give-wool','want-brick'])await me.click(`[data-pick="${k}"][data-step="1"]`);await shot(me,'06-trade-panel');
  await me.click('[data-mode="trade"]');await pause(300);
  await me.click('[data-mode="bank"]').catch(()=>{});await me.waitFor(`document.getElementById('bank')`);await me.eval(`(()=>{const b=document.querySelector('#bank [data-choice="give"] [data-choose]:not(:disabled)');b?.click();document.querySelector('#bank [data-choice="want"] [data-choose="brick"]').click();return true;})()`);await shot(me,'07-bank-panel');
  await me.click('[data-mode="bank"]').catch(()=>{});
  // Robber after a seven: a discard prompt for a player with too many cards.
  await stage(g=>{const p=(g.active+2)%4;for(const r of R){const n=Math.min(2,g.bank[r]);g.bank[r]-=n;g.players[p].hand[r]+=n;}g.dice=[3,4];g.phase='discard';g.discards=g.players.map((pl,i)=>i===p?Math.floor(Object.values(pl.hand).reduce((a,b)=>a+b,0)/2):0);g.resumePhase='action';});
  {const d=pages[(viewer+2)%4];await d.waitFor(`document.getElementById('discard')`);for(const k of ['discard-wool','discard-wool','discard-wheat'])await d.click(`[data-pick="${k}"][data-step="1"]`);await shot(d,'08-discard');}
  // Phone view of the same table.
  const phone=await browser.newPage({width:390,height:844});
  const seats=await me.eval(`localStorage.getItem('island-seats')`);await phone.goto(base);await phone.eval(`localStorage.setItem('island-seats',${JSON.stringify(seats)})`);await phone.goto(`${base}/?room=${room}`);await phone.waitFor(`document.querySelector('svg.board')`);await shot(phone,'09-phone');
  // Game over.
  await stage(g=>{g.phase='finished';g.winner=0;g.offers=[];delete g.discards;delete g.resumePhase;const extra=g.board.vertices.filter(v=>v.building?.owner===0&&v.building.kind==='settlement');extra.forEach(v=>v.building.kind='city');while(score(g,0,true)<10){const i=g.deck.lastIndexOf('vp');g.deck.splice(i,1);g.players[0].cards.push({type:'vp',bought:-1,id:'review-vp-final-'+g.players[0].cards.length});}g.events.push({turn:g.turn,text:`Mara wins with ${score(g,0,true)} points!`});});
  await shot(pages[1],'10-game-over');
}finally{for(const p of pages)await p.close().catch(()=>{});await browser.close();const exited=new Promise(r=>server.on('exit',r));server.kill();await exited;}
