// Minimal Chrome DevTools Protocol driver over Node's built-in WebSocket, so browser tests need no dependencies.
// Uses BROWSER if set, else an installed Chrome, Chromium or Edge. Returns null when none is available.
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const candidates=[process.env.BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/microsoft-edge'];
export const browserPath=candidates.find(p=>p&&existsSync(p))||null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export async function launch(){
  if(!browserPath)return null;
  mkdirSync('tmp',{recursive:true});const dir=mkdtempSync(resolve('tmp','browser-'));
  // Edge's launcher can hand off to another process and exit at once, so find the endpoint through the profile's DevToolsActivePort file rather than stderr, and never hold pipes to the child.
  const child=spawn(browserPath,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${dir}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--disable-sync','--no-startup-window','about:blank'],{stdio:'ignore'});child.unref();child.on('error',()=>{});
  const portFile=resolve(dir,'DevToolsActivePort');let endpoint;
  for(const end=Date.now()+20000;!endpoint&&Date.now()<end;await wait(50))try{const [port,path]=readFileSync(portFile,'utf8').trim().split('\n');if(port&&path)endpoint=`ws://127.0.0.1:${port}${path}`;}catch{}
  if(!endpoint){child.kill();throw new Error('Browser did not start');}
  const socket=new WebSocket(endpoint);await new Promise((ok,fail)=>{socket.onopen=ok;socket.onerror=fail;});
  let next=0;const pending=new Map(),listeners=new Set();
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id&&pending.has(m.id)){const {ok,fail}=pending.get(m.id);pending.delete(m.id);m.error?fail(new Error(m.error.message)):ok(m.result);}else for(const l of listeners)l(m);};
  const send=(method,params={},sessionId)=>new Promise((ok,fail)=>{const id=++next;pending.set(id,{ok,fail});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  async function close(){const closed=new Promise(r=>{socket.onclose=r;setTimeout(r,5000);});send('Browser.close').catch(()=>{});await closed;child.kill();for(let i=0;i<20;i++){try{rmSync(dir,{recursive:true,force:true});break;}catch{await wait(100);}}}

  // Each page gets its own browser context: separate localStorage and cookies, like a separate device.
  async function newPage({width=1280,height=900}={}){
    const {browserContextId}=await send('Target.createBrowserContext',{disposeOnDetach:true});
    const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const cmd=(method,params)=>send(method,params,sessionId),errors=[],loads=[];
    listeners.add(m=>{if(m.sessionId!==sessionId)return;if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Page.loadEventFired')loads.splice(0).forEach(r=>r());});
    await cmd('Page.enable');await cmd('Runtime.enable');
    if(process.env.THROTTLE)await cmd('Emulation.setCPUThrottlingRate',{rate:Number(process.env.THROTTLE)});
    await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
    // Record clipboard writes; the system clipboard is shared between contexts and unavailable headless.
    await cmd('Page.addScriptToEvaluateOnNewDocument',{source:'window.__copied=[];Object.defineProperty(navigator,"clipboard",{value:{writeText:async t=>{window.__copied.push(t)}}});'});
    const page={errors,
      async eval(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},
      async goto(url){const loaded=new Promise(r=>loads.push(r));await cmd('Page.navigate',{url});await loaded;},
      async reload(){const loaded=new Promise(r=>loads.push(r));await cmd('Page.reload');await loaded;},
      async waitFor(expression,{timeout=10000,message}={}){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await page.eval(expression);if(last)return last;}catch{}await wait(50);}throw new Error(message||`Timed out waiting for ${expression}`);},
      has:selector=>page.eval(`!!document.querySelector(${JSON.stringify(selector)})`),
      text:(selector='body')=>page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`),
      // Real mouse input at the element's centre, after scrolling it into view.
      async click(selector){
        const box=await page.waitFor(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return r.width||r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`,{message:`No clickable ${selector}`});
        for(const type of ['mousePressed','mouseReleased'])await cmd('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
      },
      async type(selector,text){await page.waitFor(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.focus();e.select?.();return true;})()`);await cmd('Input.insertText',{text});},
      select:(selector,value)=>page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return e.value;})()`),
      close:()=>send('Target.disposeBrowserContext',{browserContextId}),
    };
    return page;
  }
  return {newPage,close};
}
