import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bakePaperBoard,bakePaperPlatforms,paperBoardStats,paperPlatformStats,paperSolidMatrix,paperSolidGeometry,PAPER_PLATFORM_CELLS} from '../src/paper-board.js';
import {paperAlphaContours} from '../src/paper-geometry.js';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} versus ${expected}`);

test('physical board front faces preserve Canvas anchors under every authored rotation and anchor type',()=>{
 for(const type of ['stone','gate','ladder','chute'])for(const rotation of [-1.3,-.028,0,.73,Math.PI]){
  const anchor=type==='stone'?.34:type==='gate'?.91:.5,c={type,x:321,y:287,w:48,h:32,options:{rotation}},matrix=paperSolidMatrix(c,8);
  const at=new THREE.Vector3(0,.5-anchor,0).applyMatrix4(matrix);near(at.x+480,c.x);near(270-at.y,c.y);near(at.z,0);
  const back=new THREE.Vector3(0,.5-anchor,-1).applyMatrix4(matrix);near(back.z,-8);assert.ok(Math.hypot(back.x-at.x,back.y-at.y)>6,'depth projects visibly behind its fixed front');
  for(const [u,v]of[[-.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]]){
   const p=new THREE.Vector3(u,v,0).applyMatrix4(matrix),localX=u*c.w,localY=(.5-anchor-v)*c.h;
   near(p.x+480,c.x+localX*Math.cos(rotation)-localY*Math.sin(rotation));near(270-p.y,c.y+localX*Math.sin(rotation)+localY*Math.cos(rotation));
  }
 }
});

test('real portal cut geometry retains its opening, normalized artwork UVs and a physical rear face',()=>{
 const width=32,height=32,data=new Uint8ClampedArray(width*height*4);
 for(let y=3;y<30;y++)for(let x=4;x<28;x++){if(x>=10&&x<22&&y>=9&&y<26)continue;data[(y*width+x)*4+3]=255;}
 const geometry=paperSolidGeometry(paperAlphaContours({width,height,data}));
 const positions=geometry.attributes.position,uv=geometry.attributes.uv;
 assert.ok(geometry.groups.some(g=>g.materialIndex===1&&g.count>0));
 const depths=new Set();for(let n=0;n<positions.count;n++){near(uv.getX(n),positions.getX(n)+.5);near(uv.getY(n),positions.getY(n)+.5);depths.add(positions.getZ(n));}
 assert.deepEqual(depths,new Set([-1,0]));
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),ray=new THREE.Raycaster(new THREE.Vector3(0,0,10),new THREE.Vector3(0,0,-1));mesh.updateMatrixWorld();
 assert.equal(ray.intersectObject(mesh).length,0,'center ray passes through the actual opening');
 ray.set(new THREE.Vector3(-.3,0,10),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(mesh).length>=2,'paper pillar has front and rear intersections');mesh.material.dispose();geometry.dispose();
});

test('padded platform atlas preserves original printed bounds and leaves room for its physical cut depth',()=>{
 assert.equal(PAPER_PLATFORM_CELLS.length,4);
 for(const cell of PAPER_PLATFORM_CELLS){
  assert.ok(cell.contentY>18&&cell.contentY+cell.contentHeight<232,'250px row retains rim/shadow margins');
  const source={type:'platform-'+cell.index,x:480,y:cell.y+125,w:cell.contentWidth,h:cell.contentHeight,options:{anchor:.5}},matrix=paperSolidMatrix(source,6,cell.index*.002,960,1000);
  const topLeft=new THREE.Vector3(-.5,.5,0).applyMatrix4(matrix);near(topLeft.x+480,cell.contentX);near(500-topLeft.y-cell.y,cell.contentY);
  // Runtime padding cancellation must retain the old top/left art anchors.
  const x=145,y=310,w=370,h=61,sx=w/cell.contentWidth,sy=h/cell.contentHeight;
  near(x-cell.contentX*sx+cell.contentX*sx,x);near(y-cell.contentY*sy+cell.contentY*sy,y);
 }
});

test('non-DOM hosts return a safe fallback and platform diagnostics cannot overwrite board status',()=>{
 assert.equal(bakePaperBoard([],()=>{}),null);const board=paperBoardStats();assert.equal(board.available,false);assert.match(board.reason,/Canvas\/WebGL/);
 assert.equal(bakePaperPlatforms(()=>{}),null);assert.equal(paperPlatformStats().available,false);assert.deepEqual(paperBoardStats(),board);
 assert.throws(()=>paperSolidMatrix({type:'stone',x:NaN,y:0,w:20,h:20},2),RangeError);
});
