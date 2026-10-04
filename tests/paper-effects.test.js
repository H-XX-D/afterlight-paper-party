import test from 'node:test';
import assert from 'node:assert/strict';
import {paperEffectFrame} from '../src/paper-effects.js';
test('magic effects never select the legacy spiral cells, including ambient loops and progress bursts',()=>{
 for(const time of[0,.083,.16,.25,1,4.7,Infinity,NaN])for(const progress of[undefined,0,.2,.5,.8,1,NaN])assert.deepEqual(paperEffectFrame('magic',time,progress),{row:2,frame:3});
});
test('contact dust and shields retain their distinct bounded four-frame sequences',()=>{
 for(const [type,row]of[['hit',0],['dust',1],['shield',3]])assert.deepEqual([0,.25,.5,.75,1].map(progress=>paperEffectFrame(type,0,progress)),[0,1,2,3,3].map(frame=>({row,frame})));
 assert.deepEqual(paperEffectFrame('hit',Infinity),{row:0,frame:0});
});
