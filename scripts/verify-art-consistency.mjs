import assert from 'node:assert/strict';
import {access,copyFile,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {characterArtFixtures} from '../tests/character-art-fixtures.js';
import {PAPER_POSES} from '../src/paper-animation.js';
import {CHARACTER_CLOTH_STYLES,measureCharacterTone,harmonizePaperCharacterPixels,paperCutEdgePixels,foldPaperCharacterPixels} from '../src/paper-pigment.js';
import {MINIGAMES,createGame} from '../src/minigames.js';
import {BOT_DIFFICULTIES,botTarget,botTimingOffset} from '../src/bot-difficulty.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'verification','art-consistency');
const source=process.env.AFTERLIGHT_FILE||path.join(root,'AFTERLIGHT.html');
const prepareOnly=process.argv.includes('--prepare-only');
// Measured on all72 current original poses after the quieter face-fold fix:
// prepared/idle paper luma .96167..1.00455. These bounds allow approximately
// another1% for browser decoding while catching the former .807 exposure drop.
// The character author also validates ±5% idle exposure and <4% within each
// character; wider source framing may shift a body landmark by a few pixels.
const toneGate={minimum:.95,maximum:1.05,maximumPoseSpread:.04,sourceAgreementLuma:2};
const actorAssets=['characters','characters-new','character-attacks','motion-classic','motion-new'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={startedAt:new Date().toISOString(),source,prepareOnly,toneGate,checks:[],screenshots:[],pageErrors:[],consoleErrors:[],failedRequests:[],externalRequests:[],
 method:'Exact portable HTML copied alone and opened offline by file://. The72-pose audit compares production prepared diagnostics with original source pixels and connected crop overflow. Actual UI starts all26 games with the Medium default; fullscreen live gameplay checks physical input, full-resolution material buffers, and desktop DPR1/2. Same-time cloned frames isolate repeat noise and time-dependent paper scenery.',
 limits:['Original atlas boundaries can already truncate ink; expanded crops cannot reconstruct pixels outside the source image. Such source-edge contacts are reported, not concealed or presented as repaired.','Pixel differences demonstrate visible animation, not artistic quality. The source/prepared contact sheets and fullscreen screenshots need visual review.','Browser performance samples use one desktop headless Chrome instance and are not low-end-device or WAN-latency claims.','Explicit cloned render fixtures and accelerated result timers are identified below; complete naturally timed26-game matches are outside this audit.']};
let browser,completed=false;
await mkdir(output,{recursive:true});
async function check(name,fn){try{const details=await fn();report.checks.push({name,passed:true,details});console.log('PASS',name);return details;}catch(error){report.checks.push({name,passed:false,error:error.stack||error.message});console.error('FAIL',name,error.message);return null;}}
async function savePNG(name,bytes){await writeFile(path.join(output,name),bytes);report.screenshots.push(name);}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function inkSVG(width,height,lines){return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'">'+lines.map(line=>'<text x="'+line.x+'" y="'+line.y+'" fill="#eee3c9" font-family="Arial" font-size="'+(line.size||12)+'">'+xml(line.text)+'</text>').join('')+'</svg>');}
function alphaCount(frame){let n=0;for(let i=3;i<frame.pixels.length;i+=4)if(frame.pixels[i]>=20)n++;return n;}
function edgeEvidence(frame,dimensions){
 const b=frame.bounds,window={left:0,top:0,right:0,bottom:0},sheet={left:0,top:0,right:0,bottom:0};
 for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){if(frame.pixels[(y*frame.width+x)*4+3]<20)continue;const ix=b.x+x,iy=b.y+y;
  if(ix===b.cellX)window.left++;if(iy===b.cellY)window.top++;if(ix===b.cellX+b.cellWidth-1)window.right++;if(iy===b.cellY+b.cellHeight-1)window.bottom++;
  if(ix===0)sheet.left++;if(iy===0)sheet.top++;if(ix===dimensions.width-1)sheet.right++;if(iy===dimensions.height-1)sheet.bottom++;
 }
 return {window,sheet};
}
async function contactSheet(frames,name,title){
 const cellWidth=210,cellHeight=216,width=9*cellWidth,height=48+8*cellHeight,composite=[],labels=[{x:14,y:24,size:16,text:title}];
 for(const frame of frames){const row=frame.character,col=PAPER_POSES.indexOf(frame.pose),x=col*cellWidth,y=48+row*cellHeight;
  const scale=Math.min(174/frame.height,196/frame.width),w=Math.max(1,Math.round(frame.width*scale)),h=Math.max(1,Math.round(frame.height*scale));
  const image=await sharp(Buffer.from(frame.pixels),{raw:{width:frame.width,height:frame.height,channels:4}}).resize(w,h,{kernel:'lanczos3'}).png().toBuffer();
  composite.push({input:image,left:x+Math.round((cellWidth-w)/2),top:y+24+174-h});
  labels.push({x:x+8,y:y+14,text:CHARACTER_CLOTH_STYLES[row].name+' · '+frame.pose,size:11},{x:x+8,y:y+212,text:'paper '+frame.tone.paperLuma.toFixed(1)+' / body '+frame.bounds.bodyHeight+'px',size:10});
 }
 composite.push({input:inkSVG(width,height,labels),left:0,top:0});
 await savePNG(name,await sharp({create:{width,height,channels:4,background:'#232724'}}).composite(composite).png().toBuffer());
}
async function sourceAudit(){
 const actorSource=await readFile(path.join(root,'src','art.js'),'utf8'),overflowMatch=actorSource.match(/measurePaperCell\(data,[^\n]+overflow:(\d+)/);
 assert.ok(overflowMatch,'Production actor crop overflow must be discoverable');const productionOverflow=Number(overflowMatch[1]);report.productionOverflow=productionOverflow;report.actorSourceHash=sha(actorSource);
 const manifest=JSON.parse(await readFile(path.join(root,'assets-manifest.json'),'utf8'));
 report.assetHashes={};const dimensions={};
 for(const asset of manifest.images){const bytes=await readFile(path.join(root,'public','assets',asset.file));report.assetHashes[asset.name]=sha(bytes);if(actorAssets.includes(asset.name))dimensions[asset.name]=await sharp(bytes).metadata();}
 const [hard,expanded,wider]=await Promise.all([characterArtFixtures(),characterArtFixtures({overflow:productionOverflow}),characterArtFixtures({overflow:48})]);
 const rows=[],original=[],prepared=[];
 for(const actor of expanded){const idle=actor.frames.find(f=>f.pose==='idle'),idleTone=measureCharacterTone(idle.pixels,idle.width,idle.height,{metrics:idle.bounds});
  for(const frame of actor.frames){const index=actor.frames.indexOf(frame),nominal=hard[actor.character].frames[index],wide=wider[actor.character].frames[index],metrics=frame.bounds;
   const sourceTone=measureCharacterTone(frame.pixels,frame.width,frame.height,{metrics});
   let pixels=harmonizePaperCharacterPixels(frame.pixels,frame.width,frame.height,{character:actor.character,metrics,toneReference:idleTone});
   pixels=paperCutEdgePixels(pixels,frame.width,frame.height,Math.max(frame.width,frame.height)*.008);
   pixels=foldPaperCharacterPixels(pixels,frame.width,frame.height,{character:actor.character,metrics});
   const tone=measureCharacterTone(pixels,frame.width,frame.height,{metrics}),ratio=tone.paperLuma/idleTone.paperLuma;
   const alphaUnchanged=frame.pixels.every((value,i)=>i%4!==3||value===pixels[i]);
   assert.equal(alphaUnchanged,true,actor.character+'/'+frame.pose+' preparation must retain the exact original silhouette alpha');
   assert.ok(ratio>=toneGate.minimum&&ratio<=toneGate.maximum,actor.character+'/'+frame.pose+' prepared exposure ratio '+ratio);
   const croppedEdge=edgeEvidence(nominal,dimensions[frame.sheet]),edges=edgeEvidence(frame,dimensions[frame.sheet]),nominalBounds=nominal.bounds;
   const overflow={left:Math.max(0,nominalBounds.cellX-frame.bounds.x),top:Math.max(0,nominalBounds.cellY-frame.bounds.y),right:Math.max(0,frame.bounds.x+frame.width-nominalBounds.cellX-nominalBounds.cellWidth),bottom:Math.max(0,frame.bounds.y+frame.height-nominalBounds.cellY-nominalBounds.cellHeight)};
   const chromaDrift=Math.hypot(...tone.paperRGB.map((value,c)=>(value-tone.paperLuma)-(idleTone.paperRGB[c]-idleTone.paperLuma)));
   rows.push({key:actor.character+':'+frame.pose,character:actor.character,pose:frame.pose,sheet:frame.sheet,sourceCrop:[...frame.cut],sourceBounds:{x:metrics.x,y:metrics.y,width:frame.width,height:frame.height},nominalBounds:{x:nominalBounds.cellX,y:nominalBounds.cellY,width:nominalBounds.cellWidth,height:nominalBounds.cellHeight},sourceOverflow:overflow,sourcePaper:sourceTone.paperLuma,sourcePaperRGB:sourceTone.paperRGB,preparedPaper:tone.paperLuma,preparedPaperRGB:tone.paperRGB,idlePaper:idleTone.paperLuma,idlePaperRGB:idleTone.paperRGB,preparedChromaDrift:chromaDrift,ratio,rawBodyHeight:metrics.bodyHeight,canonicalBody:idle.bounds.bodyHeight,normalizedScale:idle.bounds.bodyHeight/metrics.bodyHeight,recoveredAlphaPixels:alphaCount(frame)-alphaCount(nominal),additional48AlphaPixels:alphaCount(wide)-alphaCount(frame),originalCellEdge:croppedEdge.window,expandedWindowEdge:edges.window,originalSheetEdge:edges.sheet,alphaUnchanged});
   original.push({...frame,tone:sourceTone});prepared.push({...frame,pixels,tone});
  }
 }
 assert.equal(rows.length,72);report.sourcePoseRows=rows;const briarBranch=rows.find(row=>row.key==='5:followthrough');assert.deepEqual(briarBranch.sourceCrop,[256,256,288,256]);assert.equal(briarBranch.expandedWindowEdge.right,0,'Briar followthrough retains its complete original branch');
 const perCharacter=Array.from({length:8},(_,character)=>{const poses=rows.filter(row=>row.character===character),ratios=poses.map(row=>row.ratio);return {character,name:CHARACTER_CLOTH_STYLES[character].name,outfitColor:CHARACTER_CLOTH_STYLES[character].color,minimumRatio:Math.min(...ratios),maximumRatio:Math.max(...ratios),spread:Math.max(...ratios)-Math.min(...ratios),maximumPreparedChromaDrift:Math.max(...poses.map(row=>row.preparedChromaDrift)),recoveredFrames:poses.filter(row=>row.recoveredAlphaPixels>0).length,sourceEdgeFrames:poses.filter(row=>Object.values(row.originalSheetEdge).some(Boolean)).map(row=>row.pose)};});
 for(const actor of perCharacter)assert.ok(actor.spread<=toneGate.maximumPoseSpread,actor.name+' exposure spread '+actor.spread);
 await contactSheet(original,'original-72-poses.png','AFTERLIGHT · original connected source crops · all8characters /9poses');
 await contactSheet(prepared,'prepared-72-poses.png','AFTERLIGHT · production pigment / rim / quiet face folds · all8characters /9poses');
 return {poseCount:rows.length,productionOverflow,perCharacter,recoveredFrames:rows.filter(row=>row.recoveredAlphaPixels>0).length,physicalSourceEdgeContacts:rows.filter(row=>Object.values(row.originalSheetEdge).some(Boolean)).map(row=>({key:row.key,edges:row.originalSheetEdge})),productionWindowContacts:rows.filter(row=>Object.values(row.expandedWindowEdge).some(Boolean)).map(row=>({key:row.key,edges:row.expandedWindowEdge})),additional48Gains:rows.filter(row=>row.additional48AlphaPixels>0).map(row=>({key:row.key,pixels:row.additional48AlphaPixels}))};
}
function sourceDifficultyAudit(){
 const players=[{id:'qa-bot',name:'Paper rival',character:0,bot:true}];
 const modes=MINIGAMES.map(({id})=>{const medium=createGame(id,players,172),hard=createGame(id,players,172,{difficulty:'hard'}),before=JSON.stringify(hard),p=hard.players[0],target=botTarget(hard,p,{x:480,y:250}),offsets=Array.from({length:24},(_,beat)=>botTimingOffset(hard,p,beat));
  assert.equal(medium.botDifficulty,'medium');assert.equal(hard.botDifficulty,'hard');assert.equal(JSON.stringify(hard),before);assert.notDeepEqual(target,{x:480,y:250});assert.ok(offsets.some(value=>value!==0));
  return {id,defaultDifficulty:medium.botDifficulty,hardTargetError:{x:target.x-480,y:target.y-250},hardTimingRange:[Math.min(...offsets),Math.max(...offsets)]};
 });
 assert.equal(modes.length,26);assert.ok(BOT_DIFFICULTIES.hard.reaction>0&&BOT_DIFFICULTIES.hard.miss>0&&BOT_DIFFICULTIES.hard.lapse>0);
 return {modes,profiles:BOT_DIFFICULTIES,method:'Read-only source boundary check; full deterministic26-mode error/reaction/replay behavior is covered by tests/bot-difficulty.test.js. Actual portable default selection is separately exercised through the UI.'};
}
function observe(page,label,url){page.on('pageerror',error=>report.pageErrors.push({label,message:error.message}));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({label,message:message.text()});});page.on('requestfailed',request=>report.failedRequests.push({label,url:request.url().split('?')[0],error:request.failure()?.errorText}));page.on('request',request=>{const address=request.url();if(!address.startsWith('blob:')&&!address.startsWith('data:')&&address!==url)report.externalRequests.push({label,url:address});});page.on('dialog',dialog=>dialog.dismiss());}
async function ready(page,url){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>window.afterlight?.minigames?.length===26&&window.afterlight?.animation?.frames===72,null,{timeout:30000});await page.evaluate(()=>document.fonts.ready);}
async function openArcade(page){await page.locator('.mode-card[data-nav="arcade"]').click();await page.waitForSelector('[data-practice="0"]');}
async function launch(page,index,{difficulty,character=0}={}){
 await page.locator('[data-practice="'+index+'"]').click();await page.waitForSelector('#start-solo');
 if(difficulty)await page.locator('.traveler-modal [data-difficulty="'+difficulty+'"]').click();
 else assert.equal(await page.locator('.traveler-modal [data-difficulty].selected').getAttribute('data-difficulty'),'medium','Fresh/default practice chooser stays Medium');
 await page.locator('[data-character="'+character+'"]').click();await page.locator('#player-name').fill('Paper QA');await page.locator('#start-solo').click();await page.waitForSelector('#begin-minigame');await page.locator('#begin-minigame').click();
 await page.waitForFunction(()=>window.afterlight.state?.phase==='minigame'&&window.afterlight.state.game);
 await page.evaluate(()=>window.afterlight.state.countdown=0);await page.waitForFunction(()=>!document.querySelector('.stage-overlay'));
 for(let n=0;n<8;n++)await page.evaluate(()=>new Promise(requestAnimationFrame));
}
async function practice(page,url,id,options){await ready(page,url);await openArcade(page);const index=await page.evaluate(id=>window.afterlight.minigames.findIndex(game=>game.id===id),id);assert.ok(index>=0);await launch(page,index,options);}
async function finishToArcade(page){await page.evaluate(()=>{const state=window.afterlight.state;state.countdown=0;state.game.time=state.game.duration;});await page.waitForSelector('#arcade-back',{timeout:10000});await page.locator('#arcade-back').click();await page.waitForSelector('[data-practice="0"]');}
async function shot(page,name){await page.screenshot({path:path.join(output,name),fullPage:false});report.screenshots.push(name);}
async function liveDiagnostics(page){return page.evaluate(()=>{const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d'),game=window.afterlight.state.game;
 return {id:game.id,time:game.time,level:game.botDifficulty,uiLevel:window.afterlight.ui.difficulty,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},fullscreen:document.fullscreenElement===document.documentElement,canvas:{width:canvas.width,height:canvas.height,cssWidth:rect.width,cssHeight:rect.height,smoothing:ctx.imageSmoothingEnabled,quality:ctx.imageSmoothingQuality,transform:[ctx.getTransform().a,ctx.getTransform().d],imageRendering:getComputedStyle(canvas).imageRendering},room:(()=>{const r=document.querySelector('.game-room').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})(),world:window.afterlight.paperWorld,materials:window.afterlight.materials.stats,environment:window.afterlight.environment,animation:window.afterlight.animation,bots:game.players.filter(p=>p.bot).map(p=>({id:p.id,score:p.score,brain:p.botBrain})),font:window.afterlight.ui.fontFamily};
 });}
function resolutionGate(d){
 const scale=Math.min(2,Math.max(1,d.canvas.cssWidth*d.dpr/960,d.canvas.cssHeight*d.dpr/540));
 assert.ok(Math.abs(d.canvas.width-960*scale)<=2&&Math.abs(d.canvas.height-540*scale)<=2,'Live backing canvas follows the bounded desktop/DPR contract');
 assert.deepEqual(d.materials.sprites.bufferSize,[d.canvas.width,d.canvas.height]);assert.equal(d.materials.sprites.surfaceResolution,384);assert.equal(d.materials.sprites.filtering,'linear/high-quality');
 assert.equal(d.canvas.smoothing,true);assert.equal(d.canvas.quality,'high');assert.ok(d.canvas.imageRendering!=='pixelated'&&d.canvas.imageRendering!=='crisp-edges');
 assert.ok(Math.abs(d.canvas.transform[0]-d.canvas.width/960)<.001&&Math.abs(d.canvas.transform[1]-d.canvas.height/540)<.001);
 assert.deepEqual([d.world.width,d.world.height],[d.canvas.width,d.canvas.height]);assert.equal(d.world.available,true);assert.deepEqual(d.world.shaderErrors,[]);
 assert.ok(d.world.diorama.geometryDepth>0&&d.world.diorama.reliefVertices>0);assert.equal(d.environment.foreground.layer,'after-actors-before-hud');
 assert.equal(d.materials.sprites.drawCalls,1);assert.ok(d.materials.sprites.characterFoldMaps>0);assert.equal(d.materials.sprites.paperMetalness,0);return {requestedScale:scale,effectiveScale:d.canvas.width/960};
}
async function runtimePoseAudit(page){
 const profiles=await page.evaluate(()=>window.afterlight.animation.poseToneProfiles);assert.equal(profiles.length,72);const seen=new Set();
 for(const row of profiles){assert.ok(!seen.has(row.key));seen.add(row.key);const local=report.sourcePoseRows.find(p=>p.key===row.key);assert.ok(local,'Unknown portable prepared pose '+row.key);
  const ratio=row.preparedPaper/row.idlePaper;assert.ok(ratio>=toneGate.minimum&&ratio<=toneGate.maximum,row.key+' runtime exposure '+ratio);assert.ok(Math.abs(row.preparedPaper-local.preparedPaper)<=toneGate.sourceAgreementLuma,row.key+' portable/source tone mismatch');
  assert.ok(Math.abs(row.renderedBodyAt100-100)<.001);assert.deepEqual(row.sourceCrop,local.sourceCrop);assert.deepEqual(row.sourceOverflow,local.sourceOverflow);assert.deepEqual(row.sourceBounds,local.sourceBounds);assert.ok(row.cachedSize.width<=768&&row.cachedSize.height<=768);
  assert.ok(Object.values(row.footAnchor).every(Number.isFinite));assert.ok(Number.isFinite(row.normalizedScale)&&row.normalizedScale>0);
 }
 for(let character=0;character<8;character++){const rows=profiles.filter(row=>row.key.startsWith(character+':'));assert.equal(rows.length,9);assert.deepEqual(rows.map(row=>row.key.split(':')[1]).sort(),[...PAPER_POSES].sort());}
 return {profiles,method:'Actual exact-HTML prepareActorFrames diagnostics; independently decoded original sheets and production connected crops provide the comparison pixels. renderedBodyAt100 is a geometry contract measurement, not a visual anatomy judgement.'};
}
async function pixelDelta(a,b){
 const left=await sharp(Buffer.from(a.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true}),right=await sharp(Buffer.from(b.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(left.info,right.info);
 let changedPixels=0,total=0,maximum=0;for(let i=0;i<left.data.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(left.data[i+c]-right.data[i+c]);if(delta>12)changedPixels++;total+=delta;maximum=Math.max(maximum,delta);}
 return {width:left.info.width,height:left.info.height,changedPixels,meanRGBDelta:total/(left.info.width*left.info.height*3),maximumRGBDelta:maximum};
}
async function sceneFrameProof(page){
 const pair=await page.evaluate(()=>{const game=JSON.parse(JSON.stringify(window.afterlight.state.game));game.time=4;for(const p of game.players)Object.assign(p,{bot:false,flash:0,attack:0,vx:0,vy:0});const before=JSON.stringify(game),a=window.afterlight.renderVisualFixture({game}),repeat=window.afterlight.renderVisualFixture({game});game.time=4.55;const laterBefore=JSON.stringify(game),b=window.afterlight.renderVisualFixture({game});return {a,repeat,b,unchanged:a.stateUnchanged&&repeat.stateUnchanged&&b.stateUnchanged&&before===JSON.stringify({...game,time:4})&&laterBefore===JSON.stringify(game)};});
 assert.equal(pair.unchanged,true);const noise=await pixelDelta(pair.a.image,pair.repeat.image),motion=await pixelDelta(pair.a.image,pair.b.image);assert.ok(noise.meanRGBDelta<=.02,'Same-time repeat has no incidental renderer drift');assert.ok(motion.changedPixels>100&&motion.meanRGBDelta>noise.meanRGBDelta,'Shared-clock motion is visible beyond repeat noise');
 await savePNG('shadow-fixed-time-a.png',Buffer.from(pair.a.image.split(',')[1],'base64'));await savePNG('shadow-fixed-time-b.png',Buffer.from(pair.b.image.split(',')[1],'base64'));
 return {noise,motion,stateUnchanged:true,fixtureResolution:[pair.a.stats.sprites.bufferSize,pair.a.stats.world.width,pair.a.stats.world.height],aEnvironment:pair.a.environment,bEnvironment:pair.b.environment};
}
async function frameSample(page){return page.evaluate(async()=>{const values=[];let previous=await new Promise(requestAnimationFrame);for(let n=0;n<60;n++){const now=await new Promise(requestAnimationFrame);values.push(now-previous);previous=now;}const sorted=[...values].sort((a,b)=>a-b);return {frames:values.length,medianMs:sorted[30],p95Ms:sorted[57],maximumMs:sorted.at(-1),over50:values.filter(v=>v>50).length};});}
try{
 report.sourceAudit=await check('All72 original poses retain their alpha and coherent prepared paper exposure',sourceAudit);
 report.sourceDifficulty=await check('All26 source defaults are Medium and Hard retains finite timing/aim errors',sourceDifficultyAudit);
 if(prepareOnly){completed=true;report.browserRun=false;}
 else{
  const bytes=await readFile(source);report.sha256=sha(bytes);report.bytes=bytes.length;const isolated=await mkdtemp(path.join(tmpdir(),'afterlight-art-consistency-'));const target=path.join(isolated,'AFTERLIGHT.html');await copyFile(source,target);const url=pathToFileURL(target).href;report.isolatedDirectory=isolated;
  const options={headless:true,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']};try{await access('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');options.executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';}catch{}
  browser=await chromium.launch(options);report.browserVersion=browser.version();const context=await browser.newContext({offline:true,viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();observe(page,'DPR1',url);await ready(page,url);
  await check('Portable embeds the exact current generated sheets and all72 prepared poses',async()=>{
   const actual=await page.evaluate(async names=>{const result={};for(const name of names){const bytes=await (await fetch(window.AFTERLIGHT_ASSETS[name])).arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);result[name]=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}return result;},Object.keys(report.assetHashes));assert.deepEqual(actual,report.assetHashes);return {assets:Object.keys(actual).length,...await runtimePoseAudit(page)};
  });
  await check('Actual practice picker creates all26 games with the Medium default',async()=>{
   await openArcade(page);const data=[];for(let index=0;index<26;index++){await launch(page,index);const row=await liveDiagnostics(page);assert.equal(row.level,'medium');assert.equal(row.uiLevel,'medium');assert.ok(row.bots.length>0&&row.bots.every(p=>p.brain&&p.brain.queue.length<=8));data.push({id:row.id,level:row.level,botBrains:row.bots});console.log('MEDIUM',row.id);await finishToArcade(page);}return data;
  });
  for(const difficulty of ['easy','hard'])await check('Actual picker applies '+difficulty+' to a fresh match',async()=>{await practice(page,url,'rhythm',{difficulty,character:5});const details=await liveDiagnostics(page);assert.equal(details.level,difficulty);assert.equal(details.uiLevel,difficulty);assert.ok(details.bots.every(p=>p.brain));return {level:details.level,bots:details.bots};});
  for(const id of ['shadow','rift-rumble','gullet-gala','clockwork-surgery'])await check('Fullscreen smooth paper scene: '+id,async()=>{
   await practice(page,url,id,{difficulty:'medium',character:id==='shadow'?6:2});await page.locator('#match-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement===document.documentElement);
   await page.evaluate(()=>window.afterlight.state.game.players.forEach(p=>p.bot=false));const before=await page.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');return {x:p.x,cursor:p.cursor?.x,aim:p.aim};});await page.locator('#game-canvas').click({position:{x:480,y:160}});await page.keyboard.down('ArrowRight');await page.waitForTimeout(210);await page.keyboard.up('ArrowRight');await page.waitForTimeout(90);
   const after=await page.evaluate(()=>{const p=window.afterlight.state.game.players.find(p=>p.id==='local');return {x:p.x,cursor:p.cursor?.x,aim:p.aim};});assert.ok((after.x>before.x)||(after.cursor>before.cursor)||(after.aim>before.aim),'Actual right input changes the scene player');
   const diagnostics=await liveDiagnostics(page),resolution=resolutionGate(diagnostics);assert.equal(diagnostics.fullscreen,true);assert.equal(diagnostics.room.left,0);assert.equal(diagnostics.room.top,0);assert.equal(diagnostics.room.width,diagnostics.viewport.width);assert.equal(diagnostics.room.height,diagnostics.viewport.height);assert.ok(diagnostics.font.includes('Alegreya SC'));
   await shot(page,'fullscreen-'+id+'-dpr1.png');await page.locator('#game-canvas').screenshot({path:path.join(output,'canvas-'+id+'-dpr1.png')});report.screenshots.push('canvas-'+id+'-dpr1.png');
   return {before,after,resolution,diagnostics,frameTiming:await frameSample(page),fixedFrames:id==='shadow'?await sceneFrameProof(page):null};
  });
  await context.close();
  const hiContext=await browser.newContext({offline:true,viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'no-preference'}),hiPage=await hiContext.newPage();observe(hiPage,'DPR2',url);
  await check('Fullscreen Shadow Play uses the bounded high-resolution material path at DPR2',async()=>{await practice(hiPage,url,'shadow',{character:7});await hiPage.locator('#match-fullscreen').click();await hiPage.waitForFunction(()=>document.fullscreenElement===document.documentElement);await hiPage.waitForTimeout(150);const diagnostics=await liveDiagnostics(hiPage),resolution=resolutionGate(diagnostics);assert.equal(diagnostics.dpr,2);assert.equal(diagnostics.canvas.width,1920);assert.equal(diagnostics.canvas.height,1080);await shot(hiPage,'fullscreen-shadow-dpr2.png');return {resolution,diagnostics,frameTiming:await frameSample(hiPage)};});
  await hiContext.close();await check('Exact standalone remains offline and has no renderer or browser errors',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.externalRequests,[]);assert.equal(sha(await readFile(source)),report.sha256);return {sha256:report.sha256,offline:true,sourceUnchanged:true};});completed=true;report.browserRun=true;
 }
}catch(error){report.harnessError=error.stack||error.message;console.error(error);}
finally{
 if(browser)await browser.close();report.finishedAt=new Date().toISOString();report.completed=completed;report.passed=completed&&report.checks.every(row=>row.passed);const name=prepareOnly?'source-art-report':'art-consistency-report';await writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2)+'\n');
 const summary=['AFTERLIGHT artwork consistency verification','',report.method,'','Exact portable SHA256: '+(report.sha256||'not opened; prepare-only'),report.checks.filter(row=>row.passed).length+'/'+report.checks.length+' checks passed; browser run: '+!!report.browserRun,'',...report.checks.map(row=>(row.passed?'PASS':'FAIL')+' — '+row.name+(row.error?'\n'+row.error:'')),...report.limits.map(value=>'Limit: '+value),'',report.harnessError||'','Screenshots: '+report.screenshots.join(', ')].join('\n');await writeFile(path.join(output,name+'.md'),summary+'\n');console.log('Report:',path.join(output,name+'.json'));if(!report.passed)process.exitCode=1;
}
