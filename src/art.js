import {createPaperAnimator,PAPER_CROSSFADE_SECONDS,PAPER_IMPACT_BLEND_SECONDS,measurePaperCell,normalizePaperFrame,paperFrameGeometry,paperMotionCut,MOTION_COLUMNS} from './paper-animation.js';
import {paperEffectFrame} from './paper-effects.js';
import {drawPaperEnvironment,drawPaperForeground,PAPER_ENVIRONMENT_KINDS,PAPER_ENVIRONMENT_CUTS,cleanPaperEnvironmentPixels} from './paper-environment.js';
import {createPaperWorld} from './paper-world.js';
import {createSpriteMaterials} from './sprite-materials.js';
import {sceneLighting} from './scene-lighting.js';
import {gameFont} from './game-hud.js';
import {createPaperAtlasFrames,paperAtlasDrawRect} from './paper-atlas.js';
import {PAPER_SOURCE_FILTER,tintPaperPixels,paperCutEdgePixels,foldPaperCharacterPixels,createPaperEffectCache,CHARACTER_CLOTH_STYLES,measureCharacterTone,harmonizePaperCharacterPixels} from './paper-pigment.js';
import {bakePaperPlatforms,paperPlatformStats,PAPER_PLATFORM_CELLS} from './paper-board.js';
import assetManifest from '../assets-manifest.json';

export const ASSET_MANIFEST = Object.freeze(assetManifest.images);
export const CHARACTERS = [
  {id:0,name:'Pip',role:'The courier',quote:'Wind up, then rush forward with a courier dash-cut.',className:'pip'},
  {id:1,name:'Moth',role:'The dreamer',quote:'Lift nearby rivals into the air with a rising wing gust.',className:'moth'},
  {id:2,name:'Bolt',role:'The tinkerer',quote:'Pull rivals toward your magnet, then burst them away.',className:'bolt'},
  {id:3,name:'Wisp',role:'The keeper',quote:'Send a traveling lantern bolt through the fight.',className:'wisp'},
  {id:4,name:'Rook',role:'The raven knight',quote:'A heavy slam clears both sides. Land it from solid ground.',className:'rook'},
  {id:5,name:'Briar',role:'The thorn doll',quote:'Catch a distant rival in a reaching thorn grasp.',className:'briar'},
  {id:6,name:'Vellum',role:'The ink jester',quote:'Blink through danger and slash the path you leave behind.',className:'vellum'},
  {id:7,name:'Nix',role:'The winter owl',quote:'Spread a fan of frost and slow your rivals.',className:'nix'}
].map(character=>Object.freeze({...character,outfitColor:CHARACTER_CLOTH_STYLES[character.id].color,outfitLabel:CHARACTER_CLOTH_STYLES[character.id].label}));
export const PROP_NAMES=['spark','lantern','gear','crate','drone','umbrella','key','spike','platform','switch','orb','flag'];
export const art={};
export async function loadArt(){
 await Promise.all(ASSET_MANIFEST.map(({name,file})=>new Promise((resolve,reject)=>{
  const im=new Image();im.onload=()=>{art[name]=im;resolve()};im.onerror=()=>reject(new Error(`Could not load ${name} artwork.`));im.src=window.AFTERLIGHT_ASSETS?.[name]??`${import.meta.env.BASE_URL}assets/${file}`;
 })));
 prepareActorFrames();
 prepareCraftFrames();
 preparePlatformFrames();
 if(!paperWorld)paperWorld=createPaperWorld(art);
 if(!spriteMaterials)spriteMaterials=createSpriteMaterials();
}
export function paperWorldStats(){return paperWorld?.stats||{available:false};}
// The generated atlas uses natural, irregular cutout silhouettes. Source rectangles
// crop the atlas only at draw time; the original generated pixels stay untouched.
const cuts=[[0,0,467,749],[469,0,571,749],[1041,0,511,749],[1552,0,546,749]];
const NEW_CUTS=[
 [[0,0,318,371],[322,24,404,345],[720,55,366,321]],
 [[30,370,267,368],[315,404,401,346],[721,387,365,370]],
 [[0,738,294,361],[305,753,401,341],[721,850,365,249]],
 [[9,1103,273,343],[300,1111,386,337],[687,1100,399,348]],
];
const ATTACK_CUTS=[[[20,8,492,334],[512,50,511,295]],[[15,347,497,383],[522,329,500,430]],[[18,761,492,374],[522,771,493,363]],[[18,1145,508,360],[529,1149,493,357]]];
const OBJECTIVE_CUTS={target:[0,0,420,444],dummy:[483,0,350,444],foe:[881,0,385,444],ball:[1320,21,453,411],bank:[0,443,432,443],bomb:[455,443,413,443],checkpoint:[884,443,263,443],boss:[1179,427,595,460]};
const paperSprites=new Map(),portraits=new Map(),propPortraits=new Map(),actorFrames=new Map(),actorAnimator=createPaperAnimator();
const platformFrames=new Map(),craftFrames=new Map(),atlasFrames=new Map(),cleanSources=new Map(),craftPleats=new WeakMap(),cachedFrames=new WeakMap();
const effectSprites=createPaperEffectCache((source,color)=>{
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const cx=canvas.getContext('2d',{willReadFrequently:true});cx.drawImage(source,0,0);const image=cx.getImageData(0,0,canvas.width,canvas.height);image.data.set(tintPaperPixels(image.data,color));cx.putImageData(image,0,0);return canvas;
});
const canvasScopes=new WeakMap();let nextCanvasScope=0,activeTime=0,paperReducedMotion=false;
let paperWorld=null,spriteMaterials=null,activeScene='world',activeLighting=null,activeContext=null,environmentView=null,foregroundView=null,sceneEnded=false,fixtureClock=null;
const clock=()=>fixtureClock??performance.now()/1000;
export function beginScene(ctx,id,time,profile,context){activeScene=id;activeTime=Number.isFinite(time)?time:0;activeLighting=profile||sceneLighting({id,time});activeContext=context||null;sceneEnded=false;foregroundView=null;spriteMaterials?.begin(activeLighting,ctx)}
export function endScene(ctx){if(!sceneEnded){sceneEnded=true;foregroundView=drawPaperForeground(ctx,activeScene,activeTime,helpers,{context:activeContext||{},lighting:activeLighting,reducedMotion:paperReducedMotion});}spriteMaterials?.end(ctx);}
export function clipMaterials(ctx,x,y,w,h){spriteMaterials?.clip(ctx,x,y,w,h)}
export function restoreMaterials(){spriteMaterials?.restoreClip()}
export function setMaterialFeatures(features){paperWorld?.setFeatures(features);spriteMaterials?.setFeatures(features)}
export function setWorldDepth(value){return paperWorld?.setDepth?.(value)}
export function materialStats(){return {world:paperWorldStats(),sprites:spriteMaterials?.stats||{available:false},platforms:{...paperPlatformStats(),cachedFrames:platformFrames.size}}}
export function materialFeatures(){return spriteMaterials?.features||{ao:true,normals:true,metallic:true,lighting:true}}
export function resetVisualMotion(time=null){actorAnimator.reset();fixtureClock=time}
export function setPaperReducedMotion(value){paperReducedMotion=!!value;actorAnimator.setReducedMotion(paperReducedMotion)}
export function paperAnimationStats(){return {frames:actorFrames.size,actors:actorAnimator.size,recentActors:actorAnimator.recentActors,rewardCue:'discrete paper stars beside feet; no passive-score head halo',magicEffect:'separated paper chips',reducedMotion:paperReducedMotion,crossfadeMilliseconds:PAPER_CROSSFADE_SECONDS*1000,impactBlendMilliseconds:PAPER_IMPACT_BLEND_SECONDS*1000,maxPoseLayers:3,characterFolds:'cached folded faces and matching ridge normals',characterSource:'smooth original outlined art; 768px cache; high-quality antialiasing',outfits:CHARACTER_CLOTH_STYLES.map(({character,name,label,color})=>({character,name,label,color})),poseToneProfiles:[...actorFrames].map(([key,f])=>({key,sheet:f.sheet,sourcePaper:f.sourceTone.paperLuma,preparedPaper:f.preparedTone.paperLuma,idlePaper:f.toneReference.paperLuma,bodyHeight:f.bodyHeight,canonicalBody:f.reference,normalizedScale:f.normalizedScale,renderedBodyAt100:paperFrameGeometry(f,f.reference,100).bodyHeight,sourceCrop:[...f.sourceCrop],sourceOverflow:{...f.sourceOverflow},sourceBounds:{x:f.x,y:f.y,width:f.width,height:f.height},cachedSize:{width:f.sprite.width,height:f.sprite.height},footAnchor:{x:f.anchorX,y:f.anchorY}})),environmentFrames:craftFrames.size,characterFoldMaps:spriteMaterials?.stats?.characterFoldMaps||0,foldedPoseCount:actorFrames.size,motionSheets:['motion-classic','motion-new'].filter(k=>!!art[k]),sourceFilter:PAPER_SOURCE_FILTER,cutEdges:'cached printed silhouette rim',effectCache:effectSprites.stats}}
function drawCached(ctx,c,x,y,w,h){const rect=paperAtlasDrawRect(cachedFrames.get(c),x,y,w,h);ctx.drawImage(c,rect.x,rect.y,rect.width,rect.height);return rect;}
function surface(ctx,c,x,y,w,h,kind='paper'){const rect=drawCached(ctx,c,x,y,w,h);spriteMaterials?.record(ctx,c,rect.x,rect.y,rect.width,rect.height,kind)}
function cachedCut(name,sx,sy,sw,sh,maximum=512){
 const key=[name,sx,sy,sw,sh,maximum].join(':');if(paperSprites.has(key))return paperSprites.get(key);const im=art[name];if(!im)return null;
 const columns=name==='props'?4:name==='paper-objects'?3:0;
 if(columns){
  let prepared=atlasFrames.get(name);if(prepared?.image!==im){const source=document.createElement('canvas');source.width=im.width;source.height=im.height;const sc=source.getContext('2d',{willReadFrequently:true});sc.drawImage(im,0,0);const pixels=sc.getImageData(0,0,im.width,im.height);pixels.data.set(cleanPaperEnvironmentPixels(pixels.data));prepared={image:im,atlas:createPaperAtlasFrames(pixels,{columns,rows:3,overflow:48})};atlasFrames.set(name,prepared);}
  const frame=prepared.atlas.frame(Math.round(sx/(im.width/columns)),Math.round(sy/(im.height/3)));if(!frame||frame.empty)return null;
  const source=document.createElement('canvas');source.width=frame.width;source.height=frame.height;source.getContext('2d').putImageData(new ImageData(frame.pixels,frame.width,frame.height),0,0);
  const c=document.createElement('canvas'),scale=Math.min(1,maximum/Math.max(frame.width,frame.height));c.width=Math.ceil(frame.width*scale);c.height=Math.ceil(frame.height*scale);const cx=c.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(source,0,0,c.width,c.height);cachedFrames.set(c,frame);paperSprites.set(key,c);return c;
 }
 const c=document.createElement('canvas'),scale=Math.min(1,maximum/Math.max(sw,sh));c.width=Math.ceil(sw*scale);c.height=Math.ceil(sh*scale);const illustrated=name==='pixel-fx'||name==='objectives',cx=c.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.filter=illustrated?'none':PAPER_SOURCE_FILTER;
 let source=im;if(illustrated){let cleaned=cleanSources.get(name);if(cleaned?.image!==im){const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const cc=canvas.getContext('2d',{willReadFrequently:true});cc.drawImage(im,0,0);const pixels=cc.getImageData(0,0,im.width,im.height);pixels.data.set(cleanPaperEnvironmentPixels(pixels.data));cc.putImageData(pixels,0,0);cleaned={image:im,canvas};cleanSources.set(name,cleaned);}source=cleaned.canvas;}
 cx.drawImage(source,sx,sy,sw,sh,0,0,c.width,c.height);
 paperSprites.set(key,c);return c;
}
// Original generated board pieces, cropped at their solid alpha bounds. The
// transparent atlas stays intact; strips bend the chute art along the same path
// used by player movement, so a slide never becomes a misleading vector line.
const BOARD_CUTS={stone:[48,94,672,452],ladder:[802,15,270,601],chute:[218,617,297,622],gate:[691,608,487,630]};
export function boardPiece(ctx,type,x,y,w,h,options={}){
 const cut=BOARD_CUTS[type];if(!cut)return;const c=cachedCut('board-kit',...cut,type==='stone'?192:512);if(!c)return;
 ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.translate(x,y);ctx.rotate(options.rotation||0);
 const start=options.start??0,end=options.end??1,anchor=options.anchor??(type==='stone'?.34:type==='gate'?.91:.5);
 ctx.drawImage(c,0,c.height*start,c.width,c.height*(end-start),-w/2,-h*anchor,w,h);ctx.restore();
}
const OBJECTS=['gauge','rope','altar','star','portal','pedestal','sign','crate','crown'];
export function object(ctx,type,x,y,w=50,h=w,time=0,options={}){
 const index=OBJECTS.indexOf(type),im=art['paper-objects'];if(index<0||!im)return;const cw=im.width/3,ch=im.height/3,c=cachedCut('paper-objects',index%3*cw,Math.floor(index/3)*ch,cw,ch);if(!c)return;
 ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.translate(x,y);ctx.rotate(options.rotation||0);ctx.scale(options.flipX?-1:1,1);
 drawCached(ctx,c,-w/2+2,-h/2+3,w,h);surface(ctx,c,-w/2,-h/2,w,h,['gauge','altar','star','portal','crown','pedestal'].includes(type)?'foil':'paper');ctx.restore();
}
const PLATFORM_CUTS=[[90,10,1360,255],[280,277,974,235],[174,502,1179,281],[133,760,1280,250]];
function preparePlatformFrames(){
 platformFrames.clear();if(!art['paper-platforms'])return;
 const atlas=bakePaperPlatforms((ctx,type,x,y,w,h)=>{
  const index=Number(type.slice('platform-'.length)),cut=PLATFORM_CUTS[index];if(!cut)return;const source=cachedCut('paper-platforms',...cut,1024);if(source)ctx.drawImage(source,x-w/2,y-h/2,w,h);
 });
 if(!atlas)return;
 for(const cell of PAPER_PLATFORM_CELLS){const canvas=document.createElement('canvas');canvas.width=cell.width;canvas.height=cell.height;canvas.getContext('2d').drawImage(atlas,cell.x,cell.y,cell.width,cell.height,0,0,cell.width,cell.height);platformFrames.set(cell.index,canvas);}
}
export function platform(ctx,x,y,w,depth=40,time=0,variant=0){
 const im=art['paper-platforms'];if(!im)return;const index=typeof variant==='number'?Math.max(0,Math.min(3,variant)):({stone:0,default:0,wood:3,bridge:3,shrine:2,balcony:1}[variant]??0);
 // Irregular source silhouettes are cropped by atlas cell. The walkable rim stays at y.
 const cut=PLATFORM_CUTS[index],c=platformFrames.get(index)||cachedCut('paper-platforms',...cut,1024);if(!c)return;
 const drawnHeight=Math.max(depth,index===3?w*.15:w*.14),topOffset=index===2?.48:index===3?.36:.04;
 ctx.save();if(platformFrames.has(index)){const cell=PAPER_PLATFORM_CELLS[index],sx=w/cell.contentWidth,sy=drawnHeight/cell.contentHeight;surface(ctx,c,x-cell.contentX*sx,y-topOffset*drawnHeight-cell.contentY*sy,cell.width*sx,cell.height*sy,'foil');}
 else{ctx.drawImage(c,x-3,y-topOffset*drawnHeight+4,w+6,drawnHeight);surface(ctx,c,x,y-topOffset*drawnHeight,w,drawnHeight,'foil');}ctx.restore();
}
export function fx(ctx,type,x,y,size=42,time=0,options={}){
 const im=art['pixel-fx'];if(!im)return;const progress=options.progress,{row,frame}=paperEffectFrame(type,time,progress);
 const cw=im.width/4,ch=im.height/4,source=cachedCut('pixel-fx',frame*cw,row*ch,cw,ch,256),c=effectSprites.get(source,['hit','dust','magic','shield'][row],frame,activeScene,options.color);if(!c)return;
 ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,options.alpha??1));ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.translate(x,y);ctx.rotate(options.rotation||0);ctx.scale(options.flipX?-1:1,1);ctx.drawImage(c,-size/2,-size/2,size,size);ctx.restore();
}
function prepareActorFrames(){
 actorFrames.clear();portraits.clear();effectSprites.clear();actorAnimator.reset();const pixels=new Map();
 function imagePixels(name){if(pixels.has(name))return pixels.get(name);const im=art[name];if(!im)return null;const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);const data=cx.getImageData(0,0,c.width,c.height);pixels.set(name,data);return data;}
 function frame(name,cut,characterId=0,toneReference=null){
  const data=imagePixels(name);if(!data)return null;const bounds=measurePaperCell(data,{x:cut[0],y:cut[1],width:cut[2],height:cut[3]},{includeMask:true,overflow:48});if(bounds.empty)return null;
  const source=document.createElement('canvas');source.width=bounds.width;source.height=bounds.height;const sc=source.getContext('2d'),rgba=sc.createImageData(bounds.width,bounds.height);
  for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){const ix=bounds.x+x,iy=bounds.y+y,mx=ix-bounds.cellX,my=iy-bounds.cellY,at=(y*bounds.width+x)*4,original=(iy*data.width+ix)*4;if(mx<0||my<0||mx>=bounds.cellWidth||my>=bounds.cellHeight||!bounds.mask[my*bounds.cellWidth+mx])continue;rgba.data[at]=data.data[original];rgba.data[at+1]=data.data[original+1];rgba.data[at+2]=data.data[original+2];rgba.data[at+3]=data.data[original+3];}sc.putImageData(rgba,0,0);
  const sprite=document.createElement('canvas'),scale=Math.min(1,768/Math.max(bounds.width,bounds.height));sprite.width=Math.ceil(bounds.width*scale);sprite.height=Math.ceil(bounds.height*scale);const cx=sprite.getContext('2d',{willReadFrequently:true});cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(source,0,0,sprite.width,sprite.height);
  const printed=cx.getImageData(0,0,sprite.width,sprite.height),styleMetrics={bodyTop:bounds.bodyTop*scale,bodyCenterX:bounds.bodyCenterX*scale,bodyHeight:bounds.bodyHeight*scale,anchorX:bounds.anchorX*scale,anchorY:bounds.anchorY*scale},sourceTone=measureCharacterTone(printed.data,sprite.width,sprite.height,{metrics:styleMetrics}),referenceTone=toneReference||sourceTone;
  printed.data.set(harmonizePaperCharacterPixels(printed.data,sprite.width,sprite.height,{character:characterId,metrics:styleMetrics,toneReference:referenceTone}));
  printed.data.set(paperCutEdgePixels(printed.data,sprite.width,sprite.height,Math.max(sprite.width,sprite.height)*.008));printed.data.set(foldPaperCharacterPixels(printed.data,sprite.width,sprite.height,{character:characterId,metrics:styleMetrics}));cx.putImageData(printed,0,0);
  const preparedTone=measureCharacterTone(printed.data,sprite.width,sprite.height,{metrics:styleMetrics});
  const sourceOverflow={left:Math.max(0,cut[0]-bounds.x),top:Math.max(0,cut[1]-bounds.y),right:Math.max(0,bounds.x+bounds.width-cut[0]-cut[2]),bottom:Math.max(0,bounds.y+bounds.height-cut[1]-cut[3])};
  const {mask,cellX,cellY,cellWidth,cellHeight,...metrics}=bounds;return {sprite,...metrics,reference:metrics.bodyHeight,sheet:name,sourceTone,toneReference:referenceTone,preparedTone,sourceCrop:[...cut],sourceOverflow};
 }
 for(let idx=0;idx<8;idx++){
  const classic=idx<4,row=idx%4,idle=frame(classic?'characters':'characters-new',classic?cuts[idx]:NEW_CUTS[row][0],idx);
  if(!idle)continue;actorFrames.set(idx+':idle',normalizePaperFrame(idle,idle));
  const peaks=[frame(classic?'character-attacks':'characters-new',classic?ATTACK_CUTS[idx][0]:NEW_CUTS[row][1],idx,idle.sourceTone),frame(classic?'character-attacks':'characters-new',classic?ATTACK_CUTS[idx][1]:NEW_CUTS[row][2],idx,idle.sourceTone)];
  peaks.forEach((f,i)=>{if(f)actorFrames.set(idx+':'+(i?'special-peak':'attack-peak'),normalizePaperFrame(f,idle));});
  const sheet=classic?'motion-classic':'motion-new',im=art[sheet];if(!im)continue;const cells=Array.from({length:6},(_,col)=>frame(sheet,paperMotionCut(idx,col,im.width,im.height),idx,idle.sourceTone));
  for(const [pose,column]of Object.entries(MOTION_COLUMNS)){const f=cells[column];if(f)actorFrames.set(idx+':'+pose,normalizePaperFrame(f,idle));}
 }
 pixels.clear();
}
export function character(ctx,p,x,y,size=80,options={}){
 const raw=typeof p.character==='number'?p.character:Math.max(0,CHARACTERS.findIndex(c=>c.name.toLowerCase()===String(p.character).toLowerCase())),idx=Math.max(0,Math.min(7,Math.floor(Number.isFinite(raw)?raw:0)));
 if(!actorFrames.has(idx+':idle'))return;
 const t=Number.isFinite(options.time)?options.time:Number.isFinite(fixtureClock)?fixtureClock:activeTime;
 if(!canvasScopes.has(ctx.canvas))canvasScopes.set(ctx.canvas,++nextCanvasScope);
 const key=canvasScopes.get(ctx.canvas)+':'+activeScene+':'+(options.portrait?'hud:':'actor:')+(p.id??idx);
 const pose=actorAnimator.sample(key,p,{...options,time:t,x,y,reducedMotion:options.reducedMotion??paperReducedMotion});size*=activeScene==='world'?1.08:1.28;
 ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.translate(pose.footX,pose.footY);ctx.fillStyle='rgba(8,7,6,.28)';ctx.beginPath();ctx.ellipse(2,4,size*.27,size*.055,0,0,Math.PI*2);ctx.fill();
 if(pose.land>.2)fx(ctx,'dust',0,2,size*.7,t,{progress:1-pose.land,alpha:pose.land});
 ctx.rotate(pose.rotation);ctx.scale(pose.turn*pose.sx*(options.scaleX??1),pose.sy*(options.scaleY??1));
 for(const layer of pose.layers){if(layer.alpha<=.002)continue;const fallback=layer.pose.startsWith('special')?'special-peak':layer.pose==='anticipation'||layer.pose==='followthrough'?'attack-peak':'idle',f=actorFrames.get(idx+':'+layer.pose)||actorFrames.get(idx+':'+fallback)||actorFrames.get(idx+':idle'),rect=paperFrameGeometry(f,f.reference,size);ctx.save();ctx.globalAlpha*=layer.alpha*(options.hurt?.78:1);surface(ctx,f.sprite,rect.x,rect.y,rect.width,rect.height,[2,4].includes(idx)?'character-foil:'+idx:'character:'+idx);ctx.restore();}
 const facing=pose.turn<0?-1:1;
 if(pose.attack>0)fx(ctx,'hit',facing*size*.3,-size*.55,size*.5,t,{progress:1-pose.attack,alpha:.9});
 if(pose.hurt>.2)fx(ctx,'hit',0,-size*.7,size*.65,t,{progress:1-pose.hurt});
 ctx.restore();
 if(pose.win>.2){const spread=(1-pose.win)*size*.3;for(const side of[-1,1]){object(ctx,'star',pose.footX+side*(size*.3+spread),pose.footY-size*.17-spread*.25,15+pose.win*8,15+pose.win*8,t,{rotation:side*(1-pose.win)*2.2,alpha:pose.win});}fx(ctx,'magic',pose.footX,pose.footY-7,size*.5,t,{progress:1-pose.win,alpha:pose.win*.5});}
 if(options.label){ctx.save();ctx.font=gameFont(11);ctx.textAlign='center';ctx.fillStyle='#f7f3e9';ctx.strokeStyle='#171918';ctx.lineWidth=4;ctx.strokeText(options.label,x,y-size-9);ctx.fillText(options.label,x,y-size-9);ctx.restore()}
}

export function prop(ctx,name,x,y,size=40,rotation=0){
 if(OBJECTS.includes(name)){object(ctx,name,x,y,size,size,clock(),{rotation});return;}const index=PROP_NAMES.indexOf(name);if(index<0||!art.props)return;
 const im=art.props,cw=im.width/4,ch=im.height/3,c=cachedCut('props',(index%4)*cw,Math.floor(index/4)*ch,cw,ch);
 ctx.save();ctx.translate(x,y);ctx.rotate(rotation||0);surface(ctx,c,-size/2,-size/2,size,size,['gear','key','lantern','drone','switch'].includes(name)?'foil':'paper');ctx.restore();
}
function cover(ctx,im,w,h,opacity=1,time=0,breathing=false){
 if(!im)return false;ctx.save();ctx.globalAlpha*=opacity;
 // Less than one percent of movement keeps the illustration alive without shifting the playfield.
 const zoom=breathing?1.007+Math.sin(time*.23)*.003:1;
 const s=Math.max(w/im.width,h/im.height)*zoom;
 const dx=breathing?Math.sin(time*.17)*1.1:0,dy=breathing?Math.cos(time*.13)*.7:0;
 ctx.drawImage(im,(w-im.width*s)/2+dx,(h-im.height*s)/2+dy,im.width*s,im.height*s);ctx.restore();return true;
}
export function drawWorld(ctx,w=960,h=540,opacity=1){activeScene='world';activeTime=clock();ctx.save();ctx.globalAlpha*=opacity;const done=paperWorld?.draw(ctx,'world',clock(),w,h)||cover(ctx,art.world||art.city,w,h);ctx.restore();return done;}
export function drawCity(ctx,w=960,h=540,opacity=1){return drawWorld(ctx,w,h,opacity);}
export function background(ctx,id='world',time=0){
 const t=Number.isFinite(time)?time:0;
 const drawn=paperWorld?.draw(ctx,id,t,960,540,activeLighting)||cover(ctx,(id==='world'?art.world:art[`scene-${id}`])||art.world||art.city,960,540,1,t,true);
 environmentView=drawPaperEnvironment(ctx,id,t,helpers,{context:activeContext||{},lighting:activeLighting,reducedMotion:paperReducedMotion});return drawn;
}
export function paperEnvironmentStats(){return environmentView?{id:environmentView.id,time:environmentView.time,drawn:environmentView.drawn,response:environmentView.response,pieces:environmentView.pieces,foreground:foregroundView?{available:foregroundView.available,drawn:foregroundView.drawn,layer:foregroundView.layer,pieces:foregroundView.pieces}:null}:null;}
const CHALLENGE_CUTS={tweezers:[0,0,420,440],heart:[425,0,430,440],gear:[859,0,392,440],bell:[1252,0,420,440],block:[0,440,420,501],stack:[420,440,440,501],counterweight:[860,440,392,501],crown:[1252,440,420,501]};
function prepareCraftFrames(){
 craftFrames.clear();
 for(const [name,cuts]of [['folded-environment',Object.fromEntries(PAPER_ENVIRONMENT_KINDS.map((kind,index)=>[kind,PAPER_ENVIRONMENT_CUTS[index]]))],['challenge-props',CHALLENGE_CUTS]]){
  const im=art[name];if(!im)continue;const source=document.createElement('canvas');source.width=im.width;source.height=im.height;const cx=source.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);const pixels=cx.getImageData(0,0,im.width,im.height);pixels.data.set(cleanPaperEnvironmentPixels(pixels.data));
  for(const [kind,cut]of Object.entries(cuts)){
   const bounds=measurePaperCell(pixels,{x:cut[0],y:cut[1],width:cut[2],height:cut[3]},{includeMask:true});if(bounds.empty)continue;
   const frame=document.createElement('canvas');frame.width=bounds.width;frame.height=bounds.height;const fc=frame.getContext('2d'),rgba=fc.createImageData(frame.width,frame.height);
   for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){const ix=bounds.x+x,iy=bounds.y+y,mx=ix-bounds.cellX,my=iy-bounds.cellY;if(!bounds.mask[my*bounds.cellWidth+mx])continue;const at=(y*frame.width+x)*4,original=(iy*pixels.width+ix)*4;rgba.data.set(pixels.data.subarray(original,original+4),at);}
   rgba.data.set(paperCutEdgePixels(rgba.data,frame.width,frame.height,2));fc.putImageData(rgba,0,0);craftFrames.set(name+':'+kind,frame);
   if(name==='folded-environment')craftPleats.set(frame,Array.from({length:4},(_,n)=>{const strip=document.createElement('canvas');strip.width=Math.ceil(frame.width/4);strip.height=frame.height;const sc=strip.getContext('2d');sc.imageSmoothingEnabled=true;sc.imageSmoothingQuality='high';sc.drawImage(frame,n*frame.width/4,0,frame.width/4,frame.height,0,0,strip.width,strip.height);return strip;}));
  }
 }
}
export function environmentPiece(ctx,kind,x,feetY,w,h,options={}){
 const c=craftFrames.get('folded-environment:'+kind);if(!c)return;
 ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.translate(x,feetY);ctx.rotate(options.rotation||0);ctx.scale(options.scaleX??1,options.scaleY??1);
 ctx.save();ctx.globalAlpha*=.22;ctx.drawImage(c,-w/2+4,-h+5,w,h);ctx.restore();
 // Four printed accordion faces share their original source image. Smooth hinge
 // offsets expose depth without substituting a vector shape for the illustration.
 const fold=Math.max(0,Math.min(.4,options.fold||0));
 const strips=craftPleats.get(c);for(let n=0;n<4;n++){const dx=-w/2+n*w/4,depth=(n%2?1:-1)*fold*h*.065;if(strips?.[n])surface(ctx,strips[n],dx,-h+depth,w/4,h);}
 ctx.restore();
}
export function challengeTable(ctx,table,slot=0,count=4){
 const im=art['scene-clockwork-surgery'];if(!im)return;const col=Math.max(0,Math.min(3,slot)),cw=im.width/4;ctx.save();ctx.drawImage(im,col*cw+7,im.height*.57,cw-14,im.height*.247,table.x,table.y,table.w,table.h);ctx.restore();
}
export function challengePiece(ctx,kind,x,y,size,options={}){
 const c=craftFrames.get('challenge-props:'+kind);if(!c)return;
 const w=options.width??size*c.width/c.height,height=options.height??size;ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.translate(x,y);ctx.rotate(options.rotation||0);ctx.scale(options.scaleX??1,options.scaleY??(1-(options.squash||0)*.1));
 surface(ctx,c,-w/2,options.feet?-height:-height/2,w,height,['gear','heart','bell','counterweight','crown'].includes(kind)?'foil':'paper');ctx.restore();
}
/** Draw generated objective sprites with a common feet anchor. */
export function objective(ctx,kind,x,feetY,size=60,options={}){
 const cut=OBJECTIVE_CUTS[kind];if(!cut)return;const c=cachedCut('objectives',...cut,kind==='boss'?640:384);if(!c)return;
 const w=size*c.width/c.height,sw=options.scaleX??1,sh=options.scaleY??1;
 ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.translate(x,feetY);ctx.rotate(options.rotation||0);ctx.scale((options.flipX?-1:1)*sw,sh);surface(ctx,c,-w/2,-size,w,size,['target','bank','boss','bomb'].includes(kind)?'foil':'paper');ctx.restore();
}
export function feast(ctx,slot,open,x,y,size=125,options={}){
 const im=art['feast-mouths'];if(!im)return;const col=((slot%4)+4)%4,row=open>.12?1:0,c=cachedCut('feast-mouths',col*im.width/4,row*im.height/2,im.width/4,im.height/2,384);if(!c)return;
 ctx.save();ctx.translate(x,y);ctx.rotate((options.rotation??Math.PI/2)-Math.PI/2);const pulse=Math.sin((options.time||0)*16)*Math.min(.06,(options.charge||0)*.06),jaw=Number(open)||0;ctx.scale(1+pulse+jaw*.045,1-pulse+jaw*.1);surface(ctx,c,-size/2,-size/2,size,size,'paper');ctx.restore();
}
/** Nine-sliced generated paper frame: fixed decorative corners, stretchable rails. */
export function uiFrame(ctx,x,y,w,h,options={}){
 const im=art['hud-frame'];ctx.save();ctx.globalAlpha*=options.alpha??1;ctx.fillStyle='#151619ed';ctx.fillRect(x+6,y+6,w-12,h-12);
 if(im){const sx=270,sy=230,d=Math.min(27,h*.36,w*.16),xs=[0,sx,im.width-sx],ys=[0,sy,im.height-sy],ws=[sx,im.width-2*sx,sx],hs=[sy,im.height-2*sy,sy],dx=[x,x+d,x+w-d],dy=[y,y+d,y+h-d],dw=[d,w-2*d,d],dh=[d,h-2*d,d];for(let r=0;r<3;r++)for(let c=0;c<3;c++)if(r!==1||c!==1){const plainFooter=options.variant==='plaque'&&r===2&&c===1;ctx.drawImage(im,plainFooter?Math.floor(im.width*.40):xs[c],ys[r],plainFooter?Math.floor(im.width*.025):ws[c],hs[r],dx[c],dy[r],dw[c],dh[r]);}}
 ctx.restore();
}
export const helpers={character,prop,background,platform,object,fx,beginScene,endScene,clipMaterials,restoreMaterials,boardPiece,objective,feast,uiFrame,environmentPiece,challengePiece,challengeTable};
export function portrait(index,className=''){
 const idx=Math.max(0,Math.min(7,Number(index)||0));let src=portraits.get(idx);if(!src){const cut=idx<4?cuts[idx]:NEW_CUTS[idx-4][0],c=actorFrames.get(idx+':idle')?.sprite||cachedCut(idx<4?'characters':'characters-new',...cut,256);src=c?.toDataURL('image/png')||'';portraits.set(idx,src)}
 return `<img class="portrait ${CHARACTERS[idx].className} ${className}" src="${src}" alt="" aria-hidden="true" draggable="false">`;
}
/** Menu icons share the same isolated original prop art as the game renderer. */
export function propPortrait(name){
 const index=PROP_NAMES.indexOf(name),im=art.props;if(index<0||!im)return '';
 const c=cachedCut('props',index%4*im.width/4,Math.floor(index/4)*im.height/3,im.width/4,im.height/3);if(!c)return '';
 const previous=propPortraits.get(name);if(previous?.source===c)return previous.url;
 const url=c.toDataURL('image/png');propPortraits.set(name,{source:c,url});return url;
}
