import {paperPalette} from './paper-palette.js';

/** Environmental cutouts are visual scenery, never platforms or hit boxes. */
export const PAPER_ENVIRONMENT_KINDS=Object.freeze(['arch','ruinedtower','foldedpine','foldedmushrooms','hangingbridge','waterfall','lantern','turninggear','origamimoth','foldedcloud','accordioncrystal','foldedflowers']);
export const PAPER_ENVIRONMENT_CUTS=Object.freeze([[0,0,396,370],[397,0,345,370],[742,0,335,370],[1077,0,371,370],[0,370,390,371],[390,370,352,371],[742,370,335,371],[1077,370,371,371],[0,741,470,345],[403,741,384,345],[787,741,300,345],[1087,741,361,345]].map(Object.freeze));
export const PAPER_ENVIRONMENT_SCENES=Object.freeze(['world','inkfall','mothlight','sweep','rhythm','maze','redlight','raft','gallery','trace','shadow','bell-breakers','relic-launch','hollow-horde','rift-ball','spark-heist','fuse-festival','tower-relay','bellows-boxing','colossus-wake','rift-rumble','crown-clash','meteor-melee','spire-kings','gullet-gala','clockwork-surgery','tottering-tower']);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const TAU=Math.PI*2;
const hash=value=>{let seed=2166136261;for(const character of String(value)){seed^=character.charCodeAt(0);seed=Math.imul(seed,16777619);}return seed>>>0;};
const fraction=(seed,offset)=>{let x=(seed+Math.imul(offset+1,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;return(x>>>0)/4294967296;};
const SCENE_SEEDS=new Map(PAPER_ENVIRONMENT_SCENES.map(id=>[id,hash(id)]));
const THEMES=Object.freeze({ivory:['arch','ruinedtower','foldedflowers'],sage:['foldedpine','foldedmushrooms','foldedflowers'],copper:['ruinedtower','arch','turninggear'],violet:['arch','accordioncrystal','foldedmushrooms'],frost:['accordioncrystal','ruinedtower','foldedpine']});

/** Only public animation cues are admitted; hands and input histories are ignored. */
export function paperEnvironmentResponse(time,context={},lighting=null){
 const t=finite(time),decay=(cue,duration)=>cue&&Number.isFinite(cue.startedAt)&&t>=cue.startedAt?clamp(1-(t-cue.startedAt)/duration):0;
 let celebration=Math.max(decay(context.lapCelebration,2.8),decay(context.storyEvent,3),decay(context.padEvent,2.6)),impact=decay(context.boardEncounter,1.2),play=Number.isFinite(context.lastCardPlayedAt)&&t>=context.lastCardPlayedAt?clamp(1-(t-context.lastCardPlayedAt)/1.15):0;
 const players=Array.isArray(context.players)?context.players:[];
 for(const player of players){impact=Math.max(impact,clamp(player.flash));if(player.specialAnimation==='active')celebration=Math.max(celebration,.55);}
 for(const effect of Array.isArray(lighting?.effects)?lighting.effects:[]){const alpha=clamp(effect.alpha);if(effect.type==='hit')impact=Math.max(impact,alpha);else if(effect.type==='magic')celebration=Math.max(celebration,alpha*.6);}
 return {celebration:clamp(celebration),impact:clamp(impact),play:clamp(play),energy:clamp(Math.max(celebration,impact*.65,play*.75))};
}

/** Small architecture stacks for the reusable 3D stage, outside its play plane. */
export function getPaperEnvironmentModels(sceneId='world'){
 const id=SCENE_SEEDS.has(sceneId)?sceneId:'world',seed=SCENE_SEEDS.get(id),palette=paperPalette(id),kinds=THEMES[palette.id];
 return [
  {kind:kinds[0],x:-18.8,y:-3.1,z:1.6,width:3.1,height:7.2,phase:fraction(seed,1)*TAU,side:-1},
  {kind:kinds[1],x:18.9,y:-3.2,z:.3,width:3.7,height:kinds[1]==='foldedmushrooms'?4.1:7.6,phase:fraction(seed,2)*TAU,side:1},
  {kind:'hangingbridge',x:-13.5,y:3.6,z:-10.8,width:4.4,height:1.6,phase:fraction(seed,3)*TAU,side:-1},
  {kind:kinds[2],x:17.4,y:-3.3,z:4.2,width:2.1,height:2.6,phase:fraction(seed,4)*TAU,side:1},
 ];
}

/**
 * A deterministic clock and public cues drive flapping moths, swinging lanterns,
 * turning gears, hinged flowers, drifting clouds, and flowing paper falls.
 * Positions stay in the sky or outer scenery; the central action lane is clear.
 */
export function getPaperEnvironmentPlan(sceneId='world',time=0,{context={},lighting=null,reducedMotion=false}={}){
 const id=SCENE_SEEDS.has(sceneId)?sceneId:'world',seed=SCENE_SEEDS.get(id),t=finite(time),palette=paperPalette(id),phase=fraction(seed,0)*TAU,response=paperEnvironmentResponse(t,context,lighting),motion=reducedMotion?0:1,energy=response.energy;
 const pieces=[],effects=[],add=(kind,x,y,width,height,options={})=>pieces.push({kind,x,y,width,height,rotation:0,scaleX:1,scaleY:1,fold:.12,alpha:1,layer:'behind-actors',...options});
 for(const side of[-1,1]){
  const p=phase+side*1.4,sy=Math.sin(t*.72+p),swing=Math.sin(t*.9+p);
  add('lantern',side<0?57:903,218+sy*5*motion,35,78,{rotation:swing*.14*motion,fold:.14+energy*.08,alpha:.64+energy*.13});
  add('foldedcloud',side<0?174:787,94+Math.sin(t*.23+p)*9*motion,125,54,{scaleX:1+Math.sin(t*.19+p)*.025*motion,rotation:Math.sin(t*.17+p)*.025*motion,alpha:.44,fold:.08});
 }
 const isWorkshop=palette.id==='copper',isCold=palette.id==='frost',isNight=palette.id==='violet';
 if(isWorkshop){
  add('turninggear',43,350,103,103,{rotation:(t*.37+phase)*motion,fold:.19,alpha:.9});
  add('turninggear',921,338,88,88,{rotation:-(t*.46+phase)*motion,fold:.18,alpha:.82});
 }else if(isCold||id==='world'){
  // The illustrated waterfall is cut into four overlapping pleats by the helper.
  add('waterfall',926,477,77,190,{scaleY:1+Math.sin(t*1.15+phase)*.026*motion,fold:.11+Math.sin(t*.67+phase)*.035*motion,alpha:.66});
 }else{
  for(const side of[-1,1])add(isNight?'accordioncrystal':'foldedflowers',side<0?32:929,495,isNight?85:112,isNight?146:101,{rotation:Math.sin(t*.61+phase+side)*.06*motion,scaleY:1+Math.sin(t*1.2+phase+side)*.027*motion,fold:.13+energy*.12,alpha:.92});
 }
 const flyProgress=(t*.035+fraction(seed,8))%1,flyX=96+768*flyProgress,flyY=132+Math.sin(t*.48+phase)*31;
 add('origamimoth',motion?flyX:184,motion?flyY:142,56+energy*13,46+energy*11,{rotation:Math.sin(t*.48+phase)*.16*motion,scaleX:1-Math.abs(Math.sin(t*7.4+phase))*.34*motion,fold:.08+Math.abs(Math.sin(t*7.4+phase))*.3*motion,alpha:.78});
 if(!reducedMotion&&energy>.025){
  // Small paper glints follow the lamps and moth, never a screen-sized overlay.
  for(const x of[77,883])effects.push({type:response.impact>response.celebration?'dust':'magic',x,y:174,size:30+energy*24,alpha:energy*.26,progress:(t*.9+phase/TAU)%1,color:palette.fx.magic});
 }
 if(reducedMotion)for(const piece of pieces){piece.rotation=0;piece.scaleX=piece.scaleY=1;piece.fold=.12;}
 return {id,time:t,palette:palette.id,response,pieces,effects,models:getPaperEnvironmentModels(id),geometryOnly:false};
}

/** Remove generation chroma-key fringe pixels, preserving muted printed colors. */
export function cleanPaperEnvironmentPixels(source){
 if(!source||source.length%4)throw new RangeError('A complete RGBA environment cell is required');
 const out=new Uint8ClampedArray(source);
 for(let i=0;i<out.length;i+=4){const r=out[i],g=out[i+1],b=out[i+2],marker=(r>220&&g<90&&b<100)||(r>220&&b>190&&g<100)||(r>220&&g>220&&b<110);if(marker)out[i+3]=0;}
 return out;
}

/** Root calls this immediately after the background, before playable objects. */
export function drawPaperEnvironment(ctx,sceneId,time,helpers,options={}){
 const plan=getPaperEnvironmentPlan(sceneId,time,options);
 if(typeof helpers?.environmentPiece!=='function')return {...plan,available:false,drawn:0};
 ctx.save();
 for(const piece of plan.pieces){ctx.save();ctx.globalAlpha*=piece.alpha;helpers.environmentPiece(ctx,piece.kind,piece.x,piece.y,piece.width,piece.height,{rotation:piece.rotation,scaleX:piece.scaleX,scaleY:piece.scaleY,fold:piece.fold,alpha:1,palette:plan.palette,time:plan.time});ctx.restore();}
 for(const effect of plan.effects)helpers.fx?.(ctx,effect.type,effect.x,effect.y,effect.size,plan.time,{progress:effect.progress,alpha:effect.alpha,color:effect.color});
 ctx.restore();return {...plan,available:true,drawn:plan.pieces.length};
}

/** Larger near-camera paper wings overlap the outer edge of the stage. They
 * move more than the distant scenery, while leaving actors and objectives clear.
 */
export function getPaperForegroundPlan(sceneId='world',time=0,{context={},lighting=null,reducedMotion=false}={}){
 const id=SCENE_SEEDS.has(sceneId)?sceneId:'world',seed=SCENE_SEEDS.get(id),palette=paperPalette(id),t=finite(time),phase=fraction(seed,12)*TAU,response=paperEnvironmentResponse(t,context,lighting),motion=reducedMotion?0:1;
 const kinds=THEMES[palette.id],sway=Math.sin(t*.43+phase)*motion,breath=Math.sin(t*.7+phase)*motion;
 const pieces=[
  {kind:kinds[0],x:-42+sway*6,y:550,width:176,height:240,rotation:sway*.018,fold:.18+response.energy*.09,alpha:.94},
  {kind:kinds[1],x:1005-sway*7,y:552,width:190,height:palette.id==='sage'?175:263,rotation:-sway*.022,fold:.22+response.energy*.08,alpha:.94},
  {kind:kinds[2],x:43+breath*3,y:562,width:137,height:83,rotation:breath*.025,fold:.2+response.energy*.11,alpha:.98},
  {kind:'foldedflowers',x:925-breath*3,y:564,width:136,height:84,rotation:-breath*.025,fold:.17+response.energy*.09,alpha:.96},
 ];
 return {id,time:t,palette:palette.id,response,pieces:pieces.map(piece=>({...piece,rotation:piece.rotation||0,layer:'foreground',scaleX:1,scaleY:1})),layer:'after-actors-before-hud'};
}

export function drawPaperForeground(ctx,sceneId,time,helpers,options={}){
 const plan=getPaperForegroundPlan(sceneId,time,options);
 if(typeof helpers?.environmentPiece!=='function')return {...plan,available:false,drawn:0};
 ctx.save();
 for(const piece of plan.pieces)helpers.environmentPiece(ctx,piece.kind,piece.x,piece.y,piece.width,piece.height,{rotation:piece.rotation,fold:piece.fold,alpha:piece.alpha,palette:plan.palette,time:plan.time});
 ctx.restore();return {...plan,available:true,drawn:plan.pieces.length};
}

/** Split a printed solid at crease ridges, so its lighting exposes actual facets. */
export function foldPaperTriangles(data,{crease=.15,center=0}={}){
 const p=data?.positions,uv=data?.uv;if(!p||p.length%3||!uv||uv.length/2!==p.length/3||!Number.isFinite(crease)||crease<0||crease>.5||!Number.isFinite(center)||Math.abs(center)>.22)throw new RangeError('Complete finite positions, UVs and bounded crease dimensions are required');
 if([...p,...uv].some(v=>!Number.isFinite(v)))throw new RangeError('Finite printed geometry is required');
 const sourceIndices=data.indices||Uint32Array.from({length:p.length/3},(_,i)=>i),knots=[-.5,center-.23,center,center+.23,.5].sort((a,b)=>a-b),heights=[0,crease*.15,crease,crease*.15,0],positions=[],textureUV=[],indices=[],groups=[];
 const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 const clip=(poly,bound,inside)=>{const out=[];for(let n=0;n<poly.length;n++){const a=poly[n],b=poly[(n+1)%poly.length],ai=inside(a[0],bound),bi=inside(b[0],bound);if(ai)out.push(a);if(ai!==bi)out.push(mix(a,b,(bound-a[0])/(b[0]-a[0])));}return out;};
 const fold=x=>{if(x<=knots[0]||x>=knots.at(-1))return 0;let n=0;while(n<knots.length-2&&x>knots[n+1])n++;return heights[n]+(heights[n+1]-heights[n])*(x-knots[n])/(knots[n+1]-knots[n]);};
 for(const group of data.groups?.length?data.groups:[{start:0,count:sourceIndices.length,materialIndex:0}]){
  const start=indices.length;
  for(let n=group.start;n<group.start+group.count;n+=3){
   const triangle=Array.from({length:3},(_,k)=>{const i=sourceIndices[n+k];return[p[i*3],p[i*3+1],p[i*3+2],uv[i*2],uv[i*2+1]];});
   const flatX=Math.max(...triangle.map(v=>v[0]))-Math.min(...triangle.map(v=>v[0]))<1e-8;let flatConsumed=false;
   for(let band=0;band<knots.length-1;band++){
    if(flatConsumed)break;
    let polygon=clip(triangle,knots[band],(x,b)=>x>=b-1e-7);polygon=clip(polygon,knots[band+1],(x,b)=>x<=b+1e-7);if(polygon.length<3)continue;
    for(let k=1;k<polygon.length-1;k++){
     const verts=[polygon[0],polygon[k],polygon[k+1]],a=verts[0],b=verts[1],c=verts[2],ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
     if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])<1e-9)continue;
     for(const vertex of verts){positions.push(vertex[0],vertex[1],vertex[2]+fold(vertex[0]));textureUV.push(vertex[3],vertex[4]);indices.push(indices.length);}
     if(flatX)flatConsumed=true;
    }
   }
  }
  groups.push({start,count:indices.length-start,materialIndex:group.materialIndex});
 }
 return {positions:new Float32Array(positions),uv:new Float32Array(textureUV),indices:new Uint32Array(indices),groups,crease,creaseFacets:knots.length-1};
}

/** A closed accordion support tab cut from the same printed cardstock. */
export function paperSupportTabData({thickness=.045}={}){
 if(!Number.isFinite(thickness)||thickness<=0||thickness>.3)throw new RangeError('A positive bounded tab thickness is required');
 const positions=[],uv=[],indices=[],xs=[-.5,-.18,.16,.5],zs=[0,.24,.06,0];
 for(const back of[false,true])for(const y of[-.18,.18])for(let x=0;x<4;x++){positions.push(xs[x],y,zs[x]-(back?thickness:0));uv.push(xs[x]+.5,y/.36+.5);}
 for(let x=0;x<3;x++){indices.push(x,x+4,x+1,x+1,x+4,x+5);indices.push(x+8,x+9,x+12,x+9,x+13,x+12);}
 const printed=indices.length,border=[0,1,2,3,7,6,5,4];for(let n=0;n<border.length;n++){const a=border[n],b=border[(n+1)%border.length];indices.push(a,b,b+8,a,b+8,a+8);}
 return {positions:new Float32Array(positions),uv:new Float32Array(uv),indices:new Uint16Array(indices),groups:[{start:0,count:printed,materialIndex:0},{start:printed,count:indices.length-printed,materialIndex:1}],thickness,creaseFacets:3};
}
