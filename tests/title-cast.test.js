import test from 'node:test';
import assert from 'node:assert/strict';
import {TITLE_CELEBRATION_DURATION,TITLE_CAST_CHARACTERS,getTitleCelebrationFrame,getTitleCastLayout,renderTitleCast,createTitleCast} from '../src/title-cast.js';
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const v of Object.values(value))finite(v);};

test('all four left-facing title travelers wind up, show their own special, and recover',()=>{
 assert.deepEqual(TITLE_CAST_CHARACTERS,[0,1,2,3]);
 for(const id of TITLE_CAST_CHARACTERS){const start=getTitleCelebrationFrame(id,0),peak=getTitleCelebrationFrame(id,.31),recovery=getTitleCelebrationFrame(id,.7),done=getTitleCelebrationFrame(id,TITLE_CELEBRATION_DURATION);assert.equal(start.facing,-1);assert.equal(start.pose,'special-windup');assert.equal(peak.pose,'special-peak');assert.equal(recovery.pose,'special-recovery');assert.equal(done.finished,true);assert.equal(done.pose,'idle');assert.equal(done.dx,0);assert.equal(done.jump,0);assert.equal(done.scaleX,1);assert.equal(done.scaleY,1);}
});
test('celebrations have distinct spatial gestures and character-specific paper effects',()=>{
 const frames=TITLE_CAST_CHARACTERS.map(id=>getTitleCelebrationFrame(id,.34));
 assert.equal(new Set(frames.map(f=>JSON.stringify([f.dx,f.jump,f.rotation,f.scaleX,f.scaleY]))).size,4);
 assert.ok(frames[0].dx<frames[1].dx-40);assert.ok(frames[1].jump>frames[2].jump*2);assert.equal(frames[0].effect,'dust');assert.equal(frames[2].prop.kind,'gear');assert.equal(frames[3].prop.kind,'lantern');
});
test('the sampled rubber recoil stays finite and continuous and returns to its exact foot anchor',()=>{
 for(const id of TITLE_CAST_CHARACTERS){let last;for(let i=0;i<=880;i++){const frame=getTitleCelebrationFrame(id,i/1000);finite(frame);assert.ok(frame.scaleX>.7&&frame.scaleX<1.4);assert.ok(frame.scaleY>.7&&frame.scaleY<1.4);if(last){assert.ok(Math.abs(frame.dx-last.dx)<2);assert.ok(Math.abs(frame.jump-last.jump)<2);assert.ok(Math.abs(frame.rotation-last.rotation)<.03);}last=frame;}assert.equal(last.dx,0);assert.equal(last.jump,0);}
});
test('reduced motion completes quickly with idle silhouettes and no travel, tilt or stretch',()=>{
 for(const id of TITLE_CAST_CHARACTERS)for(const t of[0,.06,.12,.3,.88]){const f=getTitleCelebrationFrame(id,t,{reducedMotion:true});assert.equal(f.pose,'idle');assert.equal(f.dx,0);assert.equal(f.jump,0);assert.equal(f.rotation,0);assert.equal(f.scaleX,1);assert.equal(f.scaleY,1);assert.equal(f.finished,t>=.12);}
});
test('invalid sampler inputs stay safe and do not escape the four-character cast',()=>{
 for(const id of[-10,Infinity,NaN,70])for(const t of[NaN,Infinity,-3]){const f=getTitleCelebrationFrame(id,t);finite(f);assert.ok(TITLE_CAST_CHARACTERS.includes(f.character));}
});
test('right-side layout keeps distinct depth order and every foot inside the title canvas',()=>{
 for(const [w,h]of[[960,900],[672,720],[760,840]]){const layout=getTitleCastLayout(w,h);assert.equal(layout.length,4);assert.equal(new Set(layout.map(p=>p.depth)).size,4);for(const p of layout){finite(p);assert.ok(p.x>0&&p.x<w);assert.ok(p.y>p.size&&p.y<h);assert.ok(p.size>100);}}
});
function mockCanvas(){const noop=()=>{},ctx={clearRect:noop,save:noop,restore:noop,beginPath:noop,ellipse:noop,fill:noop,globalAlpha:1,fillStyle:''},canvas={width:960,height:900,getContext:()=>ctx};ctx.canvas=canvas;return{canvas,ctx};}
test('cast rendering uses the playable art helpers, holds facing left, and never alters helpers',()=>{
 const {ctx}=mockCanvas(),calls=[],helpers={character(...args){calls.push(args);},fx(){},prop(){},beginScene(){}};const before=Object.keys(helpers);const result=renderTitleCast(ctx,2,{helpers,celebrationStart:1.7});assert.equal(result.characters.length,4);assert.equal(calls.length,4);for(const call of calls){assert.equal(call[5].facing,-1);assert.equal(call[5].specialAnimation,'active');assert.match(call[1].id,/^title-cast-/);}assert.deepEqual(Object.keys(helpers),before);
});
test('controller has one clock-owned celebration, returns its duration, and resets safely',()=>{
 const {canvas}=mockCanvas(),cast=createTitleCast(canvas,{character(){}});assert.equal(cast.celebrate(1),.88);assert.equal(cast.draw(1.3).finished,false);assert.equal(cast.draw(1.9).finished,true);cast.reset();assert.equal(cast.draw(2).celebrating,false);cast.setReducedMotion(true);assert.equal(cast.celebrate(3),.12);assert.equal(cast.draw(3.13).finished,true);assert.equal(cast.stats.reducedMotion,true);
});
