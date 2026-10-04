import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createPaperAtlasFrames,paperAtlasDrawRect} from '../src/paper-atlas.js';
import {cleanPaperEnvironmentPixels} from '../src/paper-environment.js';

async function fixture(name,columns,rows){
 const manifest=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../assets-manifest.json',import.meta.url)),'utf8')),file=manifest.images.find(image=>image.name===name).file;
 const {data,info}=await sharp(fileURLToPath(new URL('../public/assets/'+file,import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),pixels=cleanPaperEnvironmentPixels(data),image={data:pixels,width:info.width,height:info.height};
 return {image,atlas:createPaperAtlasFrames(image,{columns,rows,overflow:48})};
}
const fixtures=Promise.all([fixture('props',4,3),fixture('paper-objects',3,3)]);

test('real prop overflow recovers handles, rotors, rails, rope supports and sign edges',async()=>{
 const [{atlas:props},{atlas:objects}]=await fixtures;
 for(const index of[0,1,2,3,4,5,8])assert.ok(props.frames[index].recoveredPixels>100,'prop '+index+' recovers connected pixels outside its original cell');
 assert.ok(props.frames[1].sourceY+props.frames[1].height>440,'the lantern base is no longer cut at row418');
 assert.ok(props.frames[4].sourceX+props.frames[4].width>=350,'the drone keeps its far rotor');
 assert.ok(props.frames[8].sourceX+props.frames[8].width>=360,'the platform keeps its right rail and leg');
 assert.ok(objects.frames[1].sourceX<418&&objects.frames[1].sourceX+objects.frames[1].width>836,'rope bridge supports span both nominal sides');
 assert.ok(objects.frames[6].sourceX+objects.frames[6].width>435,'the sign keeps its right ornament');
});

test('touching printed neighbors keep their own art rather than lending rotors or sign ornaments',async()=>{
 const [{atlas:props},{atlas:objects}]=await fixtures;
 assert.ok(props.frames[5].sourceX>=300,'umbrella excludes the drone torso and detached rotor branches');
 assert.ok(props.frames[5].sourceX+props.frames[5].width>650,'the umbrella retains its actual far canopy edge');
 assert.ok(props.frames[6].sourceX>=690,'the key contains no umbrella edge');
 assert.ok(props.frames[9].sourceX>=350,'the switch contains no platform leg');
 assert.ok(objects.frames[7].sourceX>=470,'the crate contains no neighboring sign ornament');
});

test('all21 source pieces retain exact source RGBA, bounded crops and unique pixel ownership',async()=>{
 for(const {image,atlas}of await fixtures){const before=new Uint8ClampedArray(image.data),seen=new Uint8Array(image.width*image.height);
  for(const frame of atlas.frames){assert.equal(frame.empty,false);assert.ok(frame.alphaPixels>5000);const n=frame.nominal;
   assert.ok(frame.sourceX>=Math.floor(n.x)-49&&frame.sourceY>=Math.floor(n.y)-49);assert.ok(frame.sourceX+frame.width<=Math.ceil(n.x+n.width)+49&&frame.sourceY+frame.height<=Math.ceil(n.y+n.height)+49);
   for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){const at=(y*frame.width+x)*4;if(!frame.pixels[at+3])continue;const index=(frame.sourceY+y)*image.width+frame.sourceX+x;assert.equal(seen[index],0,'a source pixel cannot appear in neighboring sprites');seen[index]=1;for(let c=0;c<4;c++)assert.equal(frame.pixels[at+c],image.data[index*4+c],'retained antialias and original ink stay byte-exact');}
  }
  assert.deepEqual(image.data,before);
 }
});

test('tight caches preserve original grid placement and scale at every display size',async()=>{
 for(const {atlas}of await fixtures)for(const frame of atlas.frames)for(const size of[24,77,160]){
  const x=137,y=218,w=size,h=size*.7,rect=paperAtlasDrawRect(frame,x,y,w,h),sx=frame.sourceX+frame.width*.37,sy=frame.sourceY+frame.height*.61;
  assert.ok(Math.abs(rect.x+(sx-frame.sourceX)/frame.width*rect.width-(x+(sx-frame.nominal.x)/frame.nominal.width*w))<1e-9);
  assert.ok(Math.abs(rect.y+(sy-frame.sourceY)/frame.height*rect.height-(y+(sy-frame.nominal.y)/frame.nominal.height*h))<1e-9);
 }
 assert.deepEqual(paperAtlasDrawRect(null,10,20,30,40),{x:10,y:20,width:30,height:40});
});

test('a narrow accidental contact does not fuse neighboring grid owners',()=>{
 const width=120,height=70,data=new Uint8ClampedArray(width*height*4),put=(x,y)=>data.set([210,202,185,255],(y*width+x)*4);
 for(let y=15;y<55;y++)for(let x=10;x<48;x++)put(x,y);
 for(let y=15;y<55;y++)for(let x=72;x<110;x++)put(x,y);
 for(let x=48;x<72;x++)put(x,34);
 const {frames}=createPaperAtlasFrames({data,width,height},{columns:2,rows:1,overflow:48});
 assert.ok(frames[0].sourceX+frames[0].width<72);assert.ok(frames[1].sourceX>47);assert.ok(frames[0].alphaPixels>1500&&frames[1].alphaPixels>1500);
 const repeat=createPaperAtlasFrames({data,width,height},{columns:2,rows:1,overflow:48});assert.deepEqual(repeat.frames,frames);
});

test('invalid atlas inputs reject before raster or GPU preparation and overflow stays finite',()=>{
 const image={data:new Uint8ClampedArray(16),width:2,height:2};
 assert.throws(()=>createPaperAtlasFrames(image,{columns:0,rows:1}),RangeError);assert.throws(()=>createPaperAtlasFrames({...image,width:3},{columns:1,rows:1}),RangeError);
 assert.equal(createPaperAtlasFrames(image,{columns:1,rows:1,overflow:Infinity}).overflow,0);assert.equal(createPaperAtlasFrames(image,{columns:1,rows:1,overflow:999}).overflow,48);
});
