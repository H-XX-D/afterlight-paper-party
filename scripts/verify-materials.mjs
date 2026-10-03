import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'verification','materials');
const baseline=process.argv.includes('--baseline');
const developmentURL=process.env.AFTERLIGHT_URL;
const label=baseline?'baseline':developmentURL?'development':'final';
const materialsOnly=process.argv.includes('--materials-only');
const videoOnly=process.argv.includes('--video-only');
const performanceOnly=process.argv.includes('--performance-only');
const surfacesOnly=process.argv.includes('--surfaces-only');
const source=process.env.AFTERLIGHT_FILE||path.join(root,'AFTERLIGHT.html');
const bytes=await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex');
const isolated=await mkdtemp(path.join(tmpdir(),'afterlight-materials-'));
await mkdir(out,{recursive:true});await copyFile(source,path.join(isolated,'AFTERLIGHT.html'));
const report={startedAt:new Date().toISOString(),label,source:developmentURL||source,sha256:developmentURL?null:sha256,bytes:developmentURL?null:bytes.length,isolatedDirectory:developmentURL?null:isolated,
 method:'Exact standalone copied alone and opened offline through file://. Performance launches the same 20 UI games from saved initial simulation fixtures, warms 30 frames, then samples 180 rAF intervals at 1280×900. Material A/B tests hold simulation, animation time and character spring history fixed, measure repeat-render noise, then toggle each actual production feature independently.',
 limitations:['Same-machine headless Chrome samples are not physical mobile or low-end-device benchmarks.','Saved deterministic simulation fixtures and accelerated timers make this an audit, not 20 naturally timed complete matches.','Pixel differences prove a feature changes the rendered output, not artistic quality; screenshots require visual review.'],pageErrors:[],consoleErrors:[],consoleWarnings:[],failedRequests:[],externalRequests:[],performance:[],materials:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
const context=await browser.newContext({offline:!developmentURL,viewport:{width:1280,height:900}});
const page=await context.newPage();report.browserVersion=browser.version();
page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());if(m.type()==='warning')report.consoleWarnings.push(m.text());});
page.on('requestfailed',r=>report.failedRequests.push({url:r.url().split('?')[0],error:r.failure()?.errorText}));
const url=developmentURL||pathToFileURL(path.join(isolated,'AFTERLIGHT.html')).href;
page.on('request',r=>{if(!developmentURL&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:')&&r.url()!==url)report.externalRequests.push(r.url());});
if(developmentURL)report.method='Development URL audit through the production fixed-frame renderer. This does not verify the portable artifact. '+report.method.slice(report.method.indexOf('Performance launches'));

async function launch(index){
 await page.locator(`[data-practice="${index}"]`).click();await page.locator('[data-character="0"]').click();await page.locator('#player-name').fill('Material QA');await page.locator('#start-solo').click();await page.locator('#begin-minigame').click();
 await page.waitForFunction(()=>window.afterlight.state?.phase==='minigame'&&window.afterlight.state.game);
}
async function samplePerformance(){
 return page.evaluate(async()=>{
  for(let n=0;n<30;n++)await new Promise(requestAnimationFrame);
  const longTasks=[];let observer;try{observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask',buffered:false});}catch{}
  const intervals=[];let previous=await new Promise(requestAnimationFrame);const start=performance.now();
  for(let n=0;n<180;n++){const now=await new Promise(requestAnimationFrame);intervals.push(now-previous);previous=now;}
  const elapsedMs=performance.now()-start;observer?.disconnect();const sorted=[...intervals].sort((a,b)=>a-b);
  return {frames:180,elapsedMs,averageFPS:180/elapsedMs*1000,frameMs:{median:sorted[90],p95:sorted[171],max:sorted.at(-1),over25:intervals.filter(n=>n>25).length,over50:intervals.filter(n=>n>50).length},longTasks:{count:longTasks.length,totalMs:longTasks.reduce((a,b)=>a+b,0)},webgl:window.afterlight.paperWorld,materials:window.afterlight.materials?.stats??null};
 });
}
async function performanceAll20(){
 const fixtures=baseline?[]:JSON.parse(await readFile(path.join(out,'performance-fixtures.json'),'utf8'));
 await page.locator('[data-nav="arcade"]').first().click();
 for(let index=0;index<20;index++){
  await launch(index);
  if(baseline){fixtures.push(await page.evaluate(index=>{const g=window.afterlight.state.game;g.time=0;g.netId='material-performance-'+index;for(const p of g.players)p.bot=true;return JSON.parse(JSON.stringify(g));},index));}
  await page.evaluate(game=>{window.afterlight.state.game=structuredClone(game);window.afterlight.state.countdown=0;},fixtures[index]);
  const details=await samplePerformance();report.performance.push({id:fixtures[index].id,...details});console.log('PERFORMANCE',label,fixtures[index].id,details.averageFPS.toFixed(2),details.frameMs.p95.toFixed(2));
  await page.evaluate(()=>{const s=window.afterlight.state;s.game.time=s.game.duration;});await page.locator('#arcade-back').click();
 }
 if(baseline)await writeFile(path.join(out,'performance-fixtures.json'),JSON.stringify(fixtures,null,2));
}

async function verifyMaterials(){
 // The renderer contract is added by the production renderer owner. Fail closed
 // until it is available, instead of using counters as a substitute for A/B proof.
 const contract=await page.evaluate(()=>({fixture:typeof window.afterlight.renderVisualFixture,materials:!!window.afterlight.materials}));
 assert.equal(contract.fixture,'function','Production fixed-frame renderer is not available');assert.ok(contract.materials,'Production material controls are not available');
 const [fixtures,{createGame,stepGame},{sceneLighting,LIGHTING_AUDIT}]=await Promise.all([
  surfacesOnly?Promise.resolve(null):import('../tests/lighting-fixtures.js'),import('../src/minigames.js'),import('../src/scene-lighting.js')
 ]);
 const makeLightingPair=fixtures?.makeLightingPair||((id,create)=>{const game=create(id,['Pip','Moth','Bolt','Wisp'].map((name,i)=>({id:'material-'+i,name,character:i,bot:true})),143);for(let n=0;n<240;n++)stepGame(game,{},1/60);return {idle:game,event:structuredClone(game)};});
 const features={ao:true,normals:true,metallic:true,lighting:true},contact=[],comparisons=[];
 const ids=await page.evaluate(()=>window.afterlight.minigames.slice(0,20).map(g=>g.id));
 assert.equal(LIGHTING_AUDIT.length,20,'All original games have a documented gameplay-light mechanism');
 report.requirementAudit=LIGHTING_AUDIT;
 async function render(game,options={}){
  const result=await page.evaluate(({game,options})=>{
   const before=JSON.stringify(game),liveBefore=JSON.stringify(window.afterlight.state);
   const rendered=window.afterlight.renderVisualFixture({game,...options});
   if(rendered instanceof Promise)throw new Error('Fixed-frame render must be synchronous to avoid live animation drift');
   if(JSON.stringify(game)!==before)throw new Error('Material render mutated the supplied simulation');
   if(JSON.stringify(window.afterlight.state)!==liveBefore)throw new Error('Material render mutated the live simulation');
   return {...rendered,worldDiagnostics:window.afterlight.paperWorld,materialDiagnostics:window.afterlight.materials.stats};
  },{game,options:{features,...options}});
  assert.ok(result&&typeof result.image==='string','Fixture returns PNG image');pngBytes(result.image);return result;
 }
 for(const id of ids){
  const pair=makeLightingPair(id,createGame),base=pair.idle,event=pair.event;
  assert.equal(base.time,event.time,'Gameplay light fixtures hold time fixed');
  const before=JSON.stringify(base),baseProfile=sceneLighting(base),eventProfile=sceneLighting(event);
  assert.equal(JSON.stringify(base),before,'sceneLighting is read-only');
  const illumination=p=>({ambient:p.ambient,key:p.key,fill:p.fill,points:p.points,effects:[]});
  if(!surfacesOnly){assert.notDeepEqual(illumination(baseProfile),illumination(eventProfile),`${id} gameplay changes actual illumination`);assert.ok(eventProfile.effects.length>0,`${id} gameplay produces visible effect descriptors`);}
  const enabled=await render(event),repeat=await render(event),noise=await pixelDifference(enabled.image,repeat.image);
  const world=enabled.worldDiagnostics;
  assert.equal(world.available,true,`${id}: actual WebGL world is available`);
  assert.equal(world.materialMaps?.ready,true,`${id}: world material maps loaded`);
  assert.equal(world.materialMaps?.colorSpace,'linear',`${id}: maps use linear data`);
  assert.ok(world.materialMaps.size>=64,`${id}: maps have usable resolution`);
  assert.ok(world.materials?.pbr>0&&world.materials.normalMapped>0&&world.materials.aoMapped>0&&world.materials.roughnessMapped>0&&world.materials.metalnessMapped>0,`${id}: active materials bind every required map`);
  assert.equal(world.materials.paperMetalness,0,`${id}: base paper remains nonmetallic`);
  assert.deepEqual(world.shaderErrors,[],`${id}: no world shader errors`);
  const sprites=enabled.stats?.sprites;
  assert.equal(sprites?.available,true,`${id}: actual foreground material renderer is available`);
  assert.ok(sprites.normalMaps>0&&sprites.aoMaps>0&&sprites.roughnessMaps>0&&sprites.metallicMaps>0&&sprites.sprites>0,`${id}: foreground geometry uses generated surface maps`);
  assert.equal(sprites.paperMetalness,0,`${id}: character paper remains nonmetallic`);
  assert.equal(sprites.drawCalls,1,`${id}: foreground materials use one deferred pass`);
  assert.ok(noise.meanChannelDelta<=.01,`${id}: repeated fixed frame drifts (${noise.meanChannelDelta})`);
  const foreground=await render(event,{background:false}),foregroundRepeat=await render(event,{background:false}),foregroundNoise=await pixelDifference(foreground.image,foregroundRepeat.image);
  assert.ok(foregroundNoise.meanChannelDelta<=.01,`${id}: foreground fixed frame drifts`);
  const toggles={};
  for(const feature of Object.keys(features)){
   const off={...features,[feature]:false},disabled=await render(event,{features:off}),foregroundDisabled=await render(event,{features:off,background:false});
   assert.deepEqual(disabled.features,off,`${id}/${feature}: production feature states match the requested intervention`);
   const delta=await pixelDifference(enabled.image,disabled.image),foregroundDelta=await pixelDifference(foreground.image,foregroundDisabled.image);
   assertVisibleDifference(delta,noise,`${id}/${feature}`);assertVisibleDifference(foregroundDelta,foregroundNoise,`${id}/${feature}/foreground`,true);
   const hud=await pixelDifference(enabled.image,disabled.image,{left:10,top:481,width:940,height:49});assert.equal(hud.maximumChannelDelta,0,`${id}/${feature}: score HUD is not shaded by covered sprites`);
   toggles[feature]={full:delta,foreground:foregroundDelta,hud};
   if(['inkfall','fishing','trace'].includes(id)){
    await saveFrame(`${id}-${feature}-disabled.png`,disabled.image);await saveFrame(`${id}-${feature}-foreground-disabled.png`,foregroundDisabled.image);
   }
   if(feature==='lighting'&&['inkfall','fishing','trace'].includes(id))comparisons.push({label:`${id}: LIGHTING DISABLED`,image:disabled.image},{label:`${id}: ALL ENABLED`,image:enabled.image});
  }
  let gameplayLighting=null;
  if(!surfacesOnly){const eventLighting=await render(base,{lightingProfile:illumination(eventProfile)}),idleLighting=await render(base,{lightingProfile:illumination(baseProfile)});
  const lightDelta=await pixelDifference(eventLighting.image,idleLighting.image);assertVisibleDifference(lightDelta,noise,`${id}/gameplay-light`);
  const foregroundEvent=await render(base,{background:false,lightingProfile:illumination(eventProfile)}),foregroundIdle=await render(base,{background:false,lightingProfile:illumination(baseProfile)});
  const foregroundLightDelta=await pixelDifference(foregroundEvent.image,foregroundIdle.image);assertVisibleDifference(foregroundLightDelta,foregroundNoise,`${id}/gameplay-light/foreground`,true);
  gameplayLighting={full:lightDelta,foreground:foregroundLightDelta,idle:baseProfile,event:eventProfile,effectsCount:eventProfile.effects.length};}
  await saveFrame(`${id}-enabled.png`,enabled.image);contact.push({label:id.toUpperCase(),image:enabled.image});
  report.materials.push({id,passed:true,fixtureTime:base.time,noise,foregroundNoise,toggles,gameplayLighting,diagnostics:{fixture:enabled.stats??null,world:enabled.worldDiagnostics,materials:enabled.materialDiagnostics}});
  console.log('MATERIALS',id,JSON.stringify(Object.fromEntries(Object.entries(toggles).map(([key,value])=>[key,{full:value.full.changedPixels,foreground:value.foreground.changedPixels}]))));
 }
 await contactSheet(contact,'all20-materials.png','AFTERLIGHT / 20 gameplay material and lighting fixtures');
 await contactSheet(comparisons,'lighting-comparison.png','Same state and time / lighting disabled and enabled');
 report.brawlerHUD=[];
 for(const id of ['rift-rumble','crown-clash','meteor-melee','spire-kings']){
  const game=createGame(id,['Pip','Moth','Bolt','Wisp'].map((name,i)=>({id:'hud-'+i,name,character:i,bot:true})),151);for(let n=0;n<120;n++)stepGame(game,{},1/60);
  const enabled=await render(game),off=await render(game,{features:{ao:false,normals:false,metallic:false,lighting:false}}),panels=[];
  for(let i=0;i<4;i++){const delta=await pixelDifference(enabled.image,off.image,{left:10+i*240,top:483,width:220,height:48});assert.equal(delta.maximumChannelDelta,0,`${id}: player${i+1} HUD excludes the material pass`);panels.push(delta);}
  report.brawlerHUD.push({id,passed:true,panels});console.log('HUD',id);
 }
}

function pngBytes(dataURL){
 assert.ok(typeof dataURL==='string'&&dataURL.startsWith('data:image/png;base64,'),'Fixture must return actual PNG pixels');
 return Buffer.from(dataURL.slice(dataURL.indexOf(',')+1),'base64');
}
async function pixelDifference(a,b,rectangle){
 const prepare=data=>{let decoder=sharp(pngBytes(data)).ensureAlpha();if(rectangle)decoder=decoder.extract(rectangle);return decoder.raw().toBuffer({resolveWithObject:true});};
 const [left,right]=await Promise.all([prepare(a),prepare(b)]);
 assert.deepEqual(left.info,right.info,'A/B image dimensions match');
 let sum=0,changed=0,maximum=0;const count=left.info.width*left.info.height;
 for(let p=0;p<count;p++){
  const i=p*4;let local=0;
  for(let c=0;c<3;c++){const delta=Math.abs(left.data[i+c]-right.data[i+c]);sum+=delta;maximum=Math.max(maximum,delta);local=Math.max(local,delta);}
  if(local>=3)changed++;
 }
 return {width:left.info.width,height:left.info.height,pixels:count,changedPixels:changed,changedPercent:changed/count*100,meanChannelDelta:sum/(count*3),maximumChannelDelta:maximum};
}
function assertVisibleDifference(delta,noise,label,foreground=false){
 const minimumPixels=foreground?100:300;
 assert.ok(delta.changedPixels>=Math.max(minimumPixels,noise.changedPixels*10),`${label}: too few changed pixels (${delta.changedPixels}; noise ${noise.changedPixels})`);
 assert.ok(delta.meanChannelDelta>=Math.max(.025,noise.meanChannelDelta*10),`${label}: signal is too weak (${delta.meanChannelDelta}; noise ${noise.meanChannelDelta})`);
}
async function saveFrame(name,dataURL){await writeFile(path.join(out,name),pngBytes(dataURL));}
async function contactSheet(frames,filename,title){
 const columns=4,tileWidth=480,tileHeight=300,width=columns*tileWidth,height=80+Math.ceil(frames.length/columns)*tileHeight;
 const composites=[];
 for(let index=0;index<frames.length;index++){
  const x=index%columns*tileWidth,y=80+Math.floor(index/columns)*tileHeight;
  composites.push({input:await sharp(pngBytes(frames[index].image)).resize(470,264).png().toBuffer(),left:x+5,top:y});
  const label=String(frames[index].label).replace(/[<>&]/g,'');
  composites.push({input:Buffer.from(`<svg width="480" height="34"><text x="8" y="23" font-size="15" fill="#20251e" font-family="sans-serif">${label}</text></svg>`),left:x,top:y+264});
 }
 composites.push({input:Buffer.from(`<svg width="${width}" height="72"><text x="18" y="44" font-size="28" fill="#20251e" font-family="sans-serif">${title}</text></svg>`),left:0,top:0});
 await sharp({create:{width,height,channels:4,background:'#eeeade'}}).composite(composites).png().toFile(path.join(out,filename));
}

async function recordActions(){
 report.videos=[];
 for(const [id,index]of [['fishing',10],['balance',11],['trace',14]]){
  const videoContext=await browser.newContext({offline:!developmentURL,viewport:{width:1280,height:900},recordVideo:{dir:path.join(out,'video-raw'),size:{width:1280,height:900}}});
  const actorPage=await videoContext.newPage();actorPage.on('pageerror',e=>report.pageErrors.push(`${id} video: ${e.message}`));const video=actorPage.video();
  await actorPage.goto(url);await actorPage.waitForFunction(()=>window.afterlight?.minigames?.length===24);
  await actorPage.locator('[data-nav="arcade"]').first().click();await actorPage.locator(`[data-practice="${index}"]`).click();await actorPage.locator('#player-name').fill('Lighting demo');await actorPage.locator('#start-solo').click();await actorPage.locator('#begin-minigame').click();await actorPage.evaluate(()=>window.afterlight.state.countdown=0);await actorPage.waitForTimeout(500);await actorPage.locator('#game-canvas').click();
  let evidence;
  if(id==='fishing'){
   await actorPage.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');p.phase=p.arc-.07;p.hooked=false;p.cooldown=0;});
   await actorPage.keyboard.press('Space');await actorPage.waitForTimeout(160);
   assert.equal(await actorPage.evaluate(()=>window.afterlight.state.game.players.find(p=>p.id==='local').hooked),true,'Video hook uses real action input');
   for(let n=0;n<4;n++){const direction=await actorPage.evaluate(()=>window.afterlight.state.game.players.find(p=>p.id==='local').fight<0?'ArrowLeft':'ArrowRight');await actorPage.keyboard.down(direction);await actorPage.keyboard.press('Space');await actorPage.keyboard.up(direction);await actorPage.waitForTimeout(260);}
   evidence=await actorPage.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');return {hooked:p.hooked,reel:p.reel,score:p.score};});
   assert.ok(evidence.reel>0||evidence.score>2,'Actual reel controls affect the game');
  }else if(id==='balance'){
   await actorPage.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');p.lean=.75;p.velocity=.2;p.ability=0;});await actorPage.keyboard.press('Space');await actorPage.waitForTimeout(180);evidence=await actorPage.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');return {message:p.message,ability:p.ability,lean:p.lean};});assert.ok(evidence.ability>0);await actorPage.keyboard.down('ArrowUp');await actorPage.waitForTimeout(900);await actorPage.keyboard.up('ArrowUp');
  }else{
   const before=await actorPage.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');p.x=300;p.y=330;p.focus=1;p.cooldown=5;return {x:p.x,focus:p.focus};});await actorPage.keyboard.down('Space');await actorPage.keyboard.down('ArrowRight');await actorPage.waitForTimeout(850);await actorPage.keyboard.up('ArrowRight');await actorPage.keyboard.up('Space');evidence=await actorPage.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');return {x:p.x,focus:p.focus};});assert.ok(evidence.x>before.x&&evidence.focus<before.focus);
  }
  await actorPage.waitForTimeout(1000);await videoContext.close();const filename=`${label}-${id}-real-controls.webm`;await video.saveAs(path.join(out,filename));report.videos.push({id,file:filename,evidence,fixture:'Documented starting state isolates the interaction; keyboard input performs the action.'});console.log('VIDEO',id);
 }
}

async function writeAuditMarkdown(filename){
 const lines=[`# AFTERLIGHT ${label} material verification`,'',`Result: ${report.passed?'PASS':'FAIL'}.`,'',report.sha256?`Exact HTML SHA-256: ${report.sha256}.`:`Development source: ${report.source}; this report does not verify the standalone file.`,'',report.method,''];
 if(report.error)lines.push('Failure: '+report.error.split('\n')[0],'');
 if(report.materials.length){
  lines.push('Each number below counts pixels with a difference of at least 3 channel values out of 255. A feature must change at least 300 full-frame pixels and 100 foreground pixels, with mean channel difference at least 0.025 and at least 10× repeat-render noise. The foreground comparison suppresses only the background helper; gameplay sprites still use the production renderer.','','| Game | AO foreground | Normals foreground | Metallic foreground | Lighting foreground | Gameplay-light foreground | Repeat-frame noise |','|---|---:|---:|---:|---:|---:|---:|');
  for(const g of report.materials)lines.push(`| ${g.id} | ${g.toggles.ao.foreground.changedPixels} | ${g.toggles.normals.foreground.changedPixels} | ${g.toggles.metallic.foreground.changedPixels} | ${g.toggles.lighting.foreground.changedPixels} | ${g.gameplayLighting?.foreground.changedPixels??'not run'} | ${g.noise.meanChannelDelta.toFixed(6)} |`);
  lines.push('','Gameplay-light comparisons keep geometry and time identical, changing only the illumination profile derived from a real gameplay event. Event particles cannot explain the difference. Supplied and live simulation snapshots remain unchanged during rendering.','',`${report.brawlerHUD?.length??0} brawler HUD fixtures also passed; protected score-card interiors stayed pixel-identical with every material feature disabled.`,'');
 }
 if(report.performance.length){
  let prior;try{prior=JSON.parse(await readFile(path.join(out,'baseline-report.json'),'utf8'));}catch{}
  lines.push('Performance uses the same saved initial game states for baseline and final. Each scene has 30 warm-up frames and 180 measured frames. A 60Hz sample cannot establish unused GPU headroom.','','| Game | Baseline FPS | Measured FPS | Measured p95 | Frames above 25ms | Long tasks |','|---|---:|---:|---:|---:|---:|');
  for(const g of report.performance){const old=prior?.performance.find(p=>p.id===g.id);lines.push(`| ${g.id} | ${old?.averageFPS.toFixed(2)??'—'} | ${g.averageFPS.toFixed(2)} | ${g.frameMs.p95.toFixed(2)}ms | ${g.frameMs.over25} | ${g.longTasks.count} |`);}
  lines.push('',`Startup to ready: ${report.startupMs.toFixed(0)}ms.`,'');
 }
 if(report.videos?.length)lines.push('Recorded actual-control evidence:','',...report.videos.map(v=>`- ${v.file}: ${JSON.stringify(v.evidence)}`),'');
 lines.push('Limits:','',...report.limitations.map(v=>'- '+v),'');
 await writeFile(path.join(out,filename),lines.join('\n'));
}

try{
 const start=performance.now();await page.goto(url);await page.waitForFunction(()=>window.afterlight?.minigames?.length===24);report.startupMs=performance.now()-start;
 if(videoOnly)await recordActions();else{if(!materialsOnly)await performanceAll20();if(!baseline&&!performanceOnly)await verifyMaterials();if(!baseline&&!developmentURL&&!performanceOnly&&!process.argv.includes('--no-video'))await recordActions();}
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.consoleWarnings.filter(m=>/GL_INVALID|INVALID_(OPERATION|ENUM|VALUE|FRAMEBUFFER)|shader.{0,40}(error|fail)|failed to (compile|link)/i.test(m)),[],'No WebGL pipeline failures hidden in browser warnings');report.passed=true;
}catch(error){report.passed=false;report.error=error.stack||error.message;process.exitCode=1;}finally{
 await browser.close();report.finishedAt=new Date().toISOString();report.currentSourceHash=developmentURL?null:createHash('sha256').update(await readFile(source)).digest('hex');report.sourceUnchanged=developmentURL?null:report.currentSourceHash===sha256;if(report.sourceUnchanged===false)process.exitCode=1;
 const stem=`${label}-${videoOnly?'video-':performanceOnly?'performance-':surfacesOnly?'surfaces-':''}report`;
 await writeFile(path.join(out,`${stem}.json`),JSON.stringify(report,null,2));await writeAuditMarkdown(`${stem}.md`);console.log(JSON.stringify({label,passed:report.passed,sha256:report.sha256,sourceUnchanged:report.sourceUnchanged,error:report.error}));
}
