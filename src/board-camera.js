/** A shared-state camera: no frame history, wall clock, or party mutation. */
export const BOARD_VIEWPORT = Object.freeze({width:960,height:540});
const DEFAULT_TIMINGS = Object.freeze({play:.48,move:.18,shortcut:.62,transport:1.2,event:1.15});
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const ease=value=>{const t=clamp(value,0,1);return t*t*(3-2*t)};

/** The physical route and the small paper-body motion are sampled together. */
export function sampleBoardTraveler(state,player,{spaces,routePoint,timings=DEFAULT_TIMINGS}){
 const stop=spaces[player.position]||spaces[0],active=state.phase==='board'&&player.id===state.currentPlayerId;
 let x=stop.x,y=stop.y,progress=0,kind='idle',rotation=0,hop=0,scaleX=1,scaleY=1,flip=false;
 const moving=active&&['moving','transport'].includes(state.boardStage);
 if(moving){
  const transport=state.boardStage==='transport'&&state.transport;
  kind=transport?transport.type:state.shortcutTravel?'shortcut':'main';
  const from=transport?transport.from:player.position,to=transport?transport.to:state.moveTarget;
  const duration=transport?timings.transport:state.shortcutTravel?timings.shortcut:timings.move;
  progress=clamp(1-(Number(state.timer)||0)/duration,0,1);
  const p=routePoint(from,to,progress,kind),ahead=routePoint(from,to,Math.min(1,progress+.015),kind);
  x=p.x;y=p.y;flip=ahead.x<x;
  if(kind==='ladder'){
   const step=Math.sin(progress*Math.PI*12),envelope=Math.sin(progress*Math.PI);
   rotation=step*.065*envelope;hop=Math.abs(step)*2*envelope;
   scaleX=1-.065*Math.abs(step)*envelope;scaleY=1+.06*Math.abs(step)*envelope;
  }else if(kind==='chute'){
   const envelope=Math.sin(progress*Math.PI);
   rotation=clamp(Math.atan2(ahead.y-y,Math.abs(ahead.x-x)||.01),-.6,.6)*envelope;
   scaleX=1+.12*envelope;scaleY=1-.16*envelope;hop=-2*envelope;
  }else if(kind==='door'){
   const envelope=Math.sin(progress*Math.PI);hop=envelope*16;
   scaleX=1-.24*envelope;scaleY=1+.1*envelope;rotation=Math.sin(progress*Math.PI*2)*.06;
  }else{
   const envelope=Math.sin(progress*Math.PI);hop=envelope*(kind==='shortcut'?15:9);
   const landing=Math.max(0,(progress-.7)/.3);const squash=Math.sin(landing*Math.PI)*.15;
   scaleX=1-.05*envelope+squash;scaleY=1+.07*envelope-squash*.6;
   rotation=Math.sin(progress*Math.PI*2)*.055;
  }
 }else if(active&&state.boardStage==='event'){
  const duration=state.storyEvent?.dwellDuration||timings.event;
  const age=Math.max(0,duration-(Number(state.timer)||0)),spring=Math.sin(Math.min(1,age/.32)*Math.PI)*Math.exp(-age*4);
  scaleX=1+spring*.16;scaleY=1-spring*.1;
 }
 return {x,y,drawY:y-hop,progress,kind,active,moving,rotation,scaleX,scaleY,flip};
}

/** Cosmetic encounters read authority's endpoints but never move game pieces. */
export function sampleBoardEncounter(state,player,{spaces}){
 const cues=state.boardEncounters?.length?state.boardEncounters:[state.boardEncounter];
 const cue=[...cues].reverse().find(event=>event&&(event.playerId===player.id||event.targetIds?.includes(player.id))&&(state.clock||0)-event.startedAt>=0&&(state.clock||0)-event.startedAt<(event.duration||1.2));
 if(!cue)return null;
 const age=(state.clock||0)-cue.startedAt,progress=clamp(age/(cue.duration||1.2),0,1),pulse=Math.sin(progress*Math.PI);
 const move=cue.moves?.find(move=>move.playerId===player.id),motion={type:cue.type,progress,rotation:Math.sin(progress*Math.PI*3)*.1*(1-progress),hop:pulse*7,scaleX:1+pulse*.1,scaleY:1-pulse*.06,blocked:!!move?.blocked};
 if(move&&!move.blocked){
  const from=spaces[move.from],to=spaces[move.to],t=clamp(age/.8,0,1),flight=1-(1-t)**3;
  motion.x=from.x+(to.x-from.x)*flight;motion.y=from.y+(to.y-from.y)*flight;
  motion.hop=Math.sin(t*Math.PI)*23;motion.rotation=Math.sin(t*Math.PI*2)*.44;
 }else if(move?.blocked){motion.rotation=Math.sin(age*48)*.12*(1-progress);motion.hop=0;}
 return motion;
}

/**
 * Follow the same route as the traveler. Playback starts and finishes at the
 * overview, so a different player taking their turn never causes a camera cut.
 * Clamped centers guarantee the transformed backdrop covers every screen edge.
 */
export function boardCamera(state,{spaces,routePoint,timings=DEFAULT_TIMINGS,width=960,height=540,overview=false,portrait=false,visibleWidth=320,maxZoom=1.7}){
 const home={x:width/2,y:height/2},player=state.players?.find(p=>p.id===state.currentPlayerId)||state.players?.[state.turnIndex];
 const traveler=player?sampleBoardTraveler(state,player,{spaces,routePoint,timings}):null;
 let weight=0;
 if(!overview&&state.phase==='board'&&traveler){
  if(state.boardStage==='playing-card')weight=ease(1-(Number(state.timer)||0)/timings.play);
  else if(['moving','transport','choose-path','choose-event'].includes(state.boardStage))weight=1;
  else if(state.boardStage==='event'){
   const duration=state.storyEvent?.dwellDuration||timings.event;
   const elapsed=clamp(duration-(Number(state.timer)||0),0,duration),pullback=Math.min(.66,duration*.6);
   weight=1-ease((elapsed-(duration-pullback))/pullback);
  }
 }
 const portraitFollow=portrait&&!overview&&state.phase==='board'&&!!traveler;
 const baseZoom=portraitFollow?1.2:1,zoom=baseZoom+(clamp(maxZoom,baseZoom,1.8)-baseZoom)*weight;
 const focus=traveler?{x:traveler.x,y:traveler.y-30}:home;
 // In cover mode only the central crop is visible. Bound that crop rather
 // than the off-screen sides of the landscape, so edge tokens remain visible.
 const follow=portraitFollow?1:weight,cropWidth=portraitFollow?clamp(visibleWidth,180,width):width;
 const centerX=clamp(home.x+(focus.x-home.x)*follow,cropWidth/(2*zoom),width-cropWidth/(2*zoom));
 const centerY=clamp(home.y+(focus.y-home.y)*follow,height/(2*zoom),height-height/(2*zoom));
 return {zoom,centerX,centerY,tx:home.x-centerX*zoom,ty:home.y-centerY*zoom,focus,weight,stage:state.boardStage,playerId:player?.id??null};
}
