import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {launch,browserPath} from './browser.mjs';
mkdirSync('tmp',{recursive:true});

// Hosts browse at localhost while PUBLIC_ORIGIN advertises 127.0.0.1, so friends arrive from a different origin, as they do over a LAN.
async function startServer(){
  const probe=createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;probe.close();await once(probe,'close');
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:mkdtempSync(resolve('tmp','browser-test-')),PUBLIC_ORIGIN:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
  await new Promise((ok,fail)=>{let text='';const timer=setTimeout(()=>fail(new Error('Server did not start')),10000);child.stdout.on('data',d=>{text+=d;if(/ready at/.test(text)){clearTimeout(timer);ok();}});child.on('exit',code=>{clearTimeout(timer);fail(new Error('Server exit '+code));});});
  return {host:`http://localhost:${port}`,invite:`http://127.0.0.1:${port}`,async stop(){const exited=once(child,'exit');child.kill();await exited;}};
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
// Rolls, resolves a possible seven, and ends the turn.
async function playTurn(page){
  await page.click('[data-command="roll"]');
  for(let step=0;step<20&&!await page.has('[data-command="end"]');step++){
    const target=await page.has('[data-hex]')?'[data-hex]':await page.has('[data-victim]')?'[data-victim]':null;
    if(target){await page.click(target);await page.waitFor(`!document.querySelector('${target}')`);}
    else await new Promise(r=>setTimeout(r,100));
  }
  await page.click('[data-command="end"]');
}

test('browser: invite, lobby, live setup, turns, reload and seat recovery',{skip:!browserPath&&'No Chrome, Chromium or Edge found (set BROWSER)',timeout:120000},async()=>{
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
      const label=await phaseLabel(active);await playTurn(active);
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

test('browser: phone-width home and lobby fit without horizontal scrolling',{skip:!browserPath&&'No Chrome, Chromium or Edge found (set BROWSER)',timeout:60000},async()=>{
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
