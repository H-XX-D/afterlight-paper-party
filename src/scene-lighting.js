/**
 * Visual-only scene lights derived from a game snapshot. Coordinates use the
 * 960 × 540 canvas; z and radius use the same scene-pixel scale. No retained
 * history, wall clock, randomness or writes to the authoritative game state.
 */
import {paperPalette} from './paper-palette.js';
const TAU=Math.PI*2;
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,finite(n)));
const slot=(p,i=0)=>Math.max(0,Math.floor(finite(p.slot,i)));
const phase=t=>(Math.sin(t)*.5+.5);
export const SCENE_LAYOUT=Object.freeze({panelLeft:20,panelSpan:920,gridInset:12,omenCenterY:302,omenRadiusY:92});
export function scenePanel(game,index){const w=SCENE_LAYOUT.panelSpan/Math.max(1,game.players?.length||1);return {x:SCENE_LAYOUT.panelLeft+index*w,w,cx:SCENE_LAYOUT.panelLeft+(index+.5)*w};}
const panel=(game,p)=>scenePanel(game,slot(p)).cx;
const flash=(p,pattern)=>pattern.test(p.message||'')?clamp(p.flash/.9):0;
const body=p=>({x:finite(p.x,480),y:finite(p.y,390)-28});
function gridPoint(game,p,x,y,n){const cell=Math.min(n===7?43:54,(SCENE_LAYOUT.panelSpan/Math.max(1,game.players?.length||1)-SCENE_LAYOUT.gridInset)/n);return {x:panel(game,p)+(finite(x)+.5-n/2)*cell,y:(n===7?164:166)+(finite(y)+.5)*cell};}
function omenPoint(game,p){const angle=slot(p)*TAU/Math.max(1,game.players?.length||1)-Math.PI/2;return {x:480+Math.cos(angle)*291,y:SCENE_LAYOUT.omenCenterY+Math.sin(angle)*SCENE_LAYOUT.omenRadiusY};}
function watchmanPoint(game,p){const depth=clamp(p.progress/100),perspective=(1-depth)**2*.8+.16;return {x:480+(panel(game,p)+(finite(p.lane,1)-1)*30-480)*perspective,y:423-finite(p.progress)*1.8-23};}

export const LIGHTING_AUDIT=Object.freeze([
 {id:'inkfall',mechanics:'Changing hazard waves, phase dash and near-miss bonus',state:'wave; object positions; cooldown; guard; HIT/THROUGH flash',effect:'Hot impact light and pixel sparks at struck actors; falling gears catch forge light'},
 {id:'mothlight',mechanics:'Limited cargo, rare moths, bank bonuses and roaming theft',state:'carry; banked; BANKED flash; wisp position',effect:'Cargo lights grow with carried moths; banking lights the nest'},
 {id:'sweep',mechanics:'Low jump/high duck trains, express doubles and clear streaks',state:'next; height; express; lastSweep; CLEAR/CLIPPED flash',effect:'Approaching headlamps sweep the platform; clears kick up pixel steam'},
 {id:'rhythm',mechanics:'Instrument selection, accelerating beats and combo rewards',state:'track; lastBeat; combo; PERFECT/GOOD flash',effect:'Successful note strikes light the matching gate and emit pixel pulses'},
 {id:'maze',mechanics:'Timed gates, key/exit routing, phase steps and hidden rune',state:'hasKey; rune; ability; keyTile; exitTile',effect:'Keys open portal lighting; secret runes and phase steps leave restrained glints'},
 {id:'memory',mechanics:'Normal/mirror/reverse sequences and paid hints',state:'sequence; answer; hint; cycle; CORRECT/SPELL flash',effect:'Sequence lantern direction, hint light and successful recall pulses'},
 {id:'redlight',mechanics:'Sprint/stop phases, cover lanes, crouching and alert penalties',state:'green; timer; phase; progress; lane; alert',effect:'Watchman searchlight follows the most exposed traveler and brightens with alert'},
 {id:'tug',mechanics:'Alternating chains, tap pulls, heat, jams and active cooling',state:'heat; jammed; grip; score; PULL flash',effect:'Hoist metal warms with heat; jam sparks and cooling dust respond to controls'},
 {id:'raft',mechanics:'Shifting safe isles, jump/brace, wind and contested sky shards',state:'safe; upcoming; warning; shard; shardTimer; jump',effect:'The active isle and available shard light up; warning and leap dust follow state'},
 {id:'gallery',mechanics:'Aim, tap/charged shots, rotating armor and protected couriers',state:'aim; charge; shot; shotTime; object respawn/open',effect:'Charge glints build at the cannon and a short muzzle flash follows real shots'},
 {id:'fishing',mechanics:'Angular hooking, matching fight direction, reeling and easing tension',state:'hooked; reel; tension; fight; REEL/RELIC flash',effect:'Relic glints track reel progress; tension flicker stays beside the dial'},
 {id:'balance',mechanics:'Wind/lean correction, crossing, bracing and emergency catch',state:'lean; velocity; crossing; prev.down; CAUGHT flash',effect:'Gust dust responds to lean and velocity; a catch briefly lights the bridge'},
 {id:'sorting',mechanics:'Three bins, fragile stamps, express deadlines and combo delivery',state:'stamped; fragile; express; deadline; FRAGILE/SORTED flash',effect:'Stamp and dispatch flashes appear at the parcel; express urgency warms its light'},
 {id:'reaction',mechanics:'Sigil selection, true/false dawns, reaction speed and wagers',state:'signal; signalTime; symbol; answered; wager',effect:'True dawn raises chapel exposure; false dawn gives a brief muted warning'},
 {id:'trace',mechanics:'Ordered drifting stars, focus shield, comets and link combos',state:'comets; prev.action; focus; linkTime; combo',effect:'Comet light moves with actual hazards; focus and fresh links emit distinct pixel cues'},
 {id:'potato',mechanics:'Recipient selection, passing, jinx doubling, timed parries and fuse',state:'holder; fuse; jinx; parry; CURSED/REFLECTED flash',effect:'Held curse flicker accelerates near expiry; curse burst and reflection follow events'},
 {id:'crates',mechanics:'Two marked deliveries, blocked pushes, rotating rooms and limited undo',state:'boxes.delivered; boxes target; level; ONE RELIC/PAIR flash',effect:'Sealed relics light their matching sockets; pair completion releases paper glints'},
 {id:'orbit',mechanics:'Two lanes, reversing, alternating stars and moving thorns',state:'angle; orbitLane; spark; sparkLane; combo; STAR flash',effect:'Moonlight follows the collectible lane; collection glints follow the actor'},
 {id:'cipher',mechanics:'Fading codes, ordered/reversed tumblers, peeking and winding',state:'dial; symbol; reveal; lockClock; CLICK/UNLOCKED flash',effect:'Each accepted tumbler makes a metal glint; low clock and winding change lamp intensity'},
 {id:'shadow',mechanics:'Relic carrying/banking, dash, decoys, pursuit and mist cover',state:'seeker; decoys.life; relics; dash; ALTAR flash',effect:'Keeper light follows pursuit; decoy lights decay with their real remaining lifetime'},
].filter(entry=>!["memory", "tug", "fishing", "balance", "sorting", "reaction", "potato", "crates", "orbit", "cipher"].includes(entry.id)).concat(["bell-breakers", "relic-launch", "hollow-horde", "rift-ball", "spark-heist", "fuse-festival", "tower-relay", "bellows-boxing", "colossus-wake", "rift-rumble", "crown-clash", "meteor-melee", "spire-kings", "gullet-gala"].map(id=>({id,mechanics:id==='gullet-gala'?'Charged gulps, contested physical pellets, suction and burp defense':'Directional attacks, parries, unique specials and physical objective scoring',state:'player flash/attack/specialAnimation; objective positions; charge/bite',effect:'Generated pixel impacts and restrained paper illumination follow actual interactions'}))).map(Object.freeze));

export function sceneLighting(game={}){
 const t=finite(game.time),players=Array.isArray(game.players)?game.players:[],s=game.state||{};
 const palette=paperPalette(game),IVORY=palette.key,COOL=palette.fill,BRONZE=palette.metal,ROSE=palette.fx.hit;
 const profile={palette,ambient:{color:palette.ambient,intensity:.54},key:{x:272,y:75,z:235,color:IVORY,intensity:.92},fill:{x:805,y:350,z:120,color:COOL,intensity:.28},points:[],effects:[]};
 const candidates=[];
 const point=(x,y,intensity,radius=125,color=IVORY,z=62)=>{
  const strength=clamp(intensity,0,2.4);if(strength<.015)return;
  candidates.push({x:clamp(x,-96,1056),y:clamp(y,-60,600),z:clamp(z,12,400),color,intensity:strength,radius:clamp(radius,24,360)});
 };
 const effect=(type,x,y,size,strength=1,progress,rotation=0,color)=>{
  if(strength<=.025||profile.effects.length>=16)return;
  profile.effects.push({type,x:clamp(x,-96,1056),y:clamp(y,-60,600),size:clamp(size,12,110),time:t,alpha:clamp(strength,0,.85),...(Number.isFinite(progress)?{progress:clamp(progress)}:{}),rotation:finite(rotation),color:color||palette.fx[type]||palette.fx.magic});
 };
 const pulse=(p,pattern,type,x,y,size=45,color=IVORY)=>{const strength=flash(p,pattern);if(strength){effect(type,x,y,size,strength,1-strength,0,color);point(x,y,strength*1.45,100,color);}return strength;};
 switch(game.id){
  case 'gullet-gala':{
   profile.key={x:480,y:210,z:220,color:BRONZE,intensity:.95};profile.ambient.intensity=.5;
   for(const p of players){const q=body(p),charge=clamp(p.charge),hit=clamp(p.flash);point(q.x,q.y,.12+charge*.8+hit,100,IVORY);if(hit)effect('magic',q.x,q.y,50,hit,1-hit);if(charge>.2)effect('magic',q.x,q.y,35+charge*25,charge*.45);}
   break;
  }
  case 'bell-breakers':
  case 'relic-launch':
  case 'hollow-horde':
  case 'rift-ball':
  case 'spark-heist':
  case 'fuse-festival':
  case 'tower-relay':
  case 'bellows-boxing':
  case 'colossus-wake':
  case 'rift-rumble':
  case 'crown-clash':
  case 'meteor-melee':
  case 'spire-kings':{
   profile.ambient.intensity=.48;profile.key.intensity=.92;profile.fill.intensity=.3;
   for(const p of players){const q=body(p),hit=clamp(p.flash/.8),attack=clamp(p.attack/.2),special=p.specialAnimation==='active'?1:p.specialAnimation==='windup'?.6:0;
    point(q.x,q.y,.1+hit*.85+attack*.45+special*.8,90+special*75,special?BRONZE:IVORY);
    if(hit&&/^HIT|PARRY|BREAK|GOAL|BANK|POP/.test(p.message||''))effect('hit',q.x,q.y,43,hit,1-hit);
    if(special)effect('magic',q.x,q.y,55+special*18,special*.5,clamp(p.specialProgress));
   }
   const o=s.objective||{},focus=o.boss||o.ball||o.bomb||(o.targets||[]).find(x=>!x.respawn)||(o.dummies||[]).find(x=>x.launched)||(o.foes||[])[0];
   if(focus)point(focus.x,focus.y,.3+(focus.open?.7:0)+(focus.fuse<2?.6:0),125,BRONZE);
   break;
  }

  case 'inkfall':{
   profile.key.color=BRONZE;profile.key.intensity=.82+clamp(s.wave,0,2)*.11;
   for(const p of players){const impact=Math.max(flash(p,/^HIT/),clamp(p.cooldown/.85)*.45),through=flash(p,/^THROUGH/);point(p.x,401,impact*1.8+through*.85,135,impact?BRONZE:IVORY);effect(impact?'hit':'shield',p.x,404,54,Math.max(impact,through),1-Math.max(impact,through),0,BRONZE);}
   for(const o of (s.objects||[]).slice(-2))point(o.x,o.y,clamp((finite(o.y)-280)/170)*.45,85,BRONZE);
   break;
  }
  case 'mothlight':{
   profile.key.color=IVORY;
   for(const p of players){const q=body(p),cargo=clamp(p.carry/9);point(q.x,q.y,.12+cargo*.95,70+cargo*90,IVORY);if(cargo)effect('magic',q.x+18,q.y,26+cargo*22,.12+cargo*.4);const bank=flash(p,/^BANKED/);if(bank){point(480,390,bank*1.9,170,BRONZE);effect('magic',480,389,74,bank,1-bank);}}
   if(s.wisp)point(s.wisp.x,s.wisp.y,.3,76,COOL);break;
  }
  case 'sweep':{
   const until=finite(s.next,t+2)-t,approach=1-clamp(until/1.8),height=s.height==='high'?345:420,y=height-clamp(until/1.8)*200;
   profile.key.x=480;profile.key.y=y-80;profile.key.intensity=.65+approach*.85;profile.ambient.intensity=.48+approach*.12;
   for(const x of [67,893]){point(x,y,.3+approach*1.65,130+approach*100,IVORY);effect('dust',x,y+19,48,approach*.38);}
   for(const p of players){const x=players.length===1?480:150+slot(p)*660/(players.length-1);pulse(p,/^(CLEAR|CLIPPED|DUCK)/,'dust',x,419,48);}
   break;
  }
  case 'rhythm':{
   for(const p of players){const y=183+slot(p)*65,hit=flash(p,/^(PERFECT|GOOD)/);point(242,y,.12+hit*(.95+clamp(p.combo/12)*.8),112,p.track?BRONZE:COOL);if(hit)effect('magic',242,y,50+clamp(p.combo/10)*17,hit,1-hit,0,p.track?BRONZE:COOL);}
   profile.fill.intensity=.2+Math.min(.28,players.reduce((n,p)=>n+flash(p,/^(PERFECT|GOOD)/),0)*.1);break;
  }
  case 'maze':{
   for(const p of players){const q=gridPoint(game,p,p.hasKey?p.exitTile?.x:p.keyTile?.x,p.hasKey?p.exitTile?.y:p.keyTile?.y,7),rune=gridPoint(game,p,2,5,7);point(q.x,q.y,p.hasKey?.87:.25,78,p.hasKey?IVORY:BRONZE);if(p.rune){point(rune.x,rune.y,.62,70,COOL);effect('magic',rune.x,rune.y,27,.34);}pulse(p,/^(PHASE|SECRET RUNE|ESCAPED)/,'magic',q.x,q.y,39);}
   profile.key.intensity=.84+Math.min(.24,players.filter(p=>p.hasKey).length*.06);break;
  }
  case 'memory':{
   const watching=t%6.5<3;
   for(const p of players){const x=panel(game,p),sequence=p.sequence||[],index=Math.min(sequence.length-1,Math.floor((t%6.5)/(3/Math.max(1,sequence.length)))),direction=sequence[index]??0,angle=direction*Math.PI/2-Math.PI/2,recall=flash(p,/^(CORRECT|SPELL COMPLETE)/),hint=clamp(p.hint/.75);point(x+Math.cos(angle)*38,236+Math.sin(angle)*38,watching?.57:.08+recall+hint*.5,85,COOL);if(watching||hint||recall)effect('magic',x,236,43,watching?.2:Math.max(hint*.5,recall),recall?1-recall:undefined);}
   profile.ambient.intensity=watching?.44:.54;break;
  }
  case 'redlight':{
   const target=[...players].sort((a,b)=>finite(b.alert)-finite(a.alert)||slot(a)-slot(b))[0],q=target?watchmanPoint(game,target):{x:480,y:345},alarm=target?clamp(target.alert):0;
   profile.key={x:s.green?400:q.x,y:s.green?80:145,z:245,color:s.green?IVORY:BRONZE,intensity:s.green?.78:1.1+alarm*.55};profile.ambient.intensity=s.green?.58:.4;
   point(q.x,q.y,s.green?.12:.5+alarm*1.2,135+alarm*50,s.green?COOL:IVORY);if(!s.green&&alarm>.15)effect('hit',q.x,q.y-12,28,alarm*.55);break;
  }
  case 'tug':{
   let hottest=0;for(const p of players){const x=panel(game,p),heat=clamp(p.heat);hottest=Math.max(hottest,heat);point(x,173,.17+heat*1.35,100,BRONZE);if(p.jammed>0)effect('hit',x,183,43,clamp(p.jammed/1.5)*.8,1-clamp(p.jammed/1.5));else if(p.prev?.down&&heat>.05)effect('dust',x,199,39,heat*.42);pulse(p,/^PULL/,'magic',x,386-clamp(p.score,0,100)*1.8,35,BRONZE);}profile.key.color=BRONZE;profile.key.intensity=.8+hottest*.45;break;
  }
  case 'raft':{
   const safe=finite(s.safe,2),next=finite(s.upcoming,2),shard=finite(s.shard,4);point(120+safe*180,379,.8,148,IVORY);if(s.shardTimer<=0){point(120+shard*180,352,1.15,94,BRONZE);effect('magic',120+shard*180,352,42,.35);}if(s.warning){point(120+next*180,390,.8+phase(t*8)*.2,115,COOL);effect('magic',120+next*180,390,52,.45);}for(const p of players)if(p.jump>0)effect('dust',p.x,407,44,clamp(p.jump/.68)*.6,1-clamp(p.jump/.68));profile.fill.x=120+safe*180;break;
  }
  case 'gallery':{
   for(const p of players){const x=60+finite(p.aim,.5)*840,y=405+slot(p)*8,charge=clamp(p.charge/.65),shot=Number.isFinite(p.shotTime)?clamp(1-(t-p.shotTime)/.24):0;point(x,y,.1+charge*.72,75,BRONZE);if(charge)effect('magic',x,y-20,25+charge*23,charge*.55);if(shot){point(finite(p.shot,x),295,shot*2.2,220,IVORY);effect('hit',finite(p.shot,x),315,54,shot,1-shot);}}
   break;
  }
  case 'fishing':{
   for(const p of players){const x=panel(game,p),reel=clamp(p.reel),tension=clamp(p.tension);point(x,251,p.hooked?.25+reel*.74+tension*.25:.13,108,p.hooked?IVORY:COOL);if(p.hooked){effect('magic',x-31+reel*62,317,28,.15+reel*.38);if(tension>.7)effect('hit',x+68,330,26,(tension-.7)*1.6);}pulse(p,/^(REEL|RELIC LANDED)/,'magic',x,316,40,BRONZE);}
   break;
  }
  case 'balance':{
   let strain=0;for(const p of players){const x=panel(game,p),gust=clamp(Math.abs(finite(p.lean))*.6+Math.abs(finite(p.velocity))*.2),brace=p.prev?.down?.3:1;strain+=gust;point(x+finite(p.lean)*60,227,.14+gust*.4,115,COOL);effect('dust',x+Math.sign(finite(p.velocity))*24,417,35+gust*25,gust*brace*.58,undefined,finite(p.velocity)<0?Math.PI:0);pulse(p,/^(CAUGHT|CROSSED)/,'shield',x,403,50);}
   profile.fill.intensity=.23+Math.min(.18,strain*.055);profile.key.x=270+Math.sin(t*.7)*80;break;
  }
  case 'sorting':{
   for(const p of players){const x=panel(game,p),urgent=p.express?1-clamp(p.deadline/3):0,stamp=flash(p,/^FRAGILE STAMPED/),sent=flash(p,/^SORTED/);point(x,224,.12+urgent*.55+stamp+sent*.7,95,stamp||urgent?BRONZE:IVORY);if(stamp)effect('hit',x,218,40,stamp,1-stamp);if(sent)effect('magic',x+(finite(p.bin,1)-1)*Math.min(64,SCENE_LAYOUT.panelSpan/Math.max(1,players.length)/3.5),320,43,sent,1-sent);}
   break;
  }
  case 'reaction':{
   const dawn=s.signal==='go',falseDawn=s.signal==='fake',burst=clamp(1-(t-finite(s.signalTime))/1.1),strength=dawn?1.3+burst*.9:falseDawn?.35+burst*.75:.15;
   profile.ambient.intensity=dawn?.75:falseDawn?.38:.43;profile.key={x:480,y:114,z:280,color:dawn?IVORY:falseDawn?ROSE:COOL,intensity:dawn?1.48:falseDawn?.88:.63};point(480,233,strength,230,dawn?BRONZE:falseDawn?ROSE:COOL);if(dawn||falseDawn)effect(dawn?'magic':'hit',480,233,dawn?78:48,burst*.65,1-burst,0,dawn?IVORY:ROSE);break;
  }
  case 'trace':{
   for(const o of (s.comets||[]).slice(0,2)){point(o.x,o.y,.65,92,COOL);effect('dust',o.x-Math.sign(finite(o.vx))*19,o.y,39,.48,undefined,finite(o.vx)<0?Math.PI:0);}
   for(const p of players){const focused=p.prev?.action&&!p.focusExhausted&&p.focus>0,link=p.combo>0?clamp(1-(t-finite(p.linkTime))/ .65):0;if(focused){point(p.x,p.y,.3+clamp(p.focus)*.62,100,IVORY);effect('shield',p.x,p.y-14,59,clamp(p.focus)*.47);}if(link){point(p.x,p.y,link*(1+clamp(p.combo/8)),125,BRONZE);effect('magic',p.x,p.y-12,47,link,1-link);}}
   break;
  }
  case 'potato':{
   const holder=players.find(p=>slot(p)===s.holder)||players[0],urgency=1-clamp(s.fuse/4.2),double=s.jinx===2?1.3:1;
   if(holder){const q=omenPoint(game,holder),flicker=.8+phase(t*(5+urgency*19))*.2;point(q.x+38,q.y-11,(.35+urgency*1.25)*double*flicker,130,urgency>.7?ROSE:BRONZE);if(urgency>.5)effect('magic',q.x+38,q.y-11,35+urgency*16,urgency*.48);}
   for(const p of players){const q=omenPoint(game,p);pulse(p,/^CURSED/,'hit',q.x,q.y-12,78,ROSE);pulse(p,/^REFLECTED/,'shield',q.x,q.y,59,COOL);if(p.parry>0){point(q.x,q.y,.75*clamp(p.parry/.42),92,COOL);effect('shield',q.x,q.y,58,.5*clamp(p.parry/.42));}}
   profile.fill.intensity=.22+urgency*.16;break;
  }
  case 'crates':{
   for(const p of players){for(const box of p.boxes||[]){if(!box.delivered)continue;const q=gridPoint(game,p,box.tx,box.ty,5);point(q.x,q.y,.85,78,box.kind?BRONZE:IVORY);effect('magic',q.x,q.y,28,.3);}pulse(p,/^(ONE RELIC|PAIR COMPLETE)/,'magic',panel(game,p),285,57,BRONZE);}
   break;
  }
  case 'orbit':{
   for(const p of players){const x=panel(game,p),r=Math.min(94,SCENE_LAYOUT.panelSpan/Math.max(1,players.length)*.4),sr=r*(p.sparkLane?.62:1),qx=x+Math.cos(finite(p.spark))*sr,qy=284+Math.sin(finite(p.spark))*sr;point(qx,qy,.42+clamp(p.combo/10)*.48,92,IVORY);const collected=flash(p,/^STAR CHAIN/),pr=r*(p.orbitLane?.62:1);if(collected){const ax=x+Math.cos(finite(p.angle))*pr,ay=284+Math.sin(finite(p.angle))*pr;point(ax,ay,collected*1.4,95,BRONZE);effect('magic',ax,ay,41,collected,1-collected);}}
   profile.key.color=COOL;profile.key.intensity=.76+Math.min(.2,players.reduce((a,p)=>a+finite(p.combo),0)*.012);break;
  }
  case 'cipher':{
   for(const p of players){const x=panel(game,p),urgent=1-clamp(p.lockClock/10),click=flash(p,/^(CLICK|UNLOCKED)/);point(x,278,.18+finite(p.dial)*.16+urgent*.33+click,98,urgent>.7?BRONZE:IVORY);if(click)effect('hit',x+24,266,32,click,1-click);if(p.prev?.down)effect('magic',x,299,28,.25+urgent*.2);}
   break;
  }
  case 'shadow':{
   const seeker=s.seeker||{x:480,y:140};profile.ambient.intensity=.35;profile.key={x:seeker.x,y:seeker.y-100,z:210,color:COOL,intensity:.8};point(seeker.x,seeker.y,.9,145,IVORY);
   for(const decoy of (s.decoys||[]).slice(-3)){const life=clamp(decoy.life/2.1);point(decoy.x,decoy.y,.3+life*.8,100,COOL);effect('magic',decoy.x,decoy.y,47,life*.58,1-life);}
   for(const p of players){if(p.relics>0){const q=body(p);point(q.x,q.y,.2+clamp(p.relics/3)*.56,72,BRONZE);}if(p.dash>0)effect('dust',p.x,p.y-12,42,clamp(p.dash/.23)*.5);const bank=flash(p,/^ALTAR/);if(bank){point(480,402,bank*1.8,150,BRONZE);effect('magic',480,402,60,bank,1-bank);}}
   break;
  }
 }
 // Stable intensity ordering prioritizes real interactions when four travelers
 // produce more lights than the renderer's fixed point-light budget permits.
 profile.points=candidates.map((value,index)=>({value,index})).sort((a,b)=>b.value.intensity-a.value.intensity||a.index-b.index).slice(0,4).map(entry=>entry.value);
 return profile;
}
