import {selectCharacterBanter,CHARACTER_BANTER} from './character-banter.js';
export const BANTER_STATS=Object.freeze({total:CHARACTER_BANTER.reduce((sum,c)=>sum+c.lineCount,0),characters:Object.freeze(CHARACTER_BANTER.map(c=>Object.freeze({id:c.character,name:c.name,lines:c.lineCount})))});
const find=(state,id)=>state.players?.find(p=>p.id===id);
const next=(state,id)=>{const order=state.turnOrder||state.players.map(p=>p.id),i=order.indexOf(id);return find(state,order[(i+(state.turnDirection||1)+order.length)%order.length]);};
/** Public, serialised board outcomes alone choose who speaks. Private cards are
 * never examined, and the presentation cannot alter scoring or movement. */
export function boardBanterCue(state,event){
 if(!event||!Number.isSafeInteger(event.serial)||event.serial<1)return null;
 let speaker=find(state,event.id),rival=find(state,event.targetId),category='',tone='neutral';
 if(!speaker)return null;
 if(event.type==='card'){
  rival ||= next(state,speaker.id);
  if(event.buff==='shuffle'){category='shuffle';tone='good';}
  else if(event.pendingDraw>0){category='stack';tone='good';}
  else if(event.chained){category='chain';tone='good';}
  else if(event.buff){category='pad-buff';tone='good';}
  else if(event.penalty){[speaker,rival]=[rival,speaker];category='draw-penalty';tone='bad';}
  else{category=event.cardValue==='skip'?'skip':event.cardValue==='reverse'?'reverse':'play';tone=category==='play'?'neutral':'good';}
 }else if(event.type==='draw'){category=event.penalty>0?'draw-penalty':'draw';tone='bad';}
 else if(event.type==='mischief'){
  const effects=event.effects||[],taken=effects.find(e=>e.playerId!==speaker.id&&e.type==='points'&&e.amount<0);
  if(taken)rival=find(state,taken.playerId);
  const points=effects.filter(e=>e.playerId===speaker.id&&e.type==='points').reduce((n,e)=>n+e.amount,0);
  category=effects.some(e=>e.playerId===speaker.id&&e.type==='card-buff')?'pad-buff':points<0?'pad-bad':'pad-good';tone=points<0?'bad':'good';
 }
 else if(event.type==='ladder'){category='ladder';tone='good';}
 else if(event.type==='chute'){category='chute';tone='bad';}
 else if(event.type==='shortcut'){category='shortcut';tone='good';}
 else if(event.type==='lap'){category='lap';tone='good';}
 else if(event.type==='encounter'){
  rival=find(state,event.targetIds?.[0]);
  category=event.kind==='high-five'?'pass':event.blockedIds?.includes(rival?.id)?'bump-blocked':'bump-hit';tone=category==='bump-blocked'?'bad':'good';
 }else if(event.type==='winner'){
  speaker=find(state,event.finisherId);rival=find(state,event.id);if(!speaker)return null;
  const won=speaker.id===event.id;category=won?'finish-good':'finish-bad';tone=won?'good':'bad';
  if(rival.id===speaker.id)rival=next(state,speaker.id);
 }else return null;
 rival ||= next(state,speaker.id);
 return Object.freeze({eventId:'board-'+event.serial,serial:event.serial,type:event.type,category,tone,speakerId:speaker.id,rivalId:rival?.id,moverId:event.id,at:event.at??state.clock});
}

export function createBoardDialogue(){
 let observed=0,current=null,startedAt=0;const history=[],previous=new Map();
 function line(player,cue,role,tone){
  if(!player)return null;const key=player.id+':'+role,result=selectCharacterBanter({character:player.character,category:cue.category,eventId:cue.eventId,eventOrdinal:cue.serial,role,tone,previousKey:previous.get(key)});
  if(result)previous.set(key,result.key);return result;
 }
 return {
  reset(){observed=0;current=null;startedAt=0;history.length=0;previous.clear();},
  sample(state,localId,now){
   const incoming=(state.history||[]).filter(e=>e.serial>observed);observed=Math.max(observed,state.eventSerial||0,...incoming.map(e=>e.serial));
   const cues=incoming.map(e=>boardBanterCue(state,e)).filter(c=>c&&(state.clock-c.at)<4);
   if(cues.length){
    // A final outcome, encounter or transport takes precedence over its card in
    // the same snapshot; single-frame batches still preserve specific feedback.
    const rank=c=>({winner:6,lap:5,encounter:4,mischief:3,ladder:3,chute:3,shortcut:2,card:1,draw:1}[c.type]||0);
    const cue=cues.toSorted((a,b)=>rank(a)-rank(b)||a.serial-b.serial).at(-1),speaker=find(state,cue.speakerId),rival=find(state,cue.rivalId);
    current={...cue,actorLine:line(speaker,cue,'actor',cue.tone),rivalLine:line(rival,cue,'rival',cue.tone==='bad'?'bad':'good')};startedAt=now;
    history.push({eventId:cue.eventId,serial:cue.serial,type:cue.type,category:cue.category,speakerId:cue.speakerId,rivalId:cue.rivalId});if(history.length>24)history.shift();
   }
   const me=find(state,localId),active=find(state,state.currentPlayerId)||state.players[state.turnIndex],age=now-startedAt,visible=!!current&&age>=0&&age<3.4;
   let right=active?.id!==localId?active:next(state,localId),leftLine=null,rightLine=null,leftTone='neutral',rightTone='neutral';
   if(visible){
    const speaker=find(state,current.speakerId),rival=find(state,current.rivalId);
    if(speaker.id===localId){right=rival;leftLine=current.actorLine;leftTone=current.tone;if(age>.62){rightLine=current.rivalLine;rightTone=current.tone==='bad'?'good':'bad';}}
    else if(rival?.id===localId){right=speaker;rightLine=current.actorLine;rightTone=current.tone;if(age>.62){leftLine=current.rivalLine;leftTone=current.tone==='bad'?'good':'bad';}}
    else{right=speaker;rightLine=current.actorLine;rightTone=current.tone;}
   }
   const pack=(player,reaction,dialogue)=>player?{id:player.id,name:player.name,character:player.character,reaction,text:dialogue?.text||'',lineKey:dialogue?.key||'',moving:player.id===state.currentPlayerId&&['moving','transport'].includes(state.boardStage)}:null;
   return {current:visible?{...current,age}:null,left:pack(me,leftTone,leftLine),right:pack(right,rightTone,rightLine),history:[...history]};
  },
 };
}
/** Project a physical ring point through the same cover/contain canvas and
 * board camera transform. Returned values are viewport pixels for card flight. */
export function projectRingAnchor(rect,camera={zoom:1,tx:0,ty:0},{x=480,y=285,cover=true}={}){
 const scale=(cover?Math.max:Math.min)(rect.width/960,rect.height/540),sx=x*camera.zoom+camera.tx,sy=y*camera.zoom+camera.ty;
 return {x:rect.left+(rect.width-960*scale)/2+sx*scale,y:rect.top+(rect.height-540*scale)/2+sy*scale,scale};
}
