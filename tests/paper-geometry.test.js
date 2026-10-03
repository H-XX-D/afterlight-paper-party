import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {paperReliefData,paperWingData,paperAlphaContours} from '../src/paper-geometry.js';
const source=(width=48,height=32)=>({width,height,data:new Uint8ClampedArray(width*height*4).fill(255)});
const fill=(im,x,y,w,h,value,alpha=255)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*im.width+xx)*4;im.data[i]=im.data[i+1]=im.data[i+2]=value;im.data[i+3]=alpha;}};
function validGeometry(g){
 assert.ok(g.positions.length>12);assert.equal(g.positions.length/3,g.uv.length/2);assert.equal(g.indices.length%3,0);
 assert.ok([...g.positions,...g.uv].every(Number.isFinite));assert.ok(g.uv.every(v=>v>=0&&v<=1));assert.ok(g.indices.every(i=>i<g.positions.length/3));
 for(let i=0;i<g.indices.length;i+=3){const a=g.indices[i],b=g.indices[i+1],c=g.indices[i+2];assert.ok(a!==b&&b!==c&&a!==c,'triangles never repeat vertices');}
 assert.equal(g.groups.reduce((s,g)=>s+g.count,0),g.indices.length);
}
test('printed architecture produces real local relief and keeps source UVs fixed',()=>{
 const im=source(),flat=paperReliefData(im,{columns:24,rows:16});fill(im,1,8,10,15,20);const relief=paperReliefData(im,{columns:24,rows:16});validGeometry(relief);assert.deepEqual(relief.uv,flat.uv);assert.deepEqual(relief.indices,flat.indices);assert.ok(relief.depthRange[1]-relief.depthRange[0]>1.5);
 let raised=0,unchanged=0;for(let i=2;i<relief.positions.length;i+=3){if(relief.positions[i]>flat.positions[i]+.1)raised++;else if(Math.abs(relief.positions[i]-flat.positions[i])<1e-7)unchanged++;}assert.ok(raised>25);assert.ok(unchanged>200);assert.deepEqual(paperReliefData(im,{columns:24,rows:16}),relief);
 for(let n=0;n<relief.positions.length/3;n++){const z=relief.positions[n*3+2],ratio=(46.1-z)/46.1,u=relief.uv[n*2],v=1-relief.uv[n*2+1];assert.ok(Math.abs(relief.positions[n*3]/ratio-(u-.5)*72)<1e-5);assert.ok(Math.abs(1.45+(relief.positions[n*3+1]-1.45)/ratio-(.5-v)*40.5)<1e-5);}
});
test('folded contour wings are closed volumes with separate printed faces and cut edges',()=>{
 const im=source();fill(im,0,0,8,32,20);fill(im,8,12,6,10,20);
 for(const side of[-1,1])for(const near of[false,true]){const g=paperWingData(im,{side,near});validGeometry(g);assert.equal(g.groups.length,2);assert.equal(g.groups[1].materialIndex,1);assert.ok(g.groups[1].count>0);assert.equal(g.positions.length/3,g.frontCount*2);assert.ok(g.depthRange[1]-g.depthRange[0]>1.8);
  for(let n=0;n<g.frontCount;n++){assert.ok(Math.abs(g.positions[n*3+2]-g.positions[(n+g.frontCount)*3+2]-.2)<1e-5);}
  const edgeCounts=new Map();for(let n=0;n<g.indices.length;n+=3)for(let k=0;k<3;k++){const a=g.indices[n+k],b=g.indices[n+(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);edgeCounts.set(key,(edgeCounts.get(key)||0)+1);}assert.ok([...edgeCounts.values()].every(v=>v===2),'each edge joins exactly two faces');
 }
});
test('layer UVs project to their original picture positions at the reference camera',()=>{
 const im=source();fill(im,0,5,15,20,30);
 for(const near of[false,true])for(const side of[-1,1]){const g=paperWingData(im,{near,side});for(let i=0;i<g.frontCount;i++){const x=g.positions[i*3],y=g.positions[i*3+1],z=g.positions[i*3+2],u=g.uv[i*2],v=1-g.uv[i*2+1],ratio=(26.1-z)/46.1;
  assert.ok(Math.abs(x/ratio-(u-.5)*72)<1e-5);assert.ok(Math.abs(4.45+(y-4.45)/ratio-(3+(.5-v)*40.5))<1e-5);
  if(side<0)assert.ok(u<=.261);else assert.ok(u>=.739);
 }}
});
test('ink contours vary with the image while all geometry remains deterministically bounded',()=>{
 const a=source(),b=source();fill(a,0,0,5,32,0);fill(b,0,0,5,32,0);fill(b,0,9,13,12,0);
 const one=paperWingData(a),two=paperWingData(b);assert.notDeepEqual(one.contour,two.contour);assert.deepEqual(two,paperWingData(b));assert.ok(two.positions.length/3<600);assert.ok(paperReliefData(a).positions.length/3<1500);
});
test('alpha contours preserve a physical portal opening and reject detached flecks',()=>{
 const im=source(32,32);im.data.fill(0);fill(im,4,3,24,27,150);fill(im,10,9,12,17,0,0);fill(im,0,0,2,2,255);const out=paperAlphaContours(im);
 assert.equal(out.outer.length,4);assert.equal(out.holes.length,1);assert.equal(out.holes[0].length,4);assert.equal(out.pixelArea,24*27-12*17);for(const p of[out.outer,...out.holes])assert.ok(p.every(([x,y])=>x>=-.5&&x<=.5&&y>=-.5&&y<=.5));
 const empty=source(8,8);empty.data.fill(0);assert.deepEqual(paperAlphaContours(empty),{outer:[],holes:[],pixelArea:0});
});
test('all24 original realm illustrations yield bounded unique relief and four shaped layers',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../assets-manifest.json',import.meta.url))),scenes=manifest.images.filter(x=>x.name.startsWith('scene-'));assert.equal(scenes.length,24);const signatures=new Set();
 for(const asset of scenes){const{data,info}=await sharp(fileURLToPath(new URL('../public/assets/'+asset.file,import.meta.url))).resize(192,108).ensureAlpha().raw().toBuffer({resolveWithObject:true}),image={data,width:info.width,height:info.height},r=paperReliefData(image);validGeometry(r);assert.ok(r.depthRange[1]-r.depthRange[0]>.45,asset.name+' has physical relief');signatures.add(Array.from(r.positions.filter((_,i)=>i%3===2)).map(n=>n.toFixed(2)).join(','));for(const side of[-1,1])for(const near of[false,true])validGeometry(paperWingData(image,{side,near}));}
 assert.equal(signatures.size,24,'every realm derives depth from its own artwork');
});
test('invalid source and nonfinite geometry dimensions fail before GPU upload',()=>{
 assert.throws(()=>paperReliefData({width:1,height:2,data:[]}),RangeError);assert.throws(()=>paperReliefData(source(),{depth:NaN}),RangeError);assert.throws(()=>paperWingData(source(),{thickness:Infinity}),RangeError);
});
