import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {characterPaperRelief,foldPaperCharacterPixels} from '../src/paper-pigment.js';
import {spriteMaterialPixels} from '../src/sprite-materials.js';
import {measurePaperCell} from '../src/paper-animation.js';

function sheet(width=80,height=120){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=5;y<height-5;y++)for(let x=15;x<width-15;x++)data.set([210,202,186,255],(y*width+x)*4);
 return {data,width,height};
}

test('folded character raster preserves every alpha byte, clear pixel, dark ink and source byte',()=>{
 const source=sheet();source.data.set([10,12,14,255],(45*source.width+25)*4);source.data.set([160,170,180,0],0);
 const original=source.data.slice(),out=foldPaperCharacterPixels(source.data,source.width,source.height,{character:3,palette:'frost'});
 assert.deepEqual(source.data,original);assert.equal(out.length,original.length);
 for(let i=0;i<original.length;i+=4){assert.equal(out[i+3],original[i+3]);if(!original[i+3]||original[i]<20)assert.deepEqual(out.slice(i,i+4),original.slice(i,i+4));}
 assert.deepEqual(foldPaperCharacterPixels(original,source.width,source.height,{strength:0}),original);
});

test('broad opposite folded faces create strong opposite normals even on unprinted paper',()=>{
 const {data,width,height}=sheet(),field=characterPaperRelief(data,width,height,{character:0}),{normal,orm}=spriteMaterialPixels(data,width,height,'character:0');
 const left=(55*width+25)*4,right=(55*width+55)*4;
 assert.ok(normal[left]<108,'left folded face tilts toward the key light');assert.ok(normal[right]>148,'right folded face tilts away from it');
 assert.ok(Math.max(...field.relief)>2,'fold has a measurable relief height independent of printed grayscale');
 for(let i=3;i<data.length;i+=4){assert.equal(normal[i],data[i]);assert.equal(orm[i],data[i]);assert.equal(orm[i-1],0,'character stock remains matte dielectric');}
 const flat=spriteMaterialPixels(data,width,height,'paper');assert.ok(Math.abs(flat.normal[left]-128)<5,'generic props retain their existing paper relief');
});

test('crease and inward stock layers are alpha bounded and deterministic for all eight voices',()=>{
 const {data,width,height}=sheet(),variants=[];
 for(let character=0;character<8;character++){
  const first=characterPaperRelief(data,width,height,{character}),second=characterPaperRelief(data,width,height,{character});assert.deepEqual(first,second);
  for(let i=0;i<first.relief.length;i++)if(!data[i*4+3]){assert.equal(first.relief[i],0);assert.equal(first.crease[i],0);assert.equal(first.edge[i],0);}
  assert.ok(first.crease.some(n=>n>.25));assert.ok(first.edge.some(n=>n>.8));
  variants.push(Buffer.from(first.relief.buffer).toString('base64'));
 }
 assert.equal(new Set(variants).size,8,'fold axes vary deterministically by traveler');
});

test('all real generated pose cells retain exact foot anchors while adding visible folded pigment',async()=>{
 let changed=0,totalOpaque=0;
 for(const name of ['motion-classic','motion-new']){
  const file=fileURLToPath(new URL('../public/assets/'+name+'.webp',import.meta.url));
  for(let row=0;row<4;row++)for(let col=0;col<6;col++){
   const {data,info}=await sharp(file).extract({left:col*256,top:row*256,width:256,height:256}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const original=new Uint8ClampedArray(data),out=foldPaperCharacterPixels(original,info.width,info.height,{character:row+(name==='motion-new'?4:0)}),rect={x:0,y:0,width:256,height:256};
   assert.deepEqual(measurePaperCell({data:original,width:256,height:256},rect),measurePaperCell({data:out,width:256,height:256},rect),name+' cell '+row+':'+col);
   assert.deepEqual(new Uint8ClampedArray(data),original);
   let poseChanged=0;
   for(let i=0;i<out.length;i+=4){assert.equal(out[i+3],original[i+3]);if(!original[i+3])assert.deepEqual(out.slice(i,i+4),original.slice(i,i+4));else{totalOpaque++;if(Math.max(Math.abs(out[i]-original[i]),Math.abs(out[i+1]-original[i+1]),Math.abs(out[i+2]-original[i+2]))>6){changed++;poseChanged++;}}}
   assert.ok(poseChanged>100,'each actual pose receives visible face/rim treatment');
  }
 }
 assert.ok(changed/totalOpaque>.15,'treatment is broad folded face lighting, rather than a few cosmetic edge pixels');
});

test('character armor uses folded normals but retains selective existing foil masking',()=>{
 const {data,width,height}=sheet(),paper=spriteMaterialPixels(data,width,height,'character:4'),armor=spriteMaterialPixels(data,width,height,'character-foil:4');
 assert.deepEqual(armor.normal,paper.normal);assert.ok(armor.orm.some((v,i)=>i%4===2&&v>0));
 assert.throws(()=>characterPaperRelief(data,width+1,height),RangeError);assert.throws(()=>characterPaperRelief(data,0,height),RangeError);
 const clear=new Uint8ClampedArray(16);assert.deepEqual(foldPaperCharacterPixels(clear,2,2),clear);
});
