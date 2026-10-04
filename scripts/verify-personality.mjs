import assert from 'node:assert/strict';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'verification');
const source=path.join(root,'AFTERLIGHT.html');
const expectedGameCount=26;
const expectedAssetNames=JSON.parse(await readFile(path.join(root,'assets-manifest.json'),'utf8')).images.map(image=>image.name).sort();
const isolated=await mkdtemp(path.join(tmpdir(),'afterlight-personality-'));
await mkdir(output,{recursive:true});
await copyFile(source,path.join(isolated,'AFTERLIGHT.html'));
const base=pathToFileURL(path.join(isolated,'AFTERLIGHT.html')).href;
const bytes=await readFile(source);
const report={startedAt:new Date().toISOString(),source,isolatedDirectory:isolated,url:base,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),desktopOnly:true,method:'Exact single HTML copied alone into an isolated directory and opened offline by file://. Real title, card and board UI clicks exercise rendered personality. Deterministic public board fixtures isolate ladder, chute, penalty, protected bump and points finish; board timers accelerate waiting. No source-module imports and no direct presentation calls.',limits:['Desktop Chrome at1440×1050; this pass deliberately does not test phones.','Board fixtures set public card, position and timing state to make rare events repeatable. These are presentation checks, not naturally timed complete parties.','Dialogue content counts are read from diagnostics; character-bank selection and stale-event behavior have separate source tests.'],checks:[],pageErrors:[],consoleErrors:[],failedRequests:[],externalRequests:[],screenshots:[]};
let browser,completed=false;
const card=(id,color,value)=>({id:`personality-${id}`,color,value});
const remaining=()=>[card('remain-a','jade','2'),card('remain-b','ember','3')];
async function check(name,fn){try{const details=await fn();report.checks.push({name,passed:true,details});console.log('PASS',name);return details;}catch(error){report.checks.push({name,passed:false,error:error.stack||error.message});console.error('FAIL',name,error.message);return null;}}
async function shot(page,name){await page.screenshot({path:path.join(output,name),fullPage:true});report.screenshots.push(name);}
async function ready(page){await page.goto(base,{waitUntil:'load'});await page.waitForFunction(expected=>window.afterlight?.minigames?.length===expected&&window.afterlight.titleCast?.available,expectedGameCount,{timeout:25000});await page.waitForFunction(()=>window.afterlight.titleCast.characters?.length===4);}
async function solo(page){await ready(page);await page.locator('[data-play="solo"]').click();await page.waitForSelector('#start-solo');await page.locator('#player-name').fill('Portrait QA');await page.locator('#start-solo').click();await page.waitForSelector('#hand-panel [data-card]');await page.evaluate(()=>window.afterlight.state.players.forEach(p=>p.bot=false));}
async function fixture(page,{hand,position=0,turnIndex=0,deck,points=[0,0,0,0],opponentPosition=38,opponentShield=false}={}){
 await page.evaluate(({hand,position,turnIndex,deck,points,opponentPosition,opponentShield})=>{
  const s=window.afterlight.state,p=s.players[turnIndex];
  Object.assign(s,{phase:'board',boardStage:'await-card',turnIndex,currentPlayerId:p.id,turnDirection:1,turnsCompleted:0,activeColor:'ivory',discard:[{id:'personality-top-'+Math.random(),color:'ivory',value:'9'}],winnerId:null,finisherId:null,finishBonus:0,pendingEvent:null,storyEvent:null,boardEncounter:null,boardEncounters:[],lapCelebration:null,padEvent:null,drawnCardId:null,skipNext:false,pathOptions:[],transport:null,moveTarget:null,movesRemaining:0,moveTotal:0,chainValue:null,chainCount:0,pendingDraw:0,pendingDrawValue:null,turnOrder:s.players.map(player=>player.id),turnOrderRevision:0,timer:999,message:'Personality fixture '+Math.random(),cardEncounteredIds:[]});
  s.players.forEach((other,i)=>{other.hand?.forEach(card=>delete card.buff);Object.assign(other,{bot:false,sparks:points[i]||0,position:i===turnIndex?position:opponentPosition+i,fromPosition:i===turnIndex?position:opponentPosition+i,shield:i===1&&opponentShield,calledLast:false,shortcutChoice:null,boost:0});});
  Object.assign(p,{hand,handCount:hand.length});
  if(deck){s.deck=deck;s.deckCount=deck.length;}
  delete s.game;
 },{hand,position,turnIndex,deck,points,opponentPosition,opponentShield});
 if(turnIndex===0)await page.waitForSelector(`[data-card="${hand[0].id}"]:not([disabled])`);
 await page.waitForTimeout(100);
}
async function advanceBoard(page){await page.evaluate(async()=>{const s=window.afterlight.state;for(let n=0;n<400&&s.phase==='board';n++){const p=s.players[s.turnIndex];if(!p.bot&&['await-card','drawn-card','choose-path','choose-event','choose-chain','penalty-card'].includes(s.boardStage))return;s.timer=0;await new Promise(requestAnimationFrame);}if(s.phase==='board')throw new Error('Board advancement exceeded400frames');});}
async function clickCard(page,id){await page.locator(`[data-card="${id}"]`).click();}
async function startDialogueCapture(page){await page.evaluate(()=>{
 window.__personalityDialogue=[];window.__personalityCapturing=true;
 function sample(){
  if(!window.__personalityCapturing)return;
  const current=window.afterlight.presentation?.dialogue?.current;
  if(current){
   const dom=[...document.querySelectorAll('.dialogue-speaker')].map(el=>({side:el.dataset.side,playerId:el.dataset.playerId||el.dataset.player,category:el.dataset.category,reaction:el.dataset.reaction,speaking:el.dataset.speaking,line:el.querySelector('.dialogue-line')?.textContent,portrait:el.querySelector('.portrait')?.getAttribute('src')}));
   const signature=JSON.stringify([current.eventId,current.category,current.actorLine?.key,current.rivalLine?.key,dom.map(speaker=>[speaker.side,speaker.playerId,speaker.speaking,speaker.line])]);
   if(window.__personalityDialogue.at(-1)?.signature!==signature)window.__personalityDialogue.push({signature,current:JSON.parse(JSON.stringify(current)),dom});
  }
  requestAnimationFrame(sample);
 }
 requestAnimationFrame(sample);
});}
async function dialogueCapture(page){return page.evaluate(()=>window.__personalityDialogue.map(({signature,...record})=>record));}
function categories(records){return records.flatMap(record=>[record.current.category,record.current.type,record.current.actorLine?.category,record.current.rivalLine?.category,...record.dom.map(speaker=>speaker.category)]).filter(Boolean);}
async function eventScenario(page,{name,position,value='1',category,reply,setup,verify}){
 await fixture(page,{position,hand:[card(name,'ivory',value),...remaining()]});
 if(setup)await page.evaluate(setup);
 await startDialogueCapture(page);
 await clickCard(page,`personality-${name}`);
 await advanceBoard(page);
 await page.waitForFunction(expected=>window.__personalityDialogue.some(record=>record.current.category===expected||record.current.type===expected||record.dom.some(speaker=>speaker.category===expected)),category,{timeout:8000});
 if(reply)await page.waitForFunction(expected=>window.__personalityDialogue.some(record=>record.current.rivalLine?.category===expected||record.dom.some(speaker=>speaker.category===expected)),reply,{timeout:8000});
 await page.waitForTimeout(150);
 const records=await dialogueCapture(page),observed=categories(records);
 assert.ok(observed.includes(category),`${category} dialogue not observed: ${JSON.stringify(observed)}`);
 assert.ok(records.some(record=>record.dom.some(speaker=>speaker.speaking==='true'&&speaker.line?.trim().length>10)),`${category} has no rendered spoken line`);
 const state=await page.evaluate(()=>({lastEvent:window.afterlight.state.lastEvent,positions:window.afterlight.state.players.map(p=>p.position),hands:window.afterlight.state.players.map(p=>p.hand.length),points:window.afterlight.state.players.map(p=>p.sparks),encounter:window.afterlight.state.boardEncounter,penaltyBaseline:window.__personalityBeforePenalty,pendingDraw:window.afterlight.state.pendingDraw,pendingDrawValue:window.afterlight.state.pendingDrawValue,stage:window.afterlight.state.boardStage}));
 if(verify)verify(state);
 await shot(page,`personality-${name}.png`);
 await page.evaluate(()=>window.__personalityCapturing=false);
 return {category,observed,records,state,fixture:'Public deterministic hand/position fixture followed by an actual card button click'};
}

try{
 const options={headless:true,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']};
 try{await access('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');options.executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';}catch{}
 browser=await chromium.launch(options);report.browserVersion=browser.version();
 const context=await browser.newContext({offline:true,viewport:{width:1440,height:1050},reducedMotion:'no-preference'});
 const page=await context.newPage();
 page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
 page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
 page.on('request',request=>{if(!request.url().startsWith('blob:')&&!request.url().startsWith('data:')&&request.url()!==base)report.externalRequests.push(request.url());});
 await ready(page);
 await check('Exact offline HTML draws the four left-facing original title travelers with72prepared poses',async()=>{
  assert.deepEqual(await readdir(isolated),['AFTERLIGHT.html']);
  const title=await page.evaluate(()=>({cast:window.afterlight.titleCast,animation:window.afterlight.animation,assets:Object.keys(window.AFTERLIGHT_ASSETS)}));
  assert.equal(title.cast.available,true);assert.deepEqual(title.cast.characters.map(p=>p.character).sort(),[0,1,2,3]);assert.ok(title.cast.characters.every(p=>p.facing===-1));assert.equal(title.animation.frames,72);assert.deepEqual(title.assets.sort(),expectedAssetNames);
  const canvas=await page.locator('.title-cast canvas').evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let visible=0;for(let i=3;i<data.length;i+=64)if(data[i])visible++;return {width:c.width,height:c.height,visible};});assert.ok(canvas.visible>100);
  const layout=await page.evaluate(()=>{const copy=document.querySelector('.hero-copy').getBoundingClientRect(),cast=document.querySelector('.title-cast').getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},scrollHeight:document.documentElement.scrollHeight,copyCenter:copy.x+copy.width/2,castCenter:cast.x+cast.width/2};});
  assert.ok(layout.scrollHeight<=layout.viewport.height+1,'Desktop title must fit the viewport vertically');assert.ok(layout.copyCenter<layout.viewport.width*.4,'Title menu must sit on the left');assert.ok(layout.castCenter>layout.viewport.width*.65,'Title cast must sit on the right');
  await shot(page,'personality-title-idle.png');return {...title,canvas,layout};
 });
 await check('Malformed saved traveler indices recover before the real portrait picker renders',async()=>{
  const original=await page.evaluate(()=>window.afterlight.ui.profile),cases=[];
  for(const [saved,expected]of [[3.5,0],['pilgrim',0],['7',7]]){
   await page.evaluate(character=>localStorage.setItem('afterlight-profile',JSON.stringify({name:'Saved traveler QA',character,difficulty:'medium'})),saved);
   await ready(page);assert.equal(await page.evaluate(()=>window.afterlight.ui.profile.character),expected);
   await page.locator('[data-play="solo"]').first().click();await page.waitForSelector('#start-solo');
   assert.equal(await page.locator('.character-choice.selected').getAttribute('data-character'),String(expected));
   cases.push({saved,expected,selected:expected});
  }
  await page.evaluate(profile=>localStorage.setItem('afterlight-profile',JSON.stringify(profile)),original);await ready(page);
  return {cases,method:'Saved fractional/legacy values and a valid numeric string pass through actual startup and the portrait picker; no profile or renderer diagnostics are substituted.'};
 });
 await check('Actual title selection plays four distinct gestures then covers and reveals the destination',async()=>{
  await page.evaluate(()=>{window.__personalityTitle=[];window.__personalityTitleCapturing=true;function sample(){if(!window.__personalityTitleCapturing)return;const cast=window.afterlight.titleCast,overlay=document.querySelector('.title-transition-overlay');window.__personalityTitle.push({time:performance.now(),route:window.afterlight.route,covered:overlay?.dataset.covered==='true'||overlay?.classList.contains('is-covered')||!!overlay&&Number(getComputedStyle(overlay).opacity)>.25,cast:JSON.parse(JSON.stringify(cast))});requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  await page.locator('.mode-card[data-nav="arcade"]').click();
  await page.waitForFunction(()=>window.afterlight.route==='arcade',null,{timeout:5000});
  await page.waitForTimeout(350);
  const samples=await page.evaluate(()=>{window.__personalityTitleCapturing=false;return window.__personalityTitle;});
  const active=samples.filter(sample=>sample.cast?.celebrating&&sample.cast.characters?.some(frame=>frame.phase==='active'));
  assert.ok(active.length>4,'Title must spend multiple rendered frames celebrating before navigation');
  const gestures=[0,1,2,3].map(character=>{const frames=active.flatMap(sample=>sample.cast.characters.filter(frame=>frame.character===character));return {character,maxJump:Math.max(...frames.map(frame=>frame.jump)),maxTravel:Math.max(...frames.map(frame=>Math.abs(frame.dx))),props:[...new Set(frames.map(frame=>frame.prop?.kind).filter(Boolean))],effects:[...new Set(frames.map(frame=>frame.effect))]};});
  assert.equal(new Set(gestures.map(gesture=>JSON.stringify([Math.round(gesture.maxJump),Math.round(gesture.maxTravel),gesture.props]))).size,4,'All four title gestures must differ');
  assert.ok(samples.some(sample=>sample.covered),'Transition must visibly cover the title before arrival');
  assert.ok(samples.some(sample=>sample.route==='arcade'&&!sample.covered),'Destination must become visible after cover');
  await shot(page,'personality-title-destination.png');return {samples:samples.length,celebrationFrames:active.length,gestures,covered:true,destination:'arcade'};
 });
 await check('Large eight-traveler picker fits desktop sizes and sends the chosen difficulty into real play',async()=>{
  await page.locator('[data-practice="0"]').click();assert.equal(await page.locator('[data-character]').count(),8);
  assert.equal(await page.locator('[data-difficulty="medium"]').getAttribute('aria-pressed'),'true');
  const fits=[];for(const viewport of [{width:1440,height:1050},{width:1280,height:900}]){
   await page.setViewportSize(viewport);const layout=await page.evaluate(()=>{const modal=document.querySelector('.traveler-modal'),bounds=modal.getBoundingClientRect(),portraits=[...modal.querySelectorAll('.character-choice .portrait')].map(img=>{const r=img.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),spotlight=modal.querySelector('.spotlight-portrait').getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},scroll:modal.scrollHeight,client:modal.clientHeight,portraits,spotlightHeight:spotlight.height};});
   assert.ok(layout.bounds.x>=0&&layout.bounds.y>=0&&layout.bounds.x+layout.bounds.width<=viewport.width&&layout.bounds.y+layout.bounds.height<=viewport.height,'Picker frame fits desktop viewport');assert.ok(layout.scroll<=layout.client+1,'Picker needs no inner scrolling at the supported desktop sizes');assert.ok(layout.portraits.every(p=>p.height>=140&&p.x>=0&&p.x+p.width<=viewport.width&&p.y>=0&&p.y+p.height<=viewport.height),'All eight original portraits are large and visible');assert.ok(layout.spotlightHeight>=225);fits.push(layout);
  }
  await page.setViewportSize({width:1440,height:1050});
  const selection=[];for(let id=0;id<8;id++){await page.locator(`[data-character="${id}"]`).click();const current=await page.evaluate(()=>({picked:document.querySelector('[data-character].selected').dataset.character,title:document.querySelector('.traveler-description h3').textContent,special:document.querySelector('.traveler-description>b').textContent,description:document.querySelector('.traveler-description p').textContent,outfit:document.querySelector('.traveler-role').textContent}));assert.equal(current.picked,String(id));assert.ok(current.description.length>20&&current.outfit.length>10);selection.push(current);}
  assert.equal(new Set(selection.map(p=>p.title)).size,8);assert.equal(new Set(selection.map(p=>p.special)).size,8);
  await page.locator('[data-difficulty="easy"]').click();await shot(page,'personality-character-picker.png');await page.locator('#start-solo').click();await page.waitForSelector('#begin-minigame');await page.locator('#begin-minigame').click();await page.waitForFunction(()=>window.afterlight.state?.game);assert.equal(await page.evaluate(()=>window.afterlight.state.game.botDifficulty),'easy');
  const font=await page.evaluate(()=>({body:getComputedStyle(document.body).fontFamily,hud:window.afterlight.ui.fontFamily,loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),canvas:{width:document.querySelector('#game-canvas').width,height:document.querySelector('#game-canvas').height,smoothing:document.querySelector('#game-canvas').getContext('2d').imageSmoothingEnabled}}));assert.match(font.body,/Alegreya/);assert.match(font.hud,/Alegreya SC/);assert.ok(font.loaded.some(f=>/Alegreya SC/.test(f))&&font.loaded.some(f=>/Alegreya/.test(f)&&!/ SC/.test(f)));assert.ok(font.canvas.width>960&&font.canvas.width<=1920&&font.canvas.height<=1080);assert.equal(font.canvas.smoothing,true);
  await page.locator('#match-menu').click();await page.locator('#quit').click();await page.locator('[data-play="solo"]').click();await page.waitForSelector('#start-solo');await page.locator('[data-difficulty="hard"]').click();await page.locator('#start-solo').click();await page.waitForSelector('#hand-panel');assert.equal(await page.evaluate(()=>window.afterlight.state.botDifficulty),'hard');await page.evaluate(()=>{const s=window.afterlight.state;s.phase='minigame-intro';s.nextGame=0;s.message='Difficulty UI fixture';});await page.waitForSelector('#begin-minigame');await page.locator('#begin-minigame').click();await page.waitForFunction(()=>window.afterlight.state?.game);assert.equal(await page.evaluate(()=>window.afterlight.state.game.botDifficulty),'hard');
  return {fits,selection,font,practiceDifficulty:'easy',soloDifficulty:'hard',method:'Actual character/difficulty/start UI; only solo minigame invitation is accelerated with a public party fixture'};
 });
 await solo(page);
 await check('All eight travelers have at least50context lines and a consistent total bank',async()=>{
  const bank=await page.evaluate(()=>window.afterlight.banter);
  assert.equal(bank.characters.length,8);assert.equal(bank.total,bank.characters.reduce((sum,character)=>sum+character.lines,0));assert.ok(bank.characters.every(character=>character.lines>=50));assert.equal(new Set(bank.characters.map(character=>character.id)).size,8);return bank;
 });
 await check('Played card and animated flight land at the projected ring center',async()=>{
  await fixture(page,{hand:[card('center','ivory','1'),...remaining()]});
  const before=await page.evaluate(()=>{const el=document.querySelector('.ring-discard .realm-card'),r=el.getBoundingClientRect();return {card:{x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2},ring:window.afterlight.presentation.ring};});
  await page.evaluate(()=>window.__personalityPortraitBefore={left:document.querySelector('.dialogue-speaker[data-side="left"] .portrait'),right:document.querySelector('.dialogue-speaker[data-side="right"] .portrait')});
  assert.ok(Math.abs(before.card.cx-before.ring.x)<2&&Math.abs(before.card.cy-before.ring.y)<2,'Discard card must be centered at ring projection');
  await clickCard(page,'personality-center');await page.waitForSelector('.card-flight');
  const flight=await page.locator('.card-flight').evaluate(el=>({toX:parseFloat(el.style.getPropertyValue('--to-x')),toY:parseFloat(el.style.getPropertyValue('--to-y')),keyframes:el.getAnimations()[0]?.effect.getKeyframes().map(frame=>frame.transform),ring:window.afterlight.presentation.ring}));
  assert.ok(Math.abs(flight.toX-flight.ring.x)<2&&Math.abs(flight.toY-flight.ring.y)<2,'Flight target must equal projected ring center');assert.ok(flight.keyframes.some(frame=>frame.includes('rotate')));
  const impact=await page.evaluate(()=>new Promise((resolve,reject)=>{const start=performance.now();function sample(){const el=document.querySelector('.card-flight'),animation=el?.getAnimations()[0],duration=el?parseFloat(getComputedStyle(el).animationDuration)*1000:Infinity;if(animation?.currentTime>=duration){const r=el.querySelector('.realm-card').getBoundingClientRect();resolve({x:r.x+r.width/2,y:r.y+r.height/2,toX:parseFloat(el.style.getPropertyValue('--to-x')),toY:parseFloat(el.style.getPropertyValue('--to-y')),elapsed:animation.currentTime,duration});}else if(performance.now()-start>2000)reject(new Error('Natural final flight frame was not observed'));else requestAnimationFrame(sample);}requestAnimationFrame(sample);}));
  assert.ok(Math.abs(impact.x-impact.toX)<2&&Math.abs(impact.y-impact.toY)<2,'Rendered final card center must land at its requested ring coordinate');
  await page.waitForTimeout(150);const portraits=await page.evaluate(()=>({left:window.__personalityPortraitBefore.left===document.querySelector('.dialogue-speaker[data-side="left"] .portrait'),right:window.__personalityPortraitBefore.right===document.querySelector('.dialogue-speaker[data-side="right"] .portrait')}));assert.equal(portraits.left,true,'Local portrait node must persist across actor line and delayed reply');assert.equal(portraits.right,true,'Opponent portrait node must persist across actor line and delayed reply');await shot(page,'personality-center-card.png');return {before,flight,impact,portraitNodesPreserved:portraits};
 });
 await check('Local portrait stays left while the moving opponent appears on the right',async()=>{
  await fixture(page,{turnIndex:1,position:0,hand:[card('rival-move','ivory','4'),...remaining()]});
  // A computer opponent uses the actual bot turn path; the fixture only makes
  // their matching card and wait deterministic, without calling presentation.
  await page.evaluate(()=>{const s=window.afterlight.state;s.players[1].bot=true;s.timer=0;});
  await page.waitForFunction(()=>window.afterlight.state.boardStage==='moving');
  const speakers=await page.locator('.dialogue-speaker').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {side:el.dataset.side,playerId:el.dataset.playerId||el.dataset.player,moving:el.dataset.moving,portrait:!!el.querySelector('.portrait'),x:r.x,width:r.width};}));
  const data=await page.evaluate(()=>({presentation:window.afterlight.presentation,localId:window.afterlight.state.players.find(p=>p.id==='local').id,currentId:window.afterlight.state.currentPlayerId}));
  const left=speakers.find(speaker=>speaker.side==='left'),right=speakers.find(speaker=>speaker.side==='right');assert.ok(left?.portrait&&right?.portrait);assert.equal(left.playerId,data.localId);assert.ok(right.x>left.x);assert.ok(right.playerId!==left.playerId,'Right portrait is an opponent');assert.equal(right.playerId,data.currentId);assert.equal(right.moving,'true');
  await shot(page,'personality-portrait-duet.png');await page.evaluate(()=>window.afterlight.state.players[1].bot=false);return {speakers,data,fixture:'Matching four-step card acted on by the real computer-turn path'};
 });
 await check('Ladder climb receives a character line and positive snapback',()=>eventScenario(page,{name:'ladder',position:4,category:'ladder',reply:'reply-good',verify:state=>assert.equal(state.positions[0],26)}));
 await check('Chute fall receives a character line and bad-play snapback',()=>eventScenario(page,{name:'chute',position:20,category:'chute',reply:'reply-bad',verify:state=>assert.equal(state.positions[0],10)}));
 await check('Draw attack announces its pending stack with character dialogue',()=>eventScenario(page,{name:'draw-stack',position:0,value:'draw2',category:'stack',setup:()=>{window.__personalityBeforePenalty=window.afterlight.state.players[1].hand.length;},verify:state=>{assert.equal(state.hands[1],state.penaltyBaseline,'Debt waits for the recipient decision');assert.equal(state.pendingDraw,2);assert.equal(state.pendingDrawValue,'draw2');assert.equal(state.stage,'penalty-card');}}));
 await check('Taking pending debt gives the recipient a penalty line and rival snapback',async()=>{
  await fixture(page,{hand:[card('take-debt-a','ivory','7'),card('take-debt-b','ember','8')],deck:[card('take-draw-a','violet','3'),card('take-draw-b','jade','4')]});await page.evaluate(()=>{const s=window.afterlight.state;s.boardStage='penalty-card';s.pendingDraw=2;s.pendingDrawValue='draw2';s.message='Personality pending debt '+Math.random();});await page.waitForFunction(()=>document.querySelector('#draw-card')?.textContent==='Take +2');await startDialogueCapture(page);await page.locator('#draw-card').click();await page.waitForFunction(()=>window.__personalityDialogue.some(record=>record.current.category==='draw-penalty'));await page.waitForTimeout(850);const records=await dialogueCapture(page),observed=categories(records);assert.ok(observed.includes('draw-penalty')&&observed.includes('reply-bad'));const state=await page.evaluate(()=>({hand:window.afterlight.state.players[0].hand.length,pending:window.afterlight.state.pendingDraw,current:window.afterlight.state.currentPlayerId}));assert.equal(state.hand,4);assert.equal(state.pending,0);assert.notEqual(state.current,'local');assert.ok(records.some(record=>record.dom.some(s=>s.side==='left'&&s.speaking==='true'&&s.line?.length>10)));await shot(page,'personality-take-debt.png');await page.evaluate(()=>window.__personalityCapturing=false);return {records,observed,state,fixture:'Explicit pending+2 with known two-card deck; actual Take+2 UI produces recipient dialogue and draw'};
 });
 await check('An ordinary Thorn Toll pad receives a bad-outcome line and matching snapback',()=>eventScenario(page,{name:'thorn-pad',position:0,category:'pad-bad',reply:'reply-bad',setup:()=>{window.afterlight.state.players[0].sparks=10;},verify:state=>assert.equal(state.points[0],7)}));
 await check('Protected occupied landing produces a blocked-bump line and opponent comeback',()=>eventScenario(page,{name:'bump-blocked',position:0,category:'bump-blocked',setup:()=>{const s=window.afterlight.state;s.players[1].position=1;s.players[1].fromPosition=1;s.players[1].shield=true;},verify:state=>{assert.equal(state.positions[1],1);assert.ok(state.encounter.moves.some(move=>move.blocked));}}));
 await check('Final-card points defeat gives disappointed finisher and winning rival dialogue',async()=>{
  await fixture(page,{hand:[card('finish-bad','ivory','1')],points:[40,80,10,10]});await startDialogueCapture(page);await clickCard(page,'personality-finish-bad');await page.waitForFunction(()=>window.afterlight.state.phase==='finished');await page.waitForTimeout(1500);const records=await dialogueCapture(page),observed=categories(records);assert.ok(observed.includes('finish-bad'),`Missing losing-finisher line: ${JSON.stringify(observed)}`);const state=await page.evaluate(()=>({winner:window.afterlight.state.winnerId,finisher:window.afterlight.state.finisherId,bonus:window.afterlight.state.finishBonus,points:window.afterlight.state.players.map(p=>p.sparks)}));assert.notEqual(state.winner,state.finisher);assert.equal(state.bonus,10);assert.equal(state.points[0],50);assert.ok(records.some(record=>record.dom.some(speaker=>speaker.speaking==='true'&&speaker.line?.length>10)));await shot(page,'personality-points-finish.png');await page.evaluate(()=>window.__personalityCapturing=false);return {records,observed,state};
 });
 await check('Exact personality file has no external art requests or browser errors',async()=>{assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.failedRequests,[]);return {externalRequests:0,pageErrors:0,consoleErrors:0,failedRequests:0};});
 await context.close();
 completed=true;
}catch(error){
 report.harnessError=error.stack||error.message;
 throw error;
}finally{
 if(browser)await browser.close();
 report.finishedAt=new Date().toISOString();report.completed=completed;report.currentSourceHash=createHash('sha256').update(await readFile(source)).digest('hex');report.sourceUnchanged=report.currentSourceHash===report.sha256;report.passed=completed&&report.sourceUnchanged&&report.checks.length>0&&report.checks.every(check=>check.passed);
 await writeFile(path.join(output,'personality-report.json'),JSON.stringify(report,null,2)+'\n');
 const text=['# AFTERLIGHT desktop personality verification','',`Exact HTML SHA256: \`${report.sha256}\``,`${report.bytes.toLocaleString()} bytes · ${report.checks.filter(check=>check.passed).length}/${report.checks.length} checks passed · completed: ${completed}`,'',report.method,'',...report.checks.map(check=>`- ${check.passed?'PASS':'FAIL'} — ${check.name}${check.error?`\n\n${check.error}`:''}`),...(report.harnessError?['','Harness stopped:',report.harnessError]:[]),'','Limits:',...report.limits.map(limit=>`- ${limit}`),'',`Screenshots: ${report.screenshots.join(', ')}`,''].join('\n');
 await writeFile(path.join(output,'personality-report.md'),text);
 if(!report.passed)process.exitCode=1;
}
