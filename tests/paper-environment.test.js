import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {measurePaperCell} from '../src/paper-animation.js';
import {paperAlphaContours} from '../src/paper-geometry.js';
import {PAPER_ENVIRONMENT_KINDS,PAPER_ENVIRONMENT_CUTS,PAPER_ENVIRONMENT_SCENES,paperEnvironmentResponse,getPaperEnvironmentModels,getPaperEnvironmentPlan,drawPaperEnvironment,getPaperForegroundPlan,drawPaperForeground,foldPaperTriangles,paperSupportTabData,cleanPaperEnvironmentPixels} from '../src/paper-environment.js';
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const v of Object.values(value))finite(v);};
const geomValid=g=>{assert.equal(g.positions.length/3,g.uv.length/2);assert.equal(g.indices.length%3,0);assert.ok(g.positions.every(Number.isFinite));assert.ok(g.uv.every(Number.isFinite));assert.ok(g.indices.every(i=>i<g.positions.length/3));assert.equal(g.groups.reduce((n,group)=>n+group.count,0),g.indices.length);};

test('the board and all24 realms receive bounded original atlas loops and world models',()=>{
 assert.equal(PAPER_ENVIRONMENT_SCENES.length,27);assert.equal(PAPER_ENVIRONMENT_KINDS.length,12);const signatures=new Set();
 for(const id of PAPER_ENVIRONMENT_SCENES){const plan=getPaperEnvironmentPlan(id,14.2);finite(plan);assert.equal(plan.id,id);assert.ok(plan.pieces.length>=6&&plan.pieces.length<=9);assert.equal(plan.models.length,4);for(const piece of plan.pieces){assert.ok(PAPER_ENVIRONMENT_KINDS.includes(piece.kind));assert.ok(piece.alpha>=0&&piece.alpha<=1);assert.ok(piece.y<270||piece.x<140||piece.x>820,'the central play lane stays clear');assert.ok(piece.width>0&&piece.height>0);}signatures.add(JSON.stringify(plan.pieces));}
 assert.equal(signatures.size,27,'realm IDs create different clock phases and layouts');
});
test('environmental motion is deterministic, public-context-only, and leaves input state unchanged',()=>{
 const context={players:[{flash:.7,specialAnimation:'active',hand:['private-a']}],lastCardPlayedAt:4.1,lapCelebration:{startedAt:3.5},storyEvent:null},before=JSON.stringify(context),a=getPaperEnvironmentPlan('mothlight',4.3,{context}),b=getPaperEnvironmentPlan('mothlight',4.3,{context});assert.deepEqual(a,b);assert.equal(JSON.stringify(context),before);assert.ok(a.response.energy>0);
 const changedHands={...context,players:context.players.map(player=>({...player,hand:['different','secret','cards']}))};assert.deepEqual(getPaperEnvironmentPlan('mothlight',4.3,{context:changedHands}),a);
 assert.notDeepEqual(getPaperEnvironmentPlan('mothlight',4.3),getPaperEnvironmentPlan('mothlight',4.4));
});
test('public card, bump, lap, special and gameplay light cues cause bounded scenery reactions',()=>{
 const card=paperEnvironmentResponse(10,{lastCardPlayedAt:9.8}),bump=paperEnvironmentResponse(10,{boardEncounter:{startedAt:9.9}}),lap=paperEnvironmentResponse(10,{lapCelebration:{startedAt:9.9}}),special=paperEnvironmentResponse(10,{players:[{specialAnimation:'active'}]}),light=paperEnvironmentResponse(10,{}, {effects:[{type:'magic',alpha:.8}]});for(const result of[card,bump,lap,special,light]){finite(result);assert.ok(result.energy>0&&result.energy<=1);}assert.equal(paperEnvironmentResponse(20,{lastCardPlayedAt:9.8,boardEncounter:{startedAt:9.9},lapCelebration:{startedAt:9.9}}).energy,0);
});
test('reduced motion preserves printed scenery with fixed positions and no environmental bursts',()=>{
 for(const id of PAPER_ENVIRONMENT_SCENES){const a=getPaperEnvironmentPlan(id,1,{reducedMotion:true}),b=getPaperEnvironmentPlan(id,44,{reducedMotion:true});assert.deepEqual(a.pieces,b.pieces);assert.deepEqual(a.effects,[]);}
});
test('3D scenery uses four shared alpha cutouts with restrained positions outside the action plane',()=>{
 for(const id of PAPER_ENVIRONMENT_SCENES){const models=getPaperEnvironmentModels(id);assert.equal(models.length,4);models.forEach(model=>{finite(model);assert.ok(PAPER_ENVIRONMENT_KINDS.includes(model.kind));assert.ok(Math.abs(model.x)>13);assert.ok(model.width<=5&&model.height<=8);});}assert.deepEqual(getPaperEnvironmentModels('unknown'),getPaperEnvironmentModels('world'));
});
test('draw uses atlas pieces behind actors, balances saves and restores, and has a safe unavailable path',()=>{
 let saved=0,drawn=0;const ctx={globalAlpha:1,save(){saved++;},restore(){saved--;}},helpers={environmentPiece(ctx,kind,x,y,w,h,options){drawn++;assert.ok(PAPER_ENVIRONMENT_KINDS.includes(kind));finite([x,y,w,h,options]);},fx(){}};const out=drawPaperEnvironment(ctx,'gallery',.5,helpers);assert.equal(saved,0);assert.equal(drawn,out.pieces.length);assert.equal(out.available,true);assert.equal(drawPaperEnvironment(ctx,'gallery',.5,{}).available,false);
});
test('all27 stages use layered foreground wings that leave the central action lane and HUD clear',()=>{
 for(const id of PAPER_ENVIRONMENT_SCENES){const plan=getPaperForegroundPlan(id,10);finite(plan);assert.equal(plan.pieces.length,4);assert.equal(plan.layer,'after-actors-before-hud');for(const p of plan.pieces){assert.equal(p.layer,'foreground');assert.ok(PAPER_ENVIRONMENT_KINDS.includes(p.kind));assert.ok(p.x+p.width/2<60||p.x-p.width/2>900||p.y-p.height>=477);}}
});
test('foreground parallax and pad response are deterministic, independent of private hands and read only',()=>{
 const context={padEvent:{startedAt:10},players:[{hand:['secret']}]},before=JSON.stringify(context),a=getPaperForegroundPlan('world',10.2,{context});assert.deepEqual(a,getPaperForegroundPlan('world',10.2,{context}));assert.equal(JSON.stringify(context),before);assert.notDeepEqual(a,getPaperForegroundPlan('world',10.3,{context}));assert.deepEqual(a,getPaperForegroundPlan('world',10.2,{context:{...context,players:[{hand:['different']}]}}));assert.ok(a.response.energy>0);assert.deepEqual(getPaperForegroundPlan('world',1,{reducedMotion:true}).pieces,getPaperForegroundPlan('world',50,{reducedMotion:true}).pieces);
 let saved=0,draws=0;const ctx={save(){saved++},restore(){saved--}},helpers={environmentPiece(){draws++}};const out=drawPaperForeground(ctx,'world',10.2,helpers,{context});assert.equal(draws,4);assert.equal(saved,0);assert.equal(out.drawn,4);assert.equal(drawPaperForeground(ctx,'world',1,{}).available,false);
});
test('printed fronts are subdivided into real crease facets while their UVs and cut boundaries stay aligned',()=>{
 const shape=new THREE.Shape([new THREE.Vector2(-.5,-.5),new THREE.Vector2(.5,-.5),new THREE.Vector2(.5,.5),new THREE.Vector2(-.5,.5)]),solid=new THREE.ExtrudeGeometry(shape,{depth:.11,bevelEnabled:false,steps:1}),position=solid.attributes.position,uv=Float32Array.from({length:position.count*2},(_,n)=>n%2?position.getY(Math.floor(n/2))+.5:position.getX(Math.floor(n/2))+.5),folded=foldPaperTriangles({positions:position.array,uv,groups:solid.groups},{crease:.15});geomValid(folded);assert.equal(folded.creaseFacets,4);assert.ok(folded.positions.length>position.array.length);assert.ok(Math.max(...folded.positions.filter((_,i)=>i%3===2))>.24);for(let i=0;i<folded.positions.length/3;i++){assert.ok(Math.abs(folded.uv[i*2]-(folded.positions[i*3]+.5))<1e-6);assert.ok(Math.abs(folded.uv[i*2+1]-(folded.positions[i*3+1]+.5))<1e-6);}assert.deepEqual(foldPaperTriangles({positions:position.array,uv,groups:solid.groups},{crease:.15}),folded);solid.dispose();
});
test('accordion support tabs are closed three-facet printed solids with separate edge material',()=>{
 const g=paperSupportTabData();geomValid(g);assert.equal(g.creaseFacets,3);assert.equal(g.groups[1].materialIndex,1);const edges=new Map();for(let n=0;n<g.indices.length;n+=3)for(let k=0;k<3;k++){const a=g.indices[n+k],b=g.indices[n+(k+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(key,(edges.get(key)||0)+1);}assert.ok([...edges.values()].every(n=>n===2),'every cut edge meets two physical faces');assert.ok(Math.max(...g.positions.filter((_,i)=>i%3===2))>.2);
});
test('invalid geometry inputs fail before GPU upload and unknown scenes keep a safe neutral plan',()=>{
 assert.throws(()=>foldPaperTriangles({positions:[0,0,NaN],uv:[0,0]}),RangeError);assert.throws(()=>foldPaperTriangles({positions:[0,0,0],uv:[0,0]},{crease:1}),RangeError);assert.throws(()=>paperSupportTabData({thickness:Infinity}),RangeError);finite(getPaperEnvironmentPlan('unknown',Infinity,{context:{players:[{}]}}));assert.equal(getPaperEnvironmentPlan('unknown',Infinity).id,'world');
});
test('chroma-key cleanup removes marker fringes while preserving printed violet, gold and sage ink',()=>{
 const source=Uint8ClampedArray.from([255,0,0,255,255,0,255,255,255,255,0,255,132,89,157,255,169,132,77,255,81,102,87,255]),copy=new Uint8ClampedArray(source),clean=cleanPaperEnvironmentPixels(source);assert.deepEqual(source,copy);assert.deepEqual([clean[3],clean[7],clean[11]],[0,0,0]);assert.deepEqual(clean.slice(12),source.slice(12));assert.equal(PAPER_ENVIRONMENT_CUTS.length,12);for(const cut of PAPER_ENVIRONMENT_CUTS){assert.ok(cut[0]+cut[2]<=1448);assert.ok(cut[1]+cut[3]<=1086);}
});
test('all12 generated environment cells yield isolated bounded physical folds, retaining the arch opening',async()=>{
 const source=fileURLToPath(new URL('../public/assets/folded-environment-v2.webp',import.meta.url));let archHoles=0;
 for(let index=0;index<PAPER_ENVIRONMENT_CUTS.length;index++){
  const [left,top,width,height]=PAPER_ENVIRONMENT_CUTS[index],{data,info}=await sharp(source).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true}),clean=cleanPaperEnvironmentPixels(data),image={data:clean,width:info.width,height:info.height},bounds=measurePaperCell(image,{x:0,y:0,width,height},{includeMask:true});assert.equal(bounds.empty,false,PAPER_ENVIRONMENT_KINDS[index]);assert.ok(bounds.width>100&&bounds.height>100);
  const isolated=new Uint8ClampedArray(width*height*4);for(let n=0;n<width*height;n++)if(bounds.mask[n])isolated.set(clean.slice(n*4,n*4+4),n*4);
  const scan=await sharp(isolated,{raw:{width,height,channels:4}}).resize(64,64).raw().toBuffer(),contours=paperAlphaContours({data:scan,width:64,height:64});assert.ok(contours.outer.length>=3);if(index===0)archHoles=contours.holes.length;
  const shape=new THREE.Shape(contours.outer.map(p=>new THREE.Vector2(...p)));for(const hole of contours.holes)shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));const solid=new THREE.ExtrudeGeometry(shape,{depth:.11,bevelEnabled:false,curveSegments:1,steps:1}),position=solid.attributes.position,uv=Float32Array.from({length:position.count*2},(_,n)=>n%2?position.getY(Math.floor(n/2))+.5:position.getX(Math.floor(n/2))+.5),folded=foldPaperTriangles({positions:position.array,uv,groups:solid.groups});geomValid(folded);assert.ok(folded.positions.length/3<50000);assert.ok(Math.max(...folded.positions.filter((_,i)=>i%3===2))>.15);solid.dispose();
 }
 assert.ok(archHoles>=1,'the modeled arch remains open');
});
