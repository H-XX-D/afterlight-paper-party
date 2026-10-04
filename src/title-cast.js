/** The title cast is visual-only: no player, party, or network state is changed. */
export const TITLE_CELEBRATION_DURATION=.88;
export const TITLE_CAST_CHARACTERS=Object.freeze([0,1,2,3]);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const bell=(t,start,end)=>t<=start||t>=end?0:Math.sin(Math.PI*(t-start)/(end-start));
const normalizeCharacter=id=>clamp(Math.floor(finite(id)),0,3);

/**
 * Sample the complete gesture, including its wind-up and settling recoil. These
 * four paths deliberately differ in direction, height, timing, and silhouette.
 * Existing generated special wind-up / peak / recovery frames supply the poses;
 * continuous transforms bridge those frames instead of replacing them with icons.
 */
export function getTitleCelebrationFrame(characterId,elapsed,{reducedMotion=false}={}){
 const id=normalizeCharacter(characterId),t=clamp(finite(elapsed),0,TITLE_CELEBRATION_DURATION),finished=finite(elapsed)>=TITLE_CELEBRATION_DURATION;
 const frame={character:id,facing:-1,finished,elapsed:t,progress:t/TITLE_CELEBRATION_DURATION,phase:'',phaseProgress:0,pose:'idle',dx:0,jump:0,rotation:0,scaleX:1,scaleY:1,land:0,effect:'magic',effectAlpha:0,effectProgress:0,prop:null};
 if(reducedMotion){frame.finished=finite(elapsed)>=.12;frame.effectAlpha=finished?0:.26*(1-clamp(t/.12));return frame;}
 if(finished)return frame;
 const windupEnd=.14,activeEnd=[.47,.58,.48,.63][id],recoveryEnd=.78;
 if(t<windupEnd){frame.phase='windup';frame.phaseProgress=t/windupEnd;frame.pose='special-windup';}
 else if(t<activeEnd){frame.phase='active';frame.phaseProgress=(t-windupEnd)/(activeEnd-windupEnd);frame.pose='special-peak';}
 else if(t<recoveryEnd){frame.phase='recovery';frame.phaseProgress=(t-activeEnd)/(recoveryEnd-activeEnd);frame.pose='special-recovery';}
 const anticipation=bell(t,0,windupEnd),flight=bell(t,windupEnd,activeEnd+.12),recoil=bell(t,activeEnd+.09,recoveryEnd+.06),settle=t>.78?1-smooth((t-.78)/.1):1;
 const flares=bell(t,.17,.73);frame.effectAlpha=clamp(flares*.84);frame.effectProgress=clamp((t-.17)/.56);frame.land=bell(t,activeEnd+.065,activeEnd+.19)*.45;
 if(id===0){ // Pip tucks, springs into a dash-cut, then skids back into place.
  frame.dx=-83*flight;frame.jump=87*flight;frame.rotation=-.19*flight+.11*recoil;
  frame.scaleX=1+.16*anticipation-.1*flight+.08*recoil;frame.scaleY=1-.18*anticipation+.15*flight-.065*recoil;
  frame.effect='dust';
 }else if(id===1){ // Moth opens a broad wing silhouette and rises on a slow gust.
  frame.dx=-18*flight;frame.jump=128*flight;frame.rotation=.085*Math.sin(t*14)*flight;
  frame.scaleX=1+.1*flight+.055*recoil;frame.scaleY=1-.13*anticipation+.095*flight-.045*recoil;
  frame.effect='magic';
 }else if(id===2){ // Bolt compresses, launches a gear-jolt, and rattles to a stop.
  const rattle=Math.sin(t*75)*bell(t,.23,.71);
  frame.dx=-31*flight+7*rattle;frame.jump=46*flight;frame.rotation=-.12*flight+.04*rattle;
  frame.scaleX=1+.2*anticipation+.075*recoil;frame.scaleY=1-.19*anticipation+.07*flight-.06*recoil;
  frame.effect='hit';frame.prop={kind:'gear',dx:-55*flight,dy:-162-29*flight,size:45,rotation:-t*14,alpha:flares};
 }else{ // Wisp floats with a traveling lantern, then folds into a soft landing.
  frame.dx=-37*flight;frame.jump=109*flight;frame.rotation=-.105*Math.sin(t*9)*flight;
  frame.scaleX=1-.085*flight+.05*recoil;frame.scaleY=1-.11*anticipation+.145*flight-.06*recoil;
  frame.effect='magic';frame.prop={kind:'lantern',dx:-71-26*flight,dy:-174-33*flight,size:49,rotation:.14*Math.sin(t*11),alpha:flares};
 }
 frame.dx*=settle;frame.jump*=settle;frame.rotation*=settle;
 frame.scaleX=1+(frame.scaleX-1)*settle;frame.scaleY=1+(frame.scaleY-1)*settle;
 return frame;
}

/** A staggered group leaves every face and foot visible in the right-hand area. */
export function getTitleCastLayout(width=960,height=900){
 const w=Math.max(1,finite(width,960)),h=Math.max(1,finite(height,900)),scale=Math.min(w/960,h/900);
 const groupWidth=960*scale,groupHeight=900*scale,ox=(w-groupWidth)/2,oy=h-groupHeight;
 return [
  {character:0,x:ox+365*scale,y:oy+813*scale,size:263*scale,depth:3},
  {character:1,x:ox+407*scale,y:oy+530*scale,size:274*scale,depth:1},
  {character:2,x:ox+696*scale,y:oy+824*scale,size:239*scale,depth:4},
  {character:3,x:ox+768*scale,y:oy+549*scale,size:276*scale,depth:2},
 ];
}

/** Render with the same original cut-paper helpers used in the playable game. */
export function renderTitleCast(ctx,time,{helpers,celebrationStart=null,reducedMotion=false}={}){
 if(!ctx||typeof helpers?.character!=='function')return {available:false,celebrating:false,finished:true,characters:[]};
 const now=finite(time),celebrating=Number.isFinite(celebrationStart),elapsed=celebrating?Math.max(0,now-celebrationStart):null,layout=getTitleCastLayout(ctx.canvas.width,ctx.canvas.height);
 ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
 // Title artwork is transparent and uses a portrait-sized 2D canvas. Begin sets
 // the shared paper palette; the game's 960×540 deferred GPU finish is unnecessary.
 helpers.beginScene?.(ctx,'world',now);
 const sampled=[];
 for(const item of layout.toSorted((a,b)=>a.depth-b.depth)){
  const frame=celebrating?getTitleCelebrationFrame(item.character,elapsed,{reducedMotion}):{character:item.character,facing:-1,phase:'',phaseProgress:0,dx:0,jump:reducedMotion?0:Math.sin(now*1.4+item.character)*3.5,rotation:reducedMotion?0:Math.sin(now*.8+item.character)*.018,scaleX:1,scaleY:1,land:0,effectAlpha:0,prop:null,finished:true};
  const scale=item.size/[263,274,239,276][item.character],x=item.x+frame.dx*scale,y=item.y;
  sampled.push({...frame,x,y,size:item.size});
  ctx.save();ctx.globalAlpha=.24;ctx.fillStyle='#100d12';ctx.beginPath();ctx.ellipse(item.x+13*scale,item.y+9*scale,item.size*.38,item.size*.07,0,0,Math.PI*2);ctx.fill();ctx.restore();
  helpers.character(ctx,{id:'title-cast-'+item.character,character:item.character,ground:frame.jump>4?-1:0,prev:{}},x,y,item.size,{time:now,facing:-1,jump:frame.jump*scale,rotation:frame.rotation,scaleX:frame.scaleX,scaleY:frame.scaleY,grounded:frame.jump<=4,specialAnimation:frame.phase,specialProgress:frame.phaseProgress,land:frame.land,reducedMotion});
  if(frame.effectAlpha>0){
   const atFeet=frame.effect==='dust';helpers.fx?.(ctx,frame.effect,x-item.size*.2,y-(atFeet?8:item.size*.72)-frame.jump*scale,item.size*(atFeet?.62:.68),now,{progress:frame.effectProgress,alpha:frame.effectAlpha,rotation:-.22});
   if(item.character===1)helpers.fx?.(ctx,'magic',x+item.size*.35,y-item.size*.94-frame.jump*scale,item.size*.46,now,{progress:frame.effectProgress,alpha:frame.effectAlpha*.6,flipX:true});
  }
  if(frame.prop&&frame.prop.alpha>.02){ctx.save();ctx.globalAlpha*=frame.prop.alpha;helpers.prop?.(ctx,frame.prop.kind,x+frame.prop.dx*scale,y-frame.jump*scale+frame.prop.dy*scale,frame.prop.size*scale,frame.prop.rotation);ctx.restore();}
 }
 return {available:true,celebrating,finished:!celebrating||sampled.every(frame=>frame.finished),elapsed,characters:sampled};
}

/** Root owns navigation and RAF; this controller only owns a cast canvas. */
export function createTitleCast(canvas,helpers,{reducedMotion=false}={}){
 const ctx=canvas?.getContext?.('2d');let celebrationStart=null,lastResult=null;
 return {
  draw(time){return lastResult=renderTitleCast(ctx,time,{helpers,celebrationStart,reducedMotion});},
  celebrate(time){celebrationStart=finite(time);return reducedMotion?.12:TITLE_CELEBRATION_DURATION;},
  reset(){celebrationStart=null;lastResult=null;ctx?.clearRect(0,0,canvas.width,canvas.height);},
  setReducedMotion(value){reducedMotion=!!value;},
  get stats(){return {available:!!ctx,celebrationStart,reducedMotion,...(lastResult||{})};},
 };
}
