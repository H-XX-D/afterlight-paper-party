import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {PAPER_PALETTES,paperEffectVariant} from '../src/paper-palette.js';
import {tintPaperPixels,paperCutEdgePixels,createPaperEffectCache,PAPER_SOURCE_FILTER} from '../src/paper-pigment.js';
import {measurePaperCell} from '../src/paper-animation.js';

test('cached raster dye preserves exact source alpha, deep ink and original source bytes',()=>{
 const source=new Uint8ClampedArray([255,255,255,255,18,20,24,180,200,180,150,0,200,180,150,128]),before=new Uint8ClampedArray(source),tint=tintPaperPixels(source,'#a9cbd8');
 assert.deepEqual(source,before);
 for(let i=3;i<source.length;i+=4)assert.equal(tint[i],source[i]);
 assert.deepEqual(tint.slice(4,8),source.slice(4,8));assert.deepEqual(tint.slice(8,12),source.slice(8,12));
 assert.ok(tint[0]<tint[2],'frost pigment is visible on light paper');assert.equal(tint[2],255);
 assert.deepEqual(tintPaperPixels(source,'#000000'),source);assert.deepEqual(tintPaperPixels(source,'#abcdef',0),source);
 assert.equal(PAPER_SOURCE_FILTER,'grayscale(.45) sepia(.1) saturate(.9)');
});

test('all generated pixel FX receive visibly distinct muted pigments without alpha damage',async()=>{
 const file=fileURLToPath(new URL('../public/assets/pixel-fx.webp',import.meta.url));
 const {data}=await sharp(file).extract({left:0,top:0,width:313,height:313}).resize(64,64).ensureAlpha().raw().toBuffer({resolveWithObject:true}),versions=[];
 for(const palette of Object.values(PAPER_PALETTES)){
  const out=tintPaperPixels(data,palette.fx.hit);let changed=0;
  for(let i=0;i<data.length;i+=4){assert.equal(out[i+3],data[i+3]);if(out[i]!==data[i]||out[i+1]!==data[i+1]||out[i+2]!==data[i+2])changed++;}
  assert.ok(changed>100,'generated effect receives actual visible pigment');versions.push(Buffer.from(out).toString('base64'));
 }
 assert.equal(new Set(versions).size,5);
});

test('inside-silhouette cut rim shades opposing edges but does not modify dimensions or center ink',()=>{
 const width=12,height=12,source=new Uint8ClampedArray(width*height*4);
 for(let y=2;y<10;y++)for(let x=2;x<10;x++)source.set([200,195,180,255],(y*width+x)*4);
 source.set([12,13,14,255],(2*width+4)*4);
 const out=paperCutEdgePixels(source,width,height,2),top=(2*width+5)*4,bottom=(9*width+5)*4,center=(6*width+6)*4;
 assert.ok(out[top]>source[top]);assert.ok(out[bottom]<source[bottom]);
 assert.deepEqual(out.slice(center,center+4),source.slice(center,center+4));assert.deepEqual(out.slice((2*width+4)*4,(2*width+4)*4+4),source.slice((2*width+4)*4,(2*width+4)*4+4));
 for(let i=3;i<source.length;i+=4)assert.equal(out[i],source[i]);
});

test('cut-edge raster shading preserves the measured foot anchor of real generated motion art',async()=>{
 const file=fileURLToPath(new URL('../public/assets/motion-classic.webp',import.meta.url));
 const {data,info}=await sharp(file).extract({left:0,top:0,width:256,height:256}).ensureAlpha().raw().toBuffer({resolveWithObject:true}),out=paperCutEdgePixels(data,info.width,info.height,2),rect={x:0,y:0,width:256,height:256};
 assert.deepEqual(measurePaperCell({data,width:256,height:256},rect),measurePaperCell({data:out,width:256,height:256},rect));
 let changed=0;for(let i=0;i<data.length;i+=4)if(data[i]!==out[i]||data[i+1]!==out[i+1]||data[i+2]!==out[i+2])changed++;
 assert.ok(changed>100,'printed rim is present on the actual generated silhouette');
});

test('effect cache retains at most80 sprites despite arbitrary scene clocks and requested colors',()=>{
 const sources=Array.from({length:16},()=>({pixels:new Uint8ClampedArray([255,255,255,255])}));let builds=0;
 const cache=createPaperEffectCache((source,color)=>{builds++;return tintPaperPixels(source.pixels,color)}),types=['hit','dust','magic','shield'];
 for(const palette of Object.values(PAPER_PALETTES))for(let row=0;row<4;row++)for(let frame=0;frame<4;frame++)cache.get(sources[row*4+frame],types[row],frame,palette.id);
 assert.equal(builds,80);assert.equal(cache.stats.entries,80);
 for(let n=0;n<2000;n++){const row=n%4,frame=n%4,color='#'+((n*198763)%0x1000000).toString(16).padStart(6,'0');cache.get(sources[row*4+frame],types[row],frame,{id:'trace',time:n,privateCards:['never read']},color);}
 assert.equal(builds,80,'warm path uses prepared rasters, no repeated tint/readback');assert.equal(cache.stats.entries,80);
 assert.equal(cache.get(null,'magic',0,'world'),null);
 const first=cache.get(sources[0],'hit',0,'sage'),again=cache.get(sources[0],'hit',0,'mothlight');assert.equal(first,again);
 cache.clear();assert.deepEqual(cache.stats,{entries:0,builds:0,maxEntries:80,palettes:5});
});

test('explicit hue requests resolve to the closest allowed effect pigment with stable identity',()=>{
 for(const palette of Object.values(PAPER_PALETTES))for(const type of ['hit','dust','magic','shield']){
  const variant=paperEffectVariant('world',type,palette.fx[type]);assert.equal(variant.id,palette.id);assert.equal(variant.color,palette.fx[type]);assert.ok(Object.isFrozen(variant));
 }
 assert.equal(paperEffectVariant('mothlight','magic','invalid').id,'sage');assert.equal(paperEffectVariant('world','constructor').type,'magic');
});
