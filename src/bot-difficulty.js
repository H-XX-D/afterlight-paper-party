/** Human-scale bot controls. This layer delays and imperfectly interprets
 * decisions; it never changes a player's score, physics or hidden card data.
 * Its tiny control stream is public JSON so prediction and host replay agree.
 */
export const BOT_DIFFICULTIES=Object.freeze({
 easy:Object.freeze({reaction:.23,reactionJitter:.075,cadence:.125,cadenceJitter:.035,miss:.34,lapse:.14,wrongTurn:.075,aim:25,timing:.13,planningMistake:.55}),
 medium:Object.freeze({reaction:.125,reactionJitter:.035,cadence:.07,cadenceJitter:.018,miss:.13,lapse:.055,wrongTurn:.025,aim:12,timing:.07,planningMistake:.22}),
 hard:Object.freeze({reaction:.072,reactionJitter:.02,cadence:.045,cadenceJitter:.009,miss:.055,lapse:.02,wrongTurn:.009,aim:6,timing:.035,planningMistake:.09}),
});
export const BOT_CONTROL_LIMITS=Object.freeze({queue:8});
const KEYS=['left','right','up','down','action','special'],ACTION=16,SPECIAL=32;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const maskOf=i=>KEYS.reduce((mask,key,index)=>mask|(i?.[key]?1<<index:0),0);
const inputOf=mask=>Object.fromEntries(KEYS.map((key,index)=>[key,!!(mask&(1<<index))]));
function hash(seed,text){let n=(seed>>>0)^0xa511e9b3;for(const char of text)n=Math.imul(n^char.charCodeAt(0),16777619);n^=n>>>16;return n>>>0||1;}
function random(brain){let x=brain.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;brain.rng=x>>>0;return brain.rng/4294967296;}
export function normalizeBotDifficulty(level='medium'){const key=typeof level==='string'?level.trim().toLowerCase():'';return Object.hasOwn(BOT_DIFFICULTIES,key)?key:'medium';}
export function botDifficultyProfile(g){return BOT_DIFFICULTIES[normalizeBotDifficulty(g?.botDifficulty)];}
function brainFor(g,p){
 if(!p.botBrain){const brain={rng:hash(g.botSeed||g.rng,`${g.id}:${p.id}:${p.slot}`),nextAt:0,queue:[],held:0,observed:0,suppressUntil:0,errorX:0,errorY:0,decisions:0,missedActions:0,lapses:0,wrongTurns:0,delivered:0,reactionTotal:0};
  brain.errorX=random(brain)*2-1;brain.errorY=random(brain)*2-1;p.botBrain=brain;
 }
 return p.botBrain;
}
/** Native constructors may omit options for old physical-core fixtures.
 * Production createGame always passes an explicit normalized level. */
export function configureBotDifficulty(g,options,seed=g.rng){
 if(options===undefined)return g;
 g.botDifficulty=normalizeBotDifficulty(typeof options==='string'?options:options?.difficulty);g.botSeed=seed>>>0||1;
 for(const p of g.players)if(p.bot)brainFor(g,p);return g;
}
function settings(g,mode){
 const p=botDifficultyProfile(g),factor=mode==='precision'?.28:mode==='grid'?.48:mode==='timing'?.19:1;
 const cadence=mode==='timing'?Math.min(.034,p.cadence*.33):mode==='precision'?p.cadence*.5:mode==='grid'?p.cadence*.7:p.cadence;
 return {...p,reaction:p.reaction*factor,reactionJitter:p.reactionJitter*factor,cadence,cadenceJitter:p.cadenceJitter*(mode==='movement'?1:.35)};
}
/** Converts desired buttons into delayed decisions. The latest observation is
 * held between decisions; reaction delays cannot reverse queue order. */
export function botControl(g,p,intent,dt=1/60,mode='movement'){
 if(!g.botDifficulty)return intent;
 const brain=brainFor(g,p),profile=settings(g,mode),now=g.time;
 if(now+1e-8>=brain.nextAt){
  let mask=maskOf(intent);const rising=(mask&(ACTION|SPECIAL))&~brain.observed;
  if(rising&&random(brain)<profile.miss){brain.suppressUntil=now+.1+profile.reaction;brain.missedActions++;}
  if(now<brain.suppressUntil)mask&=~(ACTION|SPECIAL);
  if(random(brain)<profile.lapse){mask&=~15;brain.lapses++;if(mode==='timing')mask&=~ACTION;}
  if(mode!=='timing'&&random(brain)<profile.wrongTurn&&(mask&3)){
   mask=(mask&~3)|((mask&1)?2:1);brain.wrongTurns++;
  }
  const delay=Math.max(.016,profile.reaction+(random(brain)*2-1)*profile.reactionJitter),last=brain.queue.at(-1)?.at??0;
  brain.queue.push({at:Math.max(now+delay,last+.001),mask});if(brain.queue.length>BOT_CONTROL_LIMITS.queue)brain.queue.shift();
  brain.decisions++;brain.reactionTotal+=delay;brain.observed=maskOf(intent);
  brain.nextAt=now+Math.max(.016,profile.cadence+(random(brain)*2-1)*profile.cadenceJitter);
  brain.errorX=brain.errorX*.35+(random(brain)*2-1)*.65;brain.errorY=brain.errorY*.35+(random(brain)*2-1)*.65;
 }
 while(brain.queue.length&&brain.queue[0].at<=now+1e-8){brain.held=brain.queue.shift().mask;brain.delivered++;}
 return inputOf(brain.held);
}
/** No exact moving-target aim: bots steer toward an imperfect visible estimate.
 * Precision tools use smaller errors because their paper channels are narrow. */
export function botTarget(g,p,target,mode='movement'){
 if(!g.botDifficulty||!p.bot||!target)return target;
 const brain=brainFor(g,p),profile=botDifficultyProfile(g),scale=mode==='precision'?.19:1;
 return {...target,x:target.x+brain.errorX*profile.aim*scale,y:target.y+brain.errorY*profile.aim*scale*.6};
}
/** Stable per-opportunity timing variation does not consume either RNG. */
export function botTimingOffset(g,p,opportunity){
 if(!g.botDifficulty)return 0;
 const n=hash(g.botSeed||1,`${g.id}:${p.id}:${opportunity}`),unit=(n/4294967296)*2-1;
 return unit*botDifficultyProfile(g).timing;
}
/** Planning uses a bounded noisy ranking, rather than always selecting a
 * hypothetical perfect outcome. The decision is stable until the board changes. */
export function botRankedChoice(g,p,count,opportunity=0){
 if(count<2||!g.botDifficulty)return 0;
 const chance=hash(g.botSeed||1,`${g.id}:${p.id}:choice:${opportunity}`)/4294967296,profile=botDifficultyProfile(g);
 if(chance>=profile.planningMistake)return 0;
 const breadth=g.botDifficulty==='easy'?5:g.botDifficulty==='medium'?3:2;
 return 1+Math.floor(hash(g.botSeed||1,`${g.id}:${p.id}:rank:${opportunity}`)/4294967296*Math.min(count-1,breadth-1));
}
export function botDifficultyDiagnostics(g){
 const level=g.botDifficulty?normalizeBotDifficulty(g.botDifficulty):'legacy';
 return Object.freeze({difficulty:level,bots:Object.freeze(g.players.filter(p=>p.bot).map(p=>{
  const b=p.botBrain;return Object.freeze({id:p.id,decisions:b?.decisions||0,missedActions:b?.missedActions||0,lapses:b?.lapses||0,wrongTurns:b?.wrongTurns||0,delivered:b?.delivered||0,queued:b?.queue.length||0,meanReaction:b?.decisions?b.reactionTotal/b.decisions:0});
 }))});
}
