/** Clock-driven paper puppet animation. Visual memory never touches game state. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const PAPER_CROSSFADE_SECONDS=.085;
export const PAPER_IMPACT_BLEND_SECONDS=.028;
const MOVE_LENGTH={slash:.2,uppercut:.28,spin:.25,dive:.3};
export const PAPER_POSES=Object.freeze(['idle','anticipation','attack-peak','followthrough','special-windup','special-peak','special-recovery','run-contact','run-passing']);
export const MOTION_COLUMNS=Object.freeze({anticipation:0,followthrough:1,'special-windup':2,'special-recovery':3,'run-contact':4,'run-passing':5});
/** Briar's original followthrough branch extends past its nominal grid cell.
 * Correct that specific source rectangle; global connected overflow stays48. */
export function paperMotionCut(character,column,sheetWidth,sheetHeight){
 if(!Number.isInteger(character)||character<0||character>7||!Number.isInteger(column)||column<0||column>5||!Number.isFinite(sheetWidth)||!Number.isFinite(sheetHeight)||sheetWidth<6||sheetHeight<4)throw new RangeError('A traveler, motion column and complete sheet dimensions are required.');
 const width=sheetWidth/6,height=sheetHeight/4;
 return [column*width,character%4*height,width+(character===5&&column===MOTION_COLUMNS.followthrough?32:0),height];
}
/**
 * Measure one hard-bounded atlas cell. Central alpha mass supplies a body baseline,
 * so a tall weapon or a disconnected burst does not resize the entire character.
 */
export function measurePaperCell(image,rect,{includeMask=false,overflow=0}={}){
  const iw=image.width,ih=image.height,data=image.data;
  const nominalX=clamp(Math.floor(rect.x),0,iw-1),nominalY=clamp(Math.floor(rect.y),0,ih-1),nominalWidth=Math.max(1,Math.min(Math.floor(rect.width),iw-nominalX)),nominalHeight=Math.max(1,Math.min(Math.floor(rect.height),ih-nominalY)),margin=clamp(Math.floor(finite(overflow)),0,48);
  const x=Math.max(0,nominalX-margin),y=Math.max(0,nominalY-margin),w=Math.min(iw,nominalX+nominalWidth+margin)-x,h=Math.min(ih,nominalY+nominalHeight+margin)-y;
  const labels=new Int32Array(w*h),queue=new Int32Array(w*h);let component=0,largest=0,largestScore=0;
  for(let pos=0;pos<labels.length;pos++){
    const px=pos%w,py=Math.floor(pos/w);if(labels[pos]||data[((y+py)*iw+x+px)*4+3]<20)continue;
    component++;let tail=1,head=0,mass=0,cx=0;queue[0]=pos;labels[pos]=component;
    while(head<tail){const at=queue[head++],ax=at%w,ay=Math.floor(at/w),alpha=data[((y+ay)*iw+x+ax)*4+3]/255;
      // Select the actor by mass inside its original cell. Expanded framing
      // recovers attached feet/weapons without admitting a neighboring actor.
      if(x+ax>=nominalX&&x+ax<nominalX+nominalWidth&&y+ay>=nominalY&&y+ay<nominalY+nominalHeight){mass+=alpha;cx+=(x+ax-nominalX)*alpha;}
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){if(!ox&&!oy)continue;const nx=ax+ox,ny=ay+oy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const next=ny*w+nx;if(labels[next]||data[((y+ny)*iw+x+nx)*4+3]<20)continue;labels[next]=component;queue[tail++]=next;}
    }
    const score=mass*(1-.3*Math.abs(cx/Math.max(1,mass)-nominalWidth/2)/nominalWidth);if(score>largestScore){largestScore=score;largest=component;}
  }
  const mask=new Uint8Array(w*h);for(let i=0;i<mask.length;i++)if(labels[i]===largest&&largest)mask[i]=1;
  const alpha=(xx,yy)=>mask[yy*w+xx]?data[((y+yy)*iw+x+xx)*4+3]:0;
  let left=w,top=h,right=-1,bottom=-1,weight=0,weightedX=0;const cols=new Float64Array(w);
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const a=alpha(xx,yy);if(a<20)continue;left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);const mass=(a/255)**2;weight+=mass;weightedX+=xx*mass;cols[xx]+=mass;}
  if(right<left)return {x,y,width:w,height:h,anchorX:w/2,anchorY:h,bodyHeight:h,empty:true};
  // The densest central band is more stable than the full-silhouette bounding box.
  const span=right-left+1,coreWidth=Math.max(4,Math.floor(span*.42));let center=weightedX/weight,best=-1;
  for(let cx=Math.max(left,Math.floor(center-span*.2));cx<=Math.min(right,Math.ceil(center+span*.2));cx++){let mass=0;for(let xx=Math.max(left,cx-Math.floor(coreWidth/2));xx<=Math.min(right,cx+Math.floor(coreWidth/2));xx++)mass+=cols[xx];if(mass>best){best=mass;center=cx;}}
  const rows=new Float64Array(h),coreLeft=Math.max(left,Math.floor(center-coreWidth/2)),coreRight=Math.min(right,Math.ceil(center+coreWidth/2));let peak=0;
  for(let yy=top;yy<=bottom;yy++){for(let xx=coreLeft;xx<=coreRight;xx++){const a=alpha(xx,yy)/255;rows[yy]+=a*a;}peak=Math.max(peak,rows[yy]);}
  const threshold=Math.max(1,peak*.14),groups=[];let start=-1,last=-1,mass=0;const maxGap=Math.max(2,Math.floor((bottom-top+1)*.045));
  for(let yy=top;yy<=bottom+maxGap+1;yy++){if(yy<=bottom&&rows[yy]>=threshold){if(start<0)start=yy;last=yy;mass+=rows[yy];}else if(start>=0&&yy-last>maxGap){groups.push({start,end:last,mass});start=-1;mass=0;}}
  groups.sort((a,b)=>b.mass-a.mass);const body=groups[0]||{start:top,end:bottom},bodyHeight=Math.max(1,body.end-body.start+1);
  let footMass=0,footX=0;const footTop=Math.max(body.start,body.end-Math.max(2,Math.floor(bodyHeight*.065)));
  for(let yy=footTop;yy<=body.end;yy++)for(let xx=left;xx<=right;xx++){const a=alpha(xx,yy)/255;if(a>.4){footMass+=a*a;footX+=xx*a*a;}}
  const pad=1,bx=Math.max(0,left-pad),by=Math.max(0,top-pad),bw=Math.min(w-1,right+pad)-bx+1,bh=Math.min(h-1,bottom+pad)-by+1;
  return {...(includeMask?{mask,cellX:x,cellY:y,cellWidth:w,cellHeight:h}:{}),x:x+bx,y:y+by,width:bw,height:bh,anchorX:(footMass?footX/footMass:center)-bx,anchorY:body.end+1-by,bodyTop:body.start-by,bodyCenterX:center-bx,bodyHeight,empty:false};
}
export function referenceBodyHeight(frames){const values=frames.filter(f=>f&&!f.empty).map(f=>f.bodyHeight).sort((a,b)=>a-b);if(!values.length)return 1;const middle=Math.floor(values.length/2);return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;}
/** One idle-derived canonical body size for every source sheet. Source pixels
 * have different resolutions; their measured body height supplies the conversion.
 */
export function normalizePaperFrame(frame,idle){
 const canonical=Math.max(1,finite(idle?.bodyHeight,frame.bodyHeight)),scale=canonical/Math.max(1,finite(frame.bodyHeight));
 return {...frame,normalizedScale:scale,reference:canonical};
}
export function paperFrameGeometry(frame,reference,size){const scale=Math.max(0,finite(size))*finite(frame.normalizedScale,1)/Math.max(1,finite(reference,frame.bodyHeight));return {x:-frame.anchorX*scale,y:-frame.anchorY*scale,width:frame.width*scale,height:frame.height*scale,bodyHeight:frame.bodyHeight*scale,footX:0,footY:0};}
function poseLayers(from,to,blend){
 const weights=new Map();for(const layer of from)weights.set(layer.pose,(weights.get(layer.pose)||0)+layer.alpha*(1-blend));for(const layer of to)weights.set(layer.pose,(weights.get(layer.pose)||0)+layer.alpha*blend);
 const layers=[...weights].map(([pose,alpha])=>({pose,alpha})).filter(layer=>layer.alpha>.001).sort((a,b)=>b.alpha-a.alpha).slice(0,3),total=layers.reduce((sum,layer)=>sum+layer.alpha,0);
 return layers.map(layer=>({...layer,alpha:layer.alpha/Math.max(.0001,total)}));
}
export function createPaperAnimator({crossfade=PAPER_CROSSFADE_SECONDS,reducedMotion=false}={}){
  const states=new Map();let reduced=!!reducedMotion;
  function sample(key,actor={},options={}){
    const time=finite(options.time),x=finite(options.x),y=finite(options.y),idx=clamp(Math.floor(finite(actor.character)),0,7),still=!!options.portrait,frozen=!!options.static&&!still,less=reduced||!!options.reducedMotion;
    const attack=clamp(finite(options.attack,finite(actor.attack)/(MOVE_LENGTH[actor.move]||.2)),0,1),special=options.specialAnimation??actor.specialAnimation??'',specialProgress=clamp(finite(options.specialProgress,actor.specialProgress),0,1),action=!!actor.prev?.action;
    const grounded=options.grounded??(Number.isFinite(actor.ground)?actor.ground>=0:Math.abs(finite(options.vy,actor.vy))<40),moving=!!(options.moving||options.walking||options.walk||(!still&&(actor.prev?.left||actor.prev?.right||Math.abs(finite(actor.vx))>30)));
    const signature=[x,y,attack,special,specialProgress,action,grounded,moving,options.hurt,options.rotation,options.squash,options.land,actor.damage,actor.score,actor.facing,actor.vx,actor.vy,options.facing,options.flip,still,frozen,less].join('|');
    let m=states.get(key);if(m&&time===m.time&&signature===m.signature)return m.output;
    const reset=!m||time<m.time||time-m.time>.5||Math.hypot(x-m.x,y-m.y)>300;
    if(reset){m={time,x,y,attack,action,attackStart:attack>0?time-(1-attack)*(MOVE_LENGTH[actor.move]||.2):-100,grounded,damage:finite(actor.damage),score:finite(actor.score),landAt:-100,hitAt:-100,winAt:-100,pose:'idle',fromLayers:[{pose:'idle',alpha:1}],transitionAt:time,transitionDuration:crossfade,gait:false,stride:idx*.137,strideRate:3.1,sx:1,sy:1,rotation:0,turn:options.facing===-1||options.flip?-1:1,signature:'',output:null};states.set(key,m);}
    if(frozen&&!reset){
      // Impact pauses keep the exact strike silhouette and pause its visual clocks.
      const paused=time-m.time;for(const field of['attackStart','transitionAt','landAt','hitAt','winAt'])m[field]+=paused;
      const output={...m.output,time,footX:x,footY:y-finite(options.jump),static:true};
      Object.assign(m,{time,x,y,signature,output});return output;
    }
    const dt=clamp(time-m.time,0,.08),velocity=dt>0?(x-m.x)/dt:finite(actor.vx),vy=finite(options.vy,finite(actor.vy,dt>0?(y-m.y)/dt:0));
    if(!still){
      if((attack>.02&&m.attack<=.02)||attack>m.attack+.16||(action&&!m.action&&attack<=.02))m.attackStart=time-(attack>0?(1-attack)*(MOVE_LENGTH[actor.move]||.2):0);
      if(grounded&&!m.grounded)m.landAt=time;
      if(finite(actor.damage)>m.damage||(options.hurt&&!m.hurt))m.hitAt=time;
      // Holding an objective earns fractional score every step. That is not a
      // new pickup every frame: only discrete rewards start a brief reaction.
      if(finite(actor.score)-m.score>=.99&&time-m.winAt>.65)m.winAt=time;
    }
    const length=MOVE_LENGTH[actor.move]||.2,elapsed=time-m.attackStart,land=clamp(1-(time-m.landAt)/.28,0,1),hurt=clamp(1-(time-m.hitAt)/.27,0,1),win=clamp(1-(time-m.winAt)/.4,0,1);
    // Accumulate gait phase rather than multiplying wall time by a changing
    // speed tier. Accelerating through a threshold cannot cut the walk cycle.
    const previousRate=m.strideRate,wantedRate=clamp(2.5+Math.abs(velocity)/150,2.5,5.7);m.strideRate+=(wantedRate-m.strideRate)*(1-Math.exp(-12*dt));if(moving)m.stride+=(previousRate+m.strideRate)*.5*dt;
    const cadence=m.stride;
    let desired='idle';
    if(!still){if(special==='windup')desired='special-windup';else if(special==='active')desired='special-peak';else if(special==='recovery')desired='special-recovery';else if(elapsed>=0&&elapsed<.03)desired='anticipation';else if(elapsed>=.03&&elapsed<length*.76)desired='attack-peak';else if(elapsed>=length*.76&&elapsed<length+.15)desired='followthrough';else if(options.hurt||hurt>.35)desired='followthrough';else if(!grounded)desired='run-passing';else if(moving)desired=Math.cos(cadence*Math.PI*2)>=0?'run-contact':'run-passing';}
    if(less&&moving&&!special&&elapsed>=length+.15)desired='idle';
    const gait=!still&&!less&&moving&&grounded&&desired.startsWith('run-');
    if(gait&&m.gait)m.pose=desired;
    else if(desired!==m.pose||gait!==m.gait){m.fromLayers=m.output?.layers||[{pose:m.pose,alpha:1}];m.pose=desired;m.transitionAt=time;m.transitionDuration=['attack-peak','special-peak'].includes(desired)?Math.min(PAPER_IMPACT_BLEND_SECONDS,crossfade):crossfade;}
    if(reset)m.transitionAt=time-Math.max(.001,m.transitionDuration);
    const blend=still||less||reset?1:smooth((time-m.transitionAt)/Math.max(.001,m.transitionDuration));
    const run=moving&&grounded?Math.sin(cadence*Math.PI*2):0,air=!grounded?clamp(Math.abs(vy)/2300,0,.16):0;
    const attackSquash=desired==='anticipation'?.12:desired==='attack-peak'?.07:desired==='followthrough'?-.035:0;
    const specialSquash=special==='windup'?Math.sin(specialProgress*Math.PI*.5)*.13:special==='recovery'?-.06*(1-specialProgress):0;
    const compression=clamp(Math.max(finite(options.land),land*land)*.28+finite(options.squash)+hurt*hurt*.2+attackSquash+specialSquash,-.28,.5);
    let targetX=1+compression-air+(moving?.055*run:0),targetY=1-compression*.72+air+(moving?-.055*run:Math.sin(time*2.8+idx)*.013);
    let rotation=finite(options.rotation)+clamp(velocity/2600,-.13,.13)+(moving?run*.023:Math.sin(time*1.5+idx)*.008)+hurt*hurt*Math.sin((time-m.hitAt)*18)*.105;
    const facing=options.flip||options.facing===-1?-1:options.facing===1?1:finite(actor.facing,1)<0?-1:1;
    if(still||less){targetX=targetY=1;rotation=0;m.sx=m.sy=1;m.rotation=0;m.turn=facing;}else{const ease=1-Math.exp(-22*dt);m.sx+=(targetX-m.sx)*ease;m.sy+=(targetY-m.sy)*ease;m.rotation+=(rotation-m.rotation)*ease;m.turn+=(facing-m.turn)*(1-Math.exp(-28*dt));}
    const turn=Math.abs(m.turn)<.08?.08*Math.sign(m.turn||facing):m.turn;
    const contact=(1+Math.cos(cadence*Math.PI*2))*.5,targetLayers=gait?[{pose:'run-contact',alpha:contact},{pose:'run-passing',alpha:1-contact}]:[{pose:m.pose,alpha:1}],layers=poseLayers(m.fromLayers,targetLayers,blend);
    const output={time,pose:m.pose,layers,sx:clamp(m.sx,.65,1.5),sy:clamp(m.sy,.62,1.4),turn,rotation:clamp(m.rotation,-1.5,1.5),footX:x,footY:y-finite(options.jump),land:still||less?0:land,hurt:still||less?0:hurt,win:still||less?0:win,attack:still?0:attack,specialAnimation:special,specialProgress,static:still||frozen,reducedMotion:less};
    Object.assign(m,{time,x,y,attack,action,grounded,gait,damage:finite(actor.damage),score:finite(actor.score),hurt:!!options.hurt,signature,output});
    if(states.size>256)states.delete(states.keys().next().value);
    return output;
  }
  return {sample,reset(){states.clear();},setReducedMotion(value){reduced=!!value;states.clear();},get size(){return states.size;},get recentActors(){return [...states].filter(([key])=>!String(key).includes('hud:')).slice(-16).map(([key,m])=>({key,time:m.time,win:m.output?.win||0,rewardAt:m.winAt}));}};
}
