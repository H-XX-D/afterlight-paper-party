import {drawGameHUD} from './game-hud.js';
/** A deterministic, shared-pellet feeding contest for the paper party. */
export const GULLET_GAME=Object.freeze({id:'gullet-gala',name:'GULLET GALA',tag:'FEEDING FRENZY',duration:44,icon:'orb',description:'Four hungry paper creatures share one moon bowl. Sweep up pearls, dodge blackthorns, and burp a rival’s feast away.',instructions:'← → swivel · tap Space to bite · hold/release for a long gulp · ↑ switches GULP / SIP · ↓ burps pellets and rival jaws'});
export const GULLET_ARENA=Object.freeze({x:480,y:292,rx:282,ry:139});
const BASES=[[212,177],[748,177],[748,407],[212,407]],COLORS=['#ecd29c','#9dc4be','#c3afd7','#dda891'];
const MAX_PELLETS=44,MAX_EFFECTS=28,TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const input=(i={})=>({left:!!i?.left,right:!!i?.right,up:!!i?.up,down:!!i?.down,action:!!i?.action});
const gap=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function random(g){let x=g.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;g.rng=x>>>0;return g.rng/4294967296;}
function effect(g,type,x,y,color,size=36){g.state.effects.push({type,x,y,color,size,life:.48,max:.48});if(g.state.effects.length>MAX_EFFECTS)g.state.effects.splice(0,g.state.effects.length-MAX_EFFECTS);}
function tell(p,text){p.message=text;p.flash=.85;}
function spawn(g,kind){
  if(g.state.objects.length>=MAX_PELLETS)return;
  const a=random(g)*TAU,r=Math.sqrt(random(g))*.94;
  if(!kind){const roll=random(g);kind=roll<(g.state.course===3?.32:.12)?'pearl':roll<.25?'thorn':'crumb';}
  const speed=25+random(g)*48;
  g.state.objects.push({id:++g.state.nextId,kind,x:GULLET_ARENA.x+Math.cos(a)*GULLET_ARENA.rx*r,y:GULLET_ARENA.y+Math.sin(a)*GULLET_ARENA.ry*r,vx:-Math.sin(a)*speed,vy:Math.cos(a)*speed*.58,r:kind==='pearl'?10:8,value:kind==='pearl'?(g.state.course===3?8:6):kind==='thorn'?0:g.state.course===3?2:1,life:15,spin:random(g)*TAU});
}
export function createGullet(players,seed=1){
  if(!Array.isArray(players)||players.length<1||players.length>4)throw new Error('Gullet Gala needs1–4 travelers.');
  if(new Set(players.map(p=>String(p.id))).size!==players.length)throw new Error('Every traveler needs a distinct id.');
  const g={id:GULLET_GAME.id,time:0,duration:GULLET_GAME.duration,done:false,rng:(seed>>>0)||1,players:[],state:{objects:[],effects:[],nextId:0,spawnClock:.4,course:0,courseName:'MOON SUPPER',courseFlash:1,claims:0,claimSerial:0,burps:0}};
  // Do not copy the board roster wholesale: it contains private cards and seed data.
  g.players=players.map((p,slot)=>{
    const [baseX,baseY]=BASES[slot],baseAngle=Math.atan2(GULLET_ARENA.y-baseY,GULLET_ARENA.x-baseX);
    return {id:String(p.id),name:String(p.name||`Traveler ${slot+1}`).slice(0,18),character:clamp(Number.isInteger(p.character)?p.character:slot,0,7),bot:!!p.bot,slot,color:COLORS[slot],baseX,baseY,baseAngle,x:baseX,y:baseY,aim:0,angle:baseAngle,score:0,mode:'gulp',prev:input(),charging:false,charge:0,bite:0,biteDuration:.48,biteReach:0,bitePower:0,biteCaught:0,extension:0,cooldown:0,stun:0,burpCooldown:0,burpTime:0,caught:0,pearls:0,thorns:0,bites:0,chargedBites:0,burps:0,flash:0,message:''};
  });
  for(let n=0;n<30;n++)spawn(g,n%10===0?'pearl':n%10===5?'thorn':'crumb');
  return g;
}
function launch(g,p){
  const power=p.charge>=.36?clamp((p.charge-.2)/.8,.25,1):0;
  p.bitePower=power;p.biteReach=(p.mode==='sip'?170:205)+power*(p.mode==='sip'?95:130);
  p.biteDuration=.42+power*.2;p.bite=p.biteDuration;p.biteCaught=0;
  p.cooldown=.48+power*.72+(p.mode==='sip'?.12:0);p.charging=false;p.charge=0;p.bites++;
  if(power>0){p.chargedBites++;tell(p,'LONG GULP');}else tell(p,'CHOMP');
  effect(g,'dust',p.baseX,p.baseY,p.color,42+power*22);
}
function burp(g,p){
  p.burpCooldown=3;p.burpTime=.32;p.burps++;g.state.burps++;p.charging=false;p.charge=0;
  const ux=Math.cos(p.angle),uy=Math.sin(p.angle);
  for(const o of g.state.objects){const dx=o.x-p.x,dy=o.y-p.y,d=Math.hypot(dx,dy)||1;if(d<235&&(dx*ux+dy*uy)/d>.15){o.vx+=dx/d*360;o.vy+=dy/d*360;}}
  for(const q of g.players){if(q.id===p.id)continue;const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1;if(d<230&&(dx*ux+dy*uy)/d>.2){q.stun=Math.max(q.stun,.32);q.bite=0;q.charging=false;q.charge=0;q.cooldown=Math.max(q.cooldown,.45);tell(q,'BURPED BACK');}}
  tell(p,'PAPER BURP');for(let n=0;n<4;n++)effect(g,'dust',p.x+ux*(36+n*39),p.y+uy*(36+n*39),p.color,48+n*8);
}
function botInput(g,p){
  const i=input(),target=g.state.objects.filter(o=>o.kind!=='thorn').map(o=>({o,d:Math.hypot(o.x-p.baseX,o.y-p.baseY),angle:gap(Math.atan2(o.y-p.baseY,o.x-p.baseX),p.baseAngle)})).filter(v=>Math.abs(v.angle)<.64).sort((a,b)=>(b.o.value*80-b.d)-(a.o.value*80-a.d))[0];
  if(!target)return i;
  const aim=clamp(target.angle,-.6,.6),error=aim-p.aim;i.left=error<-.018;i.right=error>.018;
  const hazard=g.state.objects.some(o=>o.kind==='thorn'&&Math.hypot(o.x-p.x,o.y-p.y)<110&&Math.abs(gap(Math.atan2(o.y-p.y,o.x-p.x),p.angle))<.4);
  if(hazard&&p.burpCooldown<=0)i.down=true;
  const desiredMode=target.d<215&&p.slot%2===1?'sip':'gulp';
  if(p.mode!==desiredMode&&!p.charging&&p.bite<=0)i.up=true;
  if(p.charging)i.action=p.charge<(target.d>235?.96:target.d>180?.62:.075);
  else if(p.cooldown<=0&&p.stun<=0&&p.bite<=0&&Math.abs(error)<.08&&!i.up&&!i.down)i.action=true;
  return i;
}
function advancePellets(g,dt){
  const s=g.state,a=GULLET_ARENA;
  for(const o of s.objects){
    o.oldX=o.x;o.oldY=o.y;o.life-=dt;o.spin+=dt*(o.vx+o.vy)*.015;
    const dx=o.x-a.x,dy=o.y-a.y,d=Math.hypot(dx,dy)||1;
    const swirl=s.course===1?52:s.course===2?-19:8;
    o.vx+=-dy/d*swirl*dt;o.vy+=dx/d*swirl*dt*.6;
    for(const p of g.players)if(p.charging&&p.mode==='sip'&&p.stun<=0){
      const px=p.x-o.x,py=p.y-o.y,pd=Math.hypot(px,py)||1;
      if(pd<275&&Math.abs(gap(Math.atan2(-py,-px),p.angle))<.38){o.vx+=px/pd*220*dt;o.vy+=py/pd*220*dt;}
    }
    const speed=Math.hypot(o.vx,o.vy);if(speed>330){o.vx*=330/speed;o.vy*=330/speed;}
    o.vx*=Math.pow(.75,dt);o.vy*=Math.pow(.75,dt);o.x+=o.vx*dt;o.y+=o.vy*dt;
    const nx=(o.x-a.x)/(a.rx-o.r),ny=(o.y-a.y)/(a.ry-o.r),radius=Math.hypot(nx,ny);
    if(radius>1){
      o.x=a.x+nx/radius*(a.rx-o.r);o.y=a.y+ny/radius*(a.ry-o.r);
      const gx=(o.x-a.x)/(a.rx-o.r)**2,gy=(o.y-a.y)/(a.ry-o.r)**2,n=Math.hypot(gx,gy)||1,dot=o.vx*gx/n+o.vy*gy/n;
      if(dot>0){o.vx-=1.7*dot*gx/n;o.vy-=1.7*dot*gy/n;}
    }
  }
  for(let i=0;i<s.objects.length;i++)for(let j=i+1;j<s.objects.length;j++){
    const a=s.objects[i],b=s.objects[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),limit=a.r+b.r;
    if(d>=limit)continue;const nx=d?dx/d:1,ny=d?dy/d:0,push=(limit-d)*.5;
    a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
    const speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(speed<0){const impulse=-speed*.78;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;}
  }
}
/** Earliest contact of a moving mouth and moving pellet, including fast sweeps. */
function contactTime(p,o,radius){
  const x=p.oldX-o.oldX,y=p.oldY-o.oldY,dx=(p.x-p.oldX)-(o.x-o.oldX),dy=(p.y-p.oldY)-(o.y-o.oldY),c=x*x+y*y-radius*radius;
  if(c<=0)return 0;const a=dx*dx+dy*dy;if(a<1e-10)return null;
  const b=2*(x*dx+y*dy),disc=b*b-4*a*c;if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
function collect(g){
  const s=g.state,candidates=[];
  for(const o of s.objects)for(const p of g.players){
    if(!p.catching||p.stun>0)continue;const t=contactTime(p,o,21+p.bitePower*10+o.r);
    if(t!==null)candidates.push({o,p,t});
  }
  const turn=s.claimSerial%g.players.length;
  candidates.sort((a,b)=>a.t-b.t||a.o.id-b.o.id||((a.p.slot-turn+g.players.length)%g.players.length)-((b.p.slot-turn+g.players.length)%g.players.length));
  const consumed=new Set();
  for(const {o,p} of candidates){
    if(consumed.has(o.id)||p.stun>0||p.biteCaught>=(p.bitePower>0?7:3))continue;
    consumed.add(o.id);s.claimSerial++;s.claims++;p.biteCaught++;
    if(o.kind==='thorn'){
      p.thorns++;p.score=Math.max(0,p.score-3);p.stun=.9;p.bite=0;p.charging=false;p.charge=0;p.cooldown=Math.max(p.cooldown,1.1);
      tell(p,'BLACKTHORN · SPIT!');effect(g,'hit',o.x,o.y,'#ca9d89',68);
    }else{
      p.score+=o.value;p.caught++;if(o.kind==='pearl')p.pearls++;
      tell(p,o.kind==='pearl'?`MOON PEARL +${o.value}`:`+${o.value}`);effect(g,o.kind==='pearl'?'magic':'hit',o.x,o.y,p.color,o.kind==='pearl'?58:34);
    }
  }
  s.objects=s.objects.filter(o=>!consumed.has(o.id)&&o.life>0);
}
export function stepGullet(g,inputs={},dt=1/60){
  if(g.done||!Number.isFinite(dt)||dt<=0)return g;
  dt=Math.min(dt,.05,g.duration-g.time);if(dt<=0){g.done=true;return g;}g.time+=dt;
  const s=g.state,course=g.time<14?0:g.time<29?1:g.time<38?2:3;
  if(course!==s.course){s.course=course;s.courseName=['MOON SUPPER','WHIRLING FEAST','SUDDEN RUSH','GOLDEN DESSERT'][course];s.courseFlash=1.5;for(let n=0;n<6;n++)spawn(g,course===3?'pearl':undefined);}
  s.courseFlash=Math.max(0,s.courseFlash-dt);s.spawnClock-=dt;
  if(s.spawnClock<=0){spawn(g);if(s.course>=2)spawn(g);s.spawnClock=s.course===2?.2:s.course===3?.24:.43;}
  for(const e of s.effects)e.life-=dt;s.effects=s.effects.filter(e=>e.life>0);
  for(const p of g.players){
    p.oldX=p.x;p.oldY=p.y;p.catching=false;
    for(const key of ['cooldown','stun','burpCooldown','burpTime','flash'])p[key]=Math.max(0,p[key]-dt);
    const i=p.bot?botInput(g,p):input(inputs[p.id]),hit=i.action&&!p.prev.action,release=!i.action&&p.prev.action;
    p.aim=clamp(p.aim+(Number(i.right)-Number(i.left))*dt*(p.charging?.78:1.22),-.6,.6);p.angle=p.baseAngle+p.aim;
    if(i.up&&!p.prev.up&&p.bite<=0){p.mode=p.mode==='gulp'?'sip':'gulp';p.charging=false;p.charge=0;tell(p,p.mode==='sip'?'SIP · DRAW THEM CLOSE':'GULP · LONG REACH');}
    if(i.down&&!p.prev.down&&p.burpCooldown<=0&&p.stun<=0)burp(g,p);
    if(hit&&p.cooldown<=0&&p.bite<=0&&p.stun<=0&&!i.down){p.charging=true;p.charge=0;}
    if(p.charging){
      if(i.action)p.charge=Math.min(1,p.charge+dt);
      if(release&&p.stun<=0)launch(g,p);
    }
    if(p.bite>0){
      p.bite=Math.max(0,p.bite-dt);const progress=1-p.bite/p.biteDuration;
      p.extension=Math.sin(progress*Math.PI)*p.biteReach;p.catching=progress<.72&&p.stun<=0;
    }else p.extension=p.charging?p.charge*17:Math.max(0,p.extension-dt*750);
    p.x=p.baseX+Math.cos(p.angle)*p.extension;p.y=p.baseY+Math.sin(p.angle)*p.extension;p.prev=i;
  }
  advancePellets(g,dt);collect(g);
  if(g.time>=g.duration-1e-8){g.time=g.duration;g.done=true;}
  return g;
}
export function getGulletResults(g){return g.players.map(p=>({id:p.id,score:Math.max(0,Math.round(p.score))})).sort((a,b)=>b.score-a.score);}

function label(c,value,x,y,size=12,color='#f0e4c9',align='center'){
  c.font=`bold ${size}px Georgia,serif`;c.textAlign=align;c.textBaseline='middle';c.lineWidth=3;c.strokeStyle='#211f1c';c.strokeText(String(value),x,y);c.fillStyle=color;c.fillText(String(value),x,y);
}
function panel(c,x,y,w,h){c.fillStyle='#d9cfb7';c.fillRect(x,y,w,h);c.fillStyle='#c0b399';for(let n=0;n<Math.floor(w/21);n++)c.fillRect(x+n*21+3,y+h-4,12,2);}
export function drawGullet(c,g,h={}){
  const t=g.time,s=g.state;c.save();h.background?.(c,g.id,t);
  // Overlapping carved paper platforms form a tangible communal bowl and rim.
  for(let row=0;row<5;row++){const width=[430,574,644,574,430][row],y=185+row*44;h.platform?.(c,480-width/2,y,width,49,t,row%2?'wood':'stone');}
  for(let n=0;n<14;n++){const angle=n/14*TAU,x=480+Math.cos(angle)*300,y=292+Math.sin(angle)*154;h.object?.(c,'pedestal',x,y,43,34,t,{rotation:angle*.12});}
  // Riders remain large enough to read, behind their creature's hinged mouth.
  for(const p of g.players){
    const ux=Math.cos(p.baseAngle),uy=Math.sin(p.baseAngle),rx=p.baseX-ux*55,ry=p.baseY-uy*46;
    h.platform?.(c,rx-59,ry+27,118,28,t,'wood');h.character?.(c,p,rx,ry+23,64,{time:t,moving:p.charging,attack:p.bite>0?.6:0,hurt:p.stun>0,facing:ux>0?1:-1});
  }
  for(const o of s.objects){
    const size=o.kind==='pearl'?28:24;
    if(o.kind==='pearl'){h.prop?.(c,'spark',o.x,o.y,size,o.spin);h.fx?.(c,'magic',o.x,o.y,34,t+o.id*.07,{alpha:.28});}
    else if(h.objective)h.objective(c,o.kind==='thorn'?'bomb':'ball',o.x,o.y+size*.45,size,{time:t,rotation:o.spin});
    else h.prop?.(c,o.kind==='thorn'?'spike':'orb',o.x,o.y,size,o.spin);
  }
  for(const p of [...g.players].sort((a,b)=>a.y-b.y)){
    const length=Math.hypot(p.x-p.baseX,p.y-p.baseY),sections=Math.max(1,Math.ceil(length/34));
    for(let n=0;n<sections;n++){const f=n/sections,x=p.baseX+(p.x-p.baseX)*f,y=p.baseY+(p.y-p.baseY)*f;h.object?.(c,'crate',x,y,43,35,t,{rotation:p.angle,alpha:.95});}
    if(p.charging&&p.mode==='sip')for(let n=0;n<4;n++){const reach=48+((n/4+t*.8)%1)*148;h.fx?.(c,'dust',p.x+Math.cos(p.angle)*reach,p.y+Math.sin(p.angle)*reach,25,t+n*.1,{alpha:.5,rotation:p.angle});}
    if(h.feast)h.feast(c,p.slot,p.charging||p.bite>0||p.stun>0,p.x,p.y,105,{time:t,rotation:p.angle,charge:p.charge,color:p.color,hurt:p.stun>0,squash:p.bite>0?Math.sin((1-p.bite/p.biteDuration)*TAU)*.08:0});
    else h.object?.(c,'crate',p.x,p.y,97,77,t,{rotation:p.angle});
    if(p.burpTime>0)h.fx?.(c,'dust',p.x+Math.cos(p.angle)*72,p.y+Math.sin(p.angle)*72,95,t,{alpha:p.burpTime/.32,rotation:p.angle});
    if(p.stun>0)h.fx?.(c,'hit',p.x,p.y,88,t,{alpha:Math.min(1,p.stun*2)});
  }
  for(const e of s.effects)h.fx?.(c,e.type,e.x,e.y,e.size,t,{alpha:e.life/e.max,color:e.color});
  h.endScene?.(c);
  drawGameHUD(c,g,h,{mode:'gullet',cue:s.course===3?'GOLD PEARLS +8':s.course===2?'DOUBLE SERVINGS':s.course===1?'BOWL TURNING':'GATHER PEARLS'});
  c.restore();
}
