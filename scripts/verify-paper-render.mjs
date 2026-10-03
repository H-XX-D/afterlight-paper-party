import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'verification','paper-world');await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),method:'Real Chrome canvas draws through the production drawGame/art helper path. Four-player deterministic fixtures evolve for 4 seconds; fishing also includes two hooked actors to inspect both dial and reeling states. Every frame is checked for simulation immutability; actual generated atlas helpers are required. Screenshots are visual QA evidence, not end-to-end gameplay claims.',checks:[],pageErrors:[],screenshots:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto(process.env.AFTERLIGHT_URL||'http://localhost:5187');
 await page.waitForFunction(()=>window.afterlight?.minigames?.length===24);
 const setup=await page.evaluate(async()=>{
  const games=await import('/src/minigames.js'),art=await import('/src/art.js');
  for(const name of ['object','platform','fx'])if(typeof art.helpers[name]!=='function')throw new Error(`Generated ${name} helper not ready`);
  await art.loadArt();
  const canvas=document.createElement('canvas');canvas.id='paper-render-check';canvas.width=960;canvas.height=540;Object.assign(canvas.style,{position:'fixed',top:'0',left:'0',width:'960px',height:'540px',zIndex:'99999'});document.body.append(canvas);
  window.__paperQA={games,art,canvas,ctx:canvas.getContext('2d'),players:['Pip','Moth','Bolt','Wisp'].map((name,i)=>({id:'qa-'+i,name,character:i,bot:true}))};
  return {ids:games.MINIGAMES.filter(game=>games.MINIGAME_REALMS[game.id]).map(game=>game.id),assets:Object.keys(art.art)};
 });report.assets=setup.assets;
 for(const name of ['paper-platforms','paper-objects','pixel-fx'])assert.ok(setup.assets.includes(name),`${name} generated artwork loaded`);
 for(const id of setup.ids){
  const details=await page.evaluate(id=>{
   const q=window.__paperQA,game=q.games.createGame(id,q.players,143);for(let n=0;n<240;n++)q.games.stepGame(game,{},1/60);
   if(id==='fishing')for(const [i,p]of game.players.entries()){p.hooked=i>=2;p.reel=.57;p.tension=i===3?.82:.36;p.fight=i%2?1:-1;}
   if(id==='balance')for(const [i,p]of game.players.entries())p.lean=[-.48,.13,.39,-.24][i];
   const before=JSON.stringify(game),calls={object:0,platform:0,fx:0,character:0,prop:0},helpers={...q.art.helpers};
   for(const name of Object.keys(calls)){const original=helpers[name];helpers[name]=(...args)=>{calls[name]++;return original(...args);};}
   q.games.drawGame(q.ctx,game,helpers);if(before!==JSON.stringify(game))throw new Error(id+' render changed authoritative state');
   const first=q.canvas.toDataURL();game.time+=.18;q.games.drawGame(q.ctx,game,helpers);const second=q.canvas.toDataURL();
   q.game=game;return {calls,animated:first!==second,time:game.time,players:game.players.length};
  },id);
  assert.ok(details.animated,`${id} animates between frames`);assert.ok(details.calls.object+details.calls.platform>0,`${id} uses generated paper scenery`);assert.equal(details.players,4);
  const name=`${id}.png`;await page.locator('#paper-render-check').screenshot({path:path.join(out,name)});report.screenshots.push(name);report.checks.push({id,passed:true,...details});console.log('PASS',id,JSON.stringify(details.calls));
 }
 assert.equal(report.pageErrors.length,0,'No renderer errors');report.passed=true;
}catch(error){report.passed=false;report.error=error.stack||error.message;process.exitCode=1;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('Report:',path.join(out,'report.json'));}
