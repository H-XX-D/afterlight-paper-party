/** Eight original competitive objectives layered over the shared paper fighter physics. */
export const OBJECTIVE_GAMES=[
  ['bell-breakers','BELL BREAKERS','TARGET COMBOS','Shatter moving bells across the balconies. Chain breaks within 3 seconds for a rising combo; gilded bells take two light hits or one heavy strike and pay double.','↑ double jump · Space / directional strike · X special · ↓ parry · chase bells and chain breaks',45,'bell'],
  ['relic-launch','RELIC LAUNCH','DISTANCE TRIAL','Four simultaneous 11-second trials: batter your own relic for 7 seconds, then launch it before the bell. Damage and your finishing move determine its real flight distance.','← → approach your relic · Space charge hits · ↑+Space high launch · X special · launch during the 3-second bell',44,'gear'],
  ['hollow-horde','HOLLOW HORDE','WAVE SURVIVAL','Compete for paper-foe knockouts through six escalating waves. Foes warn before lunging; parry their strike to turn it back. Stay alive and steal the finishing blow.','↑ double jump · Space / directional strike · X special · ↓ timed parry · finish the paper horde',48,'mask'],
  ['rift-ball','RIFT BALL','ARENA BALL','Strike the heavy moon into either gate. The last striker earns the goal; uppercuts lob and dives spike. A timed guard reflects the ball. Final 12 seconds score double.','↑ double jump · Space kick · ↑+Space lob · air ↓+Space spike · X special · ↓ reflect',45,'orb'],
  ['spark-heist','SPARK HEIST','BANK & STEAL','Collect loose sparks and bank them at the moving altar. Clean hits spill a rival’s cargo. Carry four for a bulk bonus, but a fall drops everything.','↑ double jump · Space steal cargo · X special · ↓ guard · touch sparks, then stand by the active altar',45,'spark'],
  ['fuse-festival','FUSE FESTIVAL','PASS THE FUSE','Catch the cursed lantern, then strike to throw or pass it. The fuse keeps burning through every hand. Escape its blast or time a perfect guard; later fuses burn faster.','↑ double jump · Space throw / pass · X special · ↓ timed blast parry · leave the blast before zero',44,'lantern'],
  ['tower-relay','TOWER RELAY','CHECKPOINT RACE','Race your personal sequence of moving seals: left, summit, right, ground. Each circuit gives a bonus. Knock rivals off their route as the balconies accelerate.','↑ double jump · ← → reach your numbered seal · Space disrupt rivals · X special · ↓ guard',45,'flag'],
  ['bellows-boxing','BELLOWS BOXING','SPRING-HEAD BOXING','Wind up punches in a tightening toy ring (solo uses a sparring automaton). Clean hits build spring pressure; at 75 the rival’s head pops for 35 points. Guard drains stamina, while precise parries punish windups.','← → footwork · hold Space wind-up punch · ↑+Space rising hook · X special · ↓ guard / timed parry',45,'gear'],
  ['colossus-wake','COLOSSUS WAKE','WEAKPOINT RAID','A folded giant reveals a new weakpoint after every warned attack. Compete for damage and clean dodges. Jump its marked floor slam or parry; break its core for a contribution bonus.','↑ jump the marked slam · Space / directional strike at open core · X special · ↓ timed parry',48,'crown'],
].map(([id,name,tag,description,instructions,duration,icon])=>({id,name,tag,description,instructions,duration,icon}));
const IDS=new Set(OBJECTIVE_GAMES.map(d=>d.id));
export const isObjective=id=>IDS.has(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const active=p=>!p.eliminated&&p.respawn<=0;
const close=(p,q,r=52)=>Math.abs(p.x-q.x)<r&&Math.abs(p.y-36-q.y)<60;
const alive=g=>g.players.filter(active);
const nearest=(p,items)=>items.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.y-(p.y-36))-Math.hypot(b.x-p.x,b.y-(p.y-36)))[0];
const lootAt=(id,x,y,vx=0,vy=0,lock=0)=>({id,x,y,vx,vy,lock,life:15});
export function objectiveLayout(id){
  if(!isObjective(id))return null;
  if(id==='bellows-boxing')return [[170,430,620],[165,295,120],[675,295,120],[410,200,140]];
  if(id==='relic-launch')return [[80,430,800],[130,265,190],[640,265,190],[390,190,180]];
  if(id==='rift-ball')return [[75,430,810],[210,292,165],[585,292,165],[410,180,140]];
  if(id==='tower-relay')return [[110,430,740],[160,322,205],[595,322,205],[390,214,180]];
  return [[130,430,700],[155,322,205],[600,322,205],[385,215,190]];
}
export function initObjective(g){
  if(!isObjective(g.id))return;
  const o=g.state.objective={kind:g.id,phase:'',serial:0,phaseIndex:0};
  for(const p of g.players)p.objective={hits:0,breaks:0,combo:0,comboUntil:0,launches:0,best:0,kills:0,goals:0,carried:0,banked:0,bankTime:0,passes:0,survived:0,checkpoint:0,checkpoints:0,laps:0,bossDamage:0,evades:0,pressure:0,headpops:0,popped:0,punchWindup:0};
  if(g.id==='bell-breakers')o.targets=Array.from({length:6},(_,n)=>{const b=g.state.platforms[[0,1,2,3,0,0][n]];return{id:'bell-'+n,x:b.x+b.w*([.2,.55,.45,.5,.5,.8][n]),y:b.y-40,baseX:b.x+b.w*([.2,.55,.45,.5,.5,.8][n]),baseY:b.y-40,hp:n%3===0?2:1,gold:n%3===0,respawn:0,phase:n};});
  if(g.id==='relic-launch'){o.round=0;o.phase='charge';o.dummies=g.players.map((p,n)=>{const x=g.players.length===1?480:180+n*600/(g.players.length-1);p.x=x-44;p.y=430;return{id:'dummy-'+p.id,owner:p.id,x,y:391,origin:x,damage:0,vx:0,vy:0,launched:false,settled:false,flight:0,distance:0,scored:false};});}
  if(g.id==='hollow-horde'){o.wave=0;o.foes=[];o.nextWave=0;o.defeated=0;}
  if(g.id==='rift-ball'){o.ball={id:'moon-ball',x:480,y:205,vx:0,vy:0,r:23,lastTouch:null,previousTouch:null,lock:0,reset:0};o.lastGoal='';o.goalFlash=0;}
  if(g.id==='spark-heist'){o.bank=1;o.nextBank=2;o.nextSpawn=0;o.loot=Array.from({length:8},(_,n)=>{const b=g.state.platforms[n%4];return lootAt('spark-'+o.serial++,b.x+b.w*(.3+(n%2)*.4),b.y-22);});}
  if(g.id==='fuse-festival'){o.round=0;o.bomb={id:'fuse',holder:null,x:480,y:250,vx:0,vy:0,fuse:6.5,lock:0,owner:null,reset:0};o.explosion={x:0,y:0,life:0,radius:128};}
  if(g.id==='tower-relay'){o.order=[1,3,2,0];o.speed=1;}
  if(g.id==='bellows-boxing'){o.round=0;o.phase='footwork bell';o.hazardDone=false;o.sparring=g.players.length===1?{id:'spring-partner',x:580,y:394,pressure:0,popped:0,warning:0,cooldown:2}:null;}
  if(g.id==='colossus-wake'){o.boss={id:'colossus-core',x:480,y:174,hp:320,maxHp:320,level:1,open:false,weakPlatform:3,attackPlatform:0,cycle:-1,attackDone:false,hitPlayers:[],damageBy:{}};o.blast=0;}
}
export function objectivePlatformMotion(g,b){
  if(g.id==='bellows-boxing'&&b.id===0){const inset=Math.min(2,Math.floor(g.time/15))*30;b.x=170+inset;b.w=620-inset*2;}
  if(g.id==='tower-relay'){const speed=g.time>24?1.35:1;if(b.id===1)b.y=322+Math.sin(g.time*.8*speed)*22;if(b.id===2)b.y=322-Math.sin(g.time*.8*speed)*22;if(b.id===3)b.x=390+Math.sin(g.time*.6*speed)*75;}
  if(g.id==='spark-heist'&&b.id===3)b.y=215+Math.sin(g.time*.6)*18;
  if(g.id==='bell-breakers'&&b.id===3)b.x=385+Math.sin(g.time*.55)*48;
}
export function objectivePvp(g){return !['relic-launch','hollow-horde','colossus-wake'].includes(g.id);}
export function objectiveTarget(g,p){
  const o=g.state.objective;if(!o)return null;let target=null;
  if(g.id==='bell-breakers'){const q=nearest(p,o.targets.filter(t=>t.respawn<=0));if(q)target={x:q.x,y:q.y+36,attack:true};}
  if(g.id==='relic-launch'){const q=o.dummies.find(d=>d.owner===p.id);if(q&&!q.launched)target={x:q.x-45,y:q.y+39,attack:o.phase!=='flight',face:1};}
  if(g.id==='hollow-horde'){const q=nearest(p,o.foes.filter(f=>f.hp>0));if(q)target={x:q.x-36*(p.x<q.x?1:-1),y:q.y,attack:true,danger:q.warning>0&&q.warning<.16};}
  if(g.id==='rift-ball'){const q=o.ball,dir=q.x<480?-1:1;target={x:clamp(q.x-dir*55,115,845),y:q.y+25,attack:true,face:dir};}
  if(g.id==='spark-heist'){if(p.objective.carried>=2){const b=g.state.platforms[o.bank];target={x:b.x+b.w/2,y:b.y,attack:false};}else{const q=nearest(p,o.loot.filter(q=>q.lock<=0));if(q)target={x:q.x,y:q.y+22,attack:false};}}
  if(g.id==='fuse-festival'){const b=o.bomb;if(b.holder===p.id){const q=nearest(p,alive(g).filter(q=>q.id!==p.id).map(q=>({x:q.x,y:q.y-36})));target=q?{x:q.x,y:q.y+36,attack:true}:{x:p.x<480?240:720,y:430,attack:true};}else if(b.fuse<2.2){target={x:b.x<480?740:220,y:215,attack:false};}else target={x:b.x,y:b.y+36,attack:true};}
  if(g.id==='tower-relay'){const b=g.state.platforms[o.order[p.objective.checkpoint]];target={x:b.x+b.w/2,y:b.y,attack:false};}
  if(g.id==='bellows-boxing'&&o.sparring)target={x:o.sparring.x-60,y:430,attack:true,danger:o.sparring.warning>0&&o.sparring.warning<.15};
  if(g.id==='colossus-wake'){const b=o.boss;target={x:b.x-42*(p.x<b.x?1:-1),y:b.y+40,attack:b.open,danger:!b.open&&p.ground===b.attackPlatform&&g.time%8>2.7&&g.time%8<3.2};}
  return target;
}
function spill(g,p,count,api){const o=g.state.objective;count=Math.min(count,p.objective.carried);for(let n=0;n<count;n++)o.loot.push(lootAt('spark-'+o.serial++,p.x+(n-1)*9,p.y-38,(n%2?1:-1)*(100+n*25),-180,.5));p.objective.carried-=count;if(count)api.notify(p,'CARGO SPILLED');o.loot=o.loot.slice(-18);}
export function objectivePlayerHit(g,a,p,shielded,api){
  if(!g.state.objective||shielded)return;
  if(g.id==='spark-heist')spill(g,p,3,api);
  if(g.id==='bellows-boxing'){const v=p.objective;v.pressure+=api.power(a)*(g.state.objective.round%2?1.35:1);p.vx*=.2;p.vy*=.35;if(v.pressure>=75){v.pressure=0;v.popped=.8;a.objective.headpops++;a.score+=35;p.score=Math.max(0,p.score-8);p.damage=0;p.stun=.8;p.invuln=1;p.vx=-a.facing*80;p.vy=-100;api.notify(a,'HEAD POP +35');api.notify(p,'SPRING RESET');api.burst(g,p.x,p.y-65,p.color,18);}}
  if(g.id==='fuse-festival'){const b=g.state.objective.bomb;if(b.holder===a.id&&b.lock<=0){b.holder=p.id;b.owner=a.id;b.lock=.55;a.objective.passes++;api.notify(a,'FUSE PASSED');api.notify(p,'PASS IT!');}else if(b.holder===p.id&&b.lock<=0){b.holder=null;b.owner=a.id;b.vx=a.facing*510;b.vy=-260;b.lock=.35;}}
}
export function objectiveRingout(g,p,api){if(!g.state.objective)return;if(g.id==='spark-heist')spill(g,p,8,api);if(g.id==='fuse-festival'){const b=g.state.objective.bomb;if(b.holder===p.id){b.holder=null;b.x=clamp(p.x,150,810);b.y=220;b.vx=0;b.vy=0;b.lock=.5;}}}
function hitOnce(p,q,api){if(p.hitIds.includes(q.id)||!api.hits(p,q))return false;p.hitIds.push(q.id);return true;}
function launch(g,d,p,api,weak=false){d.launched=true;d.flight=0;d.origin=d.x;const mult=p.move==='uppercut'?.78:p.move==='dive'?.58:1;d.vx=(270+d.damage*5.2)*mult*(weak?.35:1);d.vy=-(230+d.damage*1.7)*(p.move==='uppercut'?1.4:p.move==='dive'?.5:1);api.notify(p,'LAUNCH!');api.burst(g,d.x,d.y,p.color,12);}
function projectile(q,dt,platforms,bounce=.45,r=12){const old=q.y;q.vy+=720*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;for(const b of platforms)if(q.vy>=0&&q.x>b.x-r&&q.x<b.x+b.w+r&&old<=b.y-r&&q.y>=b.y-r){q.y=b.y-r;q.vy=-q.vy*bounce;q.vx*=.88;break;}}
export function stepObjective(g,dt,api){
  const o=g.state.objective;if(!o)return;const ps=alive(g),strikers=ps.filter(p=>api.attacking(p));
  if(g.id==='bell-breakers'){
    o.phase=g.time<15?'bells':g.time<30?'drifting bells':'bell rush';
    for(const t of o.targets){if(t.respawn>0){t.respawn=Math.max(0,t.respawn-dt);if(t.respawn===0){t.hp=t.gold?2:1;t.phase+=1;}continue;}
      t.x=t.baseX+Math.sin(g.time*(g.time>30?1.7:.85)+t.phase)* (g.time>15?53:23);t.y=t.baseY+Math.sin(g.time*1.4+t.phase)*13;
      for(const p of strikers)if(hitOnce(p,t,api)){p.objective.hits++;t.hp-=api.power(p)>=16?2:1;api.burst(g,t.x,t.y,p.color,7);if(t.hp<=0){const v=p.objective;v.combo=g.time<=v.comboUntil?Math.min(5,v.combo+1):1;v.comboUntil=g.time+3;v.breaks++;p.score+=(12+v.combo*4)*(t.gold?2:1);t.respawn=g.time>30?.6:1.1;api.notify(p,'BELL ×'+v.combo);break;}}
    }
  }
  if(g.id==='relic-launch'){
    const round=Math.min(3,Math.floor(g.time/11)),clock=g.time-round*11;o.phase=clock<7?'charge':clock<10?'launch':'flight';
    if(round!==o.round){for(const d of o.dummies){const p=g.players.find(p=>p.id===d.owner);if(d.launched&&!d.scored)scoreLaunch(d,p,api);Object.assign(d,{x:d.origin,y:391,damage:0,vx:0,vy:0,launched:false,settled:false,flight:0,distance:0,scored:false});p.x=d.origin-44;p.y=430;p.vx=0;p.vy=0;p.damage=0;p.ground=0;p.invuln=.3;}o.round=round;}
    for(const d of o.dummies){const p=g.players.find(p=>p.id===d.owner);if(!d.launched){if(active(p)&&api.attacking(p)&&hitOnce(p,d,api)){p.objective.hits++;if(o.phase==='charge'){d.damage+=api.power(p);p.score+=1;api.burst(g,d.x,d.y,p.color,5);}else launch(g,d,p,api);}if(clock>=10&&d.damage>0&&!d.launched)launch(g,d,p,api,true);}
      if(d.launched&&!d.settled){d.flight+=dt;d.x+=d.vx*dt;d.vy+=640*dt;d.y+=d.vy*dt;d.distance=Math.max(d.distance,Math.abs(d.x-d.origin));if((d.y>=391&&d.flight>.2)||clock>=10.9||g.time>=g.duration){d.y=391;d.settled=true;scoreLaunch(d,p,api);}}
    }
  }
  if(g.id==='hollow-horde'){
    if(g.time>=o.nextWave){o.wave++;o.nextWave+=8;o.phase='wave '+o.wave;const count=Math.min(7,2+o.wave);for(let n=0;n<count&&o.foes.length<9;n++){const b=g.state.platforms[n%4];o.foes.push({id:'foe-'+o.serial++,x:b.x+b.w*(.25+(n%3)*.25),y:b.y,vx:0,vy:0,ground:b.id,hp:24+o.wave*4,damage:0,warning:0,cooldown:1+n*.18,spawn:.65,stun:0,lastHit:null,facing:1,counted:false});}}
    for(const f of o.foes){f.spawn=Math.max(0,f.spawn-dt);f.stun=Math.max(0,f.stun-dt);f.cooldown=Math.max(0,f.cooldown-dt);if(f.spawn>0||f.hp<=0)continue;
      for(const p of strikers)if(hitOnce(p,{...f,y:f.y-35},api)){const d=api.power(p);f.hp-=d;f.damage+=d;f.lastHit=p.id;f.vx=p.facing*(180+f.damage*3);f.vy=p.move==='dive'?380:p.move==='uppercut'?-470:-210;f.stun=.45;p.score+=2;p.objective.hits++;api.burst(g,f.x,f.y-36,p.color,7);}
      if(f.hp<=0||f.x<45||f.x>915||f.y>535){defeatFoe(g,o,f,api);continue;}
      const q=nearest({x:f.x,y:f.y},ps);if(q&&f.stun<=0){const dx=q.x-f.x;f.facing=dx>=0?1:-1;f.vx+=(Math.sign(dx)*Math.min(155,85+o.wave*9)-f.vx)*Math.min(1,dt*5);if(q.y<f.y-45&&f.ground>=0){f.vy=-470;f.ground=-1;}if(f.warning>0){f.warning-=dt;f.vx*=.7;if(f.warning<=0){if(Math.abs(dx)<90&&Math.abs(q.y-f.y)<80){const result=api.strike(g,null,q,true);if(result==='parried'){f.hp-=32;f.lastHit=q.id;q.objective.hits++;api.notify(q,'HOLLOW PARRIED');if(f.hp<=0)defeatFoe(g,o,f,api);}else api.notify(q,'HOLLOW STRIKE');}f.cooldown=Math.max(.9,1.8-o.wave*.1);}}else if(f.cooldown<=0&&Math.abs(dx)<100&&Math.abs(q.y-f.y)<80)f.warning=.44;}
      const old=f.y;f.vy=Math.min(800,f.vy+980*dt);f.x+=f.vx*dt;f.y+=f.vy*dt;f.ground=-1;api.land(f,old,g.state.platforms);
    }o.foes=o.foes.filter(f=>f.hp>0);for(const p of ps)p.score+=dt*.4;
  }
  if(g.id==='rift-ball'){
    const b=o.ball;o.goalFlash=Math.max(0,o.goalFlash-dt);o.phase=g.time>=g.duration-12?'double goals':'shoot either gate';b.lock=Math.max(0,b.lock-dt);
    if(b.reset>0){b.reset=Math.max(0,b.reset-dt);if(b.reset===0)Object.assign(b,{x:480,y:190,vx:0,vy:0,lastTouch:null,previousTouch:null,lock:.25});}
    else{
      for(const p of strikers)if(hitOnce(p,b,api)){b.previousTouch=b.lastTouch;b.lastTouch=p.id;const dir=p.move==='spin'?Math.sign(b.x-p.x)||p.facing:p.facing;b.vx=dir*(p.move==='uppercut'?420:p.move==='dive'?330:660)*(p.specialAnimation==='active'?1.25:1);b.vy=p.move==='uppercut'?-600:p.move==='dive'?500:-180;if(p.specialAnimation==='active'){if(p.specialKind==='wing-gust'){b.vx=dir*230;b.vy=-680;}if(p.specialKind==='magnet-burst'){b.vx=dir*900;b.vy=-320;}if(p.specialKind==='ground-slam'){b.vx=dir*430;b.vy=540;}if(p.specialKind==='thorn-grasp'){b.vx=-dir*330;b.vy=-190;}if(p.specialKind==='ink-blink'){b.vx=dir*970;b.vy=-90;}if(p.specialKind==='frost-fan'){b.vx=dir*370;b.vy=-100;}}b.lock=.14;p.objective.hits++;api.burst(g,b.x,b.y,p.color,10);}
      for(const p of ps)if(b.lock===0&&p.shielding&&close(p,b,48)){b.vx=(Math.sign(b.x-p.x)||p.facing)*(p.parryWindow>0?780:360);b.vy=-240;b.lastTouch=p.id;b.lock=.25;if(p.parryWindow>0){p.score+=3;p.parries++;g.state.parries++;p.parryWindow=0;api.notify(p,'MOON REFLECTED');}}
      projectile(b,dt,g.state.platforms,.72,b.r);b.vx*=Math.pow(.994,dt*60);if(Math.abs(b.vx)<25&&b.y>390)b.vx+=Math.sin(g.time)*18*dt;
      if((b.x<102||b.x>858)&&b.y>300){const p=g.players.find(p=>p.id===b.lastTouch);if(p){const pts=g.time>=g.duration-12?70:35;p.score+=pts;p.objective.goals++;api.notify(p,'GOAL +'+pts);o.lastGoal=p.name+' SCORES';}else o.lastGoal='NEUTRAL BALL · RESET';o.goalFlash=1.3;b.reset=1.1;api.burst(g,clamp(b.x,100,860),b.y,'#ecdcab',18);}
      else if(b.x<60||b.x>900){b.x=clamp(b.x,60,900);b.vx*=-.85;}if(b.y>520){b.reset=.5;}
    }
  }
  if(g.id==='spark-heist'){
    const cycle=[1,2,0,3],phase=Math.floor(g.time/10);o.bank=cycle[phase%4];o.nextBank=cycle[(phase+1)%4];o.phase=g.time%10>8?'altar moving':'bank sparks';o.nextSpawn-=dt;
    if(o.nextSpawn<=0&&o.loot.length<14){o.nextSpawn=.85;const b=g.state.platforms[o.serial%4];o.loot.push(lootAt('spark-'+o.serial++,b.x+25+api.random(g)*(b.w-50),b.y-24));}
    for(const l of o.loot){l.life-=dt;l.lock=Math.max(0,l.lock-dt);projectile(l,dt,g.state.platforms,.1,18);const p=ps.find(p=>p.objective.carried<8&&l.lock===0&&close(p,l,30));if(p){p.objective.carried++;l.life=0;api.burst(g,l.x,l.y,p.color,3);}}
    o.loot=o.loot.filter(l=>l.life>0&&l.y<520);const b=g.state.platforms[o.bank];for(const p of ps){if(p.objective.carried>0&&p.ground===b.id&&Math.abs(p.x-b.x-b.w/2)<65){p.objective.bankTime+=dt;if(p.objective.bankTime>=.45){const n=p.objective.carried;p.score+=n*12+(n>=4?20:0);p.objective.banked+=n;p.objective.carried=0;p.objective.bankTime=0;api.notify(p,'BANKED '+n+' SPARKS');api.burst(g,p.x,p.y-30,p.color,12);}}else p.objective.bankTime=0;}
  }
  if(g.id==='fuse-festival'){
    const b=o.bomb;o.explosion.life=Math.max(0,o.explosion.life-dt);b.lock=Math.max(0,b.lock-dt);o.phase=b.fuse<2?'fuse critical':'pass the fuse';
    if(b.reset>0){b.reset=Math.max(0,b.reset-dt);if(b.reset===0){o.round++;Object.assign(b,{holder:null,x:280+(o.round%3)*200,y:180,vx:0,vy:0,fuse:Math.max(3.8,6.5-o.round*.3),lock:.2,owner:null});}}
    else{b.fuse=Math.max(0,b.fuse-dt);const holder=g.players.find(p=>p.id===b.holder&&active(p));if(holder){b.x=holder.x;b.y=holder.y-70;if(api.attacking(holder)&&b.lock===0){b.holder=null;b.owner=holder.id;b.vx=holder.facing*550;b.vy=holder.move==='uppercut'?-470:-260;b.lock=.45;holder.objective.passes++;api.notify(holder,'FUSE THROWN');}}
      else{b.holder=null;for(const p of strikers)if(hitOnce(p,b,api)){b.vx=p.facing*570;b.vy=-300;b.owner=p.id;b.lock=.35;p.objective.passes++;}projectile(b,dt,g.state.platforms,.4,20);if(b.x<100||b.x>860){b.x=clamp(b.x,100,860);b.vx*=-.7;}if(b.y>510){b.x=480;b.y=200;b.vy=0;b.vx=0;}if(b.lock===0){const p=ps.find(p=>close(p,b,34));if(p){b.holder=p.id;b.lock=.3;api.notify(p,'PASS THE FUSE');}}}
      if(b.fuse===0){o.explosion={x:b.x,y:b.y,life:.55,radius:128};for(const p of ps){const hit=Math.hypot(p.x-b.x,p.y-38-b.y)<128;if(hit){const result=api.strike(g,null,p,true);if(result==='parried'){p.score+=12;p.objective.survived++;api.notify(p,'BLAST PARRIED');}else{const thrower=g.players.find(q=>q.id===b.owner&&q.id!==p.id);if(thrower)thrower.score+=20;api.notify(p,'CAUGHT IN THE BLAST');}}else{p.score+=12;p.objective.survived++;api.notify(p,'ESCAPED +12');}}api.burst(g,b.x,b.y,'#ecd9ad',24);g.state.shake=9;b.holder=null;b.reset=1;}
    }
  }
  if(g.id==='tower-relay'){
    o.speed=g.time>=24?1.35:1;o.phase=g.time>=24?'quickening balconies':'four seal circuit';for(const p of ps){const b=g.state.platforms[o.order[p.objective.checkpoint]];if(p.ground===b.id&&Math.abs(p.x-b.x-b.w/2)<72){p.objective.checkpoints++;p.score+=20;p.objective.checkpoint=(p.objective.checkpoint+1)%4;api.notify(p,'SEAL '+p.objective.checkpoints);api.burst(g,p.x,p.y-34,p.color,9);if(p.objective.checkpoint===0){p.objective.laps++;p.score+=35;api.notify(p,'CIRCUIT +35');}}}
  }
  if(g.id==='bellows-boxing'){
    const round=Math.min(2,Math.floor(g.time/15)),clock=g.time%15;if(round!==o.round){o.round=round;o.hazardDone=false;}o.phase=clock>=12?'corner bell warning':round%2?'heavy bell':'footwork bell';const slab=g.state.platforms[0];
    if(o.sparring){const f=o.sparring;f.x=clamp(f.x,slab.x+60,slab.x+slab.w-60);f.popped=Math.max(0,f.popped-dt);f.cooldown=Math.max(0,f.cooldown-dt);for(const p of strikers)if(f.popped===0&&hitOnce(p,f,api)){f.pressure+=api.power(p);p.score+=1;api.burst(g,f.x,f.y,p.color,7);if(f.pressure>=75){f.pressure=0;f.popped=.8;p.objective.headpops++;p.score+=35;api.notify(p,'HEAD POP +35');}}const p=ps[0];if(p&&f.popped===0){if(f.warning>0){f.warning=Math.max(0,f.warning-dt);if(f.warning===0){if(close(p,f,110)){const result=api.strike(g,null,p,true);if(result==='parried'){f.pressure+=30;api.notify(p,'COUNTER +30 SPRING');}else api.notify(p,'SPARRING JAB');}f.cooldown=2;}}else if(f.cooldown===0&&close(p,f,130))f.warning=.4;}}
    for(const p of ps){p.x=clamp(p.x,slab.x+18,slab.x+slab.w-18);p.objective.popped=Math.max(0,p.objective.popped-dt);if(p.objective.punchWindup>0){p.objective.punchWindup=Math.max(0,p.objective.punchWindup-dt);if(p.stun>0)p.objective.punchWindup=0;else if(p.objective.punchWindup===0)p.attack=.23;}}
    if(clock>=14&&!o.hazardDone){o.hazardDone=true;for(const p of ps)if(p.ground===0&&(p.x<slab.x+95||p.x>slab.x+slab.w-95)){api.strike(g,null,p,true);api.notify(p,'CORNER BELL');}api.burst(g,slab.x+40,410,'#ecdcab',10);api.burst(g,slab.x+slab.w-40,410,'#ecdcab',10);}
  }
  if(g.id==='colossus-wake'){
    const b=o.boss,cycle=Math.floor(g.time/8),clock=g.time%8;o.blast=Math.max(0,o.blast-dt);
    if(b.cycle!==cycle){b.cycle=cycle;b.weakPlatform=[3,1,2][cycle%3];b.attackPlatform=[0,1,2,3][cycle%4];b.attackDone=false;b.hitPlayers=[];}
    b.open=clock>=3.5&&clock<7.7;const weak=g.state.platforms[b.weakPlatform];b.x=weak.x+weak.w/2;b.y=weak.y-40;o.phase=b.open?'core exposed':clock<3?'slam warning':'armored';
    if(clock>=3&&!b.attackDone){b.attackDone=true;o.blast=.5;const slab=g.state.platforms[b.attackPlatform];for(const p of ps){const hit=p.x>slab.x-20&&p.x<slab.x+slab.w+20&&Math.abs(p.y-slab.y)<50;if(hit){const result=api.strike(g,null,p,true);if(result==='parried'){p.score+=10;p.objective.evades++;api.notify(p,'COLOSSUS PARRIED');}else b.hitPlayers.push(p.id);}else{p.score+=8;p.objective.evades++;}}api.burst(g,slab.x+slab.w/2,slab.y,'#ecdcab',18);g.state.shake=7;}
    if(b.open)for(const p of strikers)if(hitOnce(p,b,api)){const damage=api.power(p);b.hp-=damage;p.objective.bossDamage+=damage;b.damageBy[p.id]=(b.damageBy[p.id]||0)+damage;p.score+=damage*2;api.burst(g,b.x,b.y,p.color,8);if(b.hp<=0){for(const q of g.players)if(b.damageBy[q.id])q.score+=30;b.level++;b.maxHp+=80;b.hp=b.maxHp;b.damageBy={};b.open=false;api.notify(p,'CORE SHATTERED +30');g.state.shake=10;break;}}
  }
}
function defeatFoe(g,o,f,api){if(f.counted)return;f.counted=true;f.hp=0;o.defeated++;const p=g.players.find(p=>p.id===f.lastHit);if(p){p.score+=20+o.wave*2;p.objective.kills++;api.notify(p,'HOLLOW +'+(20+o.wave*2));}}
function scoreLaunch(d,p,api){if(d.scored)return;d.scored=true;const pts=Math.round(d.distance/4);p.score+=pts;p.objective.launches++;p.objective.best=Math.max(p.objective.best,Math.round(d.distance));api.notify(p,Math.round(d.distance)+'m · +'+pts);}
export function objectiveBanner(g){
 const o=g.state.objective;if(!o)return'';
 if(g.id==='bell-breakers')return o.phase==='bell rush'?'BELL RUSH':o.phase==='drifting bells'?'BELLS DRIFTING':'BREAK THE BELLS';
 if(g.id==='relic-launch')return 'TRIAL '+(o.round+1)+'/4 · '+o.phase.toUpperCase()+' '+Math.max(0,(o.phase==='charge'?7:o.phase==='launch'?10:11)-g.time%11).toFixed(1)+'s';
 if(g.id==='hollow-horde')return 'WAVE '+o.wave+' · '+o.foes.length+' HOLLOWS';
 if(g.id==='rift-ball')return o.goalFlash>0?o.lastGoal:o.phase==='double goals'?'GOALS ×2':'SCORE GOALS';
 if(g.id==='spark-heist')return o.phase==='altar moving'?'ALTAR MOVES IN '+(10-g.time%10).toFixed(1)+'s':'BANK SPARKS';
 if(g.id==='fuse-festival')return o.bomb.reset>0?'NEW FUSE':'PASS THE FUSE';
 if(g.id==='tower-relay')return o.phase==='quickening balconies'?'LIFTS SPEED UP':'REACH YOUR NEXT SEAL';
 if(g.id==='bellows-boxing')return 'BELL '+(o.round+1)+'/3 · '+(o.phase==='corner bell warning'?'CORNERS FLASHING':o.phase==='heavy bell'?'HEAVY PUNCHES':'POP RIVAL HEADS');
 if(g.id==='colossus-wake')return o.phase==='slam warning'?'SLAM INCOMING':o.boss.open?'CORE OPEN · '+Math.max(0,Math.ceil(o.boss.hp)):'CORE ARMORED';
 return'';
}
export function objectivePlayerLabel(g,p){
 const v=p.objective;if(!v)return'';
 if(g.id==='bell-breakers')return 'COMBO ×'+(g.time<v.comboUntil?v.combo:0);
 if(g.id==='relic-launch')return v.best+'m BEST';
 if(g.id==='hollow-horde')return v.kills+' KOs';
 if(g.id==='rift-ball')return v.goals+' GOALS';
 if(g.id==='spark-heist')return 'CARRY '+v.carried+'/8';
 if(g.id==='tower-relay')return 'SEAL '+(v.checkpoint+1)+'/4';
 if(g.id==='bellows-boxing')return Math.round(v.pressure)+'/75 PRESSURE';
 if(g.id==='colossus-wake')return v.bossDamage+' DAMAGE';
 return'';
}
export function drawObjective(ctx,g,h,paint){
  const o=g.state.objective;if(!o)return;const {label,fx}=paint;
  const object=(kind,x,y,size,opts={})=>{if(h.objective)h.objective(ctx,kind,x,y,size,{time:g.time,...opts});else h.prop?.(ctx,{target:'bell',dummy:'gear',foe:'mask',ball:'orb',bank:'lantern',bomb:'lantern',checkpoint:'flag',boss:'crown'}[kind],x,y-size*.45,size,opts.rotation||0);};
  if(g.id==='bell-breakers')for(const t of o.targets)if(t.respawn<=0){object('target',t.x,t.y+27,t.gold?63:51,{gold:t.gold,hp:t.hp,rotation:Math.sin(g.time*2+t.phase)*.12});if(t.gold)fx(ctx,h,'magic',t.x,t.y,40,g.time,{alpha:.4});}
  if(g.id==='relic-launch')for(const d of o.dummies){const p=g.players.find(p=>p.id===d.owner),x=clamp(d.x,80,880);object('dummy',x,d.y+39,82,{rotation:d.launched?g.time*5:Math.sin(g.time*3)*.03,color:p.color});label(ctx,d.launched?Math.round(d.distance)+'m':Math.round(d.damage)+'%',x,Math.max(85,d.y-58),16);}
  if(g.id==='hollow-horde')for(const f of o.foes){ctx.save();ctx.globalAlpha=f.spawn>0?.5:1;object('foe',f.x,f.y,68,{facing:f.facing,hurt:f.stun>0,attack:f.warning>0,rotation:f.stun>0?f.vx/1800:0});ctx.restore();if(f.warning>0){fx(ctx,h,'magic',f.x,f.y-80,38,g.time,{alpha:.8});label(ctx,'!',f.x,f.y-83,22);}}
  if(g.id==='rift-ball'){for(const x of[90,870]){object('bank',x,430,112,{facing:x<480?1:-1});fx(ctx,h,'magic',x,385,68,g.time,{alpha:.3});}if(o.ball.reset===0)object('ball',o.ball.x,o.ball.y+o.ball.r,55,{rotation:g.time*o.ball.vx/180});}
  if(g.id==='spark-heist'){for(const l of o.loot)h.prop?.(ctx,'spark',l.x,l.y,25,g.time*.8);const b=g.state.platforms[o.bank];object('bank',b.x+b.w/2,b.y,74);fx(ctx,h,'magic',b.x+b.w/2,b.y-50,58,g.time,{alpha:.4});if(o.phase==='altar moving'){const n=g.state.platforms[o.nextBank];fx(ctx,h,'magic',n.x+n.w/2,n.y-20,74,g.time,{alpha:.6});label(ctx,'NEXT',n.x+n.w/2,n.y-68,11);}}
  if(g.id==='fuse-festival'){const b=o.bomb;if(b.reset===0){object('bomb',b.x,b.y+23,51,{rotation:Math.sin(g.time*(b.fuse<2?22:5))*.15,urgent:b.fuse<2});fx(ctx,h,'magic',b.x,b.y-22,24,g.time,{alpha:.8});label(ctx,b.fuse.toFixed(1),b.x,b.y-43,16);}if(o.explosion.life>0)for(let n=0;n<8;n++)fx(ctx,h,'hit',o.explosion.x+Math.cos(n*Math.PI/4)*70,o.explosion.y+Math.sin(n*Math.PI/4)*70,90,g.time+n*.1,{alpha:o.explosion.life*1.8});}
  if(g.id==='tower-relay')for(const p of g.players){const b=g.state.platforms[o.order[p.objective.checkpoint]],x=b.x+b.w/2+(p.slot-(g.players.length-1)/2)*25;object('checkpoint',x,b.y,47,{color:p.color});label(ctx,String(p.slot+1),x,b.y-53,12,p.color);}
  if(g.id==='bellows-boxing'){if(o.sparring){const f=o.sparring;object('foe',f.x,f.y+36,91,{attack:f.warning>0,hurt:f.popped>0});label(ctx,Math.round(f.pressure)+'/75',f.x,f.y-75,12);if(f.warning>0)label(ctx,'!',f.x,f.y-98,20);if(f.popped>0)h.prop?.(ctx,'gear',f.x,f.y-110,35,g.time*8);}const slab=g.state.platforms[0];for(const x of[slab.x+15,slab.x+slab.w-15]){object('foe',x,430,88);if(o.phase==='corner bell warning')fx(ctx,h,'magic',x,390,82,g.time,{alpha:.6});}for(const p of g.players){if(p.objective.punchWindup>0){fx(ctx,h,'magic',p.x+p.facing*38,p.y-42,56,g.time,{alpha:.8});}if(p.objective.popped>0){h.prop?.(ctx,'gear',p.x,p.y-110-(.8-p.objective.popped)*45,32,g.time*8);fx(ctx,h,'hit',p.x,p.y-85,96,g.time,{alpha:p.objective.popped});}}}
  if(g.id==='colossus-wake'){const b=o.boss;object('boss',480,384,240,{open:b.open,phase:o.phase,rotation:Math.sin(g.time*.7)*.018});if(b.open){object('target',b.x,b.y+26,62,{gold:true});fx(ctx,h,'magic',b.x,b.y,82,g.time,{alpha:.65});}else{const slab=g.state.platforms[b.attackPlatform];for(let n=0;n<4;n++)fx(ctx,h,o.blast>0?'hit':'magic',slab.x+slab.w*(n+.5)/4,slab.y-14,o.blast>0?100:48,g.time+n*.13,{alpha:o.blast>0?.9:.35+Math.sin(g.time*9)*.15});}}
}
