import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {launch,browserPath} from './browser.mjs';
mkdirSync('tmp',{recursive:true});
const R=['wood','brick','wool','wheat','ore'];
const skip=!browserPath&&'No Chrome, Chromium or Edge found (set BROWSER)';

// Hosts browse at localhost while PUBLIC_ORIGIN advertises 127.0.0.1, so friends arrive from a different origin, as they do over a LAN.
async function startServer(env={}){
  const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;probe.close();await once(probe,'close');
  const dir=mkdtempSync(resolve('tmp','browser-test-')),child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,...env},stdio:['ignore','pipe','pipe']});
  await new Promise((ok,fail)=>{let text='';const timer=setTimeout(()=>fail(new Error('Server did not start')),10000);child.stdout.on('data',d=>{text+=d;if(/ready at/.test(text)){clearTimeout(timer);ok();}});child.on('exit',code=>{clearTimeout(timer);fail(new Error('Server exit '+code));});});
  return {dir,host:`http://localhost:${port}`,invite:`http://127.0.0.1:${port}`,async stop(){const exited=once(child,'exit');child.kill();await exited;}};
}
const phaseLabel=page=>page.text('.turn-card .eyebrow');
const noOverflow=page=>page.eval('document.documentElement.scrollWidth<=window.innerWidth');

async function createTable(page,base,name,map,setup){
  await page.goto(base);await page.type('#nickname',name);
  await page.click('#entry button.primary');await page.waitFor(`document.querySelector('[data-command="ready"]')`);
  // The map and island setup are chosen in the lobby; each change waits for the server to confirm it.
  for(const [k,v] of [['map',map],['setup',setup]])if(await page.eval(`document.querySelector('[data-setting="${k}"]').value`)!==v){await page.select(`[data-setting="${k}"]`,v);await page.waitFor(`document.querySelector('[data-setting="${k}"]')?.value===${JSON.stringify(v)}&&document.querySelector('[data-ui="settings"]').dataset.${k}===${JSON.stringify(v)}`);}
}
async function joinByInvite(page,link,name){
  await page.goto(link);await page.waitFor(`document.querySelector('#code')?.value.length===12`,{message:'Invite did not prefill the room code'});
  await page.type('#nickname',name);await page.click('#entry button.primary');await page.waitFor(`document.querySelector('[data-command="ready"]')`);
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// Everyone taps their dice for the first turn at the same moment, again after a tie, until the starting roll is over.
// Returns the pages that saw the result held on screen ("… goes first!", no dice left to roll) before the card went away.
// The hold lasts 3 s, too short to rely on polling every page in turn under load, so each page records it itself (window.__heldFirst).
const HELD=`document.querySelector('[data-ui="order"][data-held="first"] h2')?.textContent.includes('goes first')&&!document.querySelector('[data-command="firstRoll"]')`;
async function rollForStart(pages){
  const held=new Set(),saw=async page=>{if(await page.eval('window.__heldFirst'))held.add(page);};
  await Promise.all(pages.map(page=>page.eval(`(()=>{window.__heldFirst=false;window.__heldWatch?.disconnect();const check=()=>{if(${HELD})window.__heldFirst=true;};window.__heldWatch=new MutationObserver(check);window.__heldWatch.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});check();})()`)));
  for(let step=0;step<80;step++){
    const ready=[];for(const page of pages)if(await page.has('[data-command="firstRoll"]'))ready.push(page);
    if(ready.length)await Promise.all(ready.map(page=>page.click('[data-command="firstRoll"]').catch(()=>{})));
    let open=false;for(const page of pages){if(await page.has('[data-ui="order"]'))open=true;await saw(page);}
    if(!open||held.size===pages.length){for(const page of pages)await saw(page);await Promise.all(pages.map(page=>page.eval('window.__heldWatch?.disconnect()')));return held;}await pause(150);
  }
  throw new Error(`The starting roll did not finish: ${JSON.stringify(await Promise.all(pages.map(page=>page.eval(`({dice:!!document.querySelector('[data-command="firstRoll"]'),order:!!document.querySelector('[data-ui="order"]'),offline:!!document.querySelector('.connection.offline'),toast:document.querySelector('#toast')?.textContent,text:document.querySelector('[data-ui="order"]')?.textContent.slice(0,120)})`).catch(e=>e.message))))}`);
}
// Plays every setup placement by clicking the first highlighted target on whichever page has one.
async function playSetup(pages){
  await rollForStart(pages);
  for(let step=0;step<40;step++){
    for(const page of pages)if(await page.has('[data-command="roll"]'))return page;
    let placed=false;
    for(const page of pages)for(const target of ['[data-vertex]','[data-edge]'])if(!placed&&await page.has(target)){const before=await page.eval('document.querySelectorAll(".building,.road").length');await page.click(target);await page.waitFor(`document.querySelectorAll(".building,.road").length>${before}`);placed=true;}
    if(!placed)await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Setup did not finish');
}
// Sound cues each page played since listening started (the client logs them to window.__sounds; tests cannot hear them).
const listen=pages=>Promise.all(pages.map(p=>p.eval('window.__sounds=[]')));
const heard=(page,name)=>page.waitFor(`window.__sounds?.includes(${JSON.stringify(name)})`,{message:`Expected the "${name}" sound`});
const sounds=page=>page.eval('window.__sounds');
// The player's own resource cards as shown in their hand.
const hand=page=>page.eval(`Object.fromEntries([...document.querySelectorAll('.hand-cards .resource-card')].map(c=>[c.querySelector('span').textContent.toLowerCase(),Number(c.querySelector('b').textContent)]))`);
const fill=(page,form,values)=>page.waitFor(`(()=>{const f=document.getElementById(${JSON.stringify(form)});if(!f)return false;for(const [k,v] of Object.entries(${JSON.stringify(values)})){const e=f.elements.namedItem(k);e.value=String(v);e.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()`);
// Opens a toggled panel (trade or bank) only if it is not already open. A live update can redraw the page
// between mouse press and release, swallowing the click, so check and click again like a person would.
async function openPanel(page,mode,form){
  for(let i=0;i<3;i++){if(await page.has(`#${form}`))return;await page.click(`[data-mode="${mode}"]`);try{await page.waitFor(`document.getElementById('${form}')`,{timeout:1500});return;}catch{}}
  throw new Error(`Could not open the ${form} panel`);
}
async function submit(page,form){await page.click(`#${form} button.primary`);}
const cardButton=name=>`[...document.querySelectorAll('[data-card]')].find(b=>b.textContent.includes(${JSON.stringify(name)}))`;
async function clickCard(page,name){const id=await page.waitFor(`${cardButton(name)}?.disabled===false&&${cardButton(name)}.dataset.card`,{message:`${name} is not playable`});await page.click(`[data-card="${id}"]`);}
const scoreOf=(page,seat)=>page.eval(`Number(document.querySelectorAll('.sidebar .player .points')[${seat}].textContent)`);
const toastIncludes=(page,text)=>page.waitFor(`document.querySelector('#toast').textContent.includes(${JSON.stringify(text)})`,{message:`Expected a toast containing "${text}"`});
const waitActive=async(pages,except)=>{for(let i=0;i<200;i++){for(const p of pages)if(p!==except&&(await p.has('[data-command="roll"]')))return p;await pause(50);}throw new Error('Turn did not pass');};
// Resolves whatever follows a roll on every screen: discards, robber and theft, until the active player can act.
async function resolveRoll(pages,active){
  for(let step=0;step<60&&!await active.has('[data-command="end"]');step++){
    let acted=false;
    for(const page of pages)if(await page.has('#discard')){
      const need=Number((await page.text('#discard h3')).match(/\d+/)[0]),have=await hand(page),bundle={};let left=need;
      for(const r of R){const n=Math.min(left,have[r]);if(n)bundle[`discard-${r}`]=n;left-=n;}
      await fill(page,'discard',bundle);await submit(page,'discard');await page.waitFor(`!document.querySelector('#discard')`);acted=true;
    }
    const target=await active.has('[data-hex]')?'[data-hex]':await active.has('[data-victim]')?'[data-victim]':null;
    if(target){await active.click(target);await active.waitFor(`!document.querySelector('${target}')`);acted=true;}
    if(!acted)await pause(100);
  }
}
async function playTurn(pages,page){await page.click('[data-command="roll"]');await resolveRoll(pages,page);await page.click('[data-command="end"]');}
// Seats players in join order, so pages[i] is seat i, readies everyone and starts.
async function seatTable(browser,server,count,setup,roll=true,init=''){
  const pages=[];for(let i=0;i<count;i++){const page=await browser.newPage();if(init)await page.init(init);pages.push(page);}
  await createTable(pages[0],server.host,'Seat 0',count>4?'extended':'base',setup);const room=await pages[0].eval('document.querySelector(\'input[aria-label="Invitation code"]\').value');
  for(let i=1;i<count;i++)await joinByInvite(pages[i],`${server.invite}/?room=${room}`,`Seat ${i}`);
  for(const page of pages){await page.click('[data-command="ready"]');await page.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('Not ready')`);}
  await pages[0].click('[data-command="start"]');for(const page of pages)await page.waitFor(`document.querySelector('svg.board')`);if(roll)await rollForStart(pages);
  return pages;
}
// Test fixture only: rewrites the saved game between commands to stage a situation dice cannot be relied on to produce,
// keeping supply and deck totals conserved, then reloads every screen. Everything after it goes through the interface.
async function stage(server,pages,fn){
  const db=new DatabaseSync(resolve(server.dir,'games.sqlite'));let result;
  try{
    const row=db.prepare('SELECT id,state FROM rooms').get(),g=JSON.parse(row.state);
    const setHand=(p,h)=>{for(const r of R){g.bank[r]+=g.players[p].hand[r];g.players[p].hand[r]=0;}for(const r of R){const n=h[r]||0;assert.ok(g.bank[r]>=n,'fixture exceeds supply');g.bank[r]-=n;g.players[p].hand[r]=n;}};
    const deal=(p,type,bought=-1)=>{const i=g.deck.lastIndexOf(type);assert.ok(i>=0,`no ${type} left`);g.deck.splice(i,1);g.players[p].cards.push({type,bought,id:`fixture-${type}-${p}-${g.players[p].cards.length}`});};
    const topDeck=type=>{const i=g.deck.lastIndexOf(type);g.deck.push(...g.deck.splice(i,1));};
    result=fn(g,{setHand,deal,topDeck});g.revision++;
    db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(g),row.id);
  }finally{db.close();}
  // Wait for the live stream too: until it connects, nothing that depends on who is online (Away buttons, the connection badge) is drawn.
  for(const page of pages){await page.reload();await page.waitFor(`document.querySelector('svg.board')&&!document.querySelector('.connection.offline')`,{message:'the staged page did not reconnect'});}
  return result;
}

// A full table: the host and five bots on the extended map, to be staged from the starting roll straight into the host's
// turn (hostTurn) so the bots stay idle. The host's name is as long as names get.
async function sixSeats(browser,server,size={width:1280,height:720}){
  const host=await browser.newPage(size);await createTable(host,server.host,'Bartholomew Longfellow J','extended','variable');
  // A live update can redraw the lobby between press and release and swallow a click, so add again if the bot never came.
  for(let n=1;n<=5;n++)for(let tries=0;;tries++){if(await host.eval(`document.querySelectorAll('[data-bot]').length`)<n)await host.click('[data-command="addBot"]');try{await host.waitFor(`document.querySelectorAll('[data-bot]').length>=${n}`,{timeout:10000});break;}catch(e){if(tries>=2)throw e;}}
  await host.click('[data-command="ready"]');await host.waitFor(`!document.querySelector('[data-command="start"]').disabled`);await host.click('[data-command="start"]');await host.waitFor(`document.querySelector('svg.board')`);
  return host;
}
const hostTurn=g=>{g.active=0;g.primary=0;g.role=1;g.phase='action';g.dice=[4,5];g.offers=[];g.turn=14;};
const supplyCounts=page=>page.eval(`Object.fromEntries([...document.querySelectorAll('[data-ui="supply"] [data-supply]')].map(e=>[e.dataset.supply,Number(e.querySelector('b').textContent)]))`);

test('browser: the supply sits in the right column in every phase but the end, with unclaimed awards beside its label',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let host;
  try{
    host=await sixSeats(browser,server);
    const shown=()=>host.eval(`[!!document.querySelector('.control-sidebar [data-ui="supply"]'),!!document.querySelector('.sidebar [data-ui="supply"]')]`);
    assert.deepEqual(await shown(),[true,false],'during the starting roll');
    const before=await supplyCounts(host);
    await stage(server,[host],(g,{setHand})=>{hostTurn(g);setHand(0,{wood:4,brick:2,ore:1});g.deck.pop();});
    const left=await supplyCounts(host);
    assert.deepEqual(Object.keys(left),['wood','brick','wool','wheat','ore','deck']);
    assert.deepEqual(left,{wood:before.wood-4,brick:before.brick-2,wool:before.wool,wheat:before.wheat,ore:before.ore-1,deck:before.deck-1});
    assert.deepEqual(await host.eval(`[...document.querySelectorAll('[data-ui="supply"] [data-award]')].map(e=>e.dataset.award)`),['route','army']);
    assert.equal(await host.eval(`[...document.querySelector('.sidebar').children].every(e=>e.classList.contains('player'))`),true,'the left column holds player cards only');
    assert.match(await host.eval(`document.querySelector('.sidebar .player .points').dataset.tip`),/hidden Victory Point cards/);
    await stage(server,[host],g=>{g.awards.army=0;});
    assert.deepEqual(await host.eval(`[...document.querySelectorAll('[data-ui="supply"] [data-award]')].map(e=>e.dataset.award)`),['route'],'a held award leaves the supply');
    for(const phase of ['setupSettlement','preRoll']){await stage(server,[host],g=>{g.phase=phase;g.setupIndex=0;});assert.deepEqual(await shown(),[true,false],phase);}
    await stage(server,[host],g=>{g.phase='discard';g.discards=g.players.map((_,i)=>i===0?3:0);g.resumePhase='action';});assert.deepEqual(await shown(),[true,false],'discard');
    await stage(server,[host],g=>{g.phase='finished';g.winner=0;delete g.discards;delete g.resumePhase;});assert.deepEqual(await shown(),[false,false],'finished');
    assert.deepEqual(host.errors,[]);
  }finally{await host?.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: during a game the name and options sit in the corners and the map runs to the top of the window',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let host;
  try{
    host=await sixSeats(browser,server);await stage(server,[host],hostTurn);
    const layout=()=>host.eval(`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),inside=(a,b)=>a.left>=b.left-.5&&a.right<=b.right+.5,side=r('.control-sidebar'),left=r('.sidebar'),wrap=r('.board-wrap'),opts=[...document.querySelectorAll('.topbar .right>*')].map(e=>e.getBoundingClientRect()),col=(l,w)=>({left:l,right:l+w}),gs=getComputedStyle(document.documentElement);return {wrapTop:wrap.top,brandH:r('.brand-text').bottom<=left.top+.5,brandIn:inside(r('.brand-text'),col(0,left.width)),brandW:r('.brand-text').right<=left.width,optsIn:opts.every(o=>o.left>=side.left-.5&&o.right<=innerWidth+.5&&o.bottom<=side.top+.5),hitsBoard:opts.some(o=>o.left<wrap.right&&o.right>wrap.left),pageW:document.documentElement.scrollWidth<=innerWidth,wrapH:wrap.height,free:innerHeight-r('.hand').height};})()`);
    for(const [w,h] of [[1920,1080],[1440,900],[1280,720],[1100,700],[900,700]]){
      await host.resize(w,h);await pause(150);const l=await layout();
      assert.ok(await host.eval(`(()=>{const a=document.querySelector('.turn-card>.eyebrow'),b=document.querySelector('.turn-card .seal').getBoundingClientRect(),n=document.createRange();n.selectNodeContents(a);return n.getBoundingClientRect().right<=b.left;})()`),`the turn label clears its seal at ${w}x${h}`);
      assert.equal(l.wrapTop,0,`map reaches the top at ${w}x${h}`);assert.equal(l.wrapH,l.free,`map takes all height above the hand at ${w}x${h}`);
      assert.ok(l.brandIn&&l.brandH,`name stays in its corner at ${w}x${h}`);assert.ok(l.optsIn&&!l.hitsBoard,`options stay in their corner at ${w}x${h}`);assert.ok(l.pageW,`no sideways scroll at ${w}x${h}`);
    }
    // Losing the connection shows, without touching the turn card or the board.
    await host.resize(1100,700);await host.eval(`(()=>{const c=document.querySelector('.connection');c.classList.add('offline');c.querySelector('.connection-label').textContent='Reconnecting…';})()`);
    const off=await host.eval(`(()=>{const l=document.querySelector('.connection-label').getBoundingClientRect(),t=document.querySelector('.turn-card').getBoundingClientRect(),w=document.querySelector('.board-wrap').getBoundingClientRect();return {seen:l.width>0,clearTurn:l.bottom<=t.top,clearMap:l.left>=w.right};})()`);
    assert.deepEqual(off,{seen:true,clearTurn:true,clearMap:true});
    await host.resize(1280,720);await host.reload();await host.waitFor(`document.querySelector('svg.board')`);
    await host.waitFor(`!document.querySelector('.connection').classList.contains('offline')`,{message:'the live stream clears it'});
    // The options still work, and the rules window covers them.
    await host.click('[data-ui="help"]');await host.waitFor(`document.querySelector('dl.help')`);
    assert.equal(await host.eval(`(()=>{const b=document.querySelector('[data-ui="home"]').getBoundingClientRect();return !!document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.topbar');})()`),false,'an open window sits above the corners');
    assert.deepEqual(host.errors,[]);
    // A phone keeps its bar, with words.
    await host.reload();await host.waitFor(`document.querySelector('svg.board')`);await host.resize(390,844);await pause(150);
    assert.deepEqual(await host.eval(`[getComputedStyle(document.querySelector('.topbar')).position,document.querySelector('[data-ui="help"] .btn-label').getBoundingClientRect().width>0,document.documentElement.scrollWidth<=innerWidth]`),['static',true,true]);
  }finally{await host?.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: six player cards always fit without scrolling and never change size',{skip,timeout:120000},async()=>{
  const server=await startServer({BOT_AWAY:'600000'}),browser=await launch();let host;
  try{
    host=await sixSeats(browser,server);
    // The hardest cards: longest name, both awards, big numbers, a stood-in seat, an away player.
    const worst=g=>{hostTurn(g);g.awards.route=0;g.awards.army=0;Object.assign(g.players[0],{knights:12});g.players[1].bot=false;g.players[2].bot=false;g.players[2].auto=true;};
    await stage(server,[host],(g,{setHand,deal})=>{worst(g);setHand(0,{wood:9,brick:9,wool:9,wheat:9,ore:9});for(const t of ['knight','knight','monopoly','invention','roads','vp'])deal(0,t);});
    const cards=()=>host.eval(`(()=>{const s=document.querySelector('.sidebar'),c=[...s.querySelectorAll('.player')];const inside=(a,b)=>a.left>=b.left-.5&&a.right<=b.right+.5&&a.top>=b.top-.5&&a.bottom<=b.bottom+.5;return {n:c.length,heights:[...new Set(c.map(e=>Math.round(e.getBoundingClientRect().height)))],bottom:Math.max(...c.map(e=>e.getBoundingClientRect().bottom)),fits:s.scrollHeight<=s.clientHeight,scrolls:getComputedStyle(s).overflowY,statsIn:c.every(e=>[...e.querySelectorAll('.stat,.player-name,.points,.takeover,.badge')].every(k=>inside(k.getBoundingClientRect(),e.getBoundingClientRect()))),nameLines:Math.max(...c.map(e=>e.querySelector('.player-name').getBoundingClientRect().height)),page:document.documentElement.scrollHeight};})()`);
    for(const [w,h] of [[1920,1080],[1440,900],[1366,768],[1280,720],[1100,700],[1000,600],[1366,650],[900,620]]){
      await host.resize(w,h);await pause(150);const c=await cards(),at=`${w}x${h}`;
      assert.equal(c.n,6);assert.equal(c.heights.length,1,`equal cards at ${at}: ${c.heights}`);assert.ok(c.fits,`no scroll in the column at ${at}`);assert.equal(c.scrolls,'hidden',at);assert.ok(c.bottom<=h,`last card in the window at ${at}: ${c.bottom}`);assert.ok(c.statsIn,`everything inside its card at ${at}`);assert.ok(c.nameLines<24,`names stay on one line at ${at}`);assert.equal(c.page,h,`page does not scroll at ${at}`);
    }
    // Shorter than the game fits: the page scrolls, the column still does not, and every card can be reached.
    for(const h of [545,500]){await host.resize(1000,h);await pause(150);const c=await cards();assert.ok(c.fits&&c.page>h,`the page scrolls at height ${h}`);assert.ok(c.bottom<=c.page,'the last card can be reached');}
    await host.resize(1280,720);
    assert.ok(await host.has('[data-takeover="1"]'),'an away player offers the takeover');
    assert.deepEqual(await host.eval(`[...document.querySelectorAll('.sidebar .player')[0].querySelectorAll('[data-award]')].map(e=>e.dataset.award).sort()`),['army','route']);
    assert.match(await host.eval(`document.querySelector('[data-award="army"]').dataset.tip`),/^Largest Army, \+2 points\. 12 knights played$/);
    assert.equal(await host.eval(`document.querySelector('[data-award="army"] b').textContent`),'12');
    assert.equal(await host.eval(`document.querySelector('.sidebar .player-name').dataset.tip`),'Bartholomew Longfellow J','the tip keeps the whole name');
    const size=async()=>(await cards()).heights;const home=await size();
    assert.match(await host.text('.sidebar .player.active .badge'),/PLAYER 1/);
    await stage(server,[host],g=>{g.role=2;});assert.match(await host.text('.sidebar .player.active .badge'),/PLAYER 2/);assert.deepEqual(await size(),home);
    // The turn passes to the away player: their card keeps its size and offers the takeover instead of the badge.
    await stage(server,[host],g=>{g.role=1;g.active=1;g.primary=1;});assert.deepEqual(await size(),home,'cards do not move when the turn passes');
    assert.deepEqual(await host.eval(`(()=>{const c=document.querySelector('.sidebar .player.active');return [!!c.querySelector('[data-takeover="1"]'),!!c.querySelector('.badge')];})()`),[true,false]);
    // Phone: the cards flow, with nothing spilling out.
    await host.resize(390,844);await pause(150);const phone=await cards();assert.ok(phone.statsIn,'stats stay inside phone cards');assert.ok(await host.eval('document.documentElement.scrollWidth<=innerWidth'));assert.ok(await host.has('.control-sidebar [data-ui="supply"]'));
    assert.deepEqual(host.errors,[]);
  }finally{await host?.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: End turn glows when nothing is left to do but trade with players, and more after a while',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let host;
  try{
    // Short thresholds (soft, strong) instead of 3 s and 30 s; every staged reload keeps them. The soft stage is over in 600 ms, too brief to catch by polling on a slow machine, so the page records each level the button shows.
    host=await sixSeats(browser,server);await host.init(`window.__nudgeMs=[300,900];window.__sounds=[];window.__glow=[];new MutationObserver(()=>{const n=document.querySelector('[data-command="end"]')?.dataset.nudge;if(n&&window.__glow.at(-1)!==n)window.__glow.push(n);}).observe(document,{subtree:true,childList:true,attributes:true});`);
    const nudge=()=>host.eval(`document.querySelector('[data-command="end"]')?.dataset.nudge??'none'`);
    const glows=async(fn,why)=>{await stage(server,[host],g=>{hostTurn(g);fn(g);});await host.waitFor(`document.querySelector('[data-command="end"]')?.dataset.nudge==='strong'`,{message:`strong glow: ${why}`});
      assert.deepEqual(await host.eval('window.__glow'),['soft','strong'],`soft glow first: ${why}`);};
    const quiet=async(fn,why)=>{await stage(server,[host],g=>{hostTurn(g);fn(g);});await host.waitFor(`document.querySelector('[data-command="end"]')`);await pause(1300);assert.equal(await nudge(),'none',why);};
    // The host has no pieces on the board yet (staged from the starting roll), so the development card is the only thing to buy.
    const give=(g,h)=>{for(const r of R){g.bank[r]+=g.players[0].hand[r];g.players[0].hand[r]=0;}for(const [r,n] of Object.entries(h)){g.bank[r]-=n;g.players[0].hand[r]=n;}};
    await glows(g=>give(g,{}),'an empty hand');
    await heard(host,'nudge');assert.equal((await sounds(host)).filter(n=>n==='nudge').length,1,'one reminder tone per turn');
    assert.equal(await host.eval(`getComputedStyle(document.querySelector('[data-command="end"]')).animationName`),'end-nudge-strong');
    await quiet(g=>give(g,{ore:1,wool:1,wheat:1}),'a development card can be bought');
    await glows(g=>give(g,{ore:4}),'4 ore trade into one card, which is not enough to buy anything');
    await quiet(g=>give(g,{ore:5,wool:1}),'4 ore for wheat makes a development card affordable');
    // Development cards: one bought this turn can't be played, an older one can.
    const card=(g,bought)=>{const i=g.deck.lastIndexOf('knight');g.deck.splice(i,1);g.players[0].cards=[{type:'knight',bought,id:'fixture-knight'}];};
    await glows(g=>{give(g,{});card(g,14);},'a knight bought this turn');
    await quiet(g=>{give(g,{});g.deck.push('knight');card(g,-1);},'an older knight can be played');
    // Someone accepted the host's offer: confirming it is still to do.
    await quiet(g=>{give(g,{wood:1});g.deck.push('knight');g.players[0].cards=[];g.offers=[{id:'fixture-offer',from:0,to:null,give:{wood:1},want:{brick:1},accepted:[1],declined:[]}];},'an accepted offer waits to be confirmed');
    // Paired player 2 gets the same glow on "End my phase".
    await glows(g=>{give(g,{});g.offers=[];g.role=2;},'paired player 2');assert.match(await host.text('[data-command="end"]'),/End my phase/);
    assert.deepEqual(host.errors,[]);
  }finally{await host?.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: a full hand of development cards never pushes the Build buttons away',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let host;
  try{
    host=await sixSeats(browser,server);
    await stage(server,[host],(g,{setHand,deal})=>{hostTurn(g);setHand(0,{wood:3,brick:3,wool:3,wheat:3,ore:3});for(const t of ['knight','monopoly','invention','roads','vp'])deal(0,t);});
    for(const [w,h] of [[1920,1080],[1401,800],[1400,800],[1280,720],[1251,700],[1250,700],[1200,700],[1150,700],[1149,700],[1100,700],[1000,600],[1000,545],[860,700]]){
      await host.resize(w,h);await pause(150);
      const m=await host.eval(`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),b=r('.build-bar'),hand=r('.hand'),side=r('.control-sidebar'),c=[...document.querySelectorAll('.dev-card')].map(e=>e.getBoundingClientRect()),last=c.at(-1);return {inHand:b.right<=hand.right+.5,clearSide:b.right<=side.left+.5,sameRow:last.top<b.bottom&&last.bottom>b.top,clearBuild:last.right<=b.left+.5,steps:c.slice(1).map((e,i)=>e.left-c[i].left),handBottom:hand.bottom,page:document.documentElement.scrollHeight,buttonsOk:[...document.querySelectorAll('[data-ui="build-bar"] button')].every(e=>{const q=e.getBoundingClientRect();return q.bottom<=document.documentElement.scrollHeight;}),sideways:document.documentElement.scrollWidth<=innerWidth};})()`),at=`${w}x${h}`;
      assert.ok(m.inHand,`Build stays inside the hand at ${at}`);assert.ok(m.clearSide,`Build clears the right column at ${at}`);
      if(m.sameRow)assert.ok(m.clearBuild,`development cards stop before Build at ${at}`);
      assert.ok(Math.min(...m.steps)>=15.5,`each card shows at least 16px at ${at}: ${m.steps}`);
      assert.ok(m.handBottom<=m.page&&m.buttonsOk,`the hand can be reached at ${at}`);assert.ok(m.sideways,`no sideways scroll at ${at}`);
    }
    // Few cards leave Build beside the hand, so the map keeps that height.
    await stage(server,[host],g=>{const p=g.players[0];g.deck.push(...p.cards.splice(1).map(c=>c.type));});
    await host.resize(1100,700);await pause(150);assert.ok(await host.eval(`(()=>{const a=document.querySelector('.hand-cards').getBoundingClientRect(),b=document.querySelector('.build-bar').getBoundingClientRect();return b.left>=a.right&&b.top<a.bottom;})()`),'one kind of card leaves Build on the same row at 1100 wide');
    await stage(server,[host],(g,{deal})=>{for(const t of ['monopoly','invention','roads','vp'])deal(0,t);});
    // A card that overlaps still plays, from the part of it that shows.
    await host.resize(1280,720);await pause(150);
    assert.ok(await host.eval(`[...document.querySelectorAll('.dev-card')].every(e=>{const q=e.getBoundingClientRect();return document.elementFromPoint(q.left+8,q.top+q.height/2)?.closest('.dev-card')===e;})`),'the visible edge of every card belongs to that card');
    await host.eval(`(()=>{const q=document.querySelector('[data-type="invention"]').getBoundingClientRect();document.elementFromPoint(q.left+8,q.top+q.height/2).click();})()`);await host.waitFor(`document.getElementById('invention')`,{message:'an overlapped card did not play'});
    assert.deepEqual(host.errors,[]);
  }finally{await host?.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: invite, lobby, live setup, turns, reload and seat recovery',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();const pages=[];
  try{
    const host=await browser.newPage(),ana=await browser.newPage(),ben=await browser.newPage();pages.push(host,ana,ben);
    await createTable(host,server.host,'Host','base','variable');
    await host.click('[data-ui="invite"]');
    const link=await host.waitFor('window.__copied.at(-1)');const room=await host.eval('document.querySelector(\'input[aria-label="Invitation code"]\').value');
    assert.equal(link,`${server.invite}/?room=${room}`,'invites use the advertised address, not localhost');

    await joinByInvite(ana,link,'Ana');await joinByInvite(ben,link,'Ben');
    await host.waitFor(`document.querySelector('.lobby-top .pill')?.textContent.startsWith('3 / 4')`,{message:'Lobby did not show joined players live'});
    assert.match(await host.text(),/Ana[\s\S]*Ben/);
    assert.ok(await host.eval(`document.querySelector('[data-command="start"]').disabled`),'start waits for everyone to be ready');
    assert.match(await host.eval('getComputedStyle(document.documentElement).backgroundImage'),/gradient/,'the wood covers the whole page, not just the body');
    assert.equal(await host.text('[data-ui="start-hint"]'),'Waiting for you, Ana and Ben to get ready.');
    // Settings live in the lobby: the host changes points to win after inviting; guests see it read-only, and a change un-readies them.
    await ana.click('[data-command="ready"]');await ana.waitFor(`document.querySelector('[data-command="ready"]').textContent.includes('Not ready')`);
    await host.select('[data-setting="goal"]','12');await ana.waitFor(`document.querySelector('[data-value="goal"]')?.textContent==='12'`,{message:'guests did not see the new points to win'});
    assert.ok(!await ana.has('[data-setting]'),'only the host can change settings');assert.match(await ana.text('[data-command="ready"]'),/ready/i);assert.ok(!await ana.has('.lobby-seat.is-ready'),'changing a setting un-readies the guests');
    // The recovery key is offered in the lobby; Ben uses it on a new device mid-game below.
    await ben.click('[data-ui="seat"]');await ben.click('[data-ui="copy-seat"]');const key=await ben.waitFor('window.__copied.at(-1)');await ben.click('[data-ui="close"]');
    // Everyone readies at once: conflicting revisions must resolve without asking anyone to click again.
    await Promise.all(pages.map(page=>page.click('[data-command="ready"]')));
    await host.waitFor(`!document.querySelector('[data-command="start"]').disabled`,{message:'Simultaneous ready clicks were not all accepted'});
    for(const page of pages)assert.doesNotMatch(await page.text('#toast'),/try again/);
    // Three of four seats are enough: the host may start without waiting for the table to fill.
    assert.match(await host.text('[data-ui="start-hint"]'),/Set sail now, or wait for more friends/);
    await host.click('[data-command="start"]');
    for(const page of pages)await page.waitFor(`document.querySelector('svg.board')`,{message:'Game did not start on every screen'});
    // Everyone rolls their own dice for the first turn, all at the same moment; conflicts resolve without a "try again".
    assert.match(await phaseLabel(host),/STARTING ROLL/);
    for(const page of pages)assert.ok(await page.has('[data-ui="order"] [data-command="firstRoll"]'),'everyone has their own dice to roll');
    await listen(pages);const held=await rollForStart(pages);
    // The result stays up for a moment after the last roll, so everyone sees who rolled what.
    assert.equal(held.size,pages.length,'the starting roll result was not held on every screen');
    for(const page of pages){await heard(page,'roll');await page.waitFor(`document.querySelector('.log-list')?.textContent.includes('goes first')`,{message:'the starting roll winner is not in the history'});assert.match(await phaseLabel(page),/FOUNDATIONS/);assert.doesNotMatch(await page.text('#toast'),/try again/);}
    assert.match(await host.text('.table-line'),/First to 12 points/);

    await listen(pages);let active=await playSetup(pages);
    // Starting resources fly from their tiles; each card that lands plays a pop.
    for(const page of pages)await heard(page,'pop');
    // The game is one screen on desktop, down to short laptop windows: only panels inside it scroll.
    for(const [w,h] of [[1280,900],[1000,600]]){await host.resize(w,h);await host.waitFor(`document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth`,{message:`game page scrolls at ${w}x${h}`});}
    await host.resize(1280,900);
    for(const page of pages)await page.waitFor(`document.querySelectorAll('.building').length===6&&document.querySelectorAll('.road').length===6`,{message:'Board did not update live'});
    for(let turn=0;turn<3;turn++){
      const label=await phaseLabel(active);await playTurn(pages,active);
      active=await (async()=>{for(let i=0;i<100;i++){for(const p of pages)if(p!==active&&await p.has('[data-command="roll"]'))return p;await new Promise(r=>setTimeout(r,50));}throw new Error('Turn did not pass');})();
      assert.notEqual(await phaseLabel(active),label,'turn counter advances');
    }

    // Reloading keeps the seat; a reload mid-game must restore the same player and board.
    const before=await ana.eval('[document.querySelectorAll(".building").length,document.querySelector(".player-name small")?.parentElement.textContent]');
    await ana.reload();await ana.waitFor(`document.querySelector('svg.board')`);
    assert.deepEqual(await ana.eval('[document.querySelectorAll(".building").length,document.querySelector(".player-name small")?.parentElement.textContent]'),before);
    await ana.waitFor(`document.querySelector('.connection-label')?.textContent==='Connected'`);

    // Seat recovery key moves Ben's seat to a fresh device.
    const phone=await browser.newPage({width:390,height:844});pages.push(phone);
    await phone.goto(server.invite);await phone.click('[data-ui="help"]');await phone.click('[data-ui="recover"]');
    await phone.type('#recover input[name="key"]',key);await phone.click('#recover button');
    await phone.waitFor(`document.querySelector('svg.board')`,{message:'Recovered seat did not open the game'});
    assert.match(await phone.eval('document.querySelector(".player-name small")?.parentElement.textContent'),/^Ben/);
    assert.ok(await noOverflow(phone),'game fits a phone screen without horizontal scrolling');

    for(const page of pages)assert.deepEqual(page.errors,[],'no uncaught page errors');
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

// Turn banners are recorded in the page (window.__banners: 'me' for your own, the player's name for someone else's), because a
// band is on screen for only a couple of seconds and polling could miss it on a slow machine.
const banners=pages=>Promise.all(pages.map(p=>p.eval('window.__banners=[]')));
const sawBanner=(page,who)=>page.waitFor(`window.__banners?.includes(${JSON.stringify(who)})`,{message:`Expected the "${who}" turn banner`});
test('browser: a band across the board says whose turn it is, and a hidden tab sees its own when it comes back',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    pages=await seatTable(browser,server,3,'variable');await banners(pages);
    let active=await playSetup(pages);
    // Every setup placement of your own gets the band; nobody gets one for someone else's placement, only for the first roll after setup.
    for(const page of pages)assert.ok((await page.eval('window.__banners')).filter(b=>b!=='me').length<=1,'no bands for others during setup');
    for(const page of pages)await sawBanner(page,'me');
    const name=async page=>(await page.eval('document.querySelector(".player-name small")?.parentElement.firstChild.textContent')).trim();
    for(let turn=0;turn<2;turn++){
      await banners(pages);await playTurn(pages,active);const next=await waitActive(pages,active),who=await name(next);
      await sawBanner(next,'me');for(const page of pages)if(page!==next)await sawBanner(page,who);
      assert.ok(await next.eval(`(()=>{const b=document.querySelector('[data-ui="turn-banner"][data-who="me"]');return !b||b.textContent.includes('Roll the dice');})()`));
      active=next;
    }
    // A tab in the background doesn't waste its band: it plays when the tab is visible again, if it is still that turn.
    const after=pages[(pages.indexOf(active)+1)%pages.length];
    // Hide the next player's tab before the turn reaches it: the page sees document.hidden and a visibilitychange later.
    await after.eval(`window.__banners=[];window.__hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});`);
    await playTurn(pages,active);const next=await waitActive(pages,active);assert.equal(next,after,'turns go round the table');
    await pause(400);assert.deepEqual(await after.eval('window.__banners'),[],'no band while hidden');
    await after.eval(`window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'))`);await sawBanner(after,'me');
    for(const page of pages)assert.deepEqual(page.errors,[]);
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser.close();await server.stop();}
});

// A stand-in for the browser's notifications (headless has no notification centre), recording what the page shows and closes and
// remembering the permission across reloads like a browser,
// and a document.hidden the test can flip, with a visibilitychange like a real tab switch.
const ALERTS=`window.__notes=[];window.Notification=class{static permission=localStorage.getItem('test-permission')||'default';static requestPermission(){Notification.permission='granted';localStorage.setItem('test-permission','granted');return Promise.resolve('granted');}constructor(title,o){this.title=title;window.__notes.push(title+': '+o.body);}close(){window.__notes.push('closed');}};
window.__hidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});window.__show=v=>{window.__hidden=!v;document.dispatchEvent(new Event('visibilitychange'));};`;
test('browser: the tab title says when the game waits on you, and turn alerts reach a background tab',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[],plain;
  try{
    // Without the Notification API (or outside HTTPS/localhost) there is no bell.
    plain=await browser.newPage();await plain.init('delete window.Notification');await createTable(plain,server.host,'Plain','base','variable');
    assert.ok(!await plain.has('[data-ui="notify"]'),'no bell without notifications');assert.ok(!(await plain.eval('document.title')).startsWith('●'),'not in a lobby');await plain.close();plain=null;
    pages=await seatTable(browser,server,2,'variable',true,ALERTS);
    const titled=page=>page.eval(`document.title.startsWith('● Your turn')`);
    let active=null;for(let i=0;i<100&&!active;i++){for(const p of pages)if(await p.has('[data-vertex]'))active=p;if(!active)await pause(50);}
    const other=pages.find(p=>p!==active);assert.deepEqual([await titled(active),await titled(other)],[true,false],'only the player the game waits on is flagged');
    // The bell is off until asked for; turning it on asks the browser once, and the choice lasts.
    for(const page of pages){assert.equal(await page.eval(`document.querySelector('[data-ui="notify"]').getAttribute('aria-pressed')`),'false');await page.click('[data-ui="notify"]');await page.waitFor(`document.querySelector('[data-ui="notify"]').getAttribute('aria-pressed')==='true'`);}
    await other.reload();await other.waitFor(`document.querySelector('[data-ui="notify"]')?.getAttribute('aria-pressed')==='true'`,{message:'the choice lasts'});
    active=await playSetup(pages);const waiting=pages.find(p=>p!==active);
    // In the background, the start of your turn sends one notification; coming back closes it.
    await waiting.eval('window.__notes=[];window.__show(false)');
    await playTurn(pages,active);assert.equal(await waitActive(pages,active),waiting);
    await waiting.waitFor(`window.__notes.length===1&&window.__notes[0]==='Your turn: Roll the dice.'`,{message:'expected one turn alert'});
    assert.ok(await titled(waiting),'the background tab title is flagged');assert.ok(!await titled(active));
    await waiting.eval('window.__show(true)');await waiting.waitFor(`window.__notes.at(-1)==='closed'`,{message:'coming back closes the alert'});
    // A visible tab gets no notification.
    await waiting.eval('window.__notes=[]');await playTurn(pages,waiting);await waitActive(pages,waiting);await playTurn(pages,active);await waitActive(pages,active);
    await pause(200);assert.ok(!(await waiting.eval('window.__notes')).some(n=>n.startsWith('Your turn')),'no alert for a visible tab');
    for(const page of pages)assert.deepEqual(page.errors,[]);
  }finally{await plain?.close().catch(()=>{});for(const page of pages)await page.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: phone-width home and lobby fit without horizontal scrolling',{skip,timeout:60000},async()=>{
  const server=await startServer(),browser=await launch();let page;
  try{
    page=await browser.newPage({width:375,height:812});
    await page.goto(server.host);assert.ok(await noOverflow(page),'home');
    await createTable(page,server.host,'Solo','base','fixed');assert.ok(await noOverflow(page),'lobby');
    assert.ok(await page.eval(`(()=>{const c=document.querySelector('.lobby-seat.own').getBoundingClientRect(),all=[...document.querySelectorAll('[data-ui="colors"] [data-color]')];return all.length===6&&all.every(e=>{const r=e.getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.bottom<=c.bottom;});})()`),'the swatches stay inside the seat card');
    assert.match(await page.text('[data-ui="start-hint"]'),/at least one more player/,'a lone host is told why they cannot start');
    await page.click('[data-ui="invite"]');
    assert.match(await page.waitFor('window.__copied.at(-1)'),new RegExp(`^${server.invite.replace(/[.]/g,'\\.')}/\\?room=[a-f0-9]{12}$`));
    // Saved seats clean themselves up: a seat for a room that is gone, or a game over for more than a week, is forgotten; the live seat stays.
    await page.eval(`(()=>{const s=JSON.parse(localStorage.getItem('island-seats'));s.aaaaaaaaaaaa={room:'aaaaaaaaaaaa',token:'${'0'.repeat(64)}',at:2};s.bbbbbbbbbbbb={room:'bbbbbbbbbbbb',token:'${'1'.repeat(64)}',at:1,over:Date.now()-8*864e5};localStorage.setItem('island-seats',JSON.stringify(s));})()`);
    await page.goto(server.host);
    assert.equal(await page.waitFor(`(()=>{const k=Object.keys(JSON.parse(localStorage.getItem('island-seats')));return k.length===1&&k[0];})()`,{message:'Stale saved seats were not cleaned up'}),await page.eval(`document.querySelector('[data-resume]')?.dataset.resume`));
    assert.deepEqual(page.errors,[]);
  }finally{await page?.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: a tie in the starting roll stays on screen before the tied players roll again',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    pages=await seatTable(browser,server,3,'fixed',false);
    // Seats 0 and 1 have rolled double six, so whatever seat 2 rolls ends the round in a tie at 12.
    await stage(server,pages,g=>{for(const p of [0,1]){g.order.dice[p]=[6,6];g.order.done.push(p);g.events.push({id:++g.eventSeq,turn:g.turn,kind:'order',p,dice:[6,6],round:1});}});
    await pages[2].click('[data-command="firstRoll"]');
    for(const page of pages){await page.waitFor(`document.querySelector('[data-ui="order"][data-held="tie"]')`,{message:'the tie was not held'});assert.match(await page.text('[data-ui="order"] h2'),/Tie at 12!/);assert.ok(!await page.has('[data-command="firstRoll"]'),'no one rolls again during the hold');assert.equal(await page.eval(`document.querySelectorAll('[data-ui="order"] [data-order] .order-dice').length`),3,'every roll stays visible');}
    await pages[0].waitFor(`document.querySelector('[data-command="firstRoll"]')&&!document.querySelector('[data-held]')`,{message:'the tied players never got to roll again'});
    const held=await rollForStart(pages);assert.equal(held.size,pages.length,'the winner was not held on every screen');
    for(const page of pages)assert.deepEqual(page.errors,[]);
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: discards, player and bank trades, and every development card',{skip,timeout:180000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    pages=await seatTable(browser,server,3,'fixed');
    // A seven while the next player holds nine cards: only they discard, and the robber waits for them.
    const [a,b,c]=await stage(server,pages,(g,{setHand})=>{const a=g.active,b=(a+1)%3,c=(a+2)%3;
      setHand(a,{});setHand(b,{wood:2,brick:2,wool:2,wheat:2,ore:1});setHand(c,{wool:1});
      g.dice=[3,4];g.phase='discard';g.discards=g.players.map((_,i)=>i===b?4:0);g.resumePhase='action';return [a,b,c];});
    const [A,B,C]=[pages[a],pages[b],pages[c]];
    assert.match(await B.text('#discard h3'),/Return 4/);
    assert.ok(await B.has('[data-ui="discard"] #discard'),'the discard opens as a window over the board');assert.ok(await B.has('[data-ui="discard-risk"]')&&await B.has('.hand.at-risk'),'nine cards show the over-seven warning');assert.ok(!await C.has('[data-ui="discard-risk"]'),'one card is no risk');
    assert.ok(!await A.has('#discard')&&!await C.has('#discard'),'only players over seven discard');
    assert.ok(!await A.has('[data-hex]'),'the robber waits for discards');
    await fill(B,'discard',{'discard-wood':1});await submit(B,'discard');await toastIncludes(B,'exactly 4');
    await fill(B,'discard',{'discard-wood':2,'discard-brick':2});await submit(B,'discard');await B.waitFor(`!document.querySelector('#discard')`);
    assert.deepEqual(await hand(B),{wood:0,brick:0,wool:2,wheat:2,ore:1});
    assert.ok(!await B.has('[data-ui="discard"]')&&!await B.has('[data-ui="discard-risk"]'),'the window closes and five cards are safe');
    await resolveRoll(pages,A);

    // A lone victim is robbed at once, without a pick: the card flies face-down for onlookers and face-up for the victim.
    const lone=await stage(server,pages,(g,{setHand})=>{const h=g.board.hexes.find(h=>h.id!==g.robber&&h.vertices.every(v=>[undefined,a].includes(g.board.vertices[v].building?.owner))&&h.vertices.some(v=>!g.board.vertices[v].building));
      g.board.vertices[h.vertices.find(v=>!g.board.vertices[v].building)].building={owner:b,kind:'settlement'};setHand(b,{ore:1});g.phase='robber';g.resumePhase='action';return h.id;});
    await listen([A,B,C]);await A.click(`[data-hex="${lone}"]`);
    await C.waitFor(`document.querySelector('#fx .fly .fly-back')`,{message:'Onlookers did not see a face-down card fly'});
    await B.waitFor(`document.querySelector('#fx .fly use[href="#ico-ore"]')`,{message:'The victim did not see their ore fly away'});
    for(const page of [A,B,C])await heard(page,'robber');await heard(B,'sour');await heard(C,'steal');assert.ok(!(await sounds(C)).includes('sour'),'only the victim hears the sour note');
    await A.waitFor(`document.querySelector('[data-command="end"]')`);assert.ok(!await A.has('[data-victim]'),'no pick for a single victim');
    await C.waitFor(`document.querySelector('.log-list').textContent.includes('stole a resource from Seat ${b}')`);
    await B.waitFor(`document.querySelector('.log-list .log-res[data-tip="1 ore"]')`,{message:'The victim’s history does not name the stolen ore'});
    // Picking one of two victims. When the page changes under a still pointer (the pick panel or the robber's hex overlay vanishing),
    // the browser reports whatever is now there at the same spot; its tip must not pop up unasked, as if it showed someone's cards.
    await stage(server,pages,(g,{setHand})=>{setHand(b,{wool:2});setHand(c,{wheat:2});g.phase='steal';g.victims=[b,c];g.resumePhase='action';for(let i=0;i<12;i++)g.events.push({id:++g.eventSeq,turn:g.turn,kind:'roll',p:b,dice:[3,3],gains:[{p:b,hex:0,r:'wool',n:2},{p:c,hex:1,r:'wheat',n:1}],short:[],blocked:null});});
    await A.hover(`[data-victim="${c}"]`);await A.click(`[data-victim="${c}"]`);await A.waitFor(`!document.querySelector('[data-victim]')`);
    const spot=await A.eval(`(()=>{const e=document.querySelector('.building[data-owner="${b}"]'),r=e.getBoundingClientRect(),x=r.x+r.width/2+2,y=r.y+r.height/2+2;document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,pointerType:'mouse'}));e.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:x,clientY:y,pointerType:'mouse'}));return e.dataset.tip;})()`);
    await pause(700);assert.equal(await A.eval(`document.querySelector('#tip.visible')?.textContent??null`),null,'no tooltip for what appears under a still pointer');
    assert.match(spot,/^Seat \d’s (settlement|city)\. Produces \d \w+ on \d+/,'building tips say what the building produces, not what anyone holds');
    await A.hover(`.building[data-owner="${b}"] g path:last-child`);await A.waitFor(`document.querySelector('#tip.visible')?.textContent.includes('Produces')`,{message:'moving onto a building still shows its tip'});
    // The history wraps long lines instead of scrolling sideways, and keeps its scroll position through live updates.
    assert.ok(await A.eval(`(()=>{const l=document.querySelector('.log-list');return l.scrollWidth<=l.clientWidth;})()`),'the history does not scroll sideways');
    const scrolled=await A.eval(`document.querySelector('.log-list').scrollTop=60,document.querySelector('.log-list').scrollTop`);assert.ok(scrolled>0,'the history is long enough to scroll');
    await openPanel(A,'bank','bank');assert.equal(await A.eval(`document.querySelector('.log-list').scrollTop`),scrolled,'a redraw keeps the history where it was scrolled');await A.click('[data-mode="bank"]');await A.waitFor(`!document.getElementById('bank')`);

    await stage(server,pages,(g,{setHand,deal,topDeck})=>{assert.equal(g.phase,'action');
      setHand(a,{wood:5,wool:1,wheat:2,ore:2});setHand(b,{brick:2,wool:2});setHand(c,{wool:3,ore:1});
      deal(a,'monopoly');deal(b,'invention');deal(c,'roads');deal(c,'vp');deal(c,'knight');deal(c,'knight');topDeck('knight');
      // A long earlier history, so the layout check below has something to scroll.
      for(let i=0;i<40;i++){g.eventSeq=(g.eventSeq??g.events.length)+1;g.events.splice(-1,0,{id:g.eventSeq,turn:g.turn-1,kind:'build',p:c,piece:'road'});}});
    assert.equal(await scoreOf(C,c),await scoreOf(A,c)+1,'a hidden Victory Point counts only on its owner’s screen');
    assert.ok(await C.eval(`${cardButton('Victory Point')}.disabled`),'Victory Point cards cannot be played');
    assert.deepEqual(await C.eval(`[...document.querySelectorAll('[data-card][data-type="knight"]')].map(b=>b.querySelector('b')?.textContent)`),['2'],'two Knights stack into one card with a count');
    assert.match(await C.eval(`${cardButton('Knight')}.dataset.tip`),/steal 1 resource/,'cards say what they do');

    // Only the current player starts trades. B accepts while C counters at the same moment: both reach A live,
    // A declines the counter and then chooses B among the players who accepted.
    assert.ok(!await B.has('[data-mode="trade"]'),'only the current player can start a trade');
    assert.ok(await B.eval(`document.querySelector('[data-ui="build-bar"] [data-mode="road"]').disabled`),'the build bar waits for your turn');
    assert.deepEqual(await A.eval(`['road','buyCard'].map(k=>document.querySelector('[data-ui="build-bar"] [data-mode="'+k+'"],[data-ui="build-bar"] [data-command="'+k+'"]').disabled)`),[true,false],'the current player can buy what they can afford, and only that');
    // With a long history only the history list scrolls, not the column around it.
    assert.deepEqual(await A.eval(`(()=>{const l=document.querySelector('.log-list'),c=document.querySelector('.control-sidebar');return [l.scrollHeight>l.clientHeight,c.scrollHeight<=c.clientHeight];})()`),[true,true],'the history scrolls inside its own list');
    // Cost cards show what you hold and what you miss, on and off your turn.
    const marks=page=>page.eval(`[...document.querySelectorAll('[data-ui="build-bar"] [data-mode="road"] .cost')].map(e=>e.dataset.res+':'+e.className.split(' ')[1])`);
    assert.deepEqual(await marks(A),['wood:have','brick:miss']);assert.deepEqual(await marks(B),['wood:miss','brick:have']);
    assert.match(await A.eval(`document.querySelector('[data-ui="build-bar"] [data-mode="road"]').dataset.tip`),/missing 1 brick/);
    await listen([A,B,C]);await openPanel(A,'trade','trade');await fill(A,'trade',{'give-wood':1,'want-brick':1});await submit(A,'trade');
    for(const page of [B,C])await page.waitFor(`document.querySelector('[data-ui="trade-panel"] .offer [data-counter]')`,{message:'The offer did not open the trade panel for the other players'});
    // Closing the panel hides the offer behind a launcher badge until it is reopened.
    await heard(B,'offer');await heard(C,'offer');assert.ok(!(await sounds(A)).includes('offer'),'no bell for your own offer');
    await B.click('[data-ui="trade-close"]');await B.waitFor(`!document.querySelector('.offer')`);assert.match(await B.text('[data-ui="trade-launcher"]'),/Offers\s*1/);
    await B.click('[data-ui="trade-show"]');await B.waitFor(`document.querySelector('.offer [data-accept]')`);
    await C.click('.offer [data-counter]');await fill(C,'trade',{'give-wool':1,'want-wood':1});
    // Answer through the app's own handlers in the same instant: a mouse click can miss when the other answer arrives and shifts the layout mid-click.
    await Promise.all([B.eval(`document.querySelector('.offer [data-accept]').click()`),C.eval(`document.getElementById('trade').requestSubmit()`)]);
    for(const page of [B,C])assert.doesNotMatch(await page.text('#toast'),/try again/);
    await A.waitFor(`document.querySelector('.offer [data-confirm]')&&document.querySelectorAll('.offer').length===2`,{message:'The accept and the counteroffer did not both reach the active player'});
    // Answers redraw the panel live; it must not replay its entrance each time (it used to blink).
    await pause(300);assert.equal(await A.eval(`document.querySelector('[data-ui="trade-panel"]').getAnimations().length`),0,'the open trade panel does not animate again on a live update');
    assert.equal((await hand(B)).brick,2,'accepting alone moves no cards');
    // Arrival order is up to the race, so find C's counteroffer by its text rather than its position.
    const declineC=await A.eval(`[...document.querySelectorAll('.offer')].find(o=>o.textContent.includes('Seat ${c} counters')).querySelector('[data-decline]').dataset.decline`);
    await A.click(`[data-decline="${declineC}"]`);await A.waitFor(`document.querySelectorAll('.offer').length===1`);
    assert.match(await A.text('.offer'),new RegExp(`Seat ${a} offers 1 wood[\\s\\S]*Accepted: Seat ${b}`));
    await A.click(`[data-confirm][data-player="${b}"]`);await A.waitFor(`!document.querySelector('.offer')`);
    assert.deepEqual(await hand(A),{wood:4,brick:1,wool:1,wheat:2,ore:2});
    await B.waitFor(`[...document.querySelectorAll('.resource-card b')].map(b=>b.textContent).join()==='1,1,2,0,0'`,{message:'Confirmed trade did not update the other hand'});
    await C.waitFor(`document.querySelector('.log-list').textContent.includes('Seat ${a} traded with Seat ${b}')`);
    await openPanel(A,'trade','trade');await fill(A,'trade',{'want-ore':1});await submit(A,'trade');await toastIncludes(A,'gifts are not allowed');
    // Everyone declining at the same moment takes the offer off every table; nobody has to cancel it.
    await fill(A,'trade',{'give-wood':1,'want-ore':1});await submit(A,'trade');for(const page of [B,C])await page.waitFor(`document.querySelector('.offer [data-decline]')`,{message:'The offer did not reach the other players'});
    await Promise.all([B,C].map(page=>page.eval(`document.querySelector('.offer [data-decline]').click()`)));
    for(const page of [A,B,C])await page.waitFor(`!document.querySelector('.offer')&&document.querySelector('.log-list').textContent.includes('Everyone declined Seat ${a}’s offer.')`,{message:'The declined offer did not leave the table'});
    for(const page of [B,C])assert.doesNotMatch(await page.text('#toast'),/try again/);assert.ok(await A.has('[data-ui="trade-launcher"]')&&!await A.has('[data-ui="trade-panel"]'),'the panel closes with its last offer');
    // The mute toggle is remembered per browser and survives a reload.
    await A.click('[data-ui="mute"]');await A.waitFor(`document.querySelector('[data-ui="mute"]').getAttribute('aria-pressed')==='false'&&localStorage.getItem('island-muted')==='1'`,{message:'Mute did not switch sound off'});
    await A.eval('location.reload()');await A.waitFor(`document.querySelector('[data-ui="mute"]')?.getAttribute('aria-pressed')==='false'`,{message:'Mute was not remembered'});
    await A.click('[data-ui="mute"]');await A.waitFor(`localStorage.getItem('island-muted')==='0'`);

    await openPanel(A,'bank','bank');const ratio=Number((await A.text('#bank [data-ratio="wood"] .ratio')).match(/\d+/)[0]);
    await fill(A,'bank',{give:'wood',want:'ore'});await submit(A,'bank');
    await A.waitFor(`document.querySelectorAll('.resource-card b')[4].textContent==='3'`,{message:'Bank trade did not complete'});
    assert.deepEqual(await hand(A),{wood:4-ratio,brick:1,wool:1,wheat:2,ore:3});

    // A newly bought card waits a turn; Monopoly collects every opponent's wool.
    await A.click('[data-command="buyCard"]');await A.waitFor(`${cardButton('Knight')}?.textContent.includes('new')`);
    assert.ok(await A.eval(`${cardButton('Knight')}.disabled`),'a card bought this turn cannot be played');
    await clickCard(A,'Monopoly');await A.click('[data-monopoly="wool"]');
    await A.waitFor(`document.querySelectorAll('.resource-card b')[2].textContent==='5'`,{message:'Monopoly did not collect wool'});
    assert.equal((await hand(B)).wool,0);assert.equal((await hand(C)).wool,0);
    await listen([A,B,C]);await A.click('[data-command="end"]');

    // Invention before rolling takes two resources from the supply.
    assert.equal(await waitActive(pages,A),B);await heard(B,'turn');await heard(C,'end');assert.ok(!(await sounds(C)).includes('turn'),'only the next player hears their turn chime');assert.ok(await B.has('.table-dice.roll-me')&&!await A.has('.roll-me'),'only the roller gets the dice button');const before=await hand(B);
    await clickCard(B,'Invention');await fill(B,'invention',{'take-ore':1,'take-wheat':1});await submit(B,'invention');await B.waitFor(`!document.querySelector('#invention')`);
    assert.deepEqual(await hand(B),{...before,ore:before.ore+1,wheat:before.wheat+1});
    await playTurn(pages,B);

    // Road Building places two free roads, then the turn resumes before the roll.
    assert.equal(await waitActive(pages,B),C);const roads=await C.eval(`document.querySelectorAll('.road').length`);
    await clickCard(C,'Road Building');
    for(const n of [1,2]){await C.click('[data-edge]');await C.waitFor(`document.querySelectorAll('.road').length===${roads+n}`);}
    // Everyone else sees the new roads pulse in C's colour; C, who placed them, does not.
    await A.waitFor(`document.querySelectorAll('[data-placed="edge"]').length===2`,{message:'New roads were not highlighted for other players'});
    assert.equal(await C.eval(`document.querySelectorAll('[data-placed="edge"]').length`),0,'C does not see its own roads pulse');
    // Hovering one of C's roads explains it and lights up C's longest route; hovering a card says what it does.
    await A.hover(`.road[data-owner="${c}"]`);
    const tip=await A.waitFor(`document.querySelector('#tip.visible')?.textContent`,{message:'No tooltip on a road'});
    const route=Number(tip.match(/Longest route: (\d+)/)?.[1]);assert.ok(route>=3,tip);
    assert.equal(await A.eval(`document.querySelectorAll('.board.route-mode .road.route-lit').length`),route,'the lit roads are the longest route');
    await A.hover('[data-command="buyCard"]');await A.waitFor(`document.querySelector('#tip.visible')?.textContent.includes('Dev card')`,{message:'Moving to another element did not move the tooltip'});
    assert.equal(await A.eval(`document.querySelectorAll('.route-lit').length`),0,'leaving the road clears the highlight');
    await C.waitFor(`document.querySelector('[data-command="roll"]')`,{message:'Road Building did not return to the roll'});
    await playTurn(pages,C);

    // Last turn's Knight is now playable: it moves the robber and counts toward Largest Army.
    assert.equal(await waitActive(pages,C),A);await clickCard(A,'Knight');
    await A.click('[data-hex]');await A.waitFor(`!document.querySelector('[data-hex]')`);
    if(await A.has('[data-victim]'))await A.click('[data-victim]');
    await A.waitFor(`document.querySelector('[data-command="roll"]')`,{message:'Knight did not return to the roll'});
    assert.equal(await A.eval(`document.querySelectorAll('.sidebar .player')[${a}].querySelector('.stat[data-tip$="knights played"]').textContent`),'1');
    for(const page of pages)assert.deepEqual(page.errors,[],'no uncaught page errors');
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: Largest Army wins on your own turn, reveals hidden points, and the host starts a rematch',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    pages=await seatTable(browser,server,3,'fixed');
    // Two cities and four hidden Victory Points make eight; a third Knight brings Largest Army and ten.
    const a=await stage(server,pages,(g,{deal})=>{const a=g.active;for(const v of g.board.vertices)if(v.building?.owner===a)v.building.kind='city';for(let i=0;i<4;i++)deal(a,'vp');g.players[a].knights=2;deal(a,'knight');return a;});
    const A=pages[a],other=pages[(a+1)%3];
    assert.equal(await scoreOf(A,a),8);assert.equal(await scoreOf(other,a),4,'opponents see only public points');
    await clickCard(A,'Knight');
    for(const page of pages)await page.waitFor(`document.querySelector('.winner')`,{message:'Winner was not shown on every screen'});
    assert.match(await other.text('.winner'),new RegExp(`Seat ${a} wins!`));
    assert.equal(await scoreOf(other,a),10,'hidden points are revealed at the end');
    assert.ok(!await pages[1].has('[data-command="rematch"]'),'only the host can start a rematch');
    for(const page of pages)assert.ok(await page.has('[data-ui="victory"] .victory-card'),'the win banner covers every screen');
    await other.click('[data-ui="victory-close"]');await other.waitFor(`!document.querySelector('[data-ui="victory"]')&&document.querySelector('.control-sidebar .winner')`,{message:'Closing the banner did not reveal the board and the winner card'});
    await pages[0].click('[data-command="rematch"]');
    for(const page of pages)await page.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('I’m ready')`,{message:'Rematch did not return everyone to the lobby'});
    assert.match(await pages[2].text(),/Seat 0[\s\S]*Seat 1[\s\S]*Seat 2/);
    for(const page of pages)assert.deepEqual(page.errors,[],'no uncaught page errors');
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: five players use paired turns and neutral fixed settlements',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    pages=await seatTable(browser,server,5,'fixed');
    assert.equal(await pages[0].eval(`document.querySelectorAll('.building[data-owner="-1"]').length`),2,'the unused colour leaves two neutral settlements');
    const p1=await waitActive(pages);assert.match(await phaseLabel(p1),/PAIRED PLAYER 1/);
    await p1.click('[data-command="roll"]');await resolveRoll(pages,p1);
    assert.ok(await p1.has('[data-mode="trade"]'),'Player 1 may trade with players');
    assert.match(await p1.text('[data-command="end"]'),/End my phase/);await p1.click('[data-command="end"]');
    // Player 2 sits three seats on, acts without rolling, and nobody may trade with players.
    const s1=pages.indexOf(p1),p2=pages[(s1+3)%5];
    await p2.waitFor(`document.querySelector('.turn-card .eyebrow')?.textContent.includes('PAIRED PLAYER 2')&&document.querySelector('[data-command="end"]')`,{message:'Player 2 phase did not start three seats on'});
    assert.ok(!await p2.has('[data-command="roll"]'),'Player 2 does not roll');
    assert.match(await p2.text('.turn-card'),/No player trades/);
    for(const page of pages)assert.ok(!await page.has('[data-mode="trade"]'),'no player trades during Player 2');
    await p2.click('[data-command="end"]');
    assert.equal(await waitActive(pages,p1),pages[(s1+1)%5],'both markers advance one seat');
    for(const page of pages)assert.deepEqual(page.errors,[],'no uncaught page errors');
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: the host seats bots who play their own turns, and a bot stands in for a friend who left until they return',{skip,timeout:120000},async()=>{
  const server=await startServer({BOT_PACE:'0.05'}),browser=await launch();let pages=[];
  try{
    const host=await browser.newPage(),friend=await browser.newPage();pages=[host,friend];await createTable(host,server.host,'Marko','base','variable');
    for(const n of [1,2]){await host.click('[data-command="addBot"]');await host.waitFor(`document.querySelectorAll('[data-bot]').length===${n}`);}
    const names=await host.eval(`[...document.querySelectorAll('[data-bot] .player-name')].map(e=>e.firstChild.textContent.trim())`);assert.ok(names.every(n=>/^\w+ \(Bot\)$/.test(n)&&!n.startsWith('Marko')),names.join());
    await host.click('[data-remove-bot]');await host.waitFor(`document.querySelectorAll('[data-bot]').length===1`);const bot=names[1];
    const room=await host.eval(`document.querySelector('input[aria-label="Invitation code"]').value`);await joinByInvite(friend,`${server.invite}/?room=${room}`,'Friend');
    assert.ok(!await friend.has('[data-command="addBot"]'),'only the host adds bots');
    for(const page of pages){await page.click('[data-command="ready"]');await page.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('Not ready')`);}
    await host.click('[data-command="start"]');for(const page of pages)await page.waitFor(`document.querySelector('svg.board')`);
    // Bots take their own placements and may play a whole turn before a person rolls, so setup can need a few rounds of waiting.
    for(let i=0;;i++){try{await playSetup(pages);break;}catch(e){if(i>5)throw e;}}
    assert.equal(await host.eval(`document.querySelectorAll('.building[data-owner="1"]').length`),2,'the bot placed its own settlements');
    // The friend leaves; the host lets a bot play for them, and their seat reads "Friend (Bot)" meanwhile.
    await friend.click('[data-ui="home"]');await host.waitFor(`document.querySelector('[data-takeover="2"]')`,{message:'No takeover button for the absent friend'});
    await host.click('[data-takeover="2"]');await host.waitFor(`[...document.querySelectorAll('.sidebar .player-name')].some(e=>e.textContent.includes('Friend (Bot)'))`);
    await host.waitFor(`[...document.querySelectorAll('.log-item')].some(e=>e.textContent.includes('let a bot play for Friend'))`);
    // Two rounds: the host plays its turns, the bot and the stand-in theirs.
    for(let k=0;k<2;k++){await host.waitFor(`document.querySelector('[data-command="roll"]')`,{timeout:45000,message:'The bots did not hand the turn back'});await playTurn([host],host);}
    await host.waitFor(`document.querySelector('[data-command="roll"]')`,{timeout:45000});
    const rolls=await host.eval(`[...document.querySelectorAll('.log-item')].filter(e=>/ rolled \\d+\\./.test(e.textContent)).map(e=>e.textContent)`);
    for(const who of ['Friend (Bot)',bot])assert.ok(rolls.some(r=>r.startsWith(who)),`${who} rolled: ${rolls}`);
    // Coming back gives the seat back.
    await friend.click(`[data-resume="${room}"]`);await friend.waitFor(`document.querySelector('svg.board')`);
    await host.waitFor(`[...document.querySelectorAll('.log-item')].some(e=>e.textContent.includes('Friend is back'))`,{message:'The seat was not handed back'});
    assert.ok(!await host.has('[data-takeover]'));for(const page of pages)assert.deepEqual(page.errors,[],'no uncaught page errors');
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: toppled lobby pieces lie on a flat shadow and stay inside their seat',{skip,timeout:60000},async()=>{
  const server=await startServer(),browser=await launch();let host;
  // Each outline traced through its own transforms, because a rotated element's bounding box overstates it. 1 is half the stroke.
  const measure=`(()=>{const svg=document.querySelector('.seat-pieces'),box=svg.getBoundingClientRect(),k=box.width/svg.viewBox.baseVal.width,xs=[],ys=[];for(const path of svg.querySelectorAll('path')){const m=path.getScreenCTM(),n=path.getTotalLength();for(let i=0;i<=40;i++){const q=path.getPointAtLength(n*i/40).matrixTransform(m);xs.push(q.x);ys.push(q.y);}}const shadows=[...svg.querySelectorAll('ellipse')].map(e=>{const r=e.getBoundingClientRect();xs.push(r.left+k,r.right-k);ys.push(r.top+k,r.bottom-k);return r.width/r.height;});return {shadows,left:Math.min(...xs)-k-box.left,top:Math.min(...ys)-k-box.top,right:box.right-Math.max(...xs)-k,bottom:box.bottom-Math.max(...ys)-k};})()`;
  const check=async state=>{const m=await host.eval(measure);assert.equal(m.shadows.length,2);for(const ratio of m.shadows)assert.ok(ratio>3,`${state}: the shadow lies flat, width/height ${ratio}`);for(const side of ['left','top','right','bottom'])assert.ok(m[side]>=0,`${state}: the piece is cut off at the ${side}: ${m[side]}`);};
  try{
    host=await browser.newPage();await createTable(host,server.host,'Ana','base','variable');
    await check('not ready');
    await host.click('[data-command="ready"]');await host.waitFor(`document.querySelector('.lobby-seat.is-ready')`);
    await check('ready');
  }finally{await host?.close().catch(()=>{});await browser.close();await server.stop();}
});

test('browser: the host removes a friend from the lobby and makes the table private',{skip,timeout:90000},async()=>{
  const server=await startServer(),browser=await launch();let host,guest;
  try{
    host=await browser.newPage();guest=await browser.newPage();
    await createTable(host,server.host,'Ana','base','variable');const room=await host.eval(`document.querySelector('.place-code').value`);
    assert.match(await host.text('.lobby-top .eyebrow'),/PUBLIC TABLE/);
    await joinByInvite(guest,`${server.invite}/?room=${room}`,'Bo');await host.waitFor(`document.querySelector('[data-kick="1"]')`);
    assert.equal(await guest.has('[data-kick]'),false,'only the host can remove people');assert.equal(await host.has('[data-kick="0"]'),false,'the host cannot remove themselves');
    await guest.click('[data-command="ready"]');await host.waitFor(`document.querySelectorAll('.lobby-seat.is-ready').length===1`);
    // Visibility leaves everyone ready.
    await host.select('[data-setting="public"]','false');await host.waitFor(`document.querySelector('[data-ui="settings"]').dataset.public==='false'`);
    assert.match(await host.text('.lobby-top .eyebrow'),/PRIVATE TABLE/);await guest.waitFor(`document.querySelector('[data-value="public"]')?.textContent.includes('Private')`);
    assert.ok(await guest.has('.lobby-seat.is-ready'),'still ready');
    await host.click('[data-kick="1"]');
    await guest.waitFor(`document.querySelector('#entry')`,{message:'The removed friend did not go home'});await toastIncludes(guest,'removed you');
    assert.equal(await guest.eval(`Object.keys(JSON.parse(localStorage.getItem('island-seats')||'{}')).includes(${JSON.stringify(room)})`),false,'the seat is forgotten');
    await host.waitFor(`document.querySelectorAll('.lobby-seat:not(.empty)').length===1`);
    assert.deepEqual([...host.errors,...guest.errors],[]);
  }finally{await host?.close().catch(()=>{});await guest?.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: open tables list public lobbies on the home screen and join from the list',{skip,timeout:90000},async()=>{
  const server=await startServer(),browser=await launch();let host,guest,third;
  try{
    host=await browser.newPage();guest=await browser.newPage({width:375,height:812});third=await browser.newPage();
    await createTable(host,server.host,'Ana','extended','variable');const room=await host.eval(`document.querySelector('.place-code').value`);
    await guest.goto(server.host);await guest.click('[data-ui="tab-join"]');
    await guest.waitFor(`document.querySelector('[data-open="${room}"]')?.textContent.includes('Ana’s table')`,{message:'The public table is not listed'});
    assert.match(await guest.text(`[data-open="${room}"]`),/1 \/ 6 seated · Extended island · 10 points/);assert.ok(await noOverflow(guest),'phone width');
    // Join submits the entry form with the typed name.
    await guest.type('#nickname','Bo');await guest.click(`[data-join="${room}"]`);await guest.waitFor(`document.querySelector('[data-command="ready"]')`);
    await host.waitFor(`document.querySelectorAll('.lobby-seat:not(.empty)').length===2`);
    // Back home, the table you sit at offers Resume instead of Join.
    await guest.click('[data-ui="home"]');await guest.click('[data-ui="tab-join"]');await guest.waitFor(`document.querySelector('[data-open="${room}"] [data-resume]')`);
    await third.goto(server.host);await third.click('[data-ui="tab-join"]');await third.waitFor(`document.querySelector('[data-open="${room}"] [data-join]')`);
    await host.select('[data-setting="public"]','false');await host.waitFor(`document.querySelector('[data-ui="settings"]').dataset.public==='false'`);
    await third.waitFor(`!document.querySelector('[data-open="${room}"]')`,{timeout:12000,message:'A private table is still listed'});
    assert.deepEqual([...host.errors,...guest.errors,...third.errors],[]);
  }finally{for(const p of [host,guest,third])await p?.close().catch(()=>{});await browser?.close();await server.stop();}
});
test('browser: choosing a colour in the lobby: free, from a bot, or by asking a person, and it lasts into the game',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    for(let i=0;i<3;i++)pages.push(await browser.newPage());const [host,guest,third]=pages;
    await createTable(host,server.host,'Host','base','variable');const room=await host.eval(`document.querySelector('input[aria-label="Invitation code"]').value`);
    await joinByInvite(guest,`${server.invite}/?room=${room}`,'Guest');await joinByInvite(third,`${server.invite}/?room=${room}`,'Third');
    const palette=await host.eval(`[...document.querySelectorAll('[data-ui="colors"] [data-color]')].map(e=>e.dataset.color)`);assert.equal(palette.length,6);
    for(const p of pages)assert.equal(await p.eval(`document.querySelectorAll('[data-ui="colors"]').length`),1,'only your own card has swatches');
    const seen=(p,seat,hex)=>p.waitFor(`document.querySelector('[data-seat="${seat}"]')?.dataset.seatColor==='${hex}'`,{message:`seat ${seat} is not ${hex}`}),everywhere=async(seat,hex)=>{for(const p of pages)await seen(p,seat,hex);},swatch=hex=>`[data-color="${hex}"]`;
    // Two people pick at the same moment: both land, whichever reaches the server second is retried.
    const [blue,red,orange,white,purple,green]=palette;
    await Promise.all([host.click(swatch(green)),guest.click(swatch(purple))]);await everywhere(0,green);await everywhere(1,purple);
    assert.equal(await host.eval(`document.querySelector('${swatch(green)}').dataset.state`),'mine');await host.click(swatch(green));
    assert.equal(await host.eval(`document.querySelector('${swatch(purple)}').dataset.state`),'person');
    // Asking a person: the two of them see it, it survives a reload, and it can be withdrawn, declined or accepted.
    await third.waitFor(`document.querySelector('${swatch(green)}')?.dataset.state==='person'`);await third.click(swatch(green));
    await third.waitFor(`document.querySelector('[data-ui="color-asked"]')?.textContent.includes('Asked Host for Green')`);
    await host.waitFor(`document.querySelector('[data-swap-accept]')`);assert.match(await host.text('[data-ui="color-ask"]'),/Third asks for your Green and offers Orange/);
    assert.equal(await guest.eval(`!!document.querySelector('[data-swap-accept],[data-ui="color-asked"]')`),false,'nobody else sees the question');
    await host.reload();await host.waitFor(`document.querySelector('[data-swap-accept]')`,{message:'The request did not survive a reload'});
    await third.click(swatch(green));await host.waitFor(`!document.querySelector('[data-swap-accept]')`,{message:'Withdrawing did not reach the other card'});await third.waitFor(`!document.querySelector('[data-ui="color-asked"]')`);
    await third.waitFor(`document.querySelector('${swatch(green)}')?.dataset.state==='person'`);await third.click(swatch(green));await host.waitFor(`document.querySelector('[data-swap-decline]')`);await host.click('[data-swap-decline]');
    await third.waitFor(`!document.querySelector('[data-ui="color-asked"]')`,{message:'Declining did not reach the asker'});await everywhere(0,green);await everywhere(2,orange);
    await third.waitFor(`document.querySelector('${swatch(green)}')?.dataset.state==='person'`);await third.click(swatch(green));await host.waitFor(`document.querySelector('[data-swap-accept]')`);await host.click('[data-swap-accept]');
    await everywhere(0,orange);await everywhere(2,green);await third.waitFor(`!document.querySelector('[data-ui="color-asked"]')`);
    // A bot gives up its colour at once and takes the one you left.
    await host.click('[data-command="addBot"]');await everywhere(3,blue);await host.waitFor(`document.querySelector('${swatch(blue)}')?.dataset.state==='bot'`);
    await host.click(swatch(blue));await everywhere(0,blue);await everywhere(3,orange);
    for(const p of pages){await p.click('[data-command="ready"]');await p.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('Not ready')`);}
    await guest.waitFor(`document.querySelector('${swatch(white)}')?.dataset.state==='free'`);await guest.click(swatch(white));await everywhere(1,white);assert.equal(await guest.eval(`document.querySelector('[data-seat="1"]').classList.contains('is-ready')`),true,'changing colour keeps you ready');
    await host.waitFor(`!document.querySelector('[data-command="start"]')?.disabled`);await host.click('[data-command="start"]');for(const p of pages)await p.waitFor(`document.querySelector('svg.board')`);
    assert.deepEqual(await guest.eval(`[...document.querySelectorAll('.player')].map(e=>e.style.getPropertyValue('--player'))`),[blue,white,green,orange],'the chosen colours are the game colours');
    assert.deepEqual(pages.flatMap(p=>p.errors),[]);
  }finally{for(const p of pages)await p.close().catch(()=>{});await browser?.close();await server.stop();}
});
