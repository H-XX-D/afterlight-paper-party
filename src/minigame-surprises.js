import {paperPalette} from './paper-palette.js';
import {gameFont} from './game-hud.js';

/** Small public event stream, separate from the game's spawn/AI random stream.
 * All decisions happen during stepping. Drawing only samples the shared clock.
 */
export const SURPRISE_LIMITS=Object.freeze({objects:9,effects:12,history:4,warning:1.2,first:8.5});
export const MINIGAME_SURPRISES=Object.freeze({
 'double-moon':{label:'DOUBLE MOON · EARN ×2',icon:'orb',duration:4.8},
 'paper-gust':{label:'PAPER GALE · ↓ BRACE',icon:'umbrella',duration:4.2},
 'relic-rain':{label:'RELIC RAIN · STARS / THORNS',icon:'key',duration:5.6},
 'moon-bloom':{label:'MOON BLOOM · EXTRA RELICS',icon:'spark',duration:5.2},
 'ghost-express':{label:'EXPRESS SERVICE · JUMP / DUCK',icon:'lantern',duration:4.8},
 'star-carriage':{label:'STAR CARRIAGE · CLEAN CLEARS +4',icon:'spark',duration:4.8},
 'golden-phrase':{label:'GOLDEN PHRASE · CLEAN NOTES +3',icon:'spark',duration:4.8},
 'phase-fever':{label:'PHASE FEVER · FAST RECHARGE',icon:'key',duration:4.8},
 'cover-night':{label:'MOON SHADOW · COVER RUNS ×2',icon:'lantern',duration:4.8},
 'clockwork-lull':{label:'QUIET CLOCK · STEADY RECHARGES',icon:'gear',duration:4.8},
 'counterweight':{label:'COUNTERWEIGHT · BRACE RECHARGES',icon:'crate',duration:4.8},
});
for(const event of Object.values(MINIGAME_SURPRISES))Object.freeze(event);
const POOLS=Object.freeze({
 sweep:['double-moon','ghost-express','star-carriage'],
 rhythm:['double-moon','golden-phrase','moon-bloom'],
 maze:['double-moon','phase-fever','moon-bloom'],
 redlight:['double-moon','cover-night','moon-bloom'],
 gallery:['double-moon','moon-bloom','golden-phrase'],
 'gullet-gala':['double-moon','moon-bloom','paper-gust'],
 'clockwork-surgery':['double-moon','clockwork-lull','golden-phrase'],
 'tottering-tower':['double-moon','counterweight','golden-phrase'],
});
const MOVING=new Set(['inkfall','mothlight','raft','trace','shadow']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=s=>{let x=s.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;};
function streamSeed(id,seed){let n=(seed>>>0)^0x9e3779b9;for(const char of id)n=Math.imul(n^char.charCodeAt(0),16777619);return n>>>0||0x6d2b79f5;}
export function minigameSurprisePool(g){
 const pool=POOLS[g.id]||(Array.isArray(g.state?.platforms)?['double-moon','paper-gust','relic-rain','moon-bloom']:MOVING.has(g.id)?['double-moon','paper-gust','relic-rain','moon-bloom']:['double-moon','moon-bloom']);
 return [...pool];
}
export function initializeMinigameSurprises(g,seed=g.rng){
 if(g.surprises)return g;
 const s={rng:streamSeed(g.id,seed),serial:0,nextAt:0,warning:null,active:null,objects:[],effects:[],history:[],bonusEarned:0,claims:0,avoided:0,hits:0,hitAt:g.players.map(()=>-10),lastKind:'',lastCount:0};
 s.nextAt=SURPRISE_LIMITS.first+rand(s)*.8;g.surprises=s;return g;
}
function burst(s,type,x,y){s.effects.push({type,x,y,at:0,life:.55,max:.55});if(s.effects.length>SURPRISE_LIMITS.effects)s.effects.shift();}
function tell(p,text){p.message=text;p.flash=.75;}
function rain(g,s,event,thorn=true){
 s.objects=[];
 const lanes=Array.from({length:7},(_,i)=>100+i*126);
 for(let i=lanes.length-1;i>0;i--){const j=Math.floor(rand(s)*(i+1));[lanes[i],lanes[j]]=[lanes[j],lanes[i]];}
 for(let i=0;i<7;i++)s.objects.push({id:event.serial*10+i,x:clamp(lanes[i]+(rand(s)-.5)*48,74,886),y:94,vy:94+rand(s)*18,kind:thorn&&i%3===2?'thorn':'star',at:event.at+i*.18,life:5.5,spin:(rand(s)-.5)*3});
}
function moonBloom(g,s,event){
 const world=g.state;
 if(g.id==='gullet-gala'){
  for(let i=0;i<9&&world.objects.length<44;i++){
   const a=rand(s)*Math.PI*2,r=.35+rand(s)*.55;
   world.objects.push({id:++world.nextId,kind:'pearl',x:480+Math.cos(a)*282*r,y:292+Math.sin(a)*139*r,vx:-Math.sin(a)*62,vy:Math.cos(a)*36,r:10,value:6,life:12,spin:a});
  }
 }else if(g.id==='mothlight'){
  for(let i=0;i<3&&world.objects.length<18;i++)world.objects.push({id:1000+event.serial*10+i,x:90+rand(s)*780,y:160+rand(s)*240,phase:rand(s)*Math.PI*2,value:3,surpriseUntil:event.until});
 }else if(g.id==='shadow'){
  for(let i=0;i<2&&world.relics.length<5;i++)world.relics.push({x:110+rand(s)*740,y:165+rand(s)*205,surpriseUntil:event.until});
 }else if(g.id==='gallery'){
  for(let i=0;i<3&&world.objects.length<8;i++)world.objects.push({id:100+event.serial*3+i,x:110+i*340,y:180,speed:(i%2?1:-1)*80,respawn:0,friendly:i===2,marked:i===0,open:true,surpriseUntil:event.until});
 }else if(MOVING.has(g.id)||Array.isArray(world.platforms))rain(g,s,event,false);
 // Grid, stealth and rhythm blooms reward their ordinary objective, rather
 // than introducing a disconnected cursor or new button into the event.
}
function activate(g,s){
 const e=s.warning;s.warning=null;s.active={...e,at:e.until,until:e.until+e.duration};
 s.lastKind=e.kind;s.history.push({serial:e.serial,kind:e.kind,at:s.active.at});if(s.history.length>SURPRISE_LIMITS.history)s.history.shift();
 if(e.kind==='relic-rain')rain(g,s,s.active);
 if(e.kind==='moon-bloom')moonBloom(g,s,s.active);
 if(e.kind==='ghost-express'){g.state.next=Math.max(s.active.at+.75,s.active.at+(g.state.next-s.active.at)*.7);s.lastCount=g.state.count;}
 burst(s,'magic',480,108);
}
/** Called before the native game step, so resource boons affect that frame's
 * existing input rules. No event cancels a button, hitstuns a player, or moves
 * an anchored jaw, grid cursor or precision tool without the player's input.
 */
export function prepareMinigameSurprises(g,dt){
 initializeMinigameSurprises(g);const s=g.surprises,t=g.time+dt;
 if(!s.active&&!s.warning&&t>=s.nextAt){
  let pool=minigameSurprisePool(g).filter(kind=>kind!==s.lastKind);if(!pool.length)pool=minigameSurprisePool(g);
  const kind=pool[Math.floor(rand(s)*pool.length)],definition=MINIGAME_SURPRISES[kind];
  s.warning={kind,...definition,serial:++s.serial,at:t,until:t+SURPRISE_LIMITS.warning,direction:rand(s)<.5?-1:1};
 }
 if(s.warning&&t>=s.warning.until)activate(g,s);
 const e=s.active;
 if(e?.kind==='phase-fever')for(const p of g.players)p.ability=Math.max(0,p.ability-dt*2);
 if(e?.kind==='clockwork-lull')for(const p of g.players)p.steadyCooldown=Math.max(0,p.steadyCooldown-dt*2.2);
 if(e?.kind==='counterweight')for(const p of g.players)if(!p.prev.special)p.brace=clamp(p.brace+dt*.3,0,1);
 return e;
}
function physicalPosition(g,p){
 if(Array.isArray(g.state.platforms))return {x:p.x,y:p.y-36};
 if(g.id==='inkfall')return {x:p.x,y:400};
 if(g.id==='raft')return {x:p.x,y:405-Math.sin(clamp(p.jump/.68,0,1)*Math.PI)*90};
 return {x:p.x,y:p.y};
}
function protectedPlayer(g,p){return p.shielding||p.invuln>0||p.dash>0||(g.id==='raft'&&p.jump>0)||(g.id==='trace'&&p.prev.action&&p.focus>0&&!p.focusExhausted);}
function stepRain(g,s,dt){
 for(const o of s.objects){
  if(g.time<o.at)continue;
  o.life-=dt;o.y+=o.vy*dt;
  for(const p of g.players){
   if(p.eliminated||p.respawn>0)continue;const q=physicalPosition(g,p);
   if(Math.hypot(q.x-o.x,q.y-o.y)>29)continue;
   if(o.kind==='star'){p.score+=7;s.claims++;tell(p,'MOON RELIC +7');burst(s,'magic',o.x,o.y);o.life=0;break;}
   if(protectedPlayer(g,p)){s.avoided++;tell(p,'THORN DEFLECTED');burst(s,'shield',o.x,o.y);o.life=0;break;}
   if(g.time-s.hitAt[p.slot]>.8){s.hitAt[p.slot]=g.time;s.hits++;p.score=Math.max(0,p.score-4);tell(p,'BLACKTHORN −4');burst(s,'hit',o.x,o.y);o.life=0;break;}
  }
 }
 s.objects=s.objects.filter(o=>o.life>0&&o.y<465).slice(0,SURPRISE_LIMITS.objects);
}
function gust(g,s,event,dt){
 if(g.id==='gullet-gala'){
  // The bowl's paper wind is a pellet current: SIP and burps can oppose it.
  for(const o of g.state.objects)o.vx=clamp(o.vx+event.direction*dt*44,-260,260);
  return;
 }
 for(const p of g.players){
  if(p.eliminated||p.respawn>0||p.stun>0||p.invuln>0)continue;
  const brace=p.prev.down||p.shielding||(g.id==='trace'&&p.prev.action&&p.focus>0);
  const force=event.direction*28*(brace?.12:1)*dt;
  // Keep the event out of ring-out margins. Players can still walk/jump there.
  if(p.x>=64&&p.x<=896)p.x=clamp(p.x+force,64,896);
 }
}
/** Native-score delta is captured separately: losses are never doubled and an
 * event cannot pay a score merely for being on screen. */
export function finishMinigameSurprises(g,beforeScores,dt){
 const s=g.surprises,e=s?.active;if(!s)return;
 if(e){
  for(let j=0;j<g.players.length;j++){
   const p=g.players[j],earned=Math.max(0,p.score-beforeScores[j]);let extra=0;
   if(e.kind==='double-moon')extra=earned;
   else if(e.kind==='golden-phrase'&&earned>=1)extra=g.id==='rhythm'?3:2;
   else if(e.kind==='star-carriage'&&earned>=1)extra=4;
   else if(e.kind==='moon-bloom'&&['maze','redlight'].includes(g.id)&&earned>=1)extra=3;
   else if(e.kind==='cover-night'&&p.prev.down&&p.lane===(g.state.phase+p.slot)%3){extra=earned;if(p.prev.up)p.progress=Math.min(100,p.progress+dt*12);}
   if(extra>0){p.score+=extra;s.bonusEarned+=extra;}
  }
  if(e.kind==='paper-gust')gust(g,s,e,dt);
  if(e.kind==='ghost-express'&&g.state.count!==s.lastCount){g.state.next=g.time+Math.max(.72,(g.state.next-g.time)*.75);s.lastCount=g.state.count;}
 }
 stepRain(g,s,dt);
 for(const f of s.effects){f.life-=dt;f.at+=dt;}s.effects=s.effects.filter(f=>f.life>0);
 // Native opportunity objects expire instead of accumulating across events.
 if(g.state.objects)g.state.objects=g.state.objects.filter(o=>o.surpriseUntil===undefined||g.time<o.surpriseUntil);
 if(g.id==='shadow')g.state.relics=g.state.relics.filter(o=>o.surpriseUntil===undefined||g.time<o.surpriseUntil);
 if(e&&g.time>=e.until){s.active=null;s.nextAt=g.time+5.8+rand(s)*1.6;}
}

export function minigameSurpriseDiagnostics(g){
 const s=g.surprises;return Object.freeze({pool:Object.freeze(minigameSurprisePool(g)),serial:s?.serial||0,warning:s?.warning?.kind||null,active:s?.active?.kind||null,nextAt:s?.nextAt??SURPRISE_LIMITS.first,objects:s?.objects.length||0,effects:s?.effects.length||0,bonusEarned:s?.bonusEarned||0,claims:s?.claims||0,avoided:s?.avoided||0,hits:s?.hits||0,history:Object.freeze((s?.history||[]).map(e=>Object.freeze({...e})))});
}
export function minigameSurpriseCue(g){
 const s=g.surprises,e=s?.warning||s?.active;if(!e)return '';
 const label=e.kind==='paper-gust'&&g.id==='gullet-gala'?'BOWL CURRENT · SIP / BURP':e.kind==='moon-bloom'&&g.id==='rhythm'?'ECHO BLOOM · ANSWER THE OTHER INSTRUMENT':e.label;
 return s.warning?`${label} · ${Math.max(0,e.until-g.time).toFixed(1)}s`:label;
}
export function drawMinigameSurprises(c,g,h={}){
 const s=g.surprises;if(!s)return;const palette=paperPalette(g.id),t=g.time,e=s.warning||s.active;
 for(const o of s.objects){
  if(t<o.at){h.fx?.(c,'magic',o.x,104,30,t,{color:palette.fx.magic,alpha:.45});continue;}
  const stretch=.94+Math.sin(t*5+o.id)*.1,size=o.kind==='thorn'?35:39;
  c.save();c.translate(o.x,o.y);c.rotate(o.spin+t*(o.kind==='thorn'?.5:1.7));c.scale(1/stretch,stretch);
  if(o.kind==='thorn')h.prop?.(c,'spike',0,0,size);else if(h.object)h.object(c,'star',0,0,size,size,t);else h.prop?.(c,'spark',0,0,size);
  c.restore();h.fx?.(c,o.kind==='thorn'?'dust':'magic',o.x,o.y-14,size,t,{color:palette.fx[o.kind==='thorn'?'dust':'magic'],alpha:.28});
 }
 for(const f of s.effects)h.fx?.(c,f.type,f.x,f.y,48+(1-f.life/f.max)*40,t+f.at,{color:palette.fx[f.type],alpha:f.life/f.max});
 if(!e)return;
 const warning=!!s.warning,age=t-e.at,squash=warning?1+Math.sin(age*11)*.08:1+Math.exp(-age*5)*Math.sin(age*18)*.25;
 c.save();c.translate(480,104);c.scale(1/squash,squash);h.prop?.(c,e.icon,0,0,warning?41:37,Math.sin(t*2)*.13);c.restore();
 if(s.active?.kind==='paper-gust')for(let n=0;n<4;n++)h.fx?.(c,'dust',100+((t*.3+n/4)%1)*760,195+n*55,52,t+n,{color:palette.fx.dust,alpha:.3,rotation:e.direction<0?Math.PI:0});
}
/** Ink comes after the material flush, before the game's HUD. */
export function drawMinigameSurpriseCue(c,g,h={}){
 const cue=minigameSurpriseCue(g);if(!cue)return;const palette=paperPalette(g.id),width=Math.min(386,48+cue.length*6);
 c.save();h.uiFrame?.(c,480-width/2,117,width,27,{variant:'banner',accent:palette.accent,alpha:.91});
 if(!h.uiFrame){c.fillStyle=palette.ink;c.globalAlpha=.86;c.fillRect(480-width/2,117,width,27);c.globalAlpha=1;}
 c.fillStyle=palette.paper;c.font=gameFont(10);c.textAlign='center';c.textBaseline='middle';c.fillText(cue,480,131);c.restore();
}
