import {chromium} from 'playwright';
import {readFile,copyFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'AFTERLIGHT.html');
const bytes=await readFile(file);
const directory=await mkdtemp(path.join(tmpdir(),'afterlight-performance-'));
await copyFile(file,path.join(directory,'AFTERLIGHT.html'));
const label=(process.env.AFTERLIGHT_PERFORMANCE_LABEL||'final').replace(/[^a-z0-9-]/g,'')||'final';
const warmupFrames=30,measuredFrames=180;
// Late courses are reached through the production simulator, not fabricated object arrays.
// Even 210 frames at the app's maximum .05s timestep leave the timed games unfinished.
const scenes=[
  {index:0,id:'inkfall',character:0,preRoll:0},
  {index:20,id:'rift-rumble',character:4,preRoll:0},
  {index:10,id:'hollow-horde',character:4,preRoll:32},
  {index:17,id:'bellows-boxing',character:4,preRoll:15},
  {index:15,id:'gullet-gala',character:4,preRoll:29},
  {index:18,id:'colossus-wake',character:4,preRoll:3},
];
const report={
  startedAt:new Date().toISOString(),label,
  sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
  viewport:{width:1280,height:900},warmupFrames,measuredFrames,
  method:'One headless Chrome file:// page, offline, default CPU rate, 30 warm-up frames then 180 measured rAF intervals per scene. Board runs four bots. All minigame actors are bots; Inkfall uses characters 0–3 and combat/feast scenes use Rook, Briar, Vellum and Nix (4–7). Later courses are advanced through the production fixed-step simulator before warm-up. Warm-up and first measured second are reported separately. Samples must remain in live gameplay. Long Tasks API records work over 50ms. These short same-machine workloads do not establish a universal worst case or performance on other hardware.',
  pageErrors:[],scenes:[],
};
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
  report.browserVersion=browser.version();
  const context=await browser.newContext({offline:true,viewport:report.viewport});
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  const startupStarted=performance.now();
  await page.goto(pathToFileURL(path.join(directory,'AFTERLIGHT.html')).href);
  await page.waitForFunction(()=>window.afterlight?.minigames?.length===24);
  report.startupMs=performance.now()-startupStarted;
  report.startupHeap=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null);

  async function sample(name,expectedPhase,setup={}){
    const result=await page.evaluate(async({expectedPhase,expectedGame,warmupFrames,measuredFrames})=>{
      const app=window.afterlight;
      const snapshot=()=>{
        const state=app.state,g=state?.game;
        return {phase:state?.phase,boardStage:state?.boardStage,game:g?.id??null,time:g?.time??null,duration:g?.duration??null,done:g?.done??false,clock:state?.clock,turnsCompleted:state?.turnsCompleted,
          course:g?.state?.course??null,wave:g?.state?.objective?.wave??null,
          players:(g?.players||state?.players||[]).map(p=>({id:p.id,character:p.character,bot:p.bot,score:p.score??p.sparks,specialUses:p.specialUses??null,bites:p.bites??null,caught:p.caught??null}))};
      };
      const start=snapshot(),longTasks=[],times=[],warmupTimes=[];
      const peaks={objects:0,effects:0,foes:0};
      const phaseViolations=[];
      function check(frame){
        const s=app.state,g=s?.game;
        if(s?.phase!==expectedPhase||(expectedGame&&(g?.id!==expectedGame||g?.done||s.countdown>0))){
          if(phaseViolations.length<5)phaseViolations.push({frame,phase:s?.phase,game:g?.id,done:g?.done,countdown:s?.countdown});
        }
        peaks.objects=Math.max(peaks.objects,g?.state?.objects?.length||0);
        peaks.effects=Math.max(peaks.effects,g?.state?.effects?.length||g?.state?.particles?.length||0);
        peaks.foes=Math.max(peaks.foes,g?.state?.objective?.foes?.length||0);
      }
      function stats(values){
        const sorted=[...values].sort((a,b)=>a-b),elapsed=values.reduce((a,b)=>a+b,0);
        const percentile=q=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]??null;
        return {frames:values.length,elapsedMs:elapsed,averageFPS:elapsed?values.length/elapsed*1000:null,frameMs:{median:percentile(.5),p80:percentile(.8),p95:percentile(.95),max:sorted.at(-1)??null,over25:values.filter(t=>t>25).length,over50:values.filter(t=>t>50).length}};
      }
      let observer,longTasksSupported=false;
      try{observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({startTime:e.startTime,duration:e.duration}))));observer.observe({type:'longtask',buffered:false});longTasksSupported=true;}catch{}
      const warmupStarted=performance.now();
      let previous=await new Promise(requestAnimationFrame);
      check('start');
      for(let n=0;n<warmupFrames;n++){
        const now=await new Promise(requestAnimationFrame);warmupTimes.push(now-previous);previous=now;check(`warmup-${n}`);
      }
      const afterWarmup=snapshot(),measuredStarted=performance.now();
      for(let n=0;n<measuredFrames;n++){
        const now=await new Promise(requestAnimationFrame);times.push(now-previous);previous=now;check(n);
      }
      const measuredEnded=performance.now(),end=snapshot();
      // Let the observer deliver the final frame's entry before disconnecting.
      await new Promise(resolve=>setTimeout(resolve,0));observer?.disconnect();
      const taskStats=(from,to)=>{
        const selected=longTasks.filter(task=>task.startTime>=from&&task.startTime<to).map(task=>task.duration);
        return {supported:longTasksSupported,count:selected.length,totalMs:selected.reduce((a,b)=>a+b,0),maxMs:Math.max(0,...selected)};
      };
      let firstSecondCount=0,firstSecondMs=0;
      while(firstSecondCount<times.length&&firstSecondMs<1000)firstSecondMs+=times[firstSecondCount++];
      const specialUseDelta=end.players.reduce((sum,p)=>sum+(p.specialUses??0)-(afterWarmup.players.find(q=>q.id===p.id)?.specialUses??0),0);
      return {...stats(times),warmup:{...stats(warmupTimes),longTasks:taskStats(warmupStarted,measuredStarted)},firstMeasuredSecond:stats(times.slice(0,firstSecondCount)),longTasks:taskStats(measuredStarted,measuredEnded),
        valid:phaseViolations.length===0,phaseViolations,start,afterWarmup,end,entityPeaks:peaks,specialUseDelta,
        game:end.game,phase:end.phase,webgl:app.paperWorld,materials:app.materials.stats,prediction:app.prediction?.stats??null};
    },{expectedPhase,expectedGame:expectedPhase==='minigame'?name:null,warmupFrames,measuredFrames});
    report.scenes.push({name,setup,...result});
    console.log(name,JSON.stringify(result));
    if(!result.valid)throw new Error(`${name}: benchmark left live gameplay; see phaseViolations`);
  }

  await page.locator('[data-play="solo"]').first().click();
  await page.locator('[data-character="0"]').click();
  await page.locator('#start-solo').click();
  await page.evaluate(()=>{for(const player of window.afterlight.state.players)player.bot=true;});
  await sample('moving-card-board','board',{characters:[0,1,2,3],allBots:true});
  for(const scene of scenes){
    await page.locator('#match-menu').click();await page.locator('#quit').click();
    await page.locator('[data-nav="arcade"]').first().click();
    const actualId=await page.evaluate(index=>window.afterlight.minigames[index]?.id,scene.index);
    if(actualId!==scene.id)throw new Error(`Arcade slot ${scene.index} is ${actualId}, expected ${scene.id}`);
    await page.locator(`[data-practice="${scene.index}"]`).click();
    await page.locator(`[data-character="${scene.character}"]`).click();
    await page.locator('#start-solo').click();await page.locator('#begin-minigame').click();
    await page.waitForFunction(()=>window.afterlight.state?.phase==='minigame'&&window.afterlight.state.game);
    await page.evaluate(()=>{
      const state=window.afterlight.state;state.countdown=0;
      for(const player of state.game.players)player.bot=true;
    });
    await page.waitForFunction(()=>window.afterlight.prediction?.game===window.afterlight.state.game);
    const preparation=await page.evaluate(({character,preRoll})=>{
      const app=window.afterlight,g=app.state.game;
      const characters=g.players.map(player=>player.character);
      if(characters.some((value,index)=>value!==(character+index)%8))throw new Error('Unexpected benchmark traveler roster: '+characters);
      const target=Math.max(g.time,preRoll);
      for(let frame=0;g.time+1/60<=target+1e-7&&frame<2400;frame++)app.prediction.advance(1/60);
      if(g.done||app.state.phase!=='minigame')throw new Error('Benchmark preparation reached a completed game');
      return {characters,allBots:g.players.every(player=>player.bot),preRollTarget:preRoll,preparedGameTime:g.time,preRollMethod:'production RealtimeGame.advance(1/60)'};
    },scene);
    await sample(scene.id,'minigame',preparation);
  }
  if(report.pageErrors.length)throw new Error(`Browser errors: ${report.pageErrors.join('; ')}`);
}catch(error){report.failure=error.stack||error.message;process.exitCode=1;}
finally{
  await browser?.close();
  report.finishedAt=new Date().toISOString();
  await mkdir(path.join(root,'verification'),{recursive:true});
  if(label==='final'){
    try{
      const before=JSON.parse(await readFile(path.join(root,'verification/performance-baseline.json'),'utf8'));
      const number=value=>Number.isFinite(value)?value.toFixed(2):'—';
      const lines=['# AFTERLIGHT same-machine performance comparison','',report.method,'',`Baseline SHA-256: ${before.sha256}`,`Final SHA-256: ${report.sha256}`,'',`Startup to ready: baseline ${number(before.startupMs)} ms; final ${number(report.startupMs)} ms.`,'',
        'These are observed samples, not a controlled speedup claim. The expanded benchmark changes characters, bot activity and scene phases; older scenes without matching workloads are context only. New scenes have no historical baseline.','','| Scene | Historical FPS | Current FPS | Current p80 frame | Historical p95 frame | Current p95 frame | Current long tasks | Live sample |','|---|---:|---:|---:|---:|---:|---:|---|'];
      for(const scene of report.scenes){
        const prior=before.scenes.find(candidate=>candidate.name===scene.name);
        lines.push(`| ${scene.name} | ${number(prior?.averageFPS)} | ${number(scene.averageFPS)} | ${number(scene.frameMs.p80)} ms | ${number(prior?.frameMs.p95)} ms | ${number(scene.frameMs.p95)} ms | ${scene.longTasks.count} | ${scene.valid?'yes':'INVALID'} |`);
      }
      lines.push('','Warm-up intervals, first measured second, roster, simulation time, entity peaks, specials and phase checks are in the JSON report. Frame rate and WebRTC response latency are different measurements; this offline run does not test network latency.',
        ...(report.failure?['',`Run failed: ${report.failure.split('\n')[0]}`]:[]),'','WebGL data:',...report.scenes.map(s=>`- ${s.name}: available=${s.webgl?.available}, ${s.webgl?.calls} draw calls, ${s.webgl?.triangles} triangles, ${s.webgl?.geometries} geometries, ${s.webgl?.textures} textures.`),'');
      await writeFile(path.join(root,'verification/performance-comparison.md'),lines.join('\n'));
    }catch(error){report.comparisonWarning=error.message;}
  }
  await writeFile(path.join(root,'verification',`performance-${label}.json`),JSON.stringify(report,null,2));
  await rm(directory,{recursive:true,force:true});
  console.log('Report',`performance-${label}.json`);
}
