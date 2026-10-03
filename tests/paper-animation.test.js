import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createPaperAnimator,measurePaperCell,referenceBodyHeight,paperFrameGeometry,PAPER_POSES,MOTION_COLUMNS} from '../src/paper-animation.js';
const actor={id:'paper',character:0,move:'slash',ground:0,damage:0,score:0,vx:0,vy:0,prev:{}};
const take=(animation,p,t,options={})=>structuredClone(animation.sample('actor',p,{time:t,x:400,y:430,grounded:true,...options}));
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const v of Object.values(value))finite(v);};

test('a real attack pulse retains anticipation, impact and followthrough after attack returns to zero',()=>{
 const a=createPaperAnimator();take(a,actor,0);assert.equal(take(a,actor,.016,{attack:1}).pose,'anticipation');assert.equal(take(a,actor,.083,{attack:.67}).pose,'attack-peak');assert.equal(take(a,actor,.19,{attack:.13}).pose,'followthrough');assert.equal(take(a,actor,.24,{attack:0}).pose,'followthrough');assert.equal(take(a,actor,.4,{attack:0}).pose,'idle');
});
test('each special phase selects a different generated pose without altering its actor',()=>{
 const a=createPaperAnimator(),p=Object.freeze({...actor,specialKind:'ground-slam',specialProgress:.5});for(const [phase,pose]of[['windup','special-windup'],['active','special-peak'],['recovery','special-recovery']]){assert.equal(take(a,p,1,{specialAnimation:phase}).pose,pose);}
 assert.equal(p.specialProgress,.5);assert.equal(PAPER_POSES.length,9);assert.equal(Object.keys(MOTION_COLUMNS).length,6);
});
test('crossfade is bounded to two cached poses and completes in 45 milliseconds',()=>{
 const a=createPaperAnimator();take(a,actor,0);take(a,actor,.01,{specialAnimation:'windup'});const mid=take(a,actor,.03,{specialAnimation:'windup'});assert.equal(mid.layers.length,2);assert.ok(mid.layers[0].alpha>0&&mid.layers[1].alpha>0);assert.ok(Math.abs(mid.layers.reduce((s,l)=>s+l.alpha,0)-1)<1e-12);assert.equal(take(a,actor,.056,{specialAnimation:'windup'}).layers.length,1);
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
