import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createPaperAnimator,measurePaperCell,referenceBodyHeight,paperFrameGeometry,normalizePaperFrame,paperMotionCut,PAPER_POSES,MOTION_COLUMNS,PAPER_CROSSFADE_SECONDS,PAPER_IMPACT_BLEND_SECONDS} from '../src/paper-animation.js';
import {characterArtFixtures} from './character-art-fixtures.js';
const actor={id:'paper',character:0,move:'slash',ground:0,damage:0,score:0,vx:0,vy:0,prev:{}};
const take=(animation,p,t,options={})=>structuredClone(animation.sample('actor',p,{time:t,x:400,y:430,grounded:true,...options}));
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const v of Object.values(value))finite(v);};

test('passive crown score never creates a perpetual reward halo, and a discrete reward decays',()=>{
 const a=createPaperAnimator();take(a,actor,0);for(let n=1;n<=120;n++)assert.equal(take(a,{...actor,score:n/6},n/60).win,0);
 const reward=take(a,{...actor,score:27},2.016);assert.equal(reward.win,1);let previous=1;
 for(let n=1;n<=30;n++){const pose=take(a,{...actor,score:27+n/6},2.016+n/60);assert.ok(pose.win<=previous);previous=pose.win;}assert.equal(previous,0);
 const samples=a.recentActors;assert.equal(samples.length,1);assert.equal(samples[0].rewardAt,2.016);samples[0].rewardAt=100;assert.equal(a.recentActors[0].rewardAt,2.016,'diagnostics cannot alter the animation rig');
});

test('a real attack pulse retains anticipation, impact and followthrough after attack returns to zero',()=>{
 const a=createPaperAnimator();take(a,actor,0);assert.equal(take(a,actor,.016,{attack:1}).pose,'anticipation');assert.equal(take(a,actor,.083,{attack:.67}).pose,'attack-peak');assert.equal(take(a,actor,.19,{attack:.13}).pose,'followthrough');assert.equal(take(a,actor,.24,{attack:0}).pose,'followthrough');assert.equal(take(a,actor,.4,{attack:0}).pose,'idle');
});
test('each special phase selects a different generated pose without altering its actor',()=>{
 const a=createPaperAnimator(),p=Object.freeze({...actor,specialKind:'ground-slam',specialProgress:.5});for(const [phase,pose]of[['windup','special-windup'],['active','special-peak'],['recovery','special-recovery']]){assert.equal(take(a,p,1,{specialAnimation:phase}).pose,pose);}
 assert.equal(p.specialProgress,.5);assert.equal(PAPER_POSES.length,9);assert.equal(Object.keys(MOTION_COLUMNS).length,6);
});
test('soft transitions blend cached poses for 85ms while impact arrivals stay within 28ms',()=>{
 const a=createPaperAnimator();take(a,actor,0);take(a,actor,.01,{specialAnimation:'windup'});const mid=take(a,actor,.05,{specialAnimation:'windup'});assert.equal(mid.layers.length,2);assert.ok(mid.layers[0].alpha>0&&mid.layers[1].alpha>0);assert.ok(Math.abs(mid.layers.reduce((s,l)=>s+l.alpha,0)-1)<1e-12);assert.equal(take(a,actor,.096,{specialAnimation:'windup'}).layers.length,1);
 take(a,actor,.1,{specialAnimation:'active'});const impact=take(a,actor,.129,{specialAnimation:'active'});assert.deepEqual(impact.layers,[{pose:'special-peak',alpha:1}]);assert.equal(PAPER_CROSSFADE_SECONDS,.085);assert.equal(PAPER_IMPACT_BLEND_SECONDS,.028);
});
test('duplicate render calls at the same game clock are idempotent and time rewind resets stale attacks',()=>{
 const a=createPaperAnimator();take(a,actor,1,{attack:1});const first=take(a,actor,1.02,{attack:.9});assert.deepEqual(take(a,actor,1.02,{attack:.9}),first);const rewind=take(a,actor,.5),fresh=take(createPaperAnimator(),actor,.5);assert.deepEqual(rewind,fresh);
});
test('frame-rate sampling keeps eased body scales and rotation consistent',()=>{
 function run(rate){const a=createPaperAnimator(),p={...actor,vx:220,prev:{right:true}};let out;for(let n=0;n<=rate;n++)out=a.sample('actor',p,{time:n/rate,x:200+220*n/rate,y:430,moving:true,grounded:true});return out;}
 const slow=run(60),fast=run(120);assert.ok(Math.abs(slow.sx-fast.sx)<.02);assert.ok(Math.abs(slow.sy-fast.sy)<.02);assert.ok(Math.abs(slow.rotation-fast.rotation)<.008);assert.equal(slow.pose,fast.pose);
});
test('running alternates contact and passing poses with continuous rig values',()=>{
 const a=createPaperAnimator(),p={...actor,vx:220,prev:{right:true}},poses=new Set();let last;
 for(let n=0;n<120;n++){const out=take(a,p,n/60,{x:200+n*220/60,moving:true});poses.add(out.pose);if(last){assert.ok(Math.abs(out.sx-last.sx)<.08);assert.ok(Math.abs(out.sy-last.sy)<.08);}last=out;finite(out);assert.equal(out.footX,200+n*220/60);assert.equal(out.footY,430);}
 assert.ok(poses.has('run-contact'));assert.ok(poses.has('run-passing'));
});
test('jump stretch and landing compression preserve the exact physical foot anchor',()=>{
 const a=createPaperAnimator();take(a,actor,0);const airborne=take(a,{...actor,ground:-1,vy:-480},.1,{grounded:false,vy:-480,y:320});assert.equal(airborne.footY,320);assert.ok(airborne.sy>1);const land=take(a,actor,.116,{grounded:true,y:430});assert.equal(land.land,1);assert.equal(land.footY,430);const settle=take(a,actor,.2);assert.ok(settle.sx>1);assert.ok(settle.sy<1);assert.equal(settle.footY,430);
});
test('HUD portraits use a separate idle rig and never inherit movement, hurt or win transforms',()=>{
 const a=createPaperAnimator(),p={...actor,damage:90,score:20,prev:{action:true,right:true},specialAnimation:'active'};const combat=a.sample('world:p',p,{time:2,x:400,y:430,attack:1,rotation:.4,moving:true});const hud=a.sample('hud:p',p,{time:2,x:30,y:520,static:true,portrait:true,rotation:.8,moving:true});assert.equal(hud.pose,'idle');assert.equal(hud.sx,1);assert.equal(hud.sy,1);assert.equal(hud.rotation,0);assert.equal(hud.land,0);assert.equal(hud.hurt,0);assert.equal(hud.win,0);assert.equal(hud.attack,0);assert.notEqual(combat.pose,hud.pose);
});
test('reduced motion removes procedural rig and crossfade but preserves action readability',()=>{
 const a=createPaperAnimator({reducedMotion:true});take(a,actor,0);const out=take(a,actor,.05,{attack:.9,moving:true,rotation:.4,squash:.4});assert.equal(out.sx,1);assert.equal(out.sy,1);assert.equal(out.rotation,0);assert.equal(out.layers.length,1);assert.equal(out.pose,'anticipation');assert.equal(out.reducedMotion,true);
});
function image(w=100,h=100){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)};}
function box(im,x,y,w,h,alpha=255){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)im.data[(yy*im.width+xx)*4+3]=alpha;}
test('alpha isolation rejects detached neighbor fragments and faint haze inside a hard atlas cell',()=>{
 const im=image(200,120);box(im,35,20,28,85);const baseline=measurePaperCell(im,{x:0,y:0,width:100,height:120});box(im,0,0,200,120,10);box(im,35,20,28,85);box(im,0,45,12,12,255);box(im,105,0,90,120,255);const clean=measurePaperCell(im,{x:0,y:0,width:100,height:120},{includeMask:true});assert.equal(clean.x,baseline.x);assert.equal(clean.width,baseline.width);assert.equal(clean.bodyHeight,baseline.bodyHeight);assert.equal(clean.mask[50*100+5],0);assert.ok(clean.x+clean.width<=100);
});
test('bounded crop overflow recovers an attached weapon but rejects a larger neighboring actor',()=>{
 const im=image(240,160);box(im,32,20,42,115);box(im,73,57,62,12);box(im,152,8,80,142);
 const rect={x:0,y:0,width:110,height:160},strict=measurePaperCell(im,rect),recovered=measurePaperCell(im,rect,{overflow:32,includeMask:true});
 assert.ok(recovered.x+recovered.width>strict.x+strict.width,'the original connected weapon continues outside its nominal cell');
 assert.equal(recovered.bodyHeight,strict.bodyHeight);assert.equal(recovered.anchorX,strict.anchorX);assert.equal(recovered.anchorY,strict.anchorY);
 assert.ok(recovered.x+recovered.width<152,'neighboring body must not enter the selected silhouette');assert.equal(recovered.mask[50*recovered.cellWidth+140],0);
 const huge=measurePaperCell(im,rect,{overflow:Infinity});assert.deepEqual(huge,strict,'nonfinite overflow never creates an unbounded scan');
 assert.ok(measurePaperCell(im,rect,{overflow:100000}).width<200,'overflow remains capped');
});

test('idle canonical geometry removes cross-sheet body-size pulses while keeping physical feet fixed',async()=>{
 const fixtures=await characterArtFixtures({overflow:32});
 for(const {frames} of fixtures){const idle=frames[0].bounds;for(const {bounds}of frames){const frozen=Object.freeze({...bounds}),frame=normalizePaperFrame(frozen,idle),draw=paperFrameGeometry(frame,frame.reference,140);assert.equal(frame.reference,idle.bodyHeight);assert.ok(Math.abs(draw.bodyHeight-140)<1e-10);assert.ok(Math.abs(draw.y+frame.anchorY*draw.bodyHeight/frame.bodyHeight)<1e-10);assert.equal(draw.footX,0);assert.equal(draw.footY,0);assert.equal(frozen.bodyHeight,bounds.bodyHeight);finite(draw);}}
 const vellum=fixtures[6].frames,oldReference=referenceBodyHeight(vellum.slice(1,3).map(frame=>frame.bounds));assert.ok(Math.abs(vellum[1].bounds.bodyHeight/oldReference-vellum[2].bounds.bodyHeight/oldReference)>.3,'fixture covers the previous large peak-size mismatch');
});
test('Briar followthrough keeps its complete original branch without raising global overflow or moving its feet',async()=>{
 const {data,info}=await sharp(fileURLToPath(new URL('../public/assets/motion-new.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),image={data,width:info.width,height:info.height},cut=paperMotionCut(5,MOTION_COLUMNS.followthrough,info.width,info.height);
 assert.deepEqual(cut,[256,256,288,256]);
 const old=measurePaperCell(image,{x:256,y:256,width:256,height:256},{includeMask:true,overflow:48}),full=measurePaperCell(image,{x:cut[0],y:cut[1],width:cut[2],height:cut[3]},{includeMask:true,overflow:48}),wider=measurePaperCell(image,{x:256,y:256,width:304,height:256},{includeMask:true,overflow:48});
 const alphaCount=f=>f.mask.reduce((n,owned,i)=>n+(owned&&data[((f.cellY+Math.floor(i/f.cellWidth))*info.width+f.cellX+i%f.cellWidth)*4+3]>=20?1:0),0);
 assert.equal(alphaCount(full)-alphaCount(old),882,'the branch pixels exist in the original source');assert.equal(alphaCount(full),alphaCount(wider),'the corrected cut recovers the full branch');
 assert.deepEqual([full.x,full.y,full.width,full.height],[wider.x,wider.y,wider.width,wider.height]);
 for(let y=0;y<full.cellHeight;y++)assert.equal(full.mask[y*full.cellWidth+full.cellWidth-1],0,'no connected branch reaches the expanded right window');
 assert.equal(full.x+full.anchorX,old.x+old.anchorX);assert.equal(full.y+full.anchorY,old.y+old.anchorY);
 const fixtures=await characterArtFixtures({overflow:48}),idle=fixtures[5].frames.find(f=>f.pose==='idle').bounds,fixture=fixtures[5].frames.find(f=>f.pose==='followthrough');assert.deepEqual(fixture.cut,cut);assert.deepEqual(fixture.bounds,full);
 const normalized=normalizePaperFrame(full,idle),draw=paperFrameGeometry(normalized,normalized.reference,140);assert.ok(Math.abs(draw.bodyHeight-140)<1e-10);assert.equal(draw.footX,0);assert.equal(draw.footY,0);
 for(let character=0;character<8;character++)for(let column=0;column<6;column++){const expected=[column*256,character%4*256,character===5&&column===1?288:256,256];assert.deepEqual(paperMotionCut(character,column,1536,1024),expected);}
 assert.throws(()=>paperMotionCut(8,1,1536,1024),RangeError);
});
test('a long side weapon can extend the sprite without reducing body scale or moving its feet',()=>{
 const im=image(180,160);box(im,63,35,36,110);const body=measurePaperCell(im,{x:0,y:0,width:180,height:160});box(im,97,63,70,9);const sword=measurePaperCell(im,{x:0,y:0,width:180,height:160});assert.equal(sword.bodyHeight,body.bodyHeight);assert.ok(sword.width>body.width*2);for(const frame of[body,sword]){const geometry=paperFrameGeometry(frame,body.bodyHeight,84);assert.equal(geometry.footX,0);assert.equal(geometry.footY,0);assert.ok(Math.abs(geometry.y+frame.anchorY*84/body.bodyHeight)<1e-12);}
});
test('all 48 generated in-between cells are isolated, normalized by row and keep a finite foot anchor',async()=>{
 for(const name of['motion-classic','motion-new']){const{data,info}=await sharp(fileURLToPath(new URL('../public/assets/'+name+'.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1536);assert.equal(info.height,1024);for(let row=0;row<4;row++){const frames=Array.from({length:6},(_,col)=>measurePaperCell({data,width:info.width,height:info.height},{x:col*256,y:row*256,width:256,height:256})),reference=referenceBodyHeight(frames);assert.ok(reference>140&&reference<256);frames.forEach((f,col)=>{assert.equal(f.empty,false);assert.ok(f.x>=col*256&&f.x+f.width<=(col+1)*256);assert.ok(f.y>=row*256&&f.y+f.height<=(row+1)*256);const draw=paperFrameGeometry(f,reference,90);finite(draw);assert.ok(draw.height>60&&draw.height<125);assert.equal(draw.footX,0);assert.equal(draw.footY,0);});}}
});
test('visual memory remains bounded and input actor objects stay unchanged',()=>{
 const a=createPaperAnimator(),p={...actor,prev:{right:true},hand:['private-card']},before=JSON.stringify(p);for(let i=0;i<500;i++)finite(a.sample('actor'+i,p,{time:i*.02,x:100,y:200,moving:true}));assert.ok(a.size<=256);assert.equal(JSON.stringify(p),before);a.reset();assert.equal(a.size,0);
});

test('hitstop freezes a world strike without substituting the idle HUD pose',()=>{
 const a=createPaperAnimator();take(a,actor,0);take(a,actor,.02,{attack:1});const impact=take(a,actor,.1,{attack:.6});assert.equal(impact.pose,'attack-peak');const frozen=take(a,actor,.15,{attack:.6,static:true});assert.equal(frozen.pose,impact.pose);assert.deepEqual(frozen.layers,impact.layers);assert.equal(frozen.sx,impact.sx);assert.equal(frozen.rotation,impact.rotation);assert.equal(frozen.static,true);const thaw=take(a,actor,.166,{attack:.5});assert.equal(thaw.pose,'attack-peak');assert.equal(thaw.footY,430);const portrait=take(a,actor,.18,{attack:.5,static:true,portrait:true});assert.equal(portrait.pose,'idle');
});

test('interrupting a partial windup preserves its exact visible mixture before smoothly arriving at impact',()=>{
 const a=createPaperAnimator();take(a,actor,0);take(a,actor,.01,{specialAnimation:'windup'});
 const previous=take(a,actor,.04,{specialAnimation:'windup'}),interrupted=take(a,actor,.04,{specialAnimation:'active'});
 assert.deepEqual(interrupted.layers,previous.layers,'phase change cannot replace an unfinished blend with its target silhouette');
 assert.equal(interrupted.sx,previous.sx);assert.equal(interrupted.sy,previous.sy);assert.equal(interrupted.rotation,previous.rotation);
 const middle=take(a,actor,.054,{specialAnimation:'active'});assert.ok(middle.layers.some(l=>l.pose==='special-peak'&&l.alpha>.35));assert.ok(middle.layers.length<=3);
 const peak=take(a,actor,.069,{specialAnimation:'active'});assert.deepEqual(peak.layers,[{pose:'special-peak',alpha:1}]);
});

test('gait continuously blends both drawn foot poses and does not cut when crossing a speed tier',()=>{
 const a=createPaperAnimator(),p={...actor,vx:179,prev:{right:true}};let x=200,previous=take(a,p,9.23,{x,moving:true});
 const weight=(out,pose)=>out.layers.find(layer=>layer.pose===pose)?.alpha||0;
 for(let n=1;n<=60;n++){
  const speed=n%2?181:179;x+=speed/60;const out=take(a,{...p,vx:speed},9.23+n/60,{x,moving:true});
  assert.ok(Math.abs(weight(out,'run-contact')-weight(previous,'run-contact'))<.23,'minor speed changes cannot cut a walk half-cycle');
  assert.ok(out.layers.length<=3);assert.ok(Math.abs(out.layers.reduce((sum,l)=>sum+l.alpha,0)-1)<1e-12);previous=out;
 }
 assert.ok(previous.layers.every(layer=>['run-contact','run-passing'].includes(layer.pose)));
 const stopped=take(a,actor,10.23,{x,moving:false});assert.deepEqual(stopped.layers,previous.layers,'letting go preserves the visible walk pose at the transition instant');
 assert.equal(take(a,actor,10.32,{x,moving:false}).layers[0].pose,'idle');
});

test('accelerating walks remain consistent at 30, 60 and 120 samples per second',()=>{
 function run(rate){const a=createPaperAnimator();let out;for(let n=0;n<=rate;n++){const t=n/rate,speed=100+160*t;out=a.sample('actor',{...actor,vx:speed,prev:{right:true}},{time:t,x:200+100*t+80*t*t,y:430,moving:true,grounded:true});}return out;}
 const reference=run(120),weight=(out,pose)=>out.layers.find(layer=>layer.pose===pose)?.alpha||0;
 for(const rate of [30,60]){
  const out=run(rate);assert.ok(Math.abs(out.sx-reference.sx)<.025);assert.ok(Math.abs(out.sy-reference.sy)<.025);assert.ok(Math.abs(out.rotation-reference.rotation)<.012);
  assert.ok(Math.abs(weight(out,'run-contact')-weight(reference,'run-contact'))<.05,'gait phase integrates motion consistently across render rates');
 }
});

test('recoil starts without a rotation cut and settles smoothly instead of shaking on absolute time',()=>{
 const a=createPaperAnimator();take(a,actor,.5);const before=take(a,actor,.75),hit=take(a,{...actor,damage:20},.75);
 assert.equal(hit.sx,before.sx);assert.equal(hit.sy,before.sy);assert.equal(hit.rotation,before.rotation,'damage at the same clock cannot instantly alter the rig');
 let previous=hit;for(let n=1;n<=40;n++){
  const out=take(a,{...actor,damage:20},.75+n/120);assert.ok(Math.abs(out.rotation-previous.rotation)<.04);assert.ok(Math.abs(out.sx-previous.sx)<.055);assert.ok(Math.abs(out.sy-previous.sy)<.04);previous=out;
 }
 assert.equal(previous.hurt,0);assert.ok(Math.abs(previous.sx-1)<.025);assert.ok(Math.abs(previous.sy-1)<.025);
});

test('frequent action changes remain normalized, finite, state-pure and bounded to three cached layers',()=>{
 const a=createPaperAnimator(),p=Object.freeze({...actor,prev:Object.freeze({}),hand:Object.freeze(['private'])}),before=JSON.stringify(p),phases=['windup','active','recovery',''];
 for(let n=0;n<250;n++){
  const out=take(a,p,n/120,{specialAnimation:phases[n%4],moving:n%3===0});finite(out);assert.ok(out.layers.length<=3);assert.ok(out.layers.every(layer=>PAPER_POSES.includes(layer.pose)&&layer.alpha>0));assert.ok(Math.abs(out.layers.reduce((sum,l)=>sum+l.alpha,0)-1)<1e-12);
 }
 assert.equal(JSON.stringify(p),before);assert.equal(a.size,1);
});
