import {drawGameHUD,gameFont} from './game-hud.js';
import {configureBotDifficulty,botControl,botTarget} from './bot-difficulty.js';
import { OBJECTIVE_GAMES,objectiveLayout,initObjective,objectivePlatformMotion,objectivePvp,objectiveTarget,objectivePlayerHit,objectiveRingout,stepObjective,objectiveBanner,objectivePlayerLabel,drawObjective } from './brawl-objectives.js';
/** Original paper platform fighters. All simulation state survives a JSON snapshot. */
export const BRAWL_GAMES = [
  ['rift-rumble','RIFT RUMBLE','PLATFORM BRAWL','Two lives in a fractured moon arena. Rising damage launches you farther. Ride the drifting ledge and brace for announced rift gusts.','↑ double jump · Space slash / air spin · ↑+Space uppercut · air ↓+Space dive · ↓ guard; tap to parry',40,'orb'],
  ['crown-clash','CROWN CLASH','CROWN CAPTURE','Ride the rising balconies and steal the crown. Clean hits knock it loose; the final 12 seconds award DOUBLE crown points.','↑ double jump · Space strike · ↑+Space uppercut · air ↓+Space dive · ↓ guard / timed parry · hold the crown',45,'lantern'],
  ['meteor-melee','METEOR MELEE','SURVIVAL BRAWL','Dodge warned meteor storms and knock rivals into the void. Impact embers heal 14 damage and score 5 points; a perfect guard can reflect a meteor.','↑ double jump · Space strike · ↑+Space uppercut · air ↓+Space dive · ↓ guard / timed parry · gather fallen embers',42,'spark'],
  ['spire-kings','SPIRE KINGS','KING OF THE SPIRE','Control the glowing balcony alone. Its seal moves every 10 seconds with advance warning. Win space with uppercuts, aerial spins, and dives.','↑ double jump · Space strike · ↑+Space uppercut · air ↓+Space dive · ↓ guard / timed parry · follow the seal',45,'flag'],
].map(([id,name,tag,description,instructions,duration,icon])=>({id,name,tag,description,instructions:instructions+' · X special',duration,icon})).concat(OBJECTIVE_GAMES);

const COLORS=['#edd299','#9ad4cf','#c4afe8','#efaf95'];
const INK='#10131b',PAPER='#f4ecd8',GOLD='#edc87c',TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const input=(v={})=>({left:!!v?.left,right:!!v?.right,up:!!v?.up,down:!!(v?.down||v?.dn),action:!!v?.action,special:!!v?.special});
const active=p=>!p.eliminated&&p.respawn<=0;
const MOVES={slash:{duration:.2,cooldown:.48,damage:12},uppercut:{duration:.28,cooldown:.72,damage:16},spin:{duration:.25,cooldown:.58,damage:10},dive:{duration:.3,cooldown:.72,damage:17}};
export const SPECIALS=[
  {id:'courier-cut',name:'DASH CUT',windup:.18,active:.28,recovery:.28,cooldown:5,damage:19},
  {id:'wing-gust',name:'WING GUST',windup:.3,active:.35,recovery:.32,cooldown:5.8,damage:15},
  {id:'magnet-burst',name:'MAGNET',windup:.55,active:.22,recovery:.42,cooldown:6.5,damage:24},
  {id:'lantern-bolt',name:'LANTERN',windup:.28,active:.78,recovery:.25,cooldown:5.5,damage:17},
  {id:'ground-slam',name:'STONE SLAM',windup:.38,active:.35,recovery:.55,cooldown:6.4,damage:27},
  {id:'thorn-grasp',name:'THORN GRASP',windup:.34,active:.32,recovery:.4,cooldown:6,damage:14},
  {id:'ink-blink',name:'INK BLINK',windup:.22,active:.15,recovery:.4,cooldown:6.5,damage:20},
  {id:'frost-fan',name:'FROST FAN',windup:.32,active:.4,recovery:.32,cooldown:6.3,damage:11},
];
const hasSwing=p=>p.attack>.04||p.specialAnimation==='active';
const isAttacking=p=>p.stun<=0&&hasSwing(p);
const attackPower=p=>p.specialAnimation==='active'?SPECIALS[p.character].damage:MOVES[p.move].damage;
function attackHits(p,q){
  const front=(q.x-p.x)*p.facing,dx=Math.abs(q.x-p.x),dy=q.y-(p.y-36);
  if(p.specialAnimation==='active'){
    if(p.specialKind==='lantern-bolt')return Math.abs(q.x-p.specialX)<39&&Math.abs(q.y-p.specialY)<47;
    if(p.specialKind==='ink-blink')return q.x>=Math.min(p.specialOriginX,p.x)-32&&q.x<=Math.max(p.specialOriginX,p.x)+32&&Math.abs(dy)<70;
    if(p.specialKind==='wing-gust')return dx<115&&dy>-155&&dy<60;
    if(p.specialKind==='magnet-burst')return dx<135&&Math.abs(dy)<115;
    if(p.specialKind==='ground-slam')return dx<145&&dy>-55&&dy<70&&p.ground>=0;
    if(p.specialKind==='thorn-grasp')return front>=-10&&front<255&&Math.abs(dy)<55;
    if(p.specialKind==='frost-fan')return front>=-15&&front<230&&Math.abs(dy)<45+front*.3;
    return front>=-30&&front<95&&Math.abs(dy)<70;
  }
  return p.move==='uppercut'?dx<62&&dy>-120&&dy<32:p.move==='dive'?dx<49&&dy>-18&&dy<106:p.move==='spin'?dx<79&&Math.abs(dy)<74:front>=-14&&front<=99&&Math.abs(dy)<63;
}
function updateSpecial(g,p,i,dt){
  const def=SPECIALS[p.character];
  if(p.specialAnimation==='windup'&&p.stun>.12){p.specialAnimation='recovery';p.specialTime=def.recovery;p.specialProgress=0;notify(p,'SPECIAL INTERRUPTED');}
  if(!p.specialAnimation&&i.special&&p.specialCooldown<=0&&p.stun<=0&&!i.down){p.specialAnimation='windup';p.specialTime=def.windup;p.specialCooldown=def.cooldown;p.specialCharge=0;p.specialOriginX=p.x;p.specialX=p.x;p.specialY=p.y-42;p.specialHitIds=[];p.hitIds=[];p.attack=0;if(p.objective)p.objective.punchWindup=0;p.specialUses++;notify(p,def.name);}
  if(!p.specialAnimation)return;
  p.specialTime=Math.max(0,p.specialTime-dt);const duration=def[p.specialAnimation];p.specialProgress=1-p.specialTime/duration;
  if(p.specialAnimation==='windup'&&p.specialKind==='magnet-burst')for(const q of g.players)if(q.id!==p.id&&active(q)&&q.invuln<=0&&Math.abs(q.x-p.x)<260&&Math.abs(q.y-p.y)<150)q.vx+=(p.x-q.x)*dt*4*(q.shielding?.15:1);
  if(p.specialTime===0){
    if(p.specialAnimation==='windup'){p.specialAnimation='active';p.specialTime=def.active;p.specialProgress=0;if(p.specialKind==='ink-blink'){p.x=clamp(p.x+p.facing*155,110,850);p.invuln=Math.max(p.invuln,.13);}burst(g,p.x,p.y-35,p.color,10);}
    else if(p.specialAnimation==='active'){p.specialAnimation='recovery';p.specialTime=def.recovery;p.specialProgress=0;}
    else{p.specialAnimation='';p.specialProgress=0;}
  }
  if(p.specialAnimation==='active'&&p.specialKind==='lantern-bolt')p.specialX+=p.facing*650*dt;
}
const objectiveApi={random,burst,notify,strike,land,hits:attackHits,power:attackPower,attacking:isAttacking};
function random(g){let x=g.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;g.rng=x>>>0;return g.rng/4294967296;}
function platforms(id){
  const layouts={
    'rift-rumble':[[190,430,580],[165,320,200],[595,320,200],[390,216,180]],
    'crown-clash':[[175,430,610],[180,320,200],[580,320,200],[390,210,180]],
    'meteor-melee':[[150,430,660],[140,320,200],[620,320,200],[385,220,190]],
    'spire-kings':[[150,430,660],[210,322,180],[570,322,180],[385,215,190]],
  };
  return (objectiveLayout(id)||layouts[id]).map(([x,y,w],id)=>({id,x,y,w,h:18,dx:0,dy:0}));
}
export function createBrawl(id,players,seed=1,options){
  const def=BRAWL_GAMES.find(d=>d.id===id);
  if(!def)throw new Error(`Unknown brawler: ${id}`);
  if(!Array.isArray(players)||players.length<1||players.length>4)throw new Error('Brawlers require 1–4 players');
  const g={id,time:0,duration:def.duration,done:false,rng:(seed>>>0)||1,players:[],state:{platforms:platforms(id),effects:[],paperFlights:[],meteors:[],embers:[],nextMeteor:1.6,crown:{holder:null,x:480,y:180,vy:0,lock:0},crownBonus:false,controller:null,contested:false,controlPlatform:3,nextControlPlatform:1,arenaPhase:'calm',arenaWarning:0,wind:0,storm:false,hitstop:0,shake:0,attacks:0,ringouts:0,parries:0}};
  // Copy an explicit public actor schema. Never spread board players: their hands are private.
  g.players=players.map((p,slot)=>({id:String(p.id),name:String(p.name||`Traveler ${slot+1}`).slice(0,18),character:clamp(Number.isInteger(p.character)?p.character:slot,0,7),bot:!!p.bot,slot,color:COLORS[slot],x:players.length===1?480:260+slot*440/(players.length-1),y:430,vx:0,vy:0,facing:slot%2?-1:1,ground:0,jumps:0,damage:0,damageDealt:0,stocks:id==='rift-rumble'?2:3,eliminated:false,respawn:0,invuln:0,stun:0,shield:100,shielding:false,shieldLock:0,parryWindow:0,parryCooldown:0,parries:0,attack:0,specialCooldown:0,specialCharge:1,specialAnimation:'',specialTime:0,specialProgress:0,specialKind:SPECIALS[clamp(Number.isInteger(p.character)?p.character:slot,0,7)].id,specialHitIds:[],specialX:0,specialY:0,specialOriginX:0,specialUses:0,slow:0,move:'slash',moveUses:{slash:0,uppercut:0,spin:0,dive:0},cooldown:0,hitIds:[],prev:input(),score:0,kos:0,deaths:0,held:0,embers:0,botClock:slot*.137,lastHit:null,lastHitAt:-10,launchAt:-10,launchVx:0,launchVy:0,landAt:-10,landStrength:0,flash:0,message:'',trail:[]}));
  initObjective(g);
  return configureBotDifficulty(g,options,seed);
}
function notify(p,message){p.message=message;p.flash=.8;}
function burst(g,x,y,color=GOLD,count=9){
  for(let j=0;j<count;j++){const angle=j/count*TAU,force=65+random(g)*130;g.state.effects.push({x,y,vx:Math.cos(angle)*force,vy:Math.sin(angle)*force,life:.46,max:.46,color,size:3.5+random(g)*5,type:j%3===0?'hit':'dust'});}
  if(g.state.effects.length>100)g.state.effects.splice(0,g.state.effects.length-100);
}
function launchBurst(g,p,count=12){
 const angle=Math.atan2(p.vy,p.vx),force=Math.min(560,Math.hypot(p.vx,p.vy));
 for(let n=0;n<count;n++){const direction=angle+(random(g)-.5)*1.25,speed=95+force*.35+random(g)*100;g.state.effects.push({x:p.x,y:p.y-42,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,life:.5,max:.5,color:p.color,size:5+random(g)*6,type:n%2?'dust':'hit'});}
 if(g.state.effects.length>100)g.state.effects.splice(0,g.state.effects.length-100);
}
function dropCrown(g,p){
  const c=g.state.crown;if(c.holder!==p.id)return;
  c.holder=null;c.x=p.x;c.y=p.y-74;c.vy=-170;c.lock=.4;notify(p,'CROWN LOST');
}
function respawn(g,p){
  p.x=340+p.slot*90;p.y=126;p.vx=0;p.vy=0;p.damage=0;p.stun=0;p.jumps=0;p.ground=-1;p.invuln=1.8;p.attack=0;p.cooldown=.3;p.shielding=false;p.shield=100;p.parryWindow=0;p.parryCooldown=.3;p.lastHit=null;p.lastHitAt=-10;p.launchAt=-10;p.landAt=-10;p.trail=[];p.specialAnimation='';p.specialTime=0;p.specialProgress=0;p.slow=0;notify(p,'BACK IN THE FOLD');
}
function ringout(g,p){
  objectiveRingout(g,p,objectiveApi);dropCrown(g,p);g.state.ringouts++;p.deaths++;p.stocks=Math.max(0,p.stocks-1);p.shielding=false;p.attack=0;p.specialAnimation='';p.specialTime=0;
  const flights=g.state.paperFlights||(g.state.paperFlights=[]);
  flights.push({id:'paper-flight-'+g.state.ringouts,playerId:p.id,character:p.character,name:p.name,color:p.color,slot:p.slot,x:clamp(p.x,65,895),y:clamp(p.y,140,430),dx:Math.sign(p.vx)||(p.x<480?-1:1),dy:Math.sign(p.vy)||-1,toward:(p.slot+p.deaths)%2===0,at:g.time,duration:.82});if(flights.length>8)flights.shift();
  const killer=g.players.find(q=>q.id===p.lastHit&&q.id!==p.id&&g.time-p.lastHitAt<6);
  if(killer){killer.kos++;killer.score+=g.id==='meteor-melee'?25:12;notify(killer,'RING OUT!');}
  p.score=Math.max(0,p.score-(g.id==='meteor-melee'?8:3));
  burst(g,clamp(p.x,35,925),clamp(p.y,85,460),p.color,16);
  p.x=clamp(p.x,0,960);p.y=470;p.vx=0;p.vy=0;p.trail=[];
  if(g.id==='rift-rumble'&&p.stocks===0){p.eliminated=true;p.respawn=0;notify(p,'OUT OF PAPER');}
  else p.respawn=.9;
}
function botInput(g,p,dt){
  const i=input();p.botClock+=dt;
  const rivals=g.players.filter(q=>q.id!==p.id&&active(q)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  const rival=rivals[0],c=g.state.crown;
  let target=rival?{x:rival.x,y:rival.y}:{x:480,y:215};
  if(g.id==='crown-clash'){
    if(c.holder===p.id)target={x:Math.sin(g.time*.9+p.slot)*205+480,y:215};
    else if(c.holder){const holder=g.players.find(q=>q.id===c.holder);if(holder)target={x:holder.x,y:holder.y};}
    else target={x:c.x,y:c.y+28};
  }
  if(g.id==='spire-kings'){const b=g.state.platforms[g.state.arenaWarning>0&&g.state.arenaWarning<.8?g.state.nextControlPlatform:g.state.controlPlatform];target={x:b.x+b.w/2,y:b.y};}
  if(g.id==='meteor-melee'&&p.damage>35){const ember=g.state.embers.filter(e=>e.life>1).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];if(ember)target={x:ember.x,y:ember.y+12};}
  const goal=objectiveTarget(g,p);if(goal)target=goal;
  // Choose a reachable intermediate balcony instead of jumping under a high target.
  if(target.y<p.y-125&&p.ground>=0){
    const reachable=g.state.platforms.filter(b=>b.y<p.y-35&&b.y>=p.y-125).sort((a,b)=>Math.abs(a.x+a.w/2-p.x)-Math.abs(b.x+b.w/2-p.x));
    if(reachable[0])target={x:reachable[0].x+reachable[0].w/2,y:reachable[0].y};
  }
  target=botTarget(g,p,target);i.left=p.x>target.x+18;i.right=p.x<target.x-18;
  const inJumpWindow=p.botClock% .7<.09;
  i.up=inJumpWindow&&((target.y<p.y-38&&Math.abs(p.x-target.x)<150)||(p.ground<0&&p.vy>35&&(p.x<205||p.x>755))||(rival&&Math.abs(rival.x-p.x)<125&&p.botClock%1.4<.09));
  if(p.ground<0&&p.y>385){i.left=p.x>560;i.right=p.x<400;i.up=p.jumps<2&&!p.prev.up;}
  const danger=g.state.meteors.find(m=>Math.abs(m.x-p.x)<58&&(m.warning>0||m.y<p.y));
  if(danger){i.left=p.x>480?danger.x>=p.x:danger.x>p.x;i.right=!i.left;if(p.x<205){i.left=false;i.right=true;}if(p.x>755){i.left=true;i.right=false;}}
  i.action=!!rival&&Math.abs(rival.x-p.x)<115&&Math.abs(rival.y-p.y)<87;
  i.down=!!rival&&rival.attack>.04&&Math.abs(rival.x-p.x)<105&&p.shield>22&&Math.floor(p.botClock*3+p.slot)%3===0;
  if(i.down)i.action=false;
  else if(rival&&p.cooldown<=0&&Math.abs(rival.x-p.x)<58){
    if(rival.y<p.y-35){i.up=true;i.action=true;}
    else if(p.ground<0&&rival.y>p.y+35&&rival.y<p.y+110&&p.y<365){i.down=true;i.up=false;i.action=true;}
  }
  if(g.state.wind!==0&&p.ground>=0&&(p.x<245||p.x>715)){i.left=p.x>480;i.right=p.x<480;if(Math.abs(p.x-480)>275){i.down=true;i.action=false;}}
  if(goal){
    if(goal.face&&Math.abs(p.x-goal.x)<28&&!i.left&&!i.right)p.facing=goal.face;
    const near=Math.abs(p.x-goal.x)<110&&Math.abs(p.y-goal.y)<105;
    if(goal.attack&&near)i.action=true;
    if(goal.danger&&p.shield>20){i.down=true;i.action=false;}
    if(g.id==='relic-launch')i.up=false;
    if(g.id==='colossus-wake'&&goal.danger)i.up=!p.prev.up;
    i.special=((!!goal.attack&&near)||(rival&&Math.abs(rival.x-p.x)<135&&Math.abs(rival.y-p.y)<85&&Math.floor(p.botClock*2+p.slot)%3===0))&&p.specialCooldown<=0&&p.stun<=0;
  }else i.special=!!rival&&Math.abs(rival.x-p.x)<200&&Math.abs(rival.y-p.y)<100&&p.specialCooldown<=0&&Math.floor(p.botClock*2+p.slot)%3===0;
  return input(i);
}
function updateArena(g,dt){
  const s=g.state,t=g.time;s.arenaPhase='calm';s.arenaWarning=0;s.wind=0;s.storm=false;
  for(const b of s.platforms){const x=b.x,y=b.y;
    if(g.id==='rift-rumble'&&b.id===3)b.x=390+Math.sin(t*.7)*46;
    if(g.id==='crown-clash'&&(b.id===1||b.id===2))b.y=320+Math.sin(t*.65+(b.id===1?0:Math.PI))*24;
    objectivePlatformMotion(g,b);b.dx=b.x-x;b.dy=b.y-y;
  }
  // Carry riders with their platform before integrating motion and one-way landings.
  for(const p of g.players)if(active(p)&&p.ground>=0){const b=s.platforms[p.ground];p.x+=b.dx;p.y+=b.dy;}
  if(g.id==='rift-rumble'){
    const phase=t%8,dir=Math.floor(t/8)%2?-1:1;
    if(phase>=4.8&&phase<6){s.arenaPhase='rift-warning';s.arenaWarning=6-phase;}
    if(phase>=6&&phase<7.5){s.arenaPhase='rift-gust';s.wind=dir*390;}
  }
  if(g.id==='crown-clash'){
    s.crownBonus=t>=g.duration-12;
    if(s.crownBonus)s.arenaPhase='crown-fever';
    else if(t>=g.duration-14){s.arenaPhase='crown-warning';s.arenaWarning=g.duration-12-t;}
  }
  if(g.id==='meteor-melee'){
    const phase=t%10;if(phase>=6.5&&phase<8){s.arenaPhase='storm-warning';s.arenaWarning=8-phase;}
    if(phase>=8){s.arenaPhase='meteor-storm';s.storm=true;}
  }
  if(g.id==='spire-kings'){
    const cycle=[3,1,3,2],period=Math.floor(t/10);s.controlPlatform=cycle[period%cycle.length];s.nextControlPlatform=cycle[(period+1)%cycle.length];
    if(t%10>=8.5){s.arenaPhase='seal-warning';s.arenaWarning=10-t%10;}
  }
}
function land(p,oldY,board){
  if(p.vy<0)return;
  let landing=null;
  for(const b of board)if(p.x+17>b.x&&p.x-17<b.x+b.w&&oldY<=b.y+.01&&p.y>=b.y&&(!landing||b.y<landing.y))landing=b;
  if(landing){p.y=landing.y;p.vy=0;p.ground=landing.id;p.jumps=0;}
}
function strike(g,attacker,victim,meteor=false){
  if(!active(victim)||victim.invuln>0)return;
  const shielded=victim.shielding&&victim.shield>0;
  if(shielded&&victim.parryWindow>0){
    victim.parryWindow=0;victim.parryCooldown=.72;victim.parries++;g.state.parries++;victim.score+=meteor?6:3;victim.shield=Math.min(100,victim.shield+12);victim.invuln=.13;victim.cooldown=0;
    if(attacker){attacker.attack=0;if(attacker.specialAnimation){attacker.specialAnimation='recovery';attacker.specialTime=SPECIALS[attacker.character].recovery;attacker.specialProgress=0;}attacker.stun=.32;attacker.cooldown=Math.max(attacker.cooldown,.4);attacker.vx=-attacker.facing*210;notify(attacker,'PARRIED');}
    notify(victim,meteor?'METEOR REFLECTED +6':'PERFECT PARRY');g.state.hitstop=.11;g.state.shake=4;burst(g,victim.x,victim.y-36,'#edfff4',18);return 'parried';
  }
  const move=meteor?'meteor':attacker.move;
  const damage=(meteor?19:attackPower(attacker))*(shielded?.18:1);
  victim.damage=clamp(victim.damage+damage,0,999);
  const direction=attacker?(move==='spin'?Math.sign(victim.x-attacker.x)||attacker.facing:attacker.facing):(victim.x<480?-1:1);
  const strength=(meteor?340:260)+victim.damage*(meteor?3.4:4.25);
  victim.vx=direction*strength*(shielded?.18:1);
  victim.vy=-(155+victim.damage*1.65)*(shielded?.2:1);
  if(move==='uppercut'){victim.vx*=.46;victim.vy=-(330+victim.damage*2.8)*(shielded?.2:1);}
  if(move==='dive'){victim.vx*=.5;victim.vy=(360+victim.damage*2.2)*(shielded?.2:1);}
  if(attacker?.specialAnimation==='active'&&!shielded){const kind=attacker.specialKind;if(kind==='wing-gust')victim.vy=-580;if(kind==='magnet-burst'){victim.vx=Math.sign(victim.x-attacker.x)*560;victim.vy=-380;}if(kind==='ground-slam'){victim.vy=-570;victim.vx*=.7;}if(kind==='thorn-grasp'){victim.slow=1.6;victim.vx=-Math.sign(victim.x-attacker.x)*150;}if(kind==='frost-fan'){victim.slow=2.4;victim.vx*=.8;}}
  victim.stun=shielded?.065:Math.min(.52,.15+victim.damage*.0018);
  if(!shielded){victim.launchAt=g.time;victim.launchVx=victim.vx;victim.launchVy=victim.vy;launchBurst(g,victim,meteor?15:12);}
  victim.ground=-1;
  if(shielded){victim.shield=Math.max(0,victim.shield-23);notify(victim,'PAPER GUARD');if(victim.shield===0){victim.shieldLock=1.4;victim.stun=.8;notify(victim,'GUARD BROKEN');}}
  else{dropCrown(g,victim);notify(victim,move==='uppercut'?'UPPERCUT!':move==='dive'?'PAPER SPIKE!':`${Math.round(victim.damage)}%`);}
  if(attacker){objectivePlayerHit(g,attacker,victim,shielded,objectiveApi);victim.lastHit=attacker.id;victim.lastHitAt=g.time;attacker.damageDealt+=damage;attacker.score+=shielded?.2:1;}
  g.state.hitstop=.07;g.state.shake=shielded?2:6;burst(g,victim.x,victim.y-40,shielded?'#a9eee9':GOLD,shielded?5:9);
  return 'hit';
}
function updateCrown(g,dt){
  const c=g.state.crown;c.lock=Math.max(0,c.lock-dt);
  if(c.holder){const p=g.players.find(q=>q.id===c.holder);if(p&&active(p)){c.x=p.x;c.y=p.y-88;p.score+=dt*(g.state.crownBonus?20:10);p.held+=dt;return;}c.holder=null;}
  const oldY=c.y;c.vy+=780*dt;c.y+=c.vy*dt;
  for(const b of g.state.platforms)if(c.vy>=0&&c.x>b.x-8&&c.x<b.x+b.w+8&&oldY<=b.y-19&&c.y>=b.y-19){c.y=b.y-19;c.vy=0;break;}
  if(c.y>500||c.x<0||c.x>960){c.x=480;c.y=165;c.vy=0;c.lock=.35;}
  if(c.lock===0){const p=g.players.find(p=>active(p)&&Math.abs(p.x-c.x)<35&&Math.abs(p.y-40-c.y)<52);if(p){c.holder=p.id;notify(p,'THE CROWN IS YOURS');burst(g,p.x,p.y-72,GOLD,12);}}
}
function updateMeteors(g,dt){
  const s=g.state;s.nextMeteor-=dt;
  if(s.nextMeteor<=0){s.nextMeteor=s.storm?.32:Math.max(.55,1.4-g.time*.016);const target=g.players.filter(active);const p=target[Math.floor(random(g)*target.length)];s.meteors.push({x:clamp(p?p.x+(random(g)-.5)*110:170+random(g)*620,135,825),y:-70,warning:.85,vy:360+random(g)*90+(s.storm?65:0),spin:random(g)*TAU,hitIds:[],spent:false});}
  for(const m of s.meteors){if(m.warning>0){m.warning=Math.max(0,m.warning-dt);continue;}m.y+=m.vy*dt;m.vy+=340*dt;m.spin+=dt*2.1;for(const p of g.players)if(!m.spent&&active(p)&&!m.hitIds.includes(p.id)&&Math.abs(m.x-p.x)<42&&m.y>p.y-86&&m.y<p.y+15){m.hitIds.push(p.id);if(strike(g,null,p,true)==='parried')m.spent=true;}
    if(m.y>=430&&!m.spent){m.spent=true;s.embers.push({x:clamp(m.x,172,788),y:416,life:4});burst(g,m.x,430,'#ffb77e',7);}
  }
  s.meteors=s.meteors.filter(m=>!m.spent&&m.y<565);
  for(const e of s.embers){e.life-=dt;const p=g.players.find(p=>active(p)&&Math.abs(p.x-e.x)<29&&Math.abs(p.y-e.y)<39);if(p&&e.life>0){p.damage=Math.max(0,p.damage-14);p.score+=5;p.embers++;e.life=0;notify(p,'EMBER +5 · HEAL 14');burst(g,p.x,p.y-25,'#9aedcc',7);}}
  s.embers=s.embers.filter(e=>e.life>0);
}
export function stepBrawl(g,inputs={},dt=1/60){
  if(g.done||!Number.isFinite(dt)||dt<=0)return g;
  dt=Math.min(dt,.05);g.time=Math.min(g.duration,g.time+dt);
  const s=g.state;s.hitstop=Math.max(0,s.hitstop-dt);s.shake=Math.max(0,s.shake-dt*40);
  for(const f of s.effects){f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=250*dt;}s.effects=s.effects.filter(f=>f.life>0);
  if(s.paperFlights)s.paperFlights=s.paperFlights.filter(f=>g.time-f.at<f.duration);
  updateArena(g,dt);
  for(const p of g.players){
    p.flash=Math.max(0,p.flash-dt);p.invuln=Math.max(0,p.invuln-dt);p.cooldown=Math.max(0,p.cooldown-dt);p.attack=Math.max(0,p.attack-dt);p.stun=Math.max(0,p.stun-dt);p.shieldLock=Math.max(0,p.shieldLock-dt);p.parryWindow=Math.max(0,p.parryWindow-dt);p.parryCooldown=Math.max(0,p.parryCooldown-dt);p.slow=Math.max(0,p.slow-dt);p.specialCooldown=Math.max(0,p.specialCooldown-dt);p.specialCharge=1-p.specialCooldown/SPECIALS[p.character].cooldown;
    if(p.eliminated)continue;
    if(p.respawn>0){p.respawn=Math.max(0,p.respawn-dt);if(p.respawn===0)respawn(g,p);continue;}
    const i=p.bot?botControl(g,p,botInput(g,p,dt),dt):input(inputs[p.id]);
    updateSpecial(g,p,i,dt);
    const diving=i.down&&i.action&&p.ground<0;
    p.shielding=i.down&&!diving&&!p.specialAnimation&&p.shield>2&&p.shieldLock<=0&&p.attack<=0&&p.stun<=.07;
    if(p.shielding&&!p.prev.down&&p.parryCooldown<=0){p.parryWindow=.13;p.parryCooldown=.72;}
    if(!p.shielding)p.parryWindow=0;
    p.shield=clamp(p.shield+(p.shielding?-26:19)*dt,0,100);
    if(p.shielding&&p.shield<=2){p.shielding=false;p.shieldLock=1;}
    const horizontal=Number(i.right)-Number(i.left),control=p.stun>0?.1:1;
    if(horizontal&&p.stun<=0)p.facing=horizontal;
    const speed=(p.shielding?58:250)*(p.slow>0?.57:1),desired=horizontal*speed;
    p.vx+=(desired-p.vx)*Math.min(1,dt*(p.ground>=0?12:4.2)*control);
    if(i.up&&!p.prev.up&&p.jumps<2&&p.stun<=0&&!p.shielding){p.vy=p.jumps===0?-510:-465;p.jumps++;p.ground=-1;burst(g,p.x,p.y,p.color,4);}
    if(i.action&&p.cooldown<=0&&p.stun<=0&&!p.shielding&&!p.specialAnimation){
      p.move=i.up?'uppercut':diving?'dive':p.ground<0?'spin':'slash';const move=MOVES[p.move];p.attack=move.duration;p.cooldown=move.cooldown;p.hitIds=[];s.attacks++;p.moveUses[p.move]++;
      if(g.id==='bellows-boxing'){p.attack=0;p.objective.punchWindup=p.move==='uppercut'?.4:.28;p.cooldown+=p.objective.punchWindup;}
      if(p.move==='dive')p.vy=Math.max(p.vy,430);
    }
    if(p.specialAnimation==='active'&&p.specialKind==='courier-cut')p.vx=p.facing*610;
    if(p.specialAnimation==='active'&&p.specialKind==='ground-slam'&&p.ground<0)p.vy=Math.max(p.vy,700);
    if(s.wind&&p.invuln<=0)p.vx+=s.wind*dt*(p.shielding?.15:1);
    const oldY=p.y,oldGround=p.ground;p.vy=Math.min(880,p.vy+1080*dt);const landingSpeed=p.vy;p.x+=p.vx*dt;p.y+=p.vy*dt;p.ground=-1;land(p,oldY,s.platforms);
    if(p.ground>=0&&oldGround<0&&landingSpeed>65){p.landAt=g.time;p.landStrength=clamp(landingSpeed/660,.18,1);burst(g,p.x,p.y,p.color,5);}
    if(p.ground>=0&&p.attack>0&&p.move==='dive'){p.attack=0;burst(g,p.x,p.y,p.color,12);s.shake=Math.max(s.shake,3);}
    for(const f of p.trail)f.life-=dt;p.trail=p.trail.filter(f=>f.life>0);
    if(Math.abs(p.vx)>340)p.trail.push({x:p.x,y:p.y,life:.15});if(p.trail.length>8)p.trail.shift();
    p.prev=i;
    if(p.x<-60||p.x>1020||p.y>560||p.y<-100){ringout(g,p);continue;}
    if(g.id==='meteor-melee')p.score+=dt*1.5;
  }
  // Resolve directional hits once per regular swing or special activation.
  const contactAttackers=objectivePvp(g)?g.players.filter(p=>active(p)&&isAttacking(p)):[];
  for(const p of contactAttackers){if(!active(p))continue;for(const q of g.players){
    // Capture eligibility before any contacts, so simultaneous fresh swings
    // may trade without seat-order advantage. A parry still cancels the swing.
    if(!hasSwing(p))break;
    const ids=p.specialAnimation==='active'?p.specialHitIds:p.hitIds;
    if(p.id===q.id||!active(q)||q.invuln>0||ids.includes(q.id))continue;
    if(attackHits(p,{x:q.x,y:q.y-36})){ids.push(q.id);strike(g,p,q);}
  }}
  stepObjective(g,dt,objectiveApi);
  if(g.id==='crown-clash')updateCrown(g,dt);
  if(g.id==='meteor-melee')updateMeteors(g,dt);
  if(g.id==='spire-kings'){
    const b=s.platforms[s.controlPlatform];const owners=g.players.filter(p=>active(p)&&p.ground===b.id&&Math.abs(p.x-(b.x+b.w/2))<b.w*.43);s.contested=owners.length>1;s.controller=owners.length===1?owners[0].id:null;
    if(owners.length===1){owners[0].score+=dt*12;owners[0].held+=dt;}
  }
  if(g.id==='rift-rumble'&&g.players.filter(p=>!p.eliminated).length<=(g.players.length>1?1:0))g.done=true;
  if(g.time>=g.duration)g.done=true;
  return g;
}
export function getBrawlResults(g){
  // A life always outranks every possible KO total in a four-player/two-stock round.
  // Subscores cannot let an eliminated damage farmer beat the last survivor.
  return g.players.map(p=>({id:p.id,score:Math.max(0,Math.round(g.id==='rift-rumble'?p.stocks*10000+p.kos*1000+Math.min(999,p.damageDealt*.1+p.score):p.score))})).sort((a,b)=>b.score-a.score);
}

/** Cosmetic launch depth changes size around the exact gameplay foot anchor. */
export function brawlPaperBodyReaction(g,p){
 const age=g.time-(p.launchAt??-10),launch=age>=0&&age<.38?Math.sin(age/.38*Math.PI):0,speed=Math.hypot(p.launchVx||0,p.launchVy||0),power=clamp(speed/850,0,1),vertical=Math.abs(p.launchVy||0)>Math.abs(p.launchVx||0);
 const landingAge=g.time-(p.landAt??-10),landing=landingAge>=0&&landingAge<.3?(1-landingAge/.3)**2*(p.landStrength||0):0;
 return {size:84*(1+launch*power*.36),scaleX:1+launch*power*(vertical?-.15:.2)+landing*.18,scaleY:1+launch*power*(vertical?.22:-.12)-landing*.12,land:landing};
}
/** Serialized KO paper puppet, independent of score/stock/physics state. */
export function sampleBrawlPaperFlight(flight,time){
 const progress=clamp((time-flight.at)/flight.duration,0,1),toward=flight.toward;
 return {progress,x:flight.x+(toward?(480-flight.x)*progress*.5:flight.dx*170*progress),y:flight.y-160*progress+Math.sin(progress*Math.PI)*-45,scale:toward?.9+2.6*(1-(1-progress)**2):1.12*(1-progress)**1.45+.1,alpha:(1-progress)**1.1,rotation:flight.dx*progress*1.45,scaleX:Math.cos(progress*Math.PI*2)*(toward?.18:.12)+.9,scaleY:1+Math.sin(progress*Math.PI)*.28};
}

function label(ctx,value,x,y,size=14,color=PAPER,align='center',outline='#211d18'){
  ctx.font=gameFont(size);ctx.textAlign=align;ctx.fillStyle=color;ctx.strokeStyle=outline;ctx.lineWidth=3;ctx.strokeText(value,x,y);ctx.fillText(value,x,y);
}
function paperPanel(ctx,x,y,w,h){
  ctx.save();ctx.fillStyle='#211a1644';ctx.fillRect(x+3,y+4,w,h);
  ctx.fillStyle='#e5ddc8';ctx.beginPath();ctx.moveTo(x+3,y+1);
  for(let n=1;n<=12;n++)ctx.lineTo(x+w*n/12,y+(n%3===0?2:0));
  ctx.lineTo(x+w-1,y+h-2);
  for(let n=11;n>=0;n--)ctx.lineTo(x+w*n/12,y+h-(n%3===0?2:0));
  ctx.closePath();ctx.fill();
  // Broken ink stipples suggest a printed border, with paper showing between marks.
  ctx.fillStyle='#80725b77';
  for(let n=0;n<w-12;n+=8){ctx.fillRect(x+6+n,y+5,n%24===0?5:3,1);ctx.fillRect(x+6+n,y+h-6,n%24===0?3:5,1);}
  ctx.fillStyle='#a8967340';ctx.fillRect(x+5,y+8,1,h-16);ctx.fillRect(x+w-6,y+8,1,h-16);ctx.restore();
}
function paperFx(ctx,h,type,x,y,size,time,options={}){
  ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  h.fx?.(ctx,type,x,y,size,time,{...options,alpha:1});
  ctx.restore();
}
function platformArt(ctx,b,time,isActive,h){
  // The atlas supplies the slab, top plane, thickness, ink contours and its shadow.
  // Physics feet stay anchored to the exact top-edge y; no polygon stand-in is drawn.
  h.platform?.(ctx,b.x,b.y,b.w,b.id===0?92:64,time,b.id===0?0:isActive?2:1);
  if(isActive){
    for(let n=0;n<3;n++)paperFx(ctx,h,'magic',b.x+b.w*(.28+n*.22),b.y-7,29,time+n*.14,{alpha:.64});
  }
}
function drawSpecial(ctx,g,p,h){
  if(!p.specialAnimation)return;
  const progress=p.specialProgress,phase=p.specialAnimation;
  if(phase==='windup'){paperFx(ctx,h,'magic',p.x,p.y-42,75+progress*30,g.time,{alpha:.45+progress*.4});return;}
  if(phase!=='active')return;
  const kind=p.specialKind;
  if(kind==='lantern-bolt'){h.prop?.(ctx,'lantern',p.specialX,p.specialY,36,g.time*3);paperFx(ctx,h,'magic',p.specialX,p.specialY,65,g.time,{alpha:.85});}
  else if(kind==='ink-blink'){for(let n=0;n<5;n++)paperFx(ctx,h,'hit',p.specialOriginX+(p.x-p.specialOriginX)*n/4,p.y-40,65,g.time+n*.1,{alpha:.85});}
  else if(kind==='thorn-grasp'||kind==='frost-fan'){for(let n=0;n<4;n++){const x=p.x+p.facing*(35+n*48),y=p.y-42+(kind==='frost-fan'?Math.sin(n*2)*n*16:0);h.prop?.(ctx,kind==='thorn-grasp'?'shard':'spark',x,y,32,g.time+n);paperFx(ctx,h,'hit',x,y,57,g.time+n*.1,{alpha:.7});}}
  else if(kind==='ground-slam'){for(let n=-2;n<=2;n++)paperFx(ctx,h,'hit',p.x+n*48,p.y-8,80,g.time+n*.1,{alpha:.9});}
  else if(kind==='wing-gust'){for(let n=0;n<4;n++)paperFx(ctx,h,'dust',p.x+Math.sin(n*2)*47,p.y-30-n*37,86,g.time+n*.08,{alpha:.85});}
  else if(kind==='magnet-burst'){for(let n=0;n<6;n++)paperFx(ctx,h,'hit',p.x+Math.cos(n*Math.PI/3)*78,p.y-40+Math.sin(n*Math.PI/3)*66,72,g.time+n*.1,{alpha:.9});}
  else paperFx(ctx,h,'hit',p.x+p.facing*47,p.y-42,126,g.time,{alpha:.95,flipX:p.facing<0});
}
export function drawBrawl(ctx,g,h={}){
  const s=g.state;ctx.save();h.background?.(ctx,g.id,g.time);
  ctx.save();if(s.shake>0)ctx.translate(Math.sin(g.time*99)*s.shake*.6,Math.cos(g.time*87)*s.shake*.3);
  for(let n=0;n<9;n++){
    const x=(n*137+g.time*(5+n%3))%1000-20,y=92+(n*89)%340+Math.sin(g.time*.7+n)*10;
    paperFx(ctx,h,'dust',x,y,12+(n%3)*3,g.time+n*.23,{alpha:.22});
  }
  if(s.wind!==0){
    for(let n=0;n<9;n++){
      const x=((g.time*250*s.wind/390+n*149)%1120+1120)%1120-80;
      paperFx(ctx,h,'dust',x,145+n*31,25,g.time+n*.17,{alpha:.46,flipX:s.wind<0});
    }
  }
  for(const b of s.platforms)platformArt(ctx,b,g.time,g.id==='spire-kings'?b.id===s.controlPlatform:g.id==='crown-clash'&&b.id===3,h);
  if(g.id==='spire-kings'){
    const b=s.platforms[s.controlPlatform],x=b.x+b.w/2,owner=g.players.find(p=>p.id===s.controller);
    h.prop?.(ctx,'flag',x,b.y-63,54,Math.sin(g.time*3)*.045);
    label(ctx,s.contested?'CONTESTED':owner?'HELD':'CLAIM',x,b.y-109,13,PAPER);
    if(s.arenaWarning>0){
      const next=s.platforms[s.nextControlPlatform],nx=next.x+next.w/2;
      paperFx(ctx,h,'magic',nx,next.y-8,84,g.time,{alpha:.78});
      label(ctx,'NEXT',nx,next.y-48,13,PAPER);
    }
  }
  for(const m of s.meteors){
    if(m.warning>0){
      paperFx(ctx,h,'magic',m.x,418,56,g.time,{alpha:.6+Math.abs(Math.sin(g.time*8))*.25});
      h.prop?.(ctx,'gear',m.x,86,24,Math.sin(g.time*6)*.08);
      label(ctx,'!',m.x,119,23,'#ead9b6');
      for(let n=0;n<3;n++)paperFx(ctx,h,'dust',m.x,174+n*83,14,g.time+n*.25,{alpha:.30});
    }else{
      for(let n=3;n>=1;n--)paperFx(ctx,h,'dust',m.x,m.y-n*23,36-n*4,g.time-n*.06,{alpha:.65-n*.13});
      paperFx(ctx,h,'magic',m.x,m.y,58,g.time,{alpha:.66});
      h.prop?.(ctx,'gear',m.x,m.y,42,m.spin);
    }
  }
  for(const e of s.embers){
    paperFx(ctx,h,'magic',e.x,e.y,30,g.time,{alpha:Math.min(.6,e.life)});
    ctx.save();ctx.globalAlpha=Math.min(1,e.life);h.prop?.(ctx,'spark',e.x,e.y+Math.sin(g.time*5+e.x)*2,26,g.time*.6);ctx.restore();
  }
  drawObjective(ctx,g,h,{label,fx:paperFx});
  for(const flight of s.paperFlights||[]){
    const pose=sampleBrawlPaperFlight(flight,g.time);if(pose.alpha<=0)continue;
    ctx.save();ctx.globalAlpha*=pose.alpha;
    const puppet={id:flight.id,character:flight.character,name:flight.name,damage:0,score:0,ground:-1,vx:flight.dx*160,vy:-200,facing:flight.dx,prev:{}};
    h.character?.(ctx,puppet,pose.x,pose.y,84*pose.scale,{time:g.time,grounded:false,vy:-200,hurt:true,rotation:pose.rotation,scaleX:pose.scaleX,scaleY:pose.scaleY,specialAnimation:'',specialProgress:0,paperFlight:true});
    for(let n=0;n<3;n++)paperFx(ctx,h,n===0?'hit':'magic',pose.x-flight.dx*n*25,pose.y-45+n*8,(95+n*18)*Math.min(1.7,pose.scale),g.time+n*.07,{alpha:.75,progress:pose.progress,rotation:pose.rotation});
    ctx.restore();
  }
  for(const p of g.players){
    if(p.eliminated)continue;
    if(p.respawn>0){
      paperFx(ctx,h,'magic',340+p.slot*90,151,40,g.time,{alpha:.75});
      label(ctx,'↥',340+p.slot*90,173,18,PAPER);continue;
    }
    for(let n=0;n<p.trail.length;n+=2){
      const trail=p.trail[n];paperFx(ctx,h,'dust',trail.x,trail.y-24,17+trail.life*35,g.time+n*.04,{alpha:trail.life*3.4});
    }
    const grounded=p.ground>=0,attacking=p.attack>0&&p.stun<=0,move=MOVES[p.move],reaction=brawlPaperBodyReaction(g,p);
    const attack=attacking?p.attack/move.duration:0;
    const land=Math.max(reaction.land,grounded&&p.move==='dive'&&p.attack===0?clamp((p.cooldown-(move.cooldown-.18))/.18,0,1):0);
    const squash=p.shielding?.22:land>0?land*.28:attacking?Math.sin(attack*Math.PI)*.24:!grounded?p.vy<0?-.19:-.09:Math.abs(p.vx)>40?Math.sin(g.time*16+p.slot)*.055:0;
    if(p.shielding)paperFx(ctx,h,'shield',p.x,p.y-47,p.parryWindow>0?130:118,g.time,{alpha:p.parryWindow>0?.96:.76});
    if(grounded&&Math.abs(p.vx)>65)paperFx(ctx,h,'dust',p.x-p.facing*17,p.y-3,32,g.time+p.slot*.1,{alpha:.64});
    if(land>0)paperFx(ctx,h,'dust',p.x,p.y-4,82,g.time,{alpha:land});
    ctx.save();if(p.invuln>0)ctx.globalAlpha=.5+Math.abs(Math.sin(g.time*18))*.5;
    h.character?.(ctx,p,p.x,p.y,reaction.size,{
      time:g.time,static:s.hitstop>0,moving:Math.abs(p.vx)>35&&grounded,
      attack,move:p.move,specialAnimation:p.specialAnimation,specialKind:p.specialKind,specialProgress:p.specialProgress,grounded,vy:p.vy,hurt:p.stun>0,land,squash,facing:p.facing,
      scaleX:reaction.scaleX,scaleY:reaction.scaleY,rotation:p.stun>0?clamp(p.vx/2100,-.4,.4):!grounded?p.vx/2400:0
    });
    ctx.restore();
    if(attacking){
      const progress=1-attack;
      if(p.move==='uppercut')paperFx(ctx,h,'hit',p.x+p.facing*13,p.y-91,108,g.time,{alpha:.92,progress,rotation:-Math.PI/2,flipX:p.facing<0});
      else if(p.move==='dive')paperFx(ctx,h,'hit',p.x,p.y+2,98,g.time,{alpha:.94,progress,rotation:Math.PI/2});
      else if(p.move==='spin'){
        paperFx(ctx,h,'hit',p.x-39,p.y-43,82,g.time,{alpha:.85,progress,flipX:true});
        paperFx(ctx,h,'hit',p.x+39,p.y-43,82,g.time,{alpha:.85,progress});
      }else paperFx(ctx,h,'hit',p.x+p.facing*54,p.y-46,98,g.time,{alpha:.92,progress,flipX:p.facing<0});
    }
    drawSpecial(ctx,g,p,h);
    const nameY=Math.max(61,p.y-106);
    if(p.flash>0&&p.message)label(ctx,p.message,p.x,Math.max(46,nameY-18),12,'#f2e1b9');
    if(p.shielding||p.shield<60){
      const marks=Math.ceil(p.shield/10);ctx.save();
      for(let n=0;n<10;n++){ctx.fillStyle=n<marks?'#eee0bd':'#352e27aa';ctx.fillRect(Math.round(p.x-24+n*5),Math.round(p.y+7),4,3);}
      ctx.restore();
    }
  }
  if(g.id==='crown-clash'){
    const x=s.crown.x,y=s.crown.y-(s.crown.holder?22:0)+Math.sin(g.time*4)*2;
    paperFx(ctx,h,'magic',x,y,s.crownBonus?78:59,g.time,{alpha:s.crownBonus?.8:.5});
    h.prop?.(ctx,'crown',x,y,s.crownBonus?51:43,Math.sin(g.time*2)*.045);
    if(s.crownBonus)label(ctx,'×2',x,y-31,11,'#f2e1b9');
  }
  // Atlas particles keep hits crisp at the same pixel scale as the stage effects.
  for(let n=0;n<s.effects.length;n+=2){
    const f=s.effects[n],progress=1-f.life/f.max;
    paperFx(ctx,h,f.type||'dust',f.x,f.y,Math.max(17,f.size*3.8),g.time+n*.013,{alpha:f.life/f.max,progress,rotation:Math.atan2(f.vy,f.vx)});
  }
  ctx.restore();
  // Resolve the material layer while the arena is still unobscured. The outer
  // draw wrapper may safely call endScene again; its pending batch is now empty.
  h.endScene?.(ctx);
  const phaseText=objectiveBanner(g)||(s.arenaPhase==='rift-warning'?'GUST '+(Math.floor(g.time/8)%2?'←':'→')+' IN '+s.arenaWarning.toFixed(1)+'s':s.arenaPhase==='rift-gust'?(s.wind>0?'GUST →':'← GUST'):s.arenaPhase==='crown-warning'?'DOUBLE CROWN SOON':s.arenaPhase==='crown-fever'?'HOLD THE CROWN · ×2':s.arenaPhase==='storm-warning'?'METEORS IN '+s.arenaWarning.toFixed(1)+'s':s.arenaPhase==='meteor-storm'?'METEOR STORM':s.arenaPhase==='seal-warning'?'SEAL MOVES IN '+s.arenaWarning.toFixed(1)+'s':'');
  drawGameHUD(ctx,g,h,{mode:'brawl',cue:phaseText,players:g.players.map(p=>({detail:objectivePlayerLabel(g,p),progress:p.specialCharge}))});
  ctx.restore();
}
