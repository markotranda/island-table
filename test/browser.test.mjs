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
async function startServer(){
  const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;probe.close();await once(probe,'close');
  const dir=mkdtempSync(resolve('tmp','browser-test-')),child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,PUBLIC_ORIGIN:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
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
// Plays every setup placement by clicking the first highlighted target on whichever page has one.
async function playSetup(pages){
  for(let step=0;step<40;step++){
    for(const page of pages)if(await page.has('[data-command="roll"]'))return page;
    let placed=false;
    for(const page of pages)for(const target of ['[data-vertex]','[data-edge]'])if(!placed&&await page.has(target)){const before=await page.eval('document.querySelectorAll(".building,.road").length');await page.click(target);await page.waitFor(`document.querySelectorAll(".building,.road").length>${before}`);placed=true;}
    if(!placed)await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Setup did not finish');
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
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
async function seatTable(browser,server,count,setup){
  const pages=[];for(let i=0;i<count;i++)pages.push(await browser.newPage());
  await createTable(pages[0],server.host,'Seat 0',count>4?'extended':'base',setup);const room=await pages[0].eval('document.querySelector(\'input[aria-label="Invitation code"]\').value');
  for(let i=1;i<count;i++)await joinByInvite(pages[i],`${server.invite}/?room=${room}`,`Seat ${i}`);
  for(const page of pages){await page.click('[data-command="ready"]');await page.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('Not ready')`);}
  await pages[0].click('[data-command="start"]');for(const page of pages)await page.waitFor(`document.querySelector('svg.board')`);
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
  for(const page of pages){await page.reload();await page.waitFor(`document.querySelector('svg.board')`);}
  return result;
}

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
    assert.match(await phaseLabel(host),/FOUNDATIONS/);
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

test('browser: phone-width home and lobby fit without horizontal scrolling',{skip,timeout:60000},async()=>{
  const server=await startServer(),browser=await launch();let page;
  try{
    page=await browser.newPage({width:375,height:812});
    await page.goto(server.host);assert.ok(await noOverflow(page),'home');
    await createTable(page,server.host,'Solo','base','fixed');assert.ok(await noOverflow(page),'lobby');
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
    assert.ok(!await A.has('#discard')&&!await C.has('#discard'),'only players over seven discard');
    assert.ok(!await A.has('[data-hex]'),'the robber waits for discards');
    await fill(B,'discard',{'discard-wood':1});await submit(B,'discard');await toastIncludes(B,'exactly 4');
    await fill(B,'discard',{'discard-wood':2,'discard-brick':2});await submit(B,'discard');await B.waitFor(`!document.querySelector('#discard')`);
    assert.deepEqual(await hand(B),{wood:0,brick:0,wool:2,wheat:2,ore:1});
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
    assert.equal(await C.eval(`document.querySelectorAll('[data-placed]').length`),0);
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
