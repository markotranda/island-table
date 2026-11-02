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

async function createTable(page,base,name,count,setup){
  await page.goto(base);await page.type('#nickname',name);await page.select('#count',String(count));await page.select('#setup',setup);
  await page.click('#entry button.primary');await page.waitFor(`document.querySelector('[data-command="ready"]')`);
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
  await createTable(pages[0],server.host,'Seat 0',count,setup);const room=await pages[0].eval('document.querySelector(\'input[aria-label="Invitation code"]\').value');
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
    await createTable(host,server.host,'Host',3,'variable');
    await host.click('[data-ui="invite"]');
    const link=await host.waitFor('window.__copied.at(-1)');const room=await host.eval('document.querySelector(\'input[aria-label="Invitation code"]\').value');
    assert.equal(link,`${server.invite}/?room=${room}`,'invites use the advertised address, not localhost');

    await joinByInvite(ana,link,'Ana');await joinByInvite(ben,link,'Ben');
    await host.waitFor(`!document.body.textContent.includes('Waiting for a friend')`,{message:'Lobby did not show joined players live'});
    assert.match(await host.text(),/Ana[\s\S]*Ben/);
    assert.ok(await host.eval(`document.querySelector('[data-command="start"]').disabled`),'start waits for everyone to be ready');
    // The recovery key is offered in the lobby; Ben uses it on a new device mid-game below.
    await ben.click('[data-ui="seat"]');await ben.click('[data-ui="copy-seat"]');const key=await ben.waitFor('window.__copied.at(-1)');await ben.click('[data-ui="close"]');
    // Everyone readies at once: conflicting revisions must resolve without asking anyone to click again.
    await Promise.all(pages.map(page=>page.click('[data-command="ready"]')));
    await host.waitFor(`!document.querySelector('[data-command="start"]').disabled`,{message:'Simultaneous ready clicks were not all accepted'});
    for(const page of pages)assert.doesNotMatch(await page.text('#toast'),/try again/);
    await host.click('[data-command="start"]');
    for(const page of pages)await page.waitFor(`document.querySelector('svg.board')`,{message:'Game did not start on every screen'});
    assert.match(await phaseLabel(host),/FOUNDATIONS/);

    let active=await playSetup(pages);
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
    await createTable(page,server.host,'Solo',4,'fixed');assert.ok(await noOverflow(page),'lobby');
    await page.click('[data-ui="invite"]');
    assert.match(await page.waitFor('window.__copied.at(-1)'),new RegExp(`^${server.invite.replace(/[.]/g,'\\.')}/\\?room=[a-f0-9]{12}$`));
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

    await stage(server,pages,(g,{setHand,deal,topDeck})=>{assert.equal(g.phase,'action');
      setHand(a,{wood:5,wool:1,wheat:2,ore:2});setHand(b,{brick:2,wool:2});setHand(c,{wool:3,ore:1});
      deal(a,'monopoly');deal(b,'invention');deal(c,'roads');deal(c,'vp');topDeck('knight');});
    assert.equal(await scoreOf(C,c),await scoreOf(A,c)+1,'a hidden Victory Point counts only on its owner’s screen');
    assert.ok(await C.eval(`${cardButton('Victory Point')}.disabled`),'Victory Point cards cannot be played');

    // Two players post offers at the same moment: both reach the active player live, and cancelling one must leave the other.
    await openPanel(B,'trade','trade');await fill(B,'trade',{'give-brick':1,'want-wood':1});
    await openPanel(C,'trade','trade');await fill(C,'trade',{'give-wool':1,'want-ore':1});
    // Submit both forms in the same instant through the app's own handler: a mouse click can miss when the other offer arrives and shifts the layout mid-click.
    await Promise.all([B,C].map(page=>page.eval(`document.getElementById('trade').requestSubmit()`)));
    for(const page of [B,C])assert.doesNotMatch(await page.text('#toast'),/try again/);
    await A.waitFor(`document.querySelectorAll('.offer').length===2`,{message:'Offers did not reach the active player'});
    // Arrival order is up to the race, so cancel C's offer by its text rather than its position.
    const cancelC=await A.eval(`[...document.querySelectorAll('.offer')].find(o=>o.textContent.includes('Seat ${c} offers')).querySelector('[data-cancel]').dataset.cancel`);
    await A.click(`[data-cancel="${cancelC}"]`);await A.waitFor(`document.querySelectorAll('.offer').length<2`);await pause(300);
    assert.equal(await A.eval(`document.querySelectorAll('.offer').length`),1,'cancelling one offer leaves the others');
    assert.match(await A.text('.offer'),new RegExp(`Seat ${b} offers 1 brick`));
    await A.click('.offer [data-accept]');await A.waitFor(`!document.querySelector('.offer')`);
    assert.deepEqual(await hand(A),{wood:4,brick:1,wool:1,wheat:2,ore:2});
    await B.waitFor(`[...document.querySelectorAll('.resource-card b')].map(b=>b.textContent).join()==='1,1,2,0,0'`,{message:'Accepted trade did not update the other hand'});
    await C.waitFor(`document.querySelector('.log-list').textContent.includes('traded with')`);
    await openPanel(B,'trade','trade');await fill(B,'trade',{'want-ore':1});await submit(B,'trade');await toastIncludes(B,'gifts are not allowed');

    await openPanel(A,'bank','bank');const ratio=Number((await A.text('#bank select[name="give"] option[value="wood"]')).match(/\d+/)[0]);
    await fill(A,'bank',{give:'wood',want:'ore'});await submit(A,'bank');
    await A.waitFor(`document.querySelectorAll('.resource-card b')[4].textContent==='3'`,{message:'Bank trade did not complete'});
    assert.deepEqual(await hand(A),{wood:4-ratio,brick:1,wool:1,wheat:2,ore:3});

    // A newly bought card waits a turn; Monopoly collects every opponent's wool.
    await A.click('[data-command="buyCard"]');await A.waitFor(`${cardButton('Knight')}?.textContent.includes('new')`);
    assert.ok(await A.eval(`${cardButton('Knight')}.disabled`),'a card bought this turn cannot be played');
    await clickCard(A,'Monopoly');await A.click('[data-monopoly="wool"]');
    await A.waitFor(`document.querySelectorAll('.resource-card b')[2].textContent==='5'`,{message:'Monopoly did not collect wool'});
    assert.equal((await hand(B)).wool,0);assert.equal((await hand(C)).wool,0);
    await A.click('[data-command="end"]');

    // Invention before rolling takes two resources from the supply.
    assert.equal(await waitActive(pages,A),B);const before=await hand(B);
    await clickCard(B,'Invention');await fill(B,'invention',{'take-ore':1,'take-wheat':1});await submit(B,'invention');await B.waitFor(`!document.querySelector('#invention')`);
    assert.deepEqual(await hand(B),{...before,ore:before.ore+1,wheat:before.wheat+1});
    await playTurn(pages,B);

    // Road Building places two free roads, then the turn resumes before the roll.
    assert.equal(await waitActive(pages,B),C);const roads=await C.eval(`document.querySelectorAll('.road').length`);
    await clickCard(C,'Road Building');
    for(const n of [1,2]){await C.click('[data-edge]');await C.waitFor(`document.querySelectorAll('.road').length===${roads+n}`);}
    await C.waitFor(`document.querySelector('[data-command="roll"]')`,{message:'Road Building did not return to the roll'});
    await playTurn(pages,C);

    // Last turn's Knight is now playable: it moves the robber and counts toward Largest Army.
    assert.equal(await waitActive(pages,C),A);await clickCard(A,'Knight');
    await A.click('[data-hex]');await A.waitFor(`!document.querySelector('[data-hex]')`);
    if(await A.has('[data-victim]'))await A.click('[data-victim]');
    await A.waitFor(`document.querySelector('[data-command="roll"]')`,{message:'Knight did not return to the roll'});
    assert.match(await A.eval(`document.querySelectorAll('.sidebar .player')[${a}].textContent`),/⚑ 1/);
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
    assert.match(await other.text('.winner'),new RegExp(`Seat ${a}!`));
    assert.equal(await scoreOf(other,a),10,'hidden points are revealed at the end');
    assert.ok(!await pages[1].has('[data-command="rematch"]'),'only the host can start a rematch');
    await pages[0].click('[data-command="rematch"]');
    for(const page of pages)await page.waitFor(`document.querySelector('[data-command="ready"]')?.textContent.includes('ready ✓')`,{message:'Rematch did not return everyone to the lobby'});
    assert.match(await pages[2].text(),/Seat 0[\s\S]*Seat 1[\s\S]*Seat 2/);
    for(const page of pages)assert.deepEqual(page.errors,[],'no uncaught page errors');
  }finally{for(const page of pages)await page.close().catch(()=>{});await browser?.close();await server.stop();}
});

test('browser: five players use paired turns and neutral fixed settlements',{skip,timeout:120000},async()=>{
  const server=await startServer(),browser=await launch();let pages=[];
  try{
    pages=await seatTable(browser,server,5,'fixed');
    assert.equal(await pages[0].eval(`document.querySelectorAll('.building[fill="#727c6a"]').length`),2,'the unused colour leaves two neutral settlements');
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
