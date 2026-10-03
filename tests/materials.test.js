import test from 'node:test';
import assert from 'node:assert/strict';
import {MATERIAL_KINDS,createMaterialPixels,generateMaterialMaps} from '../src/materials.js';
import {createPaperWorld} from '../src/paper-world.js';

test('authored material maps are deterministic, bounded and contain unit normals',()=>{
  for(const kind of MATERIAL_KINDS){
    const a=createMaterialPixels(kind,64,2147),b=createMaterialPixels(kind,64,2147);
    assert.deepEqual(a,b);
    for(let i=0;i<a.normal.length;i+=4){
      const n=[a.normal[i],a.normal[i+1],a.normal[i+2]].map(c=>c/255*2-1);
      assert.ok(Math.abs(Math.hypot(...n)-1)<.014,kind+' unit normal');
      assert.equal(a.normal[i+3],255);assert.ok(a.normal[i+2]>200);
    }
    assert.ok(new Set(a.normal).size>20,kind+' has surface variation');
    assert.ok(Math.min(...a.ao)<240,kind+' has actual recessed AO');
    assert.ok(new Set(a.roughness).size>15,kind+' has roughness variation');
  }
});

test('paper and cut edges remain non-metallic, foil alone gets rough worn metal',()=>{
  for(const kind of ['paper','corrugation']){
    const data=createMaterialPixels(kind,32);
    for(let i=0;i<data.metalness.length;i+=4){assert.equal(data.metalness[i+2],0);assert.ok(data.roughness[i+1]>=216);}
  }
  const foil=createMaterialPixels('foil',32);
  assert.ok(foil.metalness.some((v,i)=>i%4===2&&v>230));
  assert.ok(foil.metalness.some((v,i)=>i%4===2&&v<100));
  assert.ok(foil.roughness.some((v,i)=>i%4===1&&v>170));
});

test('seed changes fibers without changing map dimensions or paper metalness',()=>{
  const a=createMaterialPixels('paper',64,12),b=createMaterialPixels('paper',64,13);
  assert.notDeepEqual(a.normal,b.normal);assert.deepEqual(a.metalness,b.metalness);
  assert.equal(a.normal.length,64*64*4);
});

test('canvas export writes all twelve measured maps and uses no graphics dependency',()=>{
  let writes=0;
  const result=generateMaterialMaps({size:32,canvasFactory:()=>({getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(image){writes++;assert.equal(image.data.length,32*32*4);}};}})});
  assert.equal(writes,12);assert.equal(result.colorSpace,'linear');
  for(const kind of MATERIAL_KINDS)for(const map of ['normal','ao','roughness','metalness'])assert.equal(result[kind][map].width,32);
});

test('invalid dimensions and surface kinds fail explicitly',()=>{
  assert.throws(()=>createMaterialPixels('plastic',32),RangeError);
  for(const size of [0,15,33.5,513,NaN])assert.throws(()=>createMaterialPixels('paper',size),RangeError);
  assert.throws(()=>createMaterialPixels('paper',32,Infinity),RangeError);
});

test('a host without graphics returns a safe renderer with honest diagnostics',()=>{
  const world=createPaperWorld({});
  assert.equal(world.stats.available,false);assert.equal(world.draw(null),false);
  assert.equal(world.stats.materialMaps.ready,false);assert.equal(world.stats.materials.pbr,0);
  assert.deepEqual(world.setFeatures({ao:false,lighting:false}),{ao:false,normals:true,metallic:true,lighting:false});
  world.dispose();assert.equal(world.draw(null,'world',Infinity),false);
});
