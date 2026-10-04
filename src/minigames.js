import {BOARDGAME_CHALLENGES,createChallenge,stepChallenge,drawChallenge,getChallengeResults} from './boardgame-challenges.js';
import {drawGameHUD} from './game-hud.js';
/** Host-authoritative catalog: ten paper diversions, a contested feast and thirteen platform objectives. */
import {BRAWL_GAMES,createBrawl,stepBrawl,drawBrawl,getBrawlResults} from './brawlers.js';
import {GULLET_GAME,createGullet,stepGullet,drawGullet,getGulletResults} from './gullet-gala.js';
import {sceneLighting,scenePanel,SCENE_LAYOUT} from './scene-lighting.js';
import {initializeMinigameSurprises,prepareMinigameSurprises,finishMinigameSurprises,drawMinigameSurprises,drawMinigameSurpriseCue} from './minigame-surprises.js';
import {configureBotDifficulty,normalizeBotDifficulty,botControl,botTarget,botTimingOffset} from './bot-difficulty.js';
const REPLACEMENTS={"memory": "bell-breakers", "tug": "relic-launch", "fishing": "hollow-horde", "balance": "rift-ball", "sorting": "spark-heist", "reaction": "fuse-festival", "crates": "tower-relay", "cipher": "colossus-wake", "orbit": "bellows-boxing", "potato": "gullet-gala"};
const CHALLENGE_IDS=new Set(BOARDGAME_CHALLENGES.map(game=>game.id));
const BRAWL_IDS=new Set(BRAWL_GAMES.map(game=>game.id));
export const MINIGAMES = [
  ['inkfall','INKFALL','DODGE','Dodge changing gear waves; chain daring phases through the teeth to recharge your dash.','← → move · Space phase-dash · gear waves change every 7s · close phases recharge',36,'gear'],
  ['mothlight','MOTH LIGHT','COLLECT','Flutter between rare moths, risk a heavy cargo, then bank quickly before the wisp steals it.','Arrows move · Space banks at the nest / flutters outside it · rare cargo earns more',36,'spark'],
  ['sweep','LAST TRAIN','JUMP','Read low and high ghost trains; build streaks and risk close clears through express passes.','Space jumps LOW trains · hold ↓ under HIGH trains · close low clears earn more',34,'lantern'],
  ['rhythm','PAPER PULSE','RHYTHM','Read changing moon/sun phrases, switch instruments, and finish clean phrases for an encore.','← moon / → sun instrument · Space hits matching notes · clean 8-note phrases earn encores',36,'orb'],
  ['maze','BACK ALLEYS','MAZE','Hunt shifting runes, chain phases through shelves, and turn each key into a fast escape.','Arrows move · Space phases 2 tiles · key then exit · new runes recharge phase chains',40,'key'],
  ['memory','ECHO CHAMBER','MEMORY','Repeat, mirror, or reverse each crystal spell; buy a hint only when you need it.','Arrow keys echo the spell · follow NORMAL / MIRROR / REVERSE · Space hint costs 4',39,'orb'],
  ['redlight','WATCHMAN','STEALTH','Sprint through green windows, slip into moving cover, and chain clean deliveries past the patrol.','↑ advance · ← → cover lane · ↓ crouch in lit cover · Space sprints · clean cover slips chain bonuses',36,'drone'],
  ['tug','PULL THE SUN','MASH','Swap eclipse chains when the mechanism turns; rest before its gears overheat.','← → choose chain · tap Space on the lit side · hold ↓ to cool the gears',34,'lantern'],
  ['raft','SINKING CITY','SURVIVAL','Chain landings between shifting islands, brace against gusts, and risk a detour for sky shards.','← → move · Space jumps · ↓ braces · long safe landings chain · gold shards +12',36,'platform'],
  ['gallery','PAPER SNIPER','AIM','Thread shots past blue couriers, break rotating armor, and charge for marked sentinels.','← → aim · ↓ steady · tap Space fires · hold/release pierces armor · spare BLUE',36,'drone'],
  ['fishing','DEEP SIGNAL','TIMING','Hook a relic, fight its changing pull, and ease the line before it snaps.','Space hooks / reels · match ← → fight arrow · ↓ eases dangerous line tension',38,'key'],
  ['balance','HIGH WIRE','BALANCE','Cross the high wire during changing gusts; brace or spend your emergency catch.','← → balance · ↑ crosses for bonuses · ↓ braces · Space emergency catch',36,'umbrella'],
  ['sorting','NIGHT SHIFT','SORT','Stamp fragile parcels, beat express deadlines, and chain accurate deliveries.','← → bin · ↓ stamps FRAGILE · Space sends · ↑ reroutes for 1 point',36,'crate'],
  ['reaction','FALSE DAWN','REACTION','Select the coming sigil before dawn, then decide whether to double your wager.','← → match the sigil · Space on GOLD only · ↑ while waiting doubles the stakes',34,'spark'],
  ['trace','CONSTELLATION','PATH','Race drifting stars for quick-link bonuses that refill focus, then shield through crossing comets.','Arrows move · hold Space slows / shields / extends reach · quick links refill focus',38,'orb'],
  ['potato','BAD OMEN','PASS','Choose your rival, double the curse, or reflect a pass at the last moment.','← → recipient · Space passes · ↑ doubles curse · ↓ briefly reflects incoming passes',36,'orb'],
  ['crates','DEAD LETTER','PUZZLE','Return two differently marked reliquaries per room; undo only your last three mistakes.','Arrows push BOTH relics to matching seals · Space undoes a push (3 per room)',40,'crate'],
  ['orbit','MOON RUNNER','ORBIT','Switch between two moon tracks as thorns migrate and stars alternate lanes.','↑ inner / ↓ outer orbit · Space reverses · follow alternating stars and avoid thorns',36,'spike'],
  ['cipher','LOCKSMITH','CODE','Memorize a fading code, follow reversed locks, and wind the clock under pressure.','← → symbol · Space confirms · ↑ peeks for 2 points · hold ↓ to wind the timer',38,'gear'],
  ['shadow','SHADOW PLAY','CHASE','Risk a full relic cargo for a large altar bonus, then lure the keeper with a close decoy.','Arrows move · Space dash · ↓ at altar banks · ↓ + Space decoy · full cargo bonus',38,'lantern'],
].map(([id,name,tag,description,instructions,duration,icon])=>({id,name,tag,description,instructions,duration,icon})).map(def=>REPLACEMENTS[def.id]?(REPLACEMENTS[def.id]==='gullet-gala'?GULLET_GAME:BRAWL_GAMES.find(g=>g.id===REPLACEMENTS[def.id])):def).concat(BRAWL_GAMES.slice(0,4),BOARDGAME_CHALLENGES);

const TAU=Math.PI*2, W=960,H=540;
const INK='#101215', PAPER='#e9e1cc', MUTED='#8b8b83', GOLD='#edc87c', RED='#d27568';
const COLORS=['#e7c885','#8dc4bf','#baacd7','#d6a497'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const wrap=n=>(n%TAU+TAU)%TAU;
const angleGap=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const DIRS=[[0,-1],[1,0],[0,1],[-1,0]], KEYS=['up','right','down','left'];
function random(g){let x=g.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;g.rng=x>>>0;return g.rng/4294967296;}
const pick=(g,n)=>Math.floor(random(g)*n);
function newTarget(g,p){p.target={x:85+random(g)*790,y:135+random(g)*295};}
function cleanInput(v={}){return {left:!!v.left,right:!!v.right,up:!!v.up,down:!!v.down,action:!!v.action};}
function move(p,i,dt,speed=200){const x=Number(i.right)-Number(i.left),y=Number(i.down)-Number(i.up),n=Math.hypot(x,y)||1;p.x=clamp(p.x+x/n*speed*dt,48,912);p.y=clamp(p.y+y/n*speed*dt,108,430);}
function flash(p,message,color=GOLD){p.message=message;p.messageColor=color;p.flash=0.9;}
function direction(i,prev){return KEYS.findIndex(k=>i[k]&&!prev[k]);}
function mazeSetup(p){p.cx=0;p.cy=0;p.hasKey=false;p.walk=0;const targets=[{x:6,y:0},{x:6,y:6},{x:0,y:6},{x:5,y:2},{x:3,y:3},{x:0,y:0}];p.keyTile={...targets[p.level*2%6]};p.exitTile={...targets[(p.level*2+1)%6]};p.huntTile={...[{x:4,y:3},{x:1,y:2},{x:5,y:5},{x:3,y:6},{x:0,y:3},{x:2,y:5}][p.level%6]};p.huntFound=false;p.phaseSeen=[];p.phaseChain=0;p.phaseWindow=0;}
// Each block leaves a two-cell corridor around its ends. The key and exit are reachable.
const MAZE=['0000000','0110110','0000100','0100000','0101100','0000000','0000000'];
function crateSetup(g,p){
  const rot=point=>{let [x,y]=point;for(let k=0;k<p.level%4;k++)[x,y]=[4-y,x];return {x,y};};
  const mode=p.level%3,layouts=[[[2,1,4,1],[2,3,4,3]],[[2,1,4,1],[2,3,0,3]],[[1,2,1,0],[3,2,3,4]]];p.boxes=layouts[mode].map(([x,y,tx,ty],j)=>({...rot([x,y]),tx:rot([tx,ty]).x,ty:rot([tx,ty]).y,delivered:false,kind:j}));p.walls=[rot([2,2])];
  const start=rot(mode===2?[1,3]:[1,1]);p.cx=start.x;p.cy=start.y;p.walk=0;p.history=[];p.undos=3;syncCrates(p);
}
function syncCrates(p){const b=p.boxes.find(b=>!b.delivered)||p.boxes[0];p.crateX=b.x;p.crateY=b.y;p.tx=b.tx;p.ty=b.ty;}
function cipherSetup(g,p){p.code=[pick(g,5),pick(g,5),pick(g,5)];p.order=p.level%2?[2,1,0]:[0,1,2];p.dial=0;p.symbol=0;p.lockClock=10;p.reveal=3;}
function rhythmTime(beat){let time=.8;for(let j=0;j<beat;j++)time+=Math.max(.38,.65-Math.floor(j/8)*.055);return time;}
function rhythmNearest(t){let beat=0;while(beat<100&&rhythmTime(beat+1)<t)beat++;return Math.abs(rhythmTime(beat+1)-t)<Math.abs(rhythmTime(beat)-t)?beat+1:beat;}
function rhythmLane(beat){if(beat<24)return Math.floor(beat/2)%2;const phrase=Math.floor(beat/8)%3,index=beat%8;return [[0,1,0,1,1,0,1,0],[1,1,0,1,0,0,1,0],[0,0,1,0,1,1,0,1]][phrase][index];}
function memoryAnswer(p){const index=p.cycle%3===2?p.sequence.length-1-p.answer:p.answer;return (p.sequence[index]+(p.cycle%3===1?2:0))%4;}
function nextParcel(g,p){p.parcel=pick(g,3);p.fragile=pick(g,3)===0;p.stamped=false;p.deadline=3.8+random(g)*2;p.express=pick(g,3)===0;}
const NEST={x:480,y:403},ALTAR={x:480,y:408};
const MAZE_GATES=[{x:3,y:0},{x:6,y:3},{x:2,y:5}];
function gateClosed(g,x,y){const gate=MAZE_GATES.findIndex(v=>v.x===x&&v.y===y);return gate>=0&&(Math.floor(g.time/2)+gate)%3===0;}
function tracePoint(g,p,index=p.node){const q=p.route[index];return {x:clamp(q.x+Math.sin(g.time*.8+index+p.slot)*13,65,900),y:clamp(q.y+Math.cos(g.time*.65+index)*10,143,425)};}
function hiddenInCourt(p){return [{x:185,y:235},{x:775,y:310}].some(z=>dist(z,p)<42);}
export function createGame(id,players,seed=1,options={}){
 const def=MINIGAMES.find(m=>m.id===id);if(!def)throw new Error(`Unknown minigame: ${id}`);if(!players?.length||players.length>4)throw new Error('Minigames require 1–4 players');
 const botOptions={difficulty:normalizeBotDifficulty(typeof options==='string'?options:options?.difficulty)};
 if(CHALLENGE_IDS.has(id))return initializeMinigameSurprises(createChallenge(id,players,seed,botOptions),seed);
 if(id==='gullet-gala')return initializeMinigameSurprises(createGullet(players,seed,botOptions),seed);
 if(BRAWL_IDS.has(id))return initializeMinigameSurprises(createBrawl(id,players,seed,botOptions),seed);
 const g={id,time:0,duration:def.duration,done:false,rng:(seed>>>0)||1,players:players.map((p,j)=>({id:p.id,name:p.name,character:p.character,bot:!!p.bot,slot:j,score:0,x:players.length===1?480:160+j*640/(players.length-1),y:390,prev:cleanInput(),cooldown:0,flash:0,walk:0,level:0,botClock:0,combo:0,ability:0,guard:0})),state:{objects:[],timer:0,round:0,beat:0}};
 const s=g.state;
 for(const p of g.players){p.color=COLORS[p.slot];
  switch(id){
   case 'inkfall':p.dash=0;p.dashDir=1;break;
   case 'mothlight':p.carry=0;p.banked=0;p.boost=0;p.rareCargo=0;p.lastCatch=-10;break;
   case 'sweep':p.jump=0;p.vy=0;p.lastSweep=-1;p.duck=false;break;
   case 'rhythm':p.lastBeat=-1;p.track=0;p.judgedBeat=-1;p.phrase=-1;p.phraseHits=0;p.phrasePerfect=0;p.encores=0;p.echoAt=0;p.echoBeat=-1;p.echoClaimed=-1;break;
   case 'maze':mazeSetup(p);p.facing=1;p.rune=0;break;
   case 'memory':p.sequence=[pick(g,4),pick(g,4),pick(g,4)];p.answer=0;p.cycle=-1;p.hint=0;break;
   case 'redlight':p.progress=0;p.lane=1;p.alert=0;p.coverPhase=-1;p.deliveries=0;p.cleanChain=0;break;
   case 'tug':p.heat=0;p.grip=0;p.jammed=0;break;
   case 'raft':p.x=480;p.safe=true;p.jump=0;p.takeoffX=480;break;
   case 'gallery':p.aim=.5;p.charge=0;break;
   case 'fishing':p.phase=random(g)*TAU;p.arc=random(g)*TAU;p.hooked=false;p.reel=0;p.tension=.25;p.fight=1;break;
   case 'balance':p.lean=(random(g)-.5)*.2;p.velocity=0;p.crossing=0;break;
   case 'sorting':p.bin=1;p.parcel=pick(g,3);p.fragile=false;p.stamped=false;p.deadline=5;p.express=false;break;
   case 'reaction':p.answered=-1;p.choice=0;p.wager=false;break;
   case 'trace':p.route=Array.from({length:6},()=>({x:80+random(g)*800,y:150+random(g)*260}));p.node=0;p.x=p.route[0].x;p.y=p.route[0].y;p.focus=1;p.focusExhausted=false;p.linkTime=0;break;
   case 'potato':p.recipient=(p.slot+1)%players.length;p.parry=0;break;
   case 'crates':crateSetup(g,p);break;
   case 'orbit':p.angle=p.slot*TAU/g.players.length;p.dir=1;p.spark=wrap(p.angle+1.4);p.thorn=wrap(p.angle+3);p.orbitLane=0;p.sparkLane=0;p.thornLane=0;p.hit=0;break;
   case 'cipher':cipherSetup(g,p);break;
   case 'shadow':p.relics=0;p.banked=0;p.dash=0;break;
  }
 }
 if(id==='inkfall'){s.wave=0;s.press=0;}
 if(id==='mothlight'){for(let n=0;n<13;n++)s.objects.push({id:n,x:70+random(g)*820,y:150+random(g)*240,phase:random(g)*TAU,value:n%5===0?3:1});s.wisp={x:480,y:210};}
 if(id==='sweep'){s.next=1.6;s.count=0;s.height='low';s.express=false;}
 if(id==='redlight'){s.phase=0;s.timer=1.5;s.green=true;}
 if(id==='raft'){s.safe=2;s.next=2.5;s.previous=2;s.upcoming=pick(g,5);s.warning=false;s.shard=4;s.shardTimer=0;s.wind=0;}
 if(id==='gallery')s.objects=Array.from({length:5},(_,j)=>({id:j,x:110+j*180,y:150+(j%3)*48,speed:(j%2?1:-1)*(55+random(g)*35),respawn:0,friendly:j===4,marked:j===0,open:true}));
 if(id==='reaction'){s.signal='wait';s.next=1+random(g)*1.5;s.signalTime=0;s.round=0;s.symbol=0;}
 if(id==='potato'){s.holder=0;s.fuse=3.4+random(g)*1.5;s.passes=0;s.jinx=1;s.lastFrom=-1;}
 if(id==='trace')s.comets=[{x:60,y:230,vx:106},{x:890,y:350,vx:-91}];
 if(id==='shadow'){s.seeker={x:480,y:140};s.target=0;s.decoys=[];s.relics=Array.from({length:3},(_,j)=>({x:150+j*320,y:150+random(g)*220}));}
 return initializeMinigameSurprises(configureBotDifficulty(g,botOptions,seed),seed);
}
function steer(i,p,t,dead=6){i.left=p.x>t.x+dead;i.right=p.x<t.x-dead;i.up=p.y>t.y+dead;i.down=p.y<t.y-dead;return i;}
function gridRoute(sx,sy,tx,ty,size,blocked){const queue=[[sx,sy,null]],seen=new Set([`${sx},${sy}`]);while(queue.length){const [x,y,first]=queue.shift();if(x===tx&&y===ty)return first;for(let d=0;d<4;d++){const nx=x+DIRS[d][0],ny=y+DIRS[d][1],key=`${nx},${ny}`;if(nx>=0&&nx<size&&ny>=0&&ny<size&&!blocked(nx,ny)&&!seen.has(key)){seen.add(key);queue.push([nx,ny,first===null?d:first]);}}}return null;}
function mazeNext(p){const target=p.hasKey?p.exitTile:p.keyTile;return gridRoute(p.cx,p.cy,target.x,target.y,7,(x,y)=>MAZE[y][x]!=='0');}
function botInput(g,p,dt){
 const i=cleanInput(),s=g.state,t=g.time;p.botClock+=dt;const pulse=(period=.19)=>Math.floor(p.botClock/period)%2===0;
 switch(g.id){
  case 'inkfall':{const danger=s.objects.filter(o=>o.y>180&&o.y<415).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];if(danger&&Math.abs(danger.x-p.x)<85){i.left=p.x>480?danger.x>=p.x:danger.x>p.x;i.right=!i.left;if(p.x<90){i.left=false;i.right=true;}if(p.x>870){i.left=true;i.right=false;}i.action=danger.y>335&&p.ability<=0;}break;}
  case 'mothlight':{const o=p.carry>=3||g.duration-t<5?NEST:[...s.objects].sort((a,b)=>dist(a,p)/a.value-dist(b,p)/b.value)[0];if(o)steer(i,p,botTarget(g,p,o));i.action=p.carry>0&&dist(p,NEST)<63;break;}
  case 'sweep':i.down=s.height==='high'&&s.next-t<.8;i.action=s.height==='low'&&s.next-t<.32&&s.next-t>.1&&(s.count+p.slot)%8!==5;break;
  case 'rhythm':{const b=rhythmNearest(t),echo=p.echoAt>0&&t<p.echoAt+.1&&t>p.echoAt-.13&&p.echoClaimed!==p.echoBeat,lane=echo?1-rhythmLane(p.echoBeat):rhythmLane(b);i.left=p.track>lane;i.right=p.track<lane;i.action=echo?Math.abs(t-p.echoAt-.01*p.slot-botTimingOffset(g,p,`echo${p.echoBeat}`))<.027:(b+p.slot)%9!==7&&Math.abs(t-rhythmTime(b)-.01*p.slot-botTimingOffset(g,p,b))<.027;break;}
  case 'maze':{const route=mazeNext(p);if(route!==null&&Math.floor(t*5+p.slot)%3!==2)i[KEYS[route]]=true;if(route!==null&&gateClosed(g,p.cx+DIRS[route][0],p.cy+DIRS[route][1]))i.action=p.ability<=0;break;}
  case 'memory':if(t%6.5>3.15&&p.answer<p.sequence.length)i[KEYS[memoryAnswer(p)]]=pulse(.17);break;
  case 'redlight':{const cover=(s.phase+p.slot)%3;i.left=p.lane>cover&&pulse(.12);i.right=p.lane<cover&&pulse(.12);i.up=s.green&&s.timer>.2;i.down=!s.green;i.action=s.green&&s.timer>.7&&p.ability<=0;break;}
  case 'tug':{const grip=Math.floor(t/4)%2;i.left=p.grip>grip;i.right=p.grip<grip;i.down=p.heat>.72;i.action=!i.down&&p.jammed<=0&&pulse(.14+p.slot*.01);break;}
  case 'raft':{const target=120+(s.warning?s.upcoming:s.safe)*180;i.left=p.x>target+13;i.right=p.x<target-13;i.action=!p.safe&&p.ability<=0;i.down=!i.left&&!i.right;break;}
  case 'gallery':{const o=[...s.objects.slice(p.slot),...s.objects.slice(0,p.slot)].find(o=>o.respawn<=0&&!o.friendly&&o.open);if(o){const x=60+p.aim*840,perceived=botTarget(g,p,o);i.left=x>perceived.x+11;i.right=x<perceived.x-11;i.action=Math.abs(x-o.x)<23&&pulse(.16);}break;}
  case 'fishing':if(!p.hooked)i.action=angleGap(p.phase,p.arc)<.18&&p.cooldown<=0;else{i.left=p.fight<0;i.right=p.fight>0;i.down=p.tension>.65;i.action=!i.down&&pulse(.18);}break;
  case 'balance':i.left=p.lean+p.velocity*.6>.02;i.right=p.lean+p.velocity*.6<-.02;i.up=Math.abs(p.lean)<.5;i.down=Math.abs(p.lean)>.62;i.action=Math.abs(p.lean)>.75&&p.ability<=0;break;
  case 'sorting':i.left=p.bin>p.parcel&&pulse(.13);i.right=p.bin<p.parcel&&pulse(.13);i.down=p.fragile&&!p.stamped;i.action=p.bin===p.parcel&&(!p.fragile||p.stamped)&&pulse(.18);break;
  case 'reaction':i.left=p.choice>s.symbol&&pulse(.12);i.right=p.choice<s.symbol&&pulse(.12);i.action=s.signal==='go'&&p.choice===s.symbol&&t-s.signalTime>.19+p.slot*.03&&p.answered!==s.round;break;
  case 'trace':{const target=tracePoint(g,p);steer(i,p,botTarget(g,p,target));i.action=dist(p,target)<62&&p.focus>.25;break;}
  case 'potato':i.action=s.holder===p.slot&&p.cooldown<=0&&pulse(.24);i.down=s.holder!==p.slot&&s.fuse<.8&&p.ability<=0;i.up=s.holder===p.slot&&s.fuse>2.2&&p.score>4&&pulse(.37);break;
  case 'crates':{const b=p.boxes.find(v=>!v.delivered);if(b){const dx=Math.sign(b.tx-b.x),dy=Math.sign(b.ty-b.y),tx=b.x-dx,ty=b.y-dy;if(p.cx===tx&&p.cy===ty){i.left=dx<0;i.right=dx>0;i.up=dy<0;i.down=dy>0;}else{const route=gridRoute(p.cx,p.cy,tx,ty,5,(x,y)=>p.boxes.some(q=>q.x===x&&q.y===y)||p.walls.some(q=>q.x===x&&q.y===y));if(route!==null)i[KEYS[route]]=true;}}break;}
  case 'orbit':i.up=p.sparkLane===1&&p.orbitLane!==1;i.down=p.sparkLane===0&&p.orbitLane!==0;i.action=p.orbitLane===p.thornLane&&angleGap(p.angle+p.dir*.37,p.thorn)<.2;break;
  case 'cipher':i.right=p.symbol!==p.code[p.order[p.dial]]&&pulse(.12);i.action=p.symbol===p.code[p.order[p.dial]]&&pulse(.21);i.down=p.lockClock<2;break;
  case 'shadow':{let target=p.relics>=2||g.duration-t<4?ALTAR:[...s.relics].sort((a,b)=>dist(a,p)-dist(b,p))[0];const danger=dist(p,s.seeker);if(g.botDifficulty&&danger<105&&p.cooldown>.25&&p.ability>0)target={x:clamp(p.x+(p.x-s.seeker.x)*2,65,895),y:clamp(p.y+(p.y-s.seeker.y)*2,145,420)};steer(i,p,botTarget(g,p,target));i.action=danger<155&&p.cooldown<=0&&(g.botDifficulty?pulse(.12):true);if(g.botDifficulty&&i.action)i.down=false;if(dist(p,ALTAR)<52&&p.relics>0)i.down=true;if(danger<90&&p.cooldown>.3&&p.ability<=0){i.down=true;i.action=pulse(.16);}break;}
 }
 return i;
}
function fireGallery(g,p,charged){const s=g.state;p.shot=60+p.aim*840;p.shotTime=g.time;p.cooldown=charged?.6:.24;const targets=s.objects.filter(o=>o.respawn<=0&&Math.abs(o.x-p.shot)<(charged?52:28)).sort((a,b)=>b.y-a.y);let hits=0;
 for(const o of targets){if(!charged&&hits)break;if(o.friendly){p.score=Math.max(0,p.score-7);p.combo=0;flash(p,'COURIER! −7',RED);o.respawn=1.2;hits++;}else if(o.open||charged){const thread=g.time>8&&s.objects.some(q=>q.friendly&&q.respawn<=0&&Math.abs(q.x-p.shot)<85&&Math.abs(q.x-p.shot)>(charged?52:28)),reward=(o.marked?12:7)+(charged?5:0)+Math.min(6,p.combo)+(thread?3:0)+(g.time>8&&charged&&!o.open?4:0);p.score+=reward;p.combo++;o.respawn=.85;hits++;flash(p,`${thread?'THREAD SHOT':charged&&!o.open?'ARMOR BREAK':'HIT'} +${reward}`);}else{flash(p,'ARMORED — CHARGE',RED);}}
 if(!hits){p.combo=0;p.score=Math.max(0,p.score-1);flash(p,'MISS',RED);}}
function stepRhythm(g,p,hit,di){
 const t=g.time,beat=rhythmNearest(t),phrase=Math.floor(beat/8),err=Math.abs(t-rhythmTime(beat));
 if(p.phrase!==phrase){p.phrase=phrase;p.phraseHits=0;p.phrasePerfect=0;p.phraseMiss=false;}
 if(di===1)p.track=1;if(di===3)p.track=0;
 if(p.echoAt>0&&t>p.echoAt+.12)p.echoAt=0;
 const echo=hit&&p.echoAt>0&&p.echoClaimed!==p.echoBeat&&Math.abs(t-p.echoAt)<.12&&p.track===1-rhythmLane(p.echoBeat);
 if(echo){p.echoClaimed=p.echoBeat;p.score+=6;p.combo++;flash(p,'ECHO ANSWER +6');}
 if(hit&&!echo){
  if(beat!==p.lastBeat&&err<.18&&p.track===rhythmLane(beat)){
   p.combo++;p.phraseHits++;if(err<.08)p.phrasePerfect++;
   const reward=(err<.08?5:3)+Math.min(5,Math.floor(p.combo/4));p.score+=reward;p.lastBeat=beat;
   if(g.surprises?.active?.kind==='moon-bloom'){p.echoAt=rhythmTime(beat)+.26;p.echoBeat=beat;}
   if(t>8&&beat%8===7&&p.phraseHits===8&&!p.phraseMiss){const encore=14+(p.phrasePerfect>=6?4:0);p.encores++;p.score+=encore;flash(p,`CLEAN PHRASE · ENCORE +${encore}`);}
   else flash(p,`${err<.08?'PERFECT':'GOOD'} ×${p.combo} +${reward}`);
  }else{p.combo=0;p.phraseMiss=true;p.score=Math.max(0,p.score-2);flash(p,p.track!==rhythmLane(beat)?'WRONG INSTRUMENT':'OFF BEAT',RED);}
 }
 const passed=beat-(t<rhythmTime(beat)+.19?1:0);
 if(passed>p.judgedBeat){if(passed>p.lastBeat){p.combo=0;if(Math.floor(passed/8)===phrase)p.phraseMiss=true;}p.judgedBeat=passed;}
}
function stepMaze(g,p,i,hit,dt){
 const d=KEYS.findIndex(k=>i[k]);if(d>=0)p.facing=d;const lively=g.time>8;
 if(hit&&p.ability<=0){
  const [dx,dy]=DIRS[p.facing],x=p.cx+dx*2,y=p.cy+dy*2,mx=p.cx+dx,my=p.cy+dy;
  if(x>=0&&x<7&&y>=0&&y<7&&MAZE[y][x]==='0'){
   const crossing=MAZE[my][mx]==='1'||gateClosed(g,mx,my),landing=`${x},${y}`;
   p.cx=x;p.cy=y;p.ability=lively?3:4;p.walk=.2;
   if(lively&&crossing&&p.phaseSeen.length<3&&!p.phaseSeen.includes(landing)){
    p.phaseSeen.push(landing);p.phaseChain=p.phaseWindow>0?p.phaseChain+1:1;p.phaseWindow=4;p.ability=2.2;
    const reward=3+Math.min(3,p.phaseChain)*2;p.score+=reward;flash(p,`SHELF CHAIN ×${p.phaseChain} +${reward}`);
   }else flash(p,'PHASE STEP');
  }
 }
 if(p.walk<=0&&d>=0){const x=p.cx+DIRS[d][0],y=p.cy+DIRS[d][1];if(x>=0&&x<7&&y>=0&&y<7&&MAZE[y][x]==='0'&&!gateClosed(g,x,y)){p.cx=x;p.cy=y;p.walk=.13;}}
 if(p.cx===2&&p.cy===5&&p.rune===0){p.rune=1;p.score+=12;flash(p,'SECRET RUNE +12');}
 if(lively&&!p.huntFound&&p.cx===p.huntTile.x&&p.cy===p.huntTile.y){p.huntFound=true;p.score+=14;p.ability=0;p.phaseWindow=4;flash(p,'RUNE HUNT +14 · PHASE READY');}
 if(p.cx===p.keyTile.x&&p.cy===p.keyTile.y&&!p.hasKey){p.hasKey=true;const reward=10+(lively&&p.phaseWindow>0?4:0);p.score+=reward;if(lively)p.ability=Math.max(0,p.ability-1.2);flash(p,`KEY +${reward}`);}
 if(p.cx===p.exitTile.x&&p.cy===p.exitTile.y&&p.hasKey){const reward=25+(lively?Math.min(9,p.phaseChain*3):0);p.score+=reward;p.level++;mazeSetup(p);p.rune=0;flash(p,`ESCAPED +${reward}`);}
}
function stepWatchman(g,p,i,hit,di,dt){
 const s=g.state,lively=g.time>8;
 if(di===1)p.lane=Math.min(2,p.lane+1);if(di===3)p.lane=Math.max(0,p.lane-1);
 const cover=p.lane===(s.phase+p.slot)%3&&i.down;
 p.alert=Math.max(0,p.alert-dt*(cover?(lively?1.1:.6):.1));
 // Every patrol creates one cover-slip opportunity. A late crouch cannot
 // repeatedly farm the same window; a mistake resets the delivery chain.
 if(lively&&!s.green&&cover&&p.coverPhase!==s.phase&&s.timer>.3){
  p.coverPhase=s.phase;p.cleanChain=Math.min(5,p.cleanChain+1);p.progress+=4;p.score+=2+p.cleanChain;flash(p,`COVER SLIP ×${p.cleanChain}`);
 }
 if(hit&&s.green&&p.ability<=0){const distance=lively?18:12;p.progress+=distance;p.alert+=lively?.3:.25;p.ability=lively?1.8:2.8;flash(p,`SPRINT +${distance}m`);}
 if(i.up){
  if(s.green||cover){p.progress+=dt*(cover?(lively?12:6):(lively?19:15));p.score+=dt*(cover?(lively?2.4:1.4):3);}
  else{p.cleanChain=0;p.alert+=dt*1.2;p.progress=Math.max(0,p.progress-dt*25);p.score=Math.max(0,p.score-dt*9);if(p.cooldown<=0){flash(p,'SEEN — SEEK COVER',RED);p.cooldown=.8;}}
 }
 if(p.alert>=1){p.cleanChain=0;p.progress=Math.max(0,p.progress-18);p.score=Math.max(0,p.score-6);p.alert=.2;flash(p,'ALARM −6',RED);}
 if(p.progress>=100){const reward=25+(lively?Math.min(15,p.cleanChain*3):0);p.progress-=100;p.score+=reward;p.deliveries++;flash(p,`DELIVERED +${reward}`);}
}
function sharedWorld(g,dt){const s=g.state,t=g.time;
 if(g.id==='inkfall'){s.wave=Math.floor(t/7)%3;s.press=(t%7)/7;s.timer-=dt;if(s.timer<=0){s.timer=[.36,.2,.54][s.wave];const safe=110+(Math.floor(t/7)%5)*175;const count=s.wave===2?4:1;for(let n=0;n<count;n++){let x=s.wave===2?90+n*245:55+random(g)*850;if(s.wave===2&&Math.abs(x-safe)<115)x+=130;s.objects.push({x:clamp(x,50,910),y:65,speed:125+random(g)*80+s.wave*37,r:17+random(g)*11,spin:random(g)*TAU});}}for(const o of s.objects)o.y+=o.speed*dt;s.objects=s.objects.filter(o=>o.y<480);}
 if(g.id==='mothlight'){s.wisp.x=480+Math.sin(t*.8)*350;s.wisp.y=260+Math.cos(t*1.2)*100;for(const o of s.objects){o.x=clamp(o.x+Math.sin(t*1.4+o.phase)*dt*22,65,895);o.y=clamp(o.y+Math.cos(t+o.phase)*dt*13,145,416);}}
 if(g.id==='sweep'&&t>=s.next){for(const p of g.players){const clear=s.height==='high'?p.duck&&p.jump<8:p.jump>28;if(clear){p.combo++;const close=t>8&&s.height==='low'&&p.jump<60,reward=10+Math.min(8,(p.combo-1)*2)+(close?4:0);p.score+=reward;flash(p,`${close?'CLOSE CLEAR':'CLEAR'} +${reward}`);}else{p.combo=0;p.score=Math.max(0,p.score-5);flash(p,'CLIPPED −5',RED);}}s.count++;s.height=s.count%3===1?'high':'low';s.express=s.count%4===3;s.next=t+(s.express?.92:Math.max(1.15,1.75-s.count*.025)+random(g)*.4);}
 if(g.id==='redlight'){s.timer-=dt;if(s.timer<=0){s.green=!s.green;s.timer=t>8?(s.green?1.05+random(g)*.7:.65+random(g)*.6):(s.green?1.2+random(g)*1.25:.9+random(g)*1.2);s.phase++;}}
 if(g.id==='raft'){s.next-=dt;s.shardTimer=Math.max(0,s.shardTimer-dt);s.warning=s.next<.9;s.wind=Math.sin(t*.9)*35*(Math.floor(t/6)%2?1:0);if(s.next<=0){s.previous=s.safe;s.safe=s.upcoming;s.upcoming=pick(g,5);s.next=2.65;s.warning=false;}}
 if(g.id==='gallery')for(const o of s.objects){o.respawn=Math.max(0,o.respawn-dt);o.x+=o.speed*dt*(1+Math.floor(t/9)*.13);o.y=165+(o.id%3)*48+Math.sin(t*1.3+o.id)*18;o.open=(t+o.id*.57)%2.4<1.65;o.marked=!o.friendly&&o.id===Math.floor(t/5)%4;if(o.x<75||o.x>885){o.speed*=-1;o.x=clamp(o.x,75,885);}}
 if(g.id==='reaction'&&t>=s.next){s.round++;if(s.signal==='wait'){s.signal=random(g)>.35?'go':'fake';s.signalTime=t;s.next=t+.66;}else{s.signal='wait';s.symbol=pick(g,3);s.next=t+.75+random(g)*1.4;}}
 if(g.id==='potato'){s.fuse-=dt;if(s.fuse<=0){const holder=g.players[s.holder],penalty=8*s.jinx;holder.score=Math.max(0,holder.score-penalty);flash(holder,`CURSED −${penalty}`,RED);s.holder=pick(g,g.players.length);s.fuse=3.2+random(g)*1.6;s.jinx=1;for(const p of g.players)if(p.slot!==holder.slot)p.score+=5;}}
 if(g.id==='trace')for(const o of s.comets){o.x+=o.vx*dt;if(o.x<45||o.x>915)o.vx*=-1;}
 if(g.id==='shadow'){s.decoys=s.decoys.filter(d=>(d.life-=dt)>0);s.timer-=dt;if(s.timer<=0){const visible=g.players.filter(p=>!hiddenInCourt(p));const targets=visible.length?visible:g.players;s.target=[...targets].sort((a,b)=>(b.relics*70-dist(b,s.seeker))-(a.relics*70-dist(a,s.seeker)))[0].slot;s.timer=.7;}const actor=g.players[s.target],target=s.decoys.length?s.decoys[s.decoys.length-1]:actor;if(!hiddenInCourt(actor)||s.decoys.length){const d=dist(target,s.seeker)||1,speed=s.decoys.length?150:119+actor.relics*14;s.seeker.x+=(target.x-s.seeker.x)/d*speed*dt;s.seeker.y+=(target.y-s.seeker.y)/d*speed*dt;}}
}
export function stepGame(g,inputs={},dt=1/60){
 if(g.done||!Number.isFinite(dt)||dt<=0)return g;
 dt=Math.min(dt,.05);const before=g.players.map(p=>p.score);
 prepareMinigameSurprises(g,Math.min(dt,Math.max(0,g.duration-g.time)));
 stepCoreGame(g,inputs,dt);
 finishMinigameSurprises(g,before,dt);return g;
}
function stepCoreGame(g,inputs={},dt=1/60){
 if(CHALLENGE_IDS.has(g.id))return stepChallenge(g,inputs,dt);
 if(g.id==='gullet-gala')return stepGullet(g,inputs,dt);
 if(BRAWL_IDS.has(g.id))return stepBrawl(g,inputs,dt);if(g.done)return g;if(!Number.isFinite(dt)||dt<=0)return g;dt=Math.min(dt,.05);g.time=Math.min(g.duration,g.time+dt);const s=g.state,t=g.time;
 for(const p of g.players){for(const key of ['cooldown','flash','walk','ability','guard'])p[key]=Math.max(0,p[key]-dt);if(g.id==='maze')p.phaseWindow=Math.max(0,p.phaseWindow-dt);}
 sharedWorld(g,dt);
 for(const p of g.players){const i=p.bot?botControl(g,p,botInput(g,p,dt),dt,g.id==='rhythm'||g.id==='sweep'?'timing':g.id==='maze'?'grid':'movement'):cleanInput(inputs[p.id]),hit=i.action&&!p.prev.action,release=!i.action&&p.prev.action,di=direction(i,p.prev),horizontal=Number(i.right)-Number(i.left);
  switch(g.id){
   case 'inkfall':{if(hit&&p.ability<=0){p.dash=.22;p.dashDir=horizontal||p.dashDir;p.ability=2.2;flash(p,'PHASE DASH');}p.dash=Math.max(0,p.dash-dt);p.x=clamp(p.x+(p.dash>0?p.dashDir*670:horizontal*255)*dt,50,910);p.score+=dt*(2.5+s.wave*.4);if(p.cooldown<=0&&p.dash<=0&&s.objects.some(o=>Math.abs(o.x-p.x)<o.r+17&&Math.abs(o.y-400)<o.r+21)){p.score=Math.max(0,p.score-6);p.cooldown=.85;p.combo=0;flash(p,'HIT −6',RED);}else if(p.dash>0&&s.objects.some(o=>Math.abs(o.x-p.x)<34&&Math.abs(o.y-400)<35)&&p.guard<=0){p.combo++;const reward=4+(t>8?Math.min(6,p.combo*2):0);p.score+=reward;p.guard=.4;if(t>8)p.ability=Math.max(.5,p.ability-.9);flash(p,`TEETH CHAIN ×${p.combo} +${reward}`);}break;}
   case 'mothlight':{p.boost=Math.max(0,p.boost-dt);if(t>8&&hit&&dist(p,NEST)>=67&&p.ability<=0){p.boost=.32;p.ability=2.5;flash(p,'LANTERN FLUTTER');}move(p,i,dt,p.boost>0?330:p.carry>5?173:208);for(const o of s.objects)if(dist(p,o)<29&&p.carry<9){p.carry=Math.min(9,p.carry+o.value);p.score+=1;if(t>8&&o.value>1)p.rareCargo++;p.lastCatch=t;flash(p,`CARRY ${p.carry} — BANK IT`);o.x=65+random(g)*830;o.y=150+random(g)*260;}if(hit&&dist(p,NEST)<67&&p.carry>0){const bonus=t>8?p.rareCargo*4+(t-p.lastCatch<2.5?4:0):0,reward=p.carry*4+(p.carry>=5?8:0)+bonus;p.score+=reward;p.banked+=p.carry;p.carry=0;p.rareCargo=0;flash(p,`BANKED +${reward}`);}if(dist(p,s.wisp)<32&&p.cooldown<=0&&p.carry>0){const lost=Math.min(3,p.carry);p.carry-=lost;p.rareCargo=Math.max(0,p.rareCargo-1);p.cooldown=1.5;flash(p,`WISP STOLE ${lost}`,RED);}break;}
   case 'sweep':p.duck=i.down;if(hit&&p.jump===0&&!p.duck)p.vy=390;if(p.vy||p.jump){p.jump+=p.vy*dt;p.vy-=1050*dt;if(p.jump<0){p.jump=0;p.vy=0;}}break;
   case 'rhythm':stepRhythm(g,p,hit,di);break;
   case 'maze':stepMaze(g,p,i,hit,dt);break;
   case 'memory':{const cycle=Math.floor(t/6.5),phase=t%6.5;if(cycle!==p.cycle){p.cycle=cycle;p.answer=0;p.hint=0;if(cycle>0)p.sequence=Array.from({length:3+Math.min(2,cycle)},()=>pick(g,4));}p.hint=Math.max(0,p.hint-dt);if(hit&&phase>=3&&p.answer<p.sequence.length&&p.ability<=0){p.hint=.75;p.ability=2;p.score=Math.max(0,p.score-4);p.combo=0;flash(p,'HINT −4',RED);}if(phase>=3&&di>=0&&p.answer<p.sequence.length){if(di===memoryAnswer(p)){p.answer++;p.score+=4;flash(p,p.answer===p.sequence.length?'SPELL COMPLETE':'CORRECT +4');if(p.answer===p.sequence.length){p.combo++;p.score+=10+Math.min(8,p.combo*2);}}else{p.answer=0;p.combo=0;p.score=Math.max(0,p.score-3);flash(p,'TRY AGAIN',RED);}}break;}
   case 'redlight':stepWatchman(g,p,i,hit,di,dt);break;
   case 'tug':{if(di===1)p.grip=1;if(di===3)p.grip=0;p.jammed=Math.max(0,p.jammed-dt);p.heat=Math.max(0,p.heat-dt*(i.down?.75:.13));if(hit&&p.jammed<=0&&!i.down){if(p.grip===Math.floor(t/4)%2){p.score+=1.6+Math.min(.8,p.combo*.04);p.combo++;p.heat+=.17;flash(p,`PULL ×${p.combo}`);}else{p.combo=0;p.heat+=.28;p.score=Math.max(0,p.score-2);flash(p,'WRONG CHAIN',RED);}if(p.heat>=1){p.heat=1;p.jammed=1.5;p.combo=0;p.score=Math.max(0,p.score-4);flash(p,'OVERHEAT! HOLD ↓',RED);}}break;}
   case 'raft':{const airborne=p.jump>0;if(hit&&p.ability<=0){p.jump=.68;p.takeoffX=p.x;p.ability=1.8;flash(p,'LEAP');}p.jump=Math.max(0,p.jump-dt);p.x=clamp(p.x+(horizontal*(i.down?165:310)+s.wind*(i.down?.15:1))*dt,50,910);p.safe=Math.abs(p.x-(120+s.safe*180))<82;if(p.safe||s.next>1.35||p.jump>0)p.score+=dt*3;else if(p.cooldown<=0){p.combo=0;p.score=Math.max(0,p.score-4);p.cooldown=.8;flash(p,'FALL −4',RED);}if(t>8&&airborne&&p.jump===0&&p.safe&&Math.abs(p.x-p.takeoffX)>95){p.combo++;const reward=6+Math.min(6,p.combo*2);p.score+=reward;p.ability=Math.max(0,p.ability-.6);flash(p,`ISLAND CHAIN ×${p.combo} +${reward}`);}if(s.shardTimer<=0&&Math.abs(p.x-(120+s.shard*180))<32){p.score+=12+(t>8?Math.min(6,p.combo*2):0);s.shard=(s.shard+2+pick(g,2))%5;s.shardTimer=2.6;flash(p,'SKY SHARD +12');}break;}
   case 'gallery':p.aim=clamp(p.aim+horizontal*dt*(t>8&&i.down?.27:.63),0,1);if(hit&&p.cooldown<=0)fireGallery(g,p,false);p.charge=i.action?Math.min(1.2,p.charge+dt):p.charge;if(release){if(p.charge>=.65)fireGallery(g,p,true);p.charge=0;}break;
   case 'fishing':{if(!p.hooked){p.phase=wrap(p.phase+dt*(2.3+p.level*.1));if(hit&&p.cooldown<=0){p.cooldown=.4;if(angleGap(p.phase,p.arc)<.34){p.hooked=true;p.reel=0;p.tension=.28;p.fight=pick(g,2)?1:-1;p.fightClock=1.1;p.score+=2;flash(p,'HOOKED — FOLLOW ARROW');}else{p.score=Math.max(0,p.score-2);flash(p,'MISSED −2',RED);}}}else{p.fightClock-=dt;if(p.fightClock<=0){p.fight*=-1;p.fightClock=.8+random(g)*.8;}p.tension=clamp(p.tension+dt*(i.down?-.72:horizontal===p.fight?-.11:.3),0,1.2);if(hit&&!i.down){if(horizontal===p.fight){p.reel+=.22;p.tension+=.08;flash(p,'REEL!');}else{p.tension+=.24;flash(p,'WRONG SIDE',RED);}}p.reel=Math.max(0,p.reel-dt*.025);if(p.tension>=1){p.hooked=false;p.combo=0;p.score=Math.max(0,p.score-4);p.cooldown=.7;flash(p,'LINE SNAPPED −4',RED);}else if(p.reel>=1){p.hooked=false;p.level++;p.combo++;p.score+=12+Math.min(8,p.combo*2);p.arc=wrap(p.arc+1.4+random(g)*2);p.cooldown=.5;flash(p,'RELIC LANDED!');}}break;}
   case 'balance':{const gust=Math.floor(t/5)%2?1.7:1,wind=(Math.sin(t*2.1+p.slot*.8)*.52+Math.sin(t*.7)*.28)*gust;const brace=i.down;p.velocity+=(wind*(brace?.3:1)+p.lean*.65+horizontal*2.7)*dt;p.velocity*=Math.pow(brace?.18:.72,dt);p.lean+=p.velocity*dt;if(hit&&p.ability<=0){p.lean*=.25;p.velocity*=.15;p.ability=4;flash(p,'CAUGHT THE WIRE');}if(Math.abs(p.lean)<.75){p.score+=dt*(brace?.7:2);if(i.up&&!brace){p.crossing+=dt*18;p.score+=dt*3;}}if(p.crossing>=100){p.crossing-=100;p.level++;p.score+=20;flash(p,'CROSSED +20');}if(Math.abs(p.lean)>1.1){p.score=Math.max(0,p.score-6);p.crossing=Math.max(0,p.crossing-25);p.lean=0;p.velocity=0;flash(p,'DROPPED −6',RED);}break;}
   case 'sorting':{if(di===1)p.bin=Math.min(2,p.bin+1);if(di===3)p.bin=Math.max(0,p.bin-1);if(di===2&&p.fragile){p.stamped=true;flash(p,'FRAGILE STAMPED');}if(di===0&&p.ability<=0){nextParcel(g,p);p.ability=2;p.combo=0;p.score=Math.max(0,p.score-1);flash(p,'REROUTED −1',RED);}p.deadline-=dt;if(p.deadline<=0){p.score=Math.max(0,p.score-(p.express?5:2));p.combo=0;nextParcel(g,p);flash(p,'DELIVERY EXPIRED',RED);}if(hit&&p.cooldown<=0){p.cooldown=.2;if(p.bin===p.parcel&&(!p.fragile||p.stamped)){p.combo++;const reward=5+(p.express?4:0)+Math.min(5,Math.floor(p.combo/3));p.score+=reward;flash(p,`SORTED +${reward}`);}else{p.combo=0;p.score=Math.max(0,p.score-3);flash(p,p.fragile&&!p.stamped?'NEEDS ↓ STAMP':'WRONG BIN',RED);}nextParcel(g,p);}break;}
   case 'reaction':{if(di===1)p.choice=Math.min(2,p.choice+1);if(di===3)p.choice=Math.max(0,p.choice-1);if(di===0&&s.signal==='wait')p.wager=!p.wager;if(hit&&p.answered!==s.round){p.answered=s.round;if(s.signal==='go'&&p.choice===s.symbol){const speed=t-s.signalTime,reward=Math.max(3,Math.round(12-speed*10))*(p.wager?2:1);p.score+=reward;p.combo++;flash(p,`${Math.round(speed*1000)} MS +${reward}`);}else{p.combo=0;p.score=Math.max(0,p.score-(p.wager?10:5));flash(p,p.choice!==s.symbol?'WRONG SIGIL':'FALSE START',RED);}p.wager=false;}break;}
   case 'trace':{if(!i.action)p.focusExhausted=false;if(p.focus<=0)p.focusExhausted=true;const focused=i.action&&!p.focusExhausted&&p.focus>0;p.focus=clamp(p.focus+dt*(focused?-.45:.28),0,1);move(p,i,dt,focused?130:215);const target=tracePoint(g,p);if(dist(p,target)<(focused?46:25)){const quick=t>8&&p.combo>0&&t-p.linkTime<1.5;p.combo=t-p.linkTime<2.8?p.combo+1:1;p.linkTime=t;p.score+=5+Math.min(5,p.combo-1)+(quick?3:0);if(quick)p.focus=Math.min(1,p.focus+.12);p.node++;flash(p,`LINK ×${p.combo}`);if(p.node>=p.route.length){p.score+=14;p.node=0;p.route=Array.from({length:6},()=>({x:75+random(g)*810,y:150+random(g)*260}));}}if(!focused&&p.cooldown<=0&&s.comets.some(o=>dist(o,p)<29)){p.combo=0;p.score=Math.max(0,p.score-5);p.cooldown=1;p.x=clamp(p.x+35,50,910);flash(p,'COMET −5',RED);}break;}
   case 'potato':{p.parry=Math.max(0,p.parry-dt);if(di===1)p.recipient=(p.recipient+1)%g.players.length;if(di===3)p.recipient=(p.recipient+g.players.length-1)%g.players.length;if(di===2&&s.holder!==p.slot&&p.ability<=0){p.parry=.42;p.ability=2.5;flash(p,'REFLECT READY');}if(di===0&&s.holder===p.slot&&s.jinx===1&&s.fuse>1){s.jinx=2;s.fuse-=.75;p.score=Math.max(0,p.score-2);flash(p,'DOUBLE CURSE');}if(hit&&s.holder===p.slot&&p.cooldown<=0){let to=p.recipient;if(to===p.slot&&g.players.length>1)to=(to+1)%g.players.length;const receiver=g.players[to];s.lastFrom=p.slot;s.passes++;p.cooldown=.55;if(receiver.parry>0){receiver.parry=0;receiver.score+=6;s.fuse=Math.max(.25,s.fuse-.2);flash(receiver,'REFLECTED +6');flash(p,'RETURN TO SENDER',RED);}else{s.holder=to;p.score+=3;receiver.cooldown=Math.max(receiver.cooldown,.24);flash(p,'PASSED +3');}}p.score+=dt*.5;break;}
   case 'crates':{if(hit&&p.history.length&&p.undos>0){const previous=p.history.pop();p.cx=previous.cx;p.cy=previous.cy;p.boxes=previous.boxes;p.score=previous.score;p.undos--;p.walk=.2;flash(p,`UNDONE · ${p.undos} LEFT`);}if(p.walk<=0){const d=KEYS.findIndex(k=>i[k]);if(d>=0){const [dx,dy]=DIRS[d],x=p.cx+dx,y=p.cy+dy;if(x>=0&&x<5&&y>=0&&y<5&&!p.walls.some(w=>w.x===x&&w.y===y)){const b=p.boxes.find(b=>b.x===x&&b.y===y);if(!b){p.cx=x;p.cy=y;}else{const bx=x+dx,by=y+dy;if(!b.delivered&&bx>=0&&bx<5&&by>=0&&by<5&&!p.boxes.some(q=>q.x===bx&&q.y===by)&&!p.walls.some(w=>w.x===bx&&w.y===by)){p.history.push({cx:p.cx,cy:p.cy,boxes:p.boxes.map(q=>({...q})),score:p.score});if(p.history.length>6)p.history.shift();b.x=bx;b.y=by;p.cx=x;p.cy=y;if(b.x===b.tx&&b.y===b.ty){b.delivered=true;p.score+=7;flash(p,'ONE RELIC SEALED +7');}}}p.walk=.14;}}}if(p.boxes.every(b=>b.delivered)){p.score+=16;p.level++;crateSetup(g,p);flash(p,'PAIR COMPLETE +16');}syncCrates(p);break;}
   case 'orbit':{if(hit)p.dir*=-1;if(di===0)p.orbitLane=1;if(di===2)p.orbitLane=0;p.angle=wrap(p.angle+p.dir*(p.orbitLane?2.3:1.8)*dt);if(p.orbitLane===p.sparkLane&&angleGap(p.angle,p.spark)<.17){p.combo++;p.score+=7+Math.min(5,p.combo-1);p.spark=wrap(p.spark+(p.dir>0?1:-1)*(1+random(g)*1.3));p.sparkLane=1-p.sparkLane;flash(p,`STAR CHAIN ×${p.combo}`);}if(p.orbitLane===p.thornLane&&angleGap(p.angle,p.thorn)<.16&&p.cooldown<=0){p.score=Math.max(0,p.score-4);p.cooldown=.8;p.dir*=-1;p.combo=0;flash(p,'THORN −4',RED);}p.thorn=wrap(p.thorn+dt*(Math.floor(t/6)%2?.52:.16));p.thornLane=Math.floor(t/4+p.slot)%2;break;}
   case 'cipher':{p.reveal=Math.max(0,p.reveal-dt);p.lockClock-=dt*(i.down?-.65:1);p.lockClock=Math.min(10,p.lockClock);if(di===0&&p.ability<=0){p.reveal=1.5;p.ability=2;p.score=Math.max(0,p.score-2);flash(p,'PEEK −2',RED);}if(di===1)p.symbol=(p.symbol+1)%5;if(di===3)p.symbol=(p.symbol+4)%5;if(hit&&p.cooldown<=0&&!i.down){p.cooldown=.15;if(p.symbol===p.code[p.order[p.dial]]){p.dial++;p.score+=3;flash(p,'CLICK +3');if(p.dial===3){p.score+=12+Math.floor(p.lockClock);p.level++;cipherSetup(g,p);flash(p,'UNLOCKED +TIME BONUS');}}else{p.score=Math.max(0,p.score-2);p.lockClock-=1.2;flash(p,'ALARM −2',RED);}}if(p.lockClock<=0){p.score=Math.max(0,p.score-4);cipherSetup(g,p);flash(p,'LOCK RESET −4',RED);}break;}
   case 'shadow':{if(hit&&!i.down&&p.cooldown<=0){p.dash=.23;p.cooldown=1.7;}p.dash=Math.max(0,p.dash-dt);move(p,i,dt,p.dash>0?480:195);if(i.down&&dist(p,ALTAR)<58&&p.relics>0){const reward=p.relics*12;p.score+=reward;p.banked+=p.relics;p.relics=0;flash(p,`ALTAR +${reward}`);}else if(hit&&i.down&&p.ability<=0){s.decoys.push({x:p.x,y:p.y,life:2.1});if(s.decoys.length>4)s.decoys.shift();p.ability=5;if(t>8&&dist(p,s.seeker)<150){p.score+=4;p.cooldown=Math.max(0,p.cooldown-.65);flash(p,'CLOSE DECOY +4');}else flash(p,'GHOST DECOY');}for(const o of s.relics)if(dist(p,o)<28&&p.relics<3){p.relics++;o.x=80+random(g)*800;o.y=145+random(g)*240;flash(p,`RELIC ${p.relics} — ↓ AT ALTAR`);}if(dist(p,s.seeker)<53&&p.guard<=0&&p.dash<=0&&!hiddenInCourt(p)){p.score=Math.max(0,p.score-7);p.relics=Math.max(0,p.relics-1);p.guard=1.1;flash(p,'SPOTTED −7',RED);}else if(dist(p,s.seeker)>=53&&!hiddenInCourt(p))p.score+=dt*2;break;}
  }
  p.prev=i;
 }
 if(g.time>=g.duration)g.done=true;return g;
}
export function getGameResults(g){if(CHALLENGE_IDS.has(g.id))return getChallengeResults(g);if(g.id==='gullet-gala')return getGulletResults(g);if(BRAWL_IDS.has(g.id))return getBrawlResults(g);return g.players.map(p=>({id:p.id,score:Math.max(0,Math.round(p.score))})).sort((a,b)=>b.score-a.score);}

// Each theatre shares the authoritative simulation above; all decorative motion is
// computed from game time. Rendering never consumes RNG or writes network state.
export const MINIGAME_REALMS={
  inkfall:{name:'CLOCKWORK FOUNDRY',color:'#e8b47e',weather:'embers'},
  mothlight:{name:'WHISPERING GROVE',color:'#adc999',weather:'leaves'},
  sweep:{name:'PHANTOM TERMINUS',color:'#c6d0d4',weather:'rain'},
  rhythm:{name:'MUSHROOM ORGAN',color:'#d1b3e4',weather:'spores'},
  maze:{name:'LABYRINTH LIBRARY',color:'#d9c1a3',weather:'pages'},
  memory:{name:'CRYSTAL ECHO HALL',color:'#a6dbe3',weather:'snow'},
  redlight:{name:'GARGOYLE CAUSEWAY',color:'#bfd0b2',weather:'mist'},
  tug:{name:'ECLIPSE MACHINERY',color:'#e6c385',weather:'embers'},
  raft:{name:'SHATTERED SKY ISLES',color:'#c1d3dd',weather:'mist'},
  gallery:{name:'CELESTIAL OBSERVATORY',color:'#b3cde6',weather:'stars'},
  fishing:{name:'THE SUNKEN REALM',color:'#a5d5ce',weather:'bubbles'},
  balance:{name:'WINDSWEPT SPIRES',color:'#cad8e3',weather:'wind'},
  sorting:{name:'SPECTRAL POST OFFICE',color:'#d2bea1',weather:'pages'},
  reaction:{name:'CHAPEL OF FALSE DAWN',color:'#dfc390',weather:'dust'},
  trace:{name:'THE STAR PLANISPHERE',color:'#bcc6eb',weather:'stars'},
  potato:{name:'THE WITCH’S BANQUET',color:'#cca7dc',weather:'spores'},
  crates:{name:'RELIQUARY WAREHOUSE',color:'#d3c3a7',weather:'dust'},
  orbit:{name:'CRESCENT MOON GARDEN',color:'#c5d4aa',weather:'leaves'},
  cipher:{name:'THE THIRTEENTH CLOCK',color:'#d8ba84',weather:'embers'},
  shadow:{name:'NIGHTREACH COURT',color:'#beb2d4',weather:'rain'}
};
function text(c,str,x,y,size=15,color=PAPER,align='center',weight=500){c.fillStyle=color;c.font=`${weight} ${size}px "Space Grotesk", "Arial", sans-serif`;c.textAlign=align;c.textBaseline='middle';c.fillText(str,x,y);}
function line(c,x1,y1,x2,y2,color=MUTED,width=1){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function disc(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(0,r),0,TAU);c.fill();}
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
// Interface slips are inked cardstock, with a cut edge, paper grain and a folded corner.
function glass(c,x,y,w,h,color='#c4b999',opacity=.94){c.save();c.globalAlpha*=opacity;c.fillStyle='#05060588';c.fillRect(x+3,y+4,w,h);c.beginPath();c.moveTo(x+4,y);c.lineTo(x+w-8,y);c.lineTo(x+w,y+7);c.lineTo(x+w-2,y+h);c.lineTo(x+1,y+h-1);c.lineTo(x,y+5);c.closePath();c.fillStyle='#252622';c.fill();c.strokeStyle='#aaa28c77';c.lineWidth=1;c.stroke();c.fillStyle='#d8cdb015';for(let j=0;j<w*h/200;j++){const px=(j*73+19)%Math.max(1,w-8),py=(j*31+7)%Math.max(1,h-5);c.fillRect(x+4+px,y+3+py,1+j%3,1);}line(c,x+5,y+3,x+w-10,y+3,color+'88');c.fillStyle='#a9a085';c.beginPath();c.moveTo(x+w-8,y+1);c.lineTo(x+w-1,y+7);c.lineTo(x+w-8,y+7);c.fill();c.restore();}
function star(c,x,y,r,color,turn=0){c.save();c.translate(x,y);c.rotate(turn);c.beginPath();for(let n=0;n<8;n++){const a=n*Math.PI/4,s=n%2?r*.24:r;c[n?'lineTo':'moveTo'](Math.cos(a)*s,Math.sin(a)*s);}c.closePath();c.fillStyle=color;c.fill();c.restore();}
function prop(c,h,name,x,y,size,rotation=0){if(h?.prop)h.prop(c,name,x,y,size,rotation);else{c.save();c.translate(x,y);c.rotate(rotation);c.fillStyle=GOLD;c.fillRect(-size/3,-size/3,size*.66,size*.66);c.restore();}}
function object(c,h,type,x,y,w,height=w,time=0,options={}){if(h.object)h.object(c,type,x,y,w,height,time,options);else prop(c,h,{gauge:'gear',rope:'platform',altar:'crate',star:'spark',portal:'orb',pedestal:'platform',sign:'crate',crate:'crate',crown:'spark'}[type]||type,x,y,Math.min(w,height),options.rotation||0);}
function platform(c,h,x,y,w,depth=26,time=0,variant='stone'){if(h.platform)h.platform(c,x-w/2,y,w,depth,time,variant);else prop(c,h,'platform',x,y+depth*.3,w);}
function fx(c,h,type,x,y,size,time,color=GOLD){if(h.fx)h.fx(c,type,x,y,size,time,{color});else{c.save();c.fillStyle=color;for(let j=0;j<8;j++){const angle=j*TAU/8+time*.3,r=size*(.13+(j%3)*.09),px=Math.round((x+Math.cos(angle)*r)/3)*3,py=Math.round((y+Math.sin(angle)*r)/3)*3;c.globalAlpha=.25+(j%3)*.2;c.fillRect(px,py,3+j%2,3+j%2);}c.restore();}}
function blocks(c,x,y,w,value,color=GOLD,count=16,height=7){const gap=2,bw=(w-gap*(count-1))/count;c.save();c.fillStyle='#12130f';c.fillRect(x-3,y-3,w+6,height+6);for(let j=0;j<count;j++){c.fillStyle=j/ count<clamp(value,0,1)?color:'#55574b';c.fillRect(x+j*(bw+gap),y,bw,height);if(j/count<clamp(value,0,1)){c.fillStyle='#fff6cc55';c.fillRect(x+j*(bw+gap),y,bw,1);}}c.restore();}
function woodNeedle(c,x,y,r,angle){c.save();c.translate(x,y);c.rotate(angle);c.shadowColor='#0009';c.shadowBlur=3;c.shadowOffsetY=2;c.beginPath();c.moveTo(-10,-4);c.lineTo(r,-1);c.lineTo(r,2);c.lineTo(-10,5);c.closePath();c.fillStyle='#d2ae70';c.fill();c.strokeStyle='#30281c';c.lineWidth=2;c.stroke();line(c,-5,0,r-5,0,'#f4e5b6',1);c.fillStyle='#ece0b5';c.fillRect(-4,-4,8,8);c.restore();}
function braid(c,x,y,length){c.save();c.fillStyle='#282319';c.fillRect(x-4,y,8,length);for(let j=0;j<length;j+=5){c.fillStyle=j%10?'#b9a579':'#71654b';c.fillRect(x-3+(j%10?1:0),y+j,5,4);c.fillStyle='#e3d4a6';c.fillRect(x-2,y+j,2,2);}c.restore();}
function tileGrid(c,h,x,y,n,cell,color,time){const size=n*cell;platform(c,h,x+size/2,y+size+2,size+13,18,time,'stone');object(c,h,'sign',x+size/2,y+size/2+11,size+24,size*1.5,time);c.save();c.fillStyle='#bdb6a444';for(let row=0;row<n;row++)for(let col=0;col<n;col++)if((row+col)%2)c.fillRect(x+col*cell+1,y+row*cell+1,cell-2,cell-2);for(let j=0;j<=n;j++){line(c,x+j*cell,y,x+j*cell,y+size,'#35382b77',1);line(c,x,y+j*cell,x+size,y+j*cell,'#35382b77',1);}c.restore();}
function character(c,h,p,x,y,size=58,opts={}){size*=1.17;c.save();c.shadowColor='#000000';c.shadowBlur=5;c.shadowOffsetY=1;if(h?.character)h.character(c,p,x,y,size,{...opts,flip:p.prev?.left,frame:Math.floor(p.x/12)%2});else{disc(c,x,y-16,size*.32,p.color);text(c,p.name?.slice(0,1)||'?',x,y-16,20,INK);}c.restore();ellipse(c,x,y+3,size*.23,2.5,p.color+'aa');if(p.flash>0&&p.message){const w=Math.max(68,p.message.length*6.5+12),py=Math.max(139,y-size-13);glass(c,x-w/2,py-10,w,20,p.messageColor||GOLD,.95);text(c,p.message,x,py,11,p.messageColor||GOLD);}}
function playerTag(){} // Player identity is shown once, in the portrait HUD.
function panelX(g,j){return scenePanel(g,j);}
function watchmanSpot(g,p,progress=p.progress,lane=p.lane){const depth=clamp(progress/100,0,1),a=panelX(g,p.slot),perspective=(1-depth)**2*.8+.16;return {x:480+(a.cx+(lane-1)*30-480)*perspective,y:423-progress*1.8,scale:1-depth*.35};}
function paintTitle(c,s,sub){glass(c,202,76,556,56,'#b6b9b4',.88);text(c,s,480,94,16,PAPER,'center',650);if(sub)text(c,sub,480,115,sub.length>88?9:10,'#c2c2b9');}
function arrow(c,d,x,y,size=28,color=PAPER){text(c,['↑','→','↓','←'][d],x,y,size,color,'center',600);}
function scenery(c,g,h){
 const realm=MINIGAME_REALMS[g.id],t=g.time,seed=MINIGAMES.findIndex(d=>d.id===g.id)+1;
 c.save();c.beginPath();c.rect(0,69,960,400);c.clip();
 // Sparse square particles belong to the paper world's pixel effects, not a neon overlay.
 for(let j=0;j<22;j++){
  const speed=8+(j%5)*5,x=((j*173+seed*59+t*speed*(realm.weather==='wind'?6:1))%1040)-40;
  const y=145+((j*83+seed*31+(realm.weather==='rain'?t*150:realm.weather==='bubbles'?-t*26:realm.weather==='embers'?-t*18:t*7))%315+315)%315;
  c.globalAlpha=.15+Math.sin(t*1.8+j)*.08;c.fillStyle=realm.color;
  const px=Math.round(x/3)*3,py=Math.round(y/3)*3;
  if(realm.weather==='rain'){c.fillRect(px,py,2,7);c.fillRect(px-2,py+7,2,4);}
  else if(realm.weather==='wind'){c.fillRect(px,py,11,2);c.fillRect(px+11,py-2,6,2);}
  else if(realm.weather==='pages'||realm.weather==='leaves'){c.save();c.translate(px,py);c.rotate(Math.floor((t+j)*4)*.25);c.fillRect(-3,-2,6,4);c.restore();}
  else c.fillRect(px,py,2+j%3,2+j%3);
 }
 c.restore();

}
const rulePainters={text,glass,blocks,arrow,object,prop,fx},skipRule=()=>{};
function drawDynamicRules(c,g,h,worldOnly=false){
 const s=g.state,t=g.time,realm=MINIGAME_REALMS[g.id];
 // Physical rule props enter the material pass; inked labels are drawn after it.
 const text=worldOnly?skipRule:rulePainters.text,glass=worldOnly?skipRule:rulePainters.glass,blocks=worldOnly?skipRule:rulePainters.blocks,arrow=worldOnly?skipRule:rulePainters.arrow;
 const object=worldOnly?rulePainters.object:skipRule,prop=worldOnly?rulePainters.prop:skipRule,fx=worldOnly?rulePainters.fx:skipRule;
 if(g.id==='mothlight'){object(c,h,'altar',NEST.x,NEST.y-8,100,63,t);fx(c,h,'magic',NEST.x,NEST.y-33,64,t,GOLD);text(c,'BANK',NEST.x,NEST.y+29,10,GOLD);fx(c,h,'magic',s.wisp.x,s.wisp.y,52,t,RED);prop(c,h,'orb',s.wisp.x,s.wisp.y,42,t*.2);text(c,'THIEF',s.wisp.x,s.wisp.y-24,8,RED);for(const o of s.objects)if(o.value>1){fx(c,h,'magic',o.x,o.y,37,t,GOLD);text(c,'×3',o.x,o.y-23,10,GOLD);}}
 if(g.id==='maze')for(const p of g.players){const a=panelX(g,p.slot),cell=Math.min(43,(a.w-SCENE_LAYOUT.gridInset)/7),x=a.cx-cell*3.5,y=164;for(const gate of MAZE_GATES){const gx=x+(gate.x+.5)*cell,gy=y+(gate.y+.5)*cell;if(gateClosed(g,gate.x,gate.y))object(c,h,'crate',gx,gy,cell*.91,cell*.96,t);else fx(c,h,'magic',gx,gy,cell*.75,t,p.color);}if(!p.rune)object(c,h,'star',x+2.5*cell,y+5.5*cell,cell*.65,cell*.65,t);if(t>8&&!p.huntFound){const hx=x+(p.huntTile.x+.5)*cell,hy=y+(p.huntTile.y+.5)*cell;object(c,h,'star',hx,hy,cell*.8,cell*.8,t);fx(c,h,'magic',hx,hy,cell*.86,t,p.color);}if(p.phaseWindow>0)fx(c,h,'dust',x+(p.cx+.5)*cell,y+(p.cy+.5)*cell,cell*1.15,t,p.color);}
 if(g.id==='memory')for(const p of g.players)if(p.hint>0&&p.answer<p.sequence.length){const a=panelX(g,p.slot);glass(c,a.cx-34,301,68,43,p.color);arrow(c,memoryAnswer(p),a.cx,323,31,GOLD);}
 if(g.id==='redlight')for(const p of g.players){const cover=(s.phase+p.slot)%3;for(const progress of [85,53,21]){const q=watchmanSpot(g,p,progress,cover);object(c,h,'crate',q.x,q.y-7,31*q.scale,34*q.scale,t);}const q=watchmanSpot(g,p,Math.min(93,p.progress+13),cover);text(c,'↓',q.x,q.y-9,14,p.color);}
 if(g.id==='tug')for(const p of g.players){const a=panelX(g,p.slot),side=Math.floor(t/4)%2;glass(c,a.cx-63,198,126,24,p.heat>.78?RED:p.color);text(c,side?'PULL RIGHT →':'← PULL LEFT',a.cx,211,10,side===p.grip?p.color:RED);blocks(c,a.cx-58,228,116,p.heat,p.heat>.78?RED:GOLD,14,6);}
 if(g.id==='raft'){if(s.shardTimer<=0){const x=120+s.shard*180;fx(c,h,'magic',x,354,55,t,GOLD);prop(c,h,'key',x,352,51,t*.25);text(c,'+12',x,325,9,GOLD);}if(Math.abs(s.wind)>8){glass(c,384,149,192,23,realm.color);text(c,s.wind>0?'GALE →':'← GALE',480,161,10,realm.color);}}
 if(g.id==='balance')for(const p of g.players){const a=panelX(g,p.slot);blocks(c,a.cx-67,189,134,p.crossing/100,p.color,18,5);text(c,Math.floor(t/5)%2?'GUST FRONT':'CALMER CROSSING',a.cx,205,8,Math.floor(t/5)%2?GOLD:p.color);}
 if(g.id==='sorting')for(const p of g.players){const a=panelX(g,p.slot);text(c,`${p.deadline.toFixed(1)}s ${p.express?'EXPRESS':''}`,a.cx,263,10,p.deadline<1.5?RED:GOLD);}
 if(g.id==='reaction'&&!worldOnly){const symbols=['key','gear','orb'];glass(c,423,325,114,32,GOLD);rulePainters.prop(c,h,symbols[s.symbol],447,341,29);text(c,['KEY','GEAR','ORB'][s.symbol],495,341,10,PAPER);for(const p of g.players){const a=panelX(g,p.slot);rulePainters.prop(c,h,symbols[p.choice],a.cx+30,408,27);}}
 if(g.id==='trace'){for(const o of s.comets){fx(c,h,'dust',o.x-Math.sign(o.vx)*20,o.y,44,t,RED);prop(c,h,'orb',o.x,o.y,28,t*.2);fx(c,h,'hit',o.x,o.y,35,t,RED);}for(const p of g.players)if(p.prev.action&&!p.focusExhausted&&p.focus>0)fx(c,h,'shield',p.x,p.y-12,75,t,p.color);}
 if(g.id==='potato')for(const p of g.players)if(p.parry>0){const a=p.slot*TAU/g.players.length-Math.PI/2,x=480+Math.cos(a)*291,y=SCENE_LAYOUT.omenCenterY+Math.sin(a)*SCENE_LAYOUT.omenRadiusY;fx(c,h,'shield',x,y,87,t,'#a5d4e3');text(c,'REFLECT',x,y-60,10,'#a5d4e3');}
 if(g.id==='shadow'){for(const z of [{x:185,y:235},{x:775,y:310}]){c.save();c.globalAlpha=.32;fx(c,h,'magic',z.x,z.y-8,31,t,'#b5a6be');c.restore();object(c,h,'pedestal',z.x,z.y+19,77,48,t);}object(c,h,'altar',ALTAR.x,ALTAR.y-6,95,64,t);text(c,'BANK',ALTAR.x,ALTAR.y+30,10,GOLD);for(const o of s.relics){fx(c,h,'magic',o.x,o.y,37,t,GOLD);prop(c,h,'key',o.x,o.y,38,Math.sin(t)*.2);}for(const d of s.decoys){c.save();c.globalAlpha=Math.min(.8,d.life*.4);prop(c,h,'orb',d.x,d.y,57,t*.2);fx(c,h,'magic',d.x,d.y,66,t,'#d7c5ea');c.restore();}}

}

export function drawGame(c,g,h={}){
 const lighting=sceneLighting(g);h.beginScene?.(c,g.id,g.time,lighting,g);
 if(CHALLENGE_IDS.has(g.id)){let ended=false;const end=()=>{if(!ended){ended=true;drawMinigameSurprises(c,g,h);h.endScene?.(c);drawMinigameSurpriseCue(c,g,h);}};try{return drawChallenge(c,g,{...h,endScene:end});}finally{end();}}
 if(BRAWL_IDS.has(g.id)||g.id==='gullet-gala'){let ended=false;const end=()=>{if(!ended){ended=true;drawMinigameSurprises(c,g,h);h.endScene?.(c);drawMinigameSurpriseCue(c,g,h);}};try{return (g.id==='gullet-gala'?drawGullet:drawBrawl)(c,g,{...h,endScene:end});}finally{end();}}
 c.save();c.fillStyle=INK;c.fillRect(0,0,W,H);h.background?.(c,g.id,g.time);scenery(c,g,h);
 const s=g.state,t=g.time,theme=MINIGAME_REALMS[g.id],col=theme.color;
 let heading;const title=(_context,...args)=>{heading=args;};
 switch(g.id){
  case 'inkfall':{
   title(c,'THE FOUNDRY IS COMING APART');
   platform(c,h,480,426,880,36,t,'stone');
   for(let n=0;n<7;n++){const x=90+n*130;braid(c,x,133,28);prop(c,h,'gear',x,160,35+n%2*12,(n%2?1:-1)*t*.4);}
   for(const o of s.objects){fx(c,h,'dust',o.x,o.y-19,o.r*2.6,t,col);prop(c,h,'gear',o.x,o.y,o.r*2.5,o.spin+t);}
   for(const p of g.players){if(p.dash>0)fx(c,h,'dust',p.x,409,70,t,p.color);character(c,h,p,p.x,425,68,{hurt:p.cooldown>0,dash:p.dash>0});playerTag(c,p,p.x,443);}break;
  }
  case 'mothlight':{
   title(c,'GATHER THE GROVE’S LIVING LANTERNS');
   platform(c,h,480,445,870,24,t,'stone');
   for(let n=0;n<7;n++){const x=55+n*141,y=432+Math.sin(n)*7;object(c,h,'pedestal',x,y,46,43,t);prop(c,h,'lantern',x,y-29,27);}
   for(const o of s.objects){const y=o.y+Math.sin(t*3+o.phase)*4;fx(c,h,'magic',o.x,y,33,t+o.phase,col);c.save();c.translate(o.x,y);c.scale(1,.8+Math.abs(Math.sin(t*10+o.phase))*.2);prop(c,h,'spark',0,0,41,Math.sin(t+o.phase)*.18);c.restore();}
   for(const p of [...g.players].sort((a,b)=>a.y-b.y)){character(c,h,p,p.x,p.y,63);playerTag(c,p,p.x,p.y+16);}break;
  }
  case 'sweep':{
   title(c,'THE GHOST ENGINE NEVER STOPS');const until=s.next-t,beamY=(s.height==='high'?345:420)-clamp(until/1.8,0,1)*200;
   platform(c,h,480,425,850,35,t,'bridge');
   // A tangible crossbeam, with pixel steam and lanterns, marks the train's collision front.
   for(let n=0;n<9;n++){object(c,h,'crate',100+n*95,beamY,105,59,t);fx(c,h,'dust',100+n*95,beamY-8,41,t+n,col);}
   prop(c,h,'lantern',67,beamY,61);prop(c,h,'lantern',893,beamY,61);
   for(const p of g.players){const x=g.players.length===1?480:150+p.slot*660/(g.players.length-1);character(c,h,p,x,421-p.jump,72,{scaleY:p.duck?.58:1});playerTag(c,p,x,443);}
   break;
  }
  case 'rhythm':{
   title(c,'PLAY THE MARSH’S MUSHROOM ORGAN');
   for(const p of g.players){const y=183+p.slot*65;c.save();c.beginPath();c.rect(166,y-19,728,45);c.clip();h.clipMaterials?.(c,166,y-19,728,45);platform(c,h,529,y+17,715,13,t,'wood');h.restoreMaterials?.();c.restore();object(c,h,'portal',242,y,56,61,t);glass(c,163,y-23,54,24,p.color);text(c,p.track?'SUN →':'← MOON',190,y-11,8,p.color);
    for(let b=0;b<100;b++){const x=242+(rhythmTime(b)-t)*270,ny=y+(rhythmLane(b)?-9:9),nc=rhythmLane(b)?GOLD:p.color;if(x>178&&x<877){object(c,h,rhythmLane(b)?'star':'gauge',x,ny,34,34,t);if(Math.abs(x-242)<24)fx(c,h,'magic',x,ny,40,t,nc);}}
    if(p.echoAt>0&&t<p.echoAt+.12&&p.echoClaimed!==p.echoBeat){const lane=1-rhythmLane(p.echoBeat),x=242+(p.echoAt-t)*270,ny=y+(lane?-9:9);object(c,h,lane?'star':'gauge',x,ny,29,29,t);fx(c,h,'magic',x,ny,41,t,p.color);}
    object(c,h,'pedestal',105,y+26,51,27,t);character(c,h,p,105,y+24,43);if(p.flash>0){glass(c,674,y-20,196,21,p.color);text(c,p.message,772,y-9,11,p.messageColor);}}break;
  }
  case 'maze':{
   title(c,'ESCAPE THE LIBRARY BETWEEN WORLDS');
   for(const p of g.players){const a=panelX(g,p.slot),cell=Math.min(43,(a.w-SCENE_LAYOUT.gridInset)/7),x=a.cx-cell*3.5,y=164;tileGrid(c,h,x,y,7,cell,p.color,t);
    for(let row=0;row<7;row++)for(let co=0;co<7;co++)if(MAZE[row][co]==='1')object(c,h,'crate',x+(co+.5)*cell,y+(row+.5)*cell,cell*.98,cell*1.04,t);
    if(!p.hasKey){fx(c,h,'magic',x+(p.keyTile.x+.5)*cell,y+(p.keyTile.y+.5)*cell,cell,t,GOLD);prop(c,h,'key',x+(p.keyTile.x+.5)*cell,y+(p.keyTile.y+.5)*cell,cell*.86,t*.25);}
    object(c,h,'portal',x+(p.exitTile.x+.5)*cell,y+(p.exitTile.y+.5)*cell,cell*.9,cell*.94,t,{alpha:p.hasKey?1:.5});character(c,h,p,x+(p.cx+.5)*cell,y+(p.cy+.85)*cell,cell*.98);}break;
  }
  case 'memory':{
   const phase=t%6.5,mode=['NORMAL — REPEAT','MIRROR — OPPOSITE ARROWS','REVERSE — LAST TO FIRST'][Math.floor(t/6.5)%3];title(c,phase<3?'WATCH · '+mode:'YOUR TURN · '+mode);
   for(const p of g.players){const a=panelX(g,p.slot),index=Math.floor(phase/(3/p.sequence.length)),r=Math.min(89,a.w*.4);object(c,h,'altar',a.cx,297,r*2.1,85,t);object(c,h,'sign',a.cx,236,r*2,154,t);glass(c,a.cx-r*.69,190,r*1.38,106,p.color);
    if(phase<3){arrow(c,p.sequence[Math.min(p.sequence.length-1,index)],a.cx,235,76,p.color);text(c,`${Math.min(p.sequence.length,index+1)} / ${p.sequence.length}`,a.cx,283,12,PAPER);fx(c,h,'magic',a.cx,235,r*1.8,t,p.color);}else{for(let j=0;j<p.sequence.length;j++){const x=a.cx+(j-(p.sequence.length-1)/2)*24;c.save();c.globalAlpha=j<p.answer?1:.35;object(c,h,'star',x,227,22,22,t);c.restore();}text(c,p.answer===p.sequence.length?'SPELL COMPLETE':'↑  →  ↓  ←',a.cx,272,p.answer===p.sequence.length?12:19,p.color);}
    platform(c,h,a.cx,422,Math.min(154,a.w-20),24,t,'stone');character(c,h,p,a.cx,417,71);}break;
  }
  case 'redlight':{
   title(c,s.green?'THE GARGOYLE DREAMS — ADVANCE':'THE GARGOYLE WAKES — FREEZE');
   const signal=s.green?'#bfdba3':RED;object(c,h,'pedestal',480,205,134,62,t);prop(c,h,'drone',480,166,102);fx(c,h,'magic',480,174,40,t,signal);platform(c,h,480,426,878,33,t,'stone');
   for(const p of [...g.players].sort((a,b)=>b.progress-a.progress)){const a=panelX(g,p.slot),q=watchmanSpot(g,p),exit=watchmanSpot(g,p,100,1);object(c,h,'portal',exit.x,exit.y,29,36,t);character(c,h,p,q.x,q.y,63*q.scale,{scaleY:p.prev.down?.7:1});}break;
  }
  case 'tug':{
   title(c,'HAUL THE SUN OUT OF ITS ECLIPSE');
   for(const p of g.players){const a=panelX(g,p.slot),y=386-clamp(p.score,0,100)*1.8;braid(c,a.cx,148,272);prop(c,h,'gear',a.cx,173,86,-p.score*.07);object(c,h,'star',a.cx,y,79,79,t);prop(c,h,'lantern',a.cx,y,52);fx(c,h,'magic',a.cx,y,72,t,GOLD);platform(c,h,a.cx,425,Math.min(160,a.w-20),29,t,'stone');character(c,h,p,a.cx+34,424,67,{rotation:p.cooldown>0?-.14:0});glass(c,a.cx-52,140,104,23,p.color);text(c,`${Math.floor(p.score/1.6)} PULLS`,a.cx,152,12,p.color);}break;
  }
  case 'raft':{
   title(c,s.warning?'THE ISLES ARE SHIFTING — FOLLOW “NEXT”':'CROSS TO THE LANTERN ISLE');
   for(let j=0;j<5;j++){const x=120+j*180,safe=j===s.safe,y=407+Math.sin(t*1.2+j)*3;platform(c,h,x,y,169,44,t,'stone');if(safe){prop(c,h,'lantern',x,y-37,43);fx(c,h,'magic',x,y-15,89,t,GOLD);}if(s.warning&&j===s.upcoming){object(c,h,'sign',x,337,79,55,t);glass(c,x-35,325,70,22,GOLD);text(c,'NEXT ↓',x,337,12,GOLD);}}
   for(const p of g.players){character(c,h,p,p.x,400+Math.sin(t*3+p.slot)*3-Math.sin(p.jump/.68*Math.PI)*67,67,{hurt:!p.safe&&s.next<1.2});playerTag(c,p,p.x,443);}break;
  }
  case 'gallery':{
   title(c,'LIGHT THE WANDERING SENTINELS');
   for(const o of s.objects)if(o.respawn<=0){const oc=o.friendly?'#75c9e0':o.marked?GOLD:col;prop(c,h,o.friendly?'crate':'drone',o.x,o.y,84);if(!o.open&&!o.friendly)fx(c,h,'shield',o.x,o.y,79,t,RED);if(o.marked)object(c,h,'crown',o.x,o.y-40,31,28,t);fx(c,h,'magic',o.x,o.y+26,40,t,oc);glass(c,o.x-28,o.y-49,56,16,oc);text(c,o.friendly?'COURIER':o.marked?'MARKED':o.open?'OPEN':'ARMOR',o.x,o.y-41,8,oc);}
   platform(c,h,480,438,880,32,t,'stone');
   for(const p of g.players){const x=60+p.aim*840,y=362+p.slot*18;for(const [dx,dy] of [[-13,-13],[9,-13],[-13,9],[9,9]]){c.fillStyle=p.color;c.fillRect(x+dx,302+dy,4,4);}if(t-(p.shotTime??-1)<.12){for(let j=0;j<8;j++)fx(c,h,'hit',p.shot,155+j*34,37,t+j,p.color);}prop(c,h,'gear',x+18,y+23,28,-p.aim*3);character(c,h,p,x,y+43,53);}break;
  }
  case 'fishing':{
   title(c,'RAISE A RELIC FROM THE DROWNED BELLS');
   for(const p of g.players){const a=panelX(g,p.slot),r=Math.min(80,a.w*.34),cy=251;
    // The working dial is a generated wooden instrument; the only vector part is its moving wooden hand.
    object(c,h,'pedestal',a.cx,326,r*2.15,68,t);object(c,h,'gauge',a.cx,cy,r*2.32,r*2.32,t);
    if(!p.hooked){for(let k=-3;k<=3;k++){const angle=p.arc+k*.105,x=a.cx+Math.cos(angle)*r*.65,y=cy-4+Math.sin(angle)*r*.65;c.fillStyle=p.color;c.fillRect(Math.round(x/2)*2-3,Math.round(y/2)*2-3,6,6);}woodNeedle(c,a.cx,cy-4,r*.67,p.phase);prop(c,h,'key',a.cx,cy+88,32,Math.sin(t)*.08);text(c,'SPACE · HOOK THE RELIC',a.cx,350,9,p.color);}else{glass(c,a.cx-48,cy-36,96,71,p.color);arrow(c,p.fight>0?1:3,a.cx,cy-10,52,p.color);text(c,'MATCH + TAP',a.cx,cy+19,8,p.color);blocks(c,a.cx-r,cy+61,r*2,p.reel,p.color,14,8);text(c,'REEL',a.cx,cy+49,8,p.color);blocks(c,a.cx-r,cy+87,r*2,p.tension,p.tension>.7?RED:GOLD,14,6);text(c,'TENSION · ↓ EASES',a.cx,cy+101,8,p.tension>.7?RED:PAPER);if(p.tension>.7)fx(c,h,'hit',a.cx+r,cy+81,35,t,RED);}
    platform(c,h,a.cx,423,Math.min(151,a.w-20),28,t,'wood');line(c,a.cx+20,382,a.cx+47,338,'#32291c',5);line(c,a.cx+20,382,a.cx+47,338,'#ba9a63',2);line(c,a.cx+47,338,a.cx+61,415,'#c9c0a2',1);character(c,h,p,a.cx-8,421,67);glass(c,a.cx-56,432,112,16,p.color);text(c,`${p.level} RELICS RAISED`,a.cx,441,9,p.color);}break;
  }
  case 'balance':{
   title(c,'HOLD YOUR UMBRELLA AGAINST THE GALE');
   // Each board has a visible paper thickness; ropes and anchor posts are physical sprites.
   platform(c,h,480,411,893,125,t,'bridge');object(c,h,'pedestal',43,413,53,73,t);object(c,h,'pedestal',918,413,53,73,t);
   for(const p of g.players){const a=panelX(g,p.slot),lean=clamp(p.lean,-1.1,1.1),wind=Math.sin(t*2.1+p.slot*.8)*.52+Math.sin(t*.7)*.28;glass(c,a.cx-80,141,160,38,p.color);blocks(c,a.cx-68,151,136,.5,p.color,19,8);const mx=a.cx+lean*62;c.fillStyle='#12130f';c.fillRect(mx-4,147,8,16);c.fillStyle=PAPER;c.fillRect(mx-2,148,4,14);text(c,wind<0?'← WIND':'WIND →',a.cx,171,8,p.color);line(c,a.cx,332,a.cx+lean*65,225,'#352c20',6);line(c,a.cx,332,a.cx+lean*65,225,'#ccb784',2);prop(c,h,'umbrella',a.cx+lean*65,218,122,lean*.4);character(c,h,p,a.cx,422,78,{rotation:lean*.13});if(Math.abs(lean)>.6)fx(c,h,'dust',a.cx,421,63,t,p.color);}break;
  }
  case 'sorting':{
   title(c,'THE DEAD STILL EXPECT THEIR POST');
   for(const p of g.players){const a=panelX(g,p.slot),gap=Math.min(64,a.w/3.5),names=['key','gear','spark'];braid(c,a.cx,160,43);object(c,h,'crate',a.cx,224,98,91,t,{rotation:Math.sin(t)*.04});prop(c,h,names[p.parcel],a.cx,218,36,Math.sin(t)*.06);glass(c,a.cx-85,144,170,24,p.color);text(c,p.fragile?(p.stamped?'STAMPED ✓':'FRAGILE · ↓ STAMP'):p.express?'EXPRESS · HURRY':'STANDARD MAIL',a.cx,156,9,p.fragile&&!p.stamped?GOLD:p.color);
    for(let j=0;j<3;j++){const x=a.cx+(j-1)*gap;object(c,h,'crate',x,322,gap*.96,80,t);prop(c,h,names[j],x,314,gap*.55);if(j===p.bin){arrow(c,2,x,277,23,p.color);fx(c,h,'magic',x,321,gap,t,p.color);}}platform(c,h,a.cx,355,Math.min(185,a.w-12),22,t,'wood');platform(c,h,a.cx,444,Math.min(191,a.w-15),28,t,'wood');character(c,h,p,a.cx,441,65);}break;
  }
  case 'reaction':{
   title(c,s.signal==='go'?'THE TRUE DAWN — TOUCH THE LIGHT':s.signal==='fake'?'A FALSE DAWN — DO NOT TOUCH':'WATCH THE CHAPEL’S SEALED SUN');
   const signal=s.signal==='go'?GOLD:s.signal==='fake'?RED:col;object(c,h,'altar',480,298,199,97,t);object(c,h,'portal',480,226,179,185,t);object(c,h,'star',480,230,s.signal==='wait'?72:110,s.signal==='wait'?72:110,t);if(s.signal!=='wait')fx(c,h,s.signal==='go'?'magic':'hit',480,233,141,t,signal);glass(c,439,274,82,23,signal);text(c,s.signal==='go'?'GOLD · NOW':s.signal==='fake'?'FALSE':'WAIT',480,286,12,signal);
   for(let n=0;n<6;n++)prop(c,h,'lantern',290+n*76,340,26);
   for(const p of g.players){const a=panelX(g,p.slot);platform(c,h,a.cx,428,Math.min(158,a.w-18),25,t,'stone');character(c,h,p,a.cx,425,72);playerTag(c,p,a.cx,448);}break;
  }
  case 'trace':{
   title(c,'STITCH YOUR CONSTELLATION BACK TOGETHER');
   platform(c,h,480,440,873,28,t,'stone');
   // Stars float as small folded paper objects; no network of laser lines covers the painting.
   for(const p of g.players){for(let j=0;j<p.route.length;j++){const o=tracePoint(g,p,j),current=j===p.node,done=j<p.node;c.save();c.globalAlpha=done?.32:current?1:.62;object(c,h,'star',o.x,o.y,current?55:38,current?55:38,t,{rotation:Math.sin(t*.8+j)*.06});c.restore();if(current)fx(c,h,'magic',o.x,o.y,49,t,p.color);glass(c,o.x-8,o.y+12,16,16,p.color);text(c,`${j+1}`,o.x,o.y+21,9,done?'#929285':p.color,'center',650);}character(c,h,p,p.x,p.y,54);}break;
  }
  case 'potato':{
   title(c,'PASS THE WITCH’S CURSED INVITATION');
   // A furnished paper altar replaces the former flat elliptical arena.
   object(c,h,'altar',480,281,264,170,t);object(c,h,'crate',480,253,67,59,t);for(let n=0;n<2;n++)prop(c,h,'lantern',414+n*132,244,39);object(c,h,'crown',480,211,43,36,t);fx(c,h,'magic',480,252,76,t,col);
   glass(c,22,413,276,24,s.fuse<1?RED:col);text(c,s.fuse<1?'THE CURSE IS ABOUT TO BREAK':s.jinx===2?'DOUBLE CURSE · EXPLOSION −16':'INVITATION · EXPLOSION −8',160,426,11,s.fuse<1?RED:col);
   for(const p of g.players){const angle=p.slot*TAU/g.players.length-Math.PI/2,x=480+Math.cos(angle)*291,y=SCENE_LAYOUT.omenCenterY+Math.sin(angle)*SCENE_LAYOUT.omenRadiusY;platform(c,h,x,y+42,119,25,t,'wood');character(c,h,p,x,y+41,71);playerTag(c,p,x,Math.min(438,y+57));
    if(s.holder===p.slot){object(c,h,'crate',x+39,y-9,51,43,t,{rotation:Math.sin(t*(s.fuse<1?25:5))*.08});prop(c,h,'key',x+39,y-12,23);fx(c,h,s.fuse<1?'hit':'magic',x+38,y-11,59,t,s.fuse<1?RED:GOLD);blocks(c,x-43,y-49,86,s.fuse/4.2,s.fuse<1?RED:GOLD,12,5);const recipient=g.players[p.recipient],a=recipient.slot*TAU/g.players.length-Math.PI/2,rx=480+Math.cos(a)*291,ry=SCENE_LAYOUT.omenCenterY+Math.sin(a)*SCENE_LAYOUT.omenRadiusY;glass(c,rx-38,ry-57,76,19,GOLD);text(c,'SEND HERE ↓',rx,ry-47,9,GOLD);}}
   break;
  }
  case 'crates':{
   title(c,'TWO RELICS. TWO WAITING SEALS.');
   for(const p of g.players){const a=panelX(g,p.slot),cell=Math.min(54,(a.w-SCENE_LAYOUT.gridInset)/5),x=a.cx-cell*2.5,y=166;tileGrid(c,h,x,y,5,cell,p.color,t);for(const wall of p.walls)object(c,h,'pedestal',x+(wall.x+.5)*cell,y+(wall.y+.5)*cell,cell*.97,cell*.97,t);
    for(const b of p.boxes){const tx=x+(b.tx+.5)*cell,ty=y+(b.ty+.5)*cell,bc=b.kind?GOLD:p.color;object(c,h,'pedestal',tx,ty+cell*.12,cell*.88,cell*.5,t);prop(c,h,b.kind?'gear':'key',tx,ty,cell*.47);object(c,h,'crate',x+(b.x+.5)*cell,y+(b.y+.5)*cell,cell*.97,cell*.97,t);prop(c,h,b.kind?'gear':'key',x+(b.x+.5)*cell,y+(b.y+.5)*cell,cell*.36);if(b.delivered)fx(c,h,'magic',x+(b.x+.5)*cell,y+(b.y+.5)*cell,cell,t,bc);}
    character(c,h,p,x+(p.cx+.5)*cell,y+(p.cy+.9)*cell,cell*.94);glass(c,a.x+8,419,a.w-16,27,p.color);text(c,`${p.level} ROOMS · ${p.boxes.filter(b=>b.delivered).length}/2 SEALED`,a.cx,433,10,p.color);}break;
  }
  case 'orbit':{
   title(c,'RUN THE CRESCENT GARDEN’S SILVER RIM');
   for(const p of g.players){const a=panelX(g,p.slot),r=Math.min(94,a.w*.4),cy=284;
    for(const scale of [1,.62])for(let n=0;n<12;n++){const angle=n*TAU/12;object(c,h,'crate',a.cx+Math.cos(angle)*r*scale,cy+Math.sin(angle)*r*scale+18,Math.max(20,r*scale*.5),27,t);}
    object(c,h,'pedestal',a.cx,cy+19,r*.7,r*.55,t);prop(c,h,'lantern',a.cx,cy-7,37);const tr=r*(p.thornLane?.62:1),sr=r*(p.sparkLane?.62:1),pr=r*(p.orbitLane?.62:1);prop(c,h,'spike',a.cx+Math.cos(p.thorn)*tr,cy+Math.sin(p.thorn)*tr,44,p.thorn+Math.PI/2);object(c,h,'star',a.cx+Math.cos(p.spark)*sr,cy+Math.sin(p.spark)*sr,38,38,t);fx(c,h,'magic',a.cx+Math.cos(p.spark)*sr,cy+Math.sin(p.spark)*sr,35,t,GOLD);character(c,h,p,a.cx+Math.cos(p.angle)*pr,cy+Math.sin(p.angle)*pr+10,47,{hurt:p.cooldown>0});glass(c,a.cx-69,411,138,25,p.color);text(c,p.dir>0?'CLOCKWISE →':'← COUNTERCLOCKWISE',a.cx,424,9,p.color);}break;
  }
  case 'cipher':{
   title(c,'OPEN THE THIRTEENTH CLOCK’S SECRET');
   for(const p of g.players){const a=panelX(g,p.slot),names=['key','gear','spark','orb','lantern'],gap=Math.min(54,a.w/4);glass(c,a.x+9,145,a.w-18,62,p.color);for(let j=0;j<3;j++){const x=a.cx+(j-1)*gap;if(p.reveal>0||p.order.indexOf(j)<p.dial)prop(c,h,names[p.code[j]],x,173,31);else text(c,'?',x,173,26,p.color);blocks(c,x-15,195,30,p.order.indexOf(j)<p.dial?1:j===p.order[p.dial]?.5:0,p.color,4,3);}
    object(c,h,'pedestal',a.cx,342,163,85,t);object(c,h,'gauge',a.cx,278,180,180,t);prop(c,h,'gear',a.cx,277,95,-p.symbol*.25-t*.05);glass(c,a.cx-27,251,54,54,p.color);prop(c,h,names[p.symbol],a.cx,278,44);arrow(c,3,a.cx-100,286,31,p.color);arrow(c,1,a.cx+100,286,31,p.color);platform(c,h,a.cx,426,Math.min(165,a.w-16),24,t,'stone');character(c,h,p,a.cx,425,65);}break;
  }
  case 'shadow':{
   title(c,'ESCAPE THE KEEPER OF NIGHTREACH');
   platform(c,h,480,446,893,25,t,'stone');for(let n=0;n<6;n++){const x=51+n*172;object(c,h,'pedestal',x,434,46,40,t);prop(c,h,'lantern',x,410,28);}
   // Sparse edge particles retain the keeper's readable danger radius without a giant opaque disc.
   for(let n=0;n<12;n++){const a=n*TAU/12+t*.08;fx(c,h,'magic',s.seeker.x+Math.cos(a)*53,s.seeker.y+Math.sin(a)*53,18,t+n,GOLD);}prop(c,h,'lantern',s.seeker.x,s.seeker.y,84,Math.sin(t)*.1);
   for(const p of [...g.players].sort((a,b)=>a.y-b.y)){if(p.dash>0)fx(c,h,'dust',p.x,p.y-15,63,t,p.color);character(c,h,p,p.x,p.y,64,{dash:p.dash>0});if(p.cooldown<=0)prop(c,h,'spark',p.x+25,p.y-8,18);playerTag(c,p,p.x,p.y+18);}break;
  }
 }
 drawDynamicRules(c,g,h,true);
 for(const e of lighting.effects)h.fx?.(c,e.type,e.x,e.y,e.size,e.time,{alpha:e.alpha,progress:e.progress,rotation:e.rotation,color:e.color});
 drawMinigameSurprises(c,g,h);
 h.endScene?.(c);
 drawMinigameSurpriseCue(c,g,h);
 drawDynamicRules(c,g,h);
 const cue=g.id==='redlight'?(s.green?'GO':'FREEZE'):g.id==='sweep'?(s.height==='high'?'HIGH TRAIN · DUCK':s.next-t<.5?'LOW TRAIN · JUMP':s.express?'EXPRESS TRAIN':'LOW TRAIN APPROACHING'):g.id==='raft'&&s.warning?'ISLANDS SHIFTING':g.id==='inkfall'?['GEAR SHOWER','GEAR RAIN','PRESS WALL'][s.wave]:'';
 drawGameHUD(c,g,h,{mode:'arcade',cue});
 c.restore();
}
