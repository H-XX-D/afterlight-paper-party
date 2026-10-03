import test from 'node:test';
import assert from 'node:assert/strict';
import {spriteMaterialPixels} from '../src/sprite-materials.js';
const pixels=new Uint8ClampedArray([35,30,26,0,210,201,180,255,75,70,68,180,240,232,215,255]);
test('paper material keeps source alpha and zero metallic reflectance',()=>{const {normal,orm}=spriteMaterialPixels(pixels,2,2);for(let i=0;i<4;i++){assert.equal(normal[i*4+3],pixels[i*4+3]);assert.equal(orm[i*4+3],pixels[i*4+3]);assert.equal(orm[i*4+2],0);assert.ok(orm[i*4+1]>=220)}assert.deepEqual(pixels,new Uint8ClampedArray([35,30,26,0,210,201,180,255,75,70,68,180,240,232,215,255]))});
test('normal relief responds to printed height and foil remains selectively masked',()=>{const {normal,orm}=spriteMaterialPixels(pixels,2,2,'foil');assert.ok(normal.some((v,i)=>i%4<2&&Math.abs(v-128)>4));assert.ok(orm[6]>orm[2]);assert.ok(orm[14]>0&&orm[14]<255);assert.ok(orm[5]<220)});
