import test from 'node:test';
import assert from 'node:assert/strict';
import {spriteMaterialPixels,spriteMaterialUniforms} from '../src/sprite-materials.js';
import {paperPalette,paperColorRGB} from '../src/paper-palette.js';
import {sceneLighting} from '../src/scene-lighting.js';
const pixels=new Uint8ClampedArray([35,30,26,0,210,201,180,255,75,70,68,180,240,232,215,255]);
test('paper material keeps source alpha and zero metallic reflectance',()=>{const {normal,orm}=spriteMaterialPixels(pixels,2,2);for(let i=0;i<4;i++){assert.equal(normal[i*4+3],pixels[i*4+3]);assert.equal(orm[i*4+3],pixels[i*4+3]);assert.equal(orm[i*4+2],0);assert.ok(orm[i*4+1]>=220)}assert.deepEqual(pixels,new Uint8ClampedArray([35,30,26,0,210,201,180,255,75,70,68,180,240,232,215,255]))});
test('normal relief responds to printed height and foil remains selectively masked',()=>{const {normal,orm}=spriteMaterialPixels(pixels,2,2,'foil');assert.ok(normal.some((v,i)=>i%4<2&&Math.abs(v-128)>4));assert.ok(orm[6]>orm[2]);assert.ok(orm[14]>0&&orm[14]<255);assert.ok(orm[5]<220)});

test('the actual shader input path binds distinct realm edge, bounce and selective foil pigments',()=>{
 const pigmentOutputs=[];
 for(const id of ['world','mothlight','trace','inkfall','sweep']){
  const profile=sceneLighting({id,time:9}),before=JSON.stringify(profile),data=spriteMaterialUniforms(profile),palette=paperPalette(id);
  assert.equal(data.palette,palette.id);assert.deepEqual(data.edgeColor,paperColorRGB(palette.edge));assert.deepEqual(data.bounceColor,paperColorRGB(palette.bounce));assert.deepEqual(data.metalColor,paperColorRGB(palette.metal));assert.equal(data.tintStrength,palette.spriteTint);
  assert.deepEqual(data,spriteMaterialUniforms(structuredClone(profile)));assert.equal(JSON.stringify(profile),before);
  assert.equal(data.positions.length,24);assert.equal(data.colors.length,24);pigmentOutputs.push(data.bounceColor.join(','));
 }
 assert.equal(new Set(pigmentOutputs).size,5);
});

test('foreground material upload is capped at six finite lights and ignores extra source fields',()=>{
 const data=spriteMaterialUniforms({palette:{id:'frost'},ambient:{color:'invalid',intensity:Infinity},key:{x:NaN,y:-Infinity,z:Infinity,color:null,intensity:-9},fill:{x:100000,y:-100000,z:10000,intensity:100},points:Array.from({length:100},(_,i)=>({x:i,color:'#aabbcc',intensity:i+1,radius:60})),hand:['private']});
 assert.equal(data.positions.length,24);assert.equal(data.colors.length,24);
 assert.ok([...data.positions,...data.colors,...data.ambientColor].every(Number.isFinite));
 assert.equal(data.colors[3],0);assert.ok(Math.abs(data.colors[7]-2.4)<.000001);
 for(let i=0;i<6;i++)assert.ok(data.colors[i*4+3]>=0&&data.colors[i*4+3]<=2.400001);
 assert.equal(data.palette,'frost');assert.ok(!Object.hasOwn(data,'hand'));assert.deepEqual(data.ambientColor,[1,1,1]);
 assert.equal(spriteMaterialUniforms(null).palette,'ivory');
});
