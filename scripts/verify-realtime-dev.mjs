import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PeerServer } from 'peer';
import { writeFile } from 'node:fs/promises';
const report={startedAt:new Date().toISOString(),passed:false,errors:[],checks:[]};
let server,browser;
try{
 await new Promise(resolve=>PeerServer({host:'127.0.0.1',port:0,path:'/peerjs'},s=>{server=s;resolve()}));
 const port=server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
 const pages=[];
 for(let i=0;i<4;i++){
  const context=await browser.newContext({viewport:{width:1360,height:1000}});
  await context.addInitScript(port=>window.AFTERLIGHT_NETWORK={host:'127.0.0.1',port,path:'/peerjs',secure:false,config:{iceServers:[]}},port);
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());pages.push(page);
 }
 await Promise.all(pages.map(p=>p.goto('http://localhost:5187',{waitUntil:'networkidle'})));
 for(let i=0;i<4;i++){await pages[i].waitForFunction(()=>window.afterlight?.route==='home');await pages[i].locator('[data-play="online"]').click();await pages[i].locator('#player-name').fill(`Realtime ${i}`)}
 const [host,guest,observer]=pages;
 await host.locator('#host').click();await host.waitForFunction(()=>window.afterlight?.route==='lobby');const code=await host.locator('#room-code').innerText();
 for(const page of pages.slice(1)){await page.locator('#join-code').fill(code);await page.locator('#join').click();await page.waitForFunction(()=>window.afterlight?.route==='lobby')}
 await Promise.all(pages.slice(1).map(page=>page.waitForFunction(()=>window.afterlight.network.meshConnections.size===2&&[...window.afterlight.network.meshConnections.values()].every(r=>r.conn.open),null,{timeout:15000})));
 report.checks.push('four browsers with two direct guest mesh links each');
 await host.locator('#start-online').click();await guest.waitForFunction(()=>window.afterlight.state?.phase==='board');
 const guestId=await guest.evaluate(()=>window.afterlight.network.id);
 await host.evaluate(async()=>{
  const {createGame}=await import('/src/minigames.js');const s=window.afterlight.state;s.phase='minigame';s.nextGame=20;s.countdown=0;s.game=createGame('rift-rumble',s.players,833);s.game.netId='realtime-qa-'+Date.now();
  for(const [i,p] of s.game.players.entries()){p.bot=false;p.x=250+i*145;p.y=430;p.ground=0;p.vx=0;p.vy=0;p.invuln=20}s.message='Realtime fixture';
 });
 await Promise.all(pages.map(page=>page.waitForFunction(()=>window.afterlight.renderedGame?.id==='rift-rumble'&&window.afterlight.prediction)));
 await guest.locator('#game-canvas').click({position:{x:10,y:10}});
 const baseline=await guest.evaluate(id=>window.afterlight.renderedGame.players.find(p=>p.id===id).x,guestId);
 await observer.evaluate(id=>{window.__direct=[];window.afterlight.network.meshConnections.get(id).conn.on('data',d=>{if(d.t==='input'&&(d.b&2))window.__direct.push(d)})},guestId);
 await guest.evaluate(()=>{
  const n=window.afterlight.network,c=n.hostConnection.conn,send=c.send,onState=n.onState;
  window.__queued=[];window.__restore=()=>{c.send=send;n.onState=onState};
  c.send=function(d,...a){const packet=typeof d==='string'?JSON.parse(d):d;if(packet.t!=='input')return send.call(c,d,...a);window.__queued.push({q:packet.q,b:packet.b,queuedAt:performance.now()});setTimeout(()=>send.call(c,d,...a),350)};
  n.onState=(...args)=>setTimeout(()=>onState(...args),350);
 });
 const started=Date.now();await guest.keyboard.down('ArrowRight');await guest.waitForTimeout(100);
 const [localX,hostX,remoteX,packets]=await Promise.all([
  guest.evaluate(id=>window.afterlight.renderedGame.players.find(p=>p.id===id).x,guestId),
  host.evaluate(id=>window.afterlight.state.game.players.find(p=>p.id===id).x,guestId),
  observer.evaluate(id=>window.afterlight.renderedGame.players.find(p=>p.id===id).x,guestId),
  observer.evaluate(()=>window.__direct)
 ]);
 report.latency={injectedInputMs:350,injectedSnapshotMs:350,observedAfterMs:Date.now()-started,baseline,localX,hostX,remoteX,directPackets:packets};
 assert.ok(report.latency.observedAfterMs<350);assert.ok(localX>baseline+1);assert.ok(Math.abs(hostX-baseline)<1);assert.ok(packets.length>0);
 report.checks.push('local rendered motion and direct mesh delivery before host receives delayed input');
 await guest.keyboard.up('ArrowRight');await guest.waitForTimeout(1800);
 const finalHost=await host.evaluate(id=>window.afterlight.state.game.players.find(p=>p.id===id).x,guestId),finalGuest=await guest.evaluate(id=>window.afterlight.renderedGame.players.find(p=>p.id===id).x,guestId);
 report.latency.finalHost=finalHost;report.latency.finalGuest=finalGuest;report.latency.finalError=Math.abs(finalHost-finalGuest);assert.ok(report.latency.finalError<15);
 await guest.evaluate(()=>window.__restore());
 report.checks.push('prediction reconciles to authority after delayed press and release');
 report.network=await host.evaluate(()=>({snapshots:window.afterlight.network.snapshotStats,inputs:window.afterlight.network.inputStats,acks:window.afterlight.network.inputAcks}));
 assert.equal(report.errors.length,0);report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=error.stack;console.error(error)}finally{report.finishedAt=new Date().toISOString();await writeFile(new URL('../verification/realtime-dev-report.json',import.meta.url),JSON.stringify(report,null,2));await browser?.close();server?.close();process.exit(report.passed?0:1)}
