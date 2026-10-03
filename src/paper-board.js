import * as THREE from 'three';
import {paperAlphaContours} from './paper-geometry.js';
import {paperPalette} from './paper-palette.js';

let diagnostics={available:false,mode:'illustrated fallback'};
export function paperBoardStats(){return {...diagnostics};}
let platformDiagnostics={available:false,mode:'illustrated fallback'};
export function paperPlatformStats(){return {...platformDiagnostics};}
export const PAPER_PLATFORM_CELLS=Object.freeze([165,880*235/974,880*281/1179,880*250/1280].map((height,index)=>Object.freeze({index,x:0,y:index*250,width:960,height:250,contentX:40,contentY:(250-height)/2,contentWidth:880,contentHeight:height})));
const report=(kind,value)=>{if(kind==='platforms')platformDiagnostics=value;else diagnostics=value;};

/** Front faces project to the Canvas anchor exactly. Negative local z is the
 * real cut depth; a tiny layer separation preserves authored overlap ordering. */
export function paperSolidMatrix(command,depth,layer=0,width=960,height=540){
 const {type,x,y,w,h,options={}}=command,anchor=options.anchor??(type==='stone'?.34:type==='gate'?.91:.5),rotation=-(options.rotation||0),c=Math.cos(rotation),s=Math.sin(rotation),offset=(.5-anchor)*h;
 if(![x,y,w,h,depth,layer,width,height,anchor,rotation].every(Number.isFinite)||w<=0||h<=0||depth<=0)throw new RangeError('Paper solids require finite positive dimensions');
 return new THREE.Matrix4().set(c*w,-s*h,-.34*depth,x-width/2+s*offset,s*w,c*h,.7*depth,height/2-y-c*offset,0,0,depth,layer,0,0,0,1);
}

/** The same normalized alpha contour drives both physical faces and their UVs. */
export function paperSolidGeometry(contour){
 const shape=new THREE.Shape(contour.outer.map(([x,y])=>new THREE.Vector2(x,y)));for(const hole of contour.holes)shape.holes.push(new THREE.Path(hole.map(([x,y])=>new THREE.Vector2(x,y))));
 const uv={generateTopUV(g,v,a,b,c){return [a,b,c].map(i=>new THREE.Vector2(v[i*3]+.5,v[i*3+1]+.5));},generateSideWallUV(g,v,a,b,c,d){return [a,b,c,d].map(i=>new THREE.Vector2(v[i*3]+.5,v[i*3+1]+.5));}};
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,steps:1,curveSegments:1,UVGenerator:uv});geometry.translate(0,0,-1);return geometry;
}

export function bakePaperPlatforms(drawPiece){
 const commands=PAPER_PLATFORM_CELLS.map(cell=>({type:'platform-'+cell.index,x:480,y:cell.y+125,w:cell.contentWidth,h:cell.contentHeight,options:{anchor:.5}}));
 return bakePaperBoard(commands,drawPiece,{width:960,height:1000,scale:1,kind:'platforms'});
}

/** Bake genuine alpha-cut paper solids at the board's fixed orthographic angle.
 * The moving camera can reuse the result without a third per-frame WebGL pass.
 * Screen anchors are unchanged: depth projects behind each printed front face.
 */
export function bakePaperBoard(commands,drawPiece,{width=960,height=540,scale=1.5,kind='board'}={}){
 const started=globalThis.performance?.now?.()??Date.now();
 let renderer,sun;const geometries=new Set(),materials=new Set(),textures=new Set();
 if(typeof document==='undefined'){report(kind,{available:false,mode:'illustrated fallback',reason:'Canvas/WebGL unavailable on this host'});return null;}
 try{
  const canvas=document.createElement('canvas');
  renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setSize(width*scale,height*scale,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0,0);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,2000);camera.position.z=1000;
  scene.add(new THREE.HemisphereLight(0xf3e8d2,0x858b9a,2.1));
  sun=new THREE.DirectionalLight(0xffedd4,2.5);sun.position.set(-280,370,650);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-width*.58,right:width*.58,top:height*.66,bottom:-height*.66,near:1,far:1600});sun.shadow.mapSize.set(2048,kind==='platforms'?2048:1024);sun.shadow.bias=-.00025;sun.shadow.normalBias=.15;scene.add(sun);
  const shade=new THREE.ShadowMaterial({opacity:.27}),groundGeometry=new THREE.PlaneGeometry(width+120,height+120);materials.add(shade);geometries.add(groundGeometry);
  const ground=new THREE.Mesh(groundGeometry,shade);ground.position.z=-24;ground.receiveShadow=true;scene.add(ground);
  const templates=new Map(),frontMaterials=new Map(),edgeMaterials=new Map(),paletteNames=['sage','copper','violet','frost','copper','ivory'];
  let vertices=0,maxDepth=0,solids=0;
  function template(command){
   const {type,options={}}=command,key=[type,options.start??0,options.end??1].join(':');if(templates.has(key))return templates.get(key);
   const platform=type.startsWith('platform-'),image=document.createElement('canvas');image.width=platform?512:type==='gate'?128:type==='stone'?192:64;image.height=platform?192:type==='gate'?192:128;
   drawPiece(image.getContext('2d'),type,image.width/2,image.height/2,image.width,image.height,{...options,rotation:0,alpha:1,anchor:.5});
   const sample=document.createElement('canvas');sample.width=platform?128:48;sample.height=platform?64:48;const sc=sample.getContext('2d',{willReadFrequently:true});sc.drawImage(image,0,0,sample.width,sample.height);
   const contour=paperAlphaContours(sc.getImageData(0,0,sample.width,sample.height),{threshold:80,minArea:2,maxHoles:12});if(contour.outer.length<3){templates.set(key,null);return null;}
   const geometry=paperSolidGeometry(contour);geometries.add(geometry);
   const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.add(texture);
   const result={geometry,texture};templates.set(key,result);return result;
  }
  for(const [order,command] of commands.entries()){
   const {type,x,y,w,h,options={}}=command,t=template(command);if(!t)continue;
   const palette=paperPalette(paletteNames[command.realm??5]),alpha=Math.max(0,Math.min(1,Number.isFinite(options.alpha)?options.alpha:1)),frontKey=t.texture.uuid+':'+palette.id+':'+alpha;
   let front=frontMaterials.get(frontKey);if(!front){front=new THREE.MeshStandardMaterial({map:t.texture,color:new THREE.Color(palette.paper).lerp(new THREE.Color('#ffffff'),.78),roughness:.97,metalness:0,alphaTest:.12,opacity:alpha,transparent:alpha<1,side:THREE.DoubleSide,forceSinglePass:true});frontMaterials.set(frontKey,front);materials.add(front);}
   // Original printed ink stays on both broad faces. Only the freshly cut edge
   // receives a stronger muted paper pigment. Sampling the front's transparent
   // boundary here would make an opaque black rim instead of a cut paper edge.
   const edgeKey=palette.id+':'+alpha;let edge=edgeMaterials.get(edgeKey);if(!edge){edge=new THREE.MeshStandardMaterial({color:palette.edge,roughness:1,metalness:0,opacity:alpha,transparent:alpha<1,side:THREE.DoubleSide,forceSinglePass:true});edgeMaterials.set(edgeKey,edge);materials.add(edge);}
   const mesh=new THREE.Mesh(t.geometry,[front,edge]),depth=type.startsWith('platform-')?6:type==='gate'?3.4:type==='stone'?Math.max(1.8,Math.min(8,h*.23)):2.2;
   // This oblique shear is part of the solid's geometry transform, not a second
   // sprite shadow: back faces, rims and their cast shadows occupy real depth.
   mesh.matrixAutoUpdate=false;mesh.matrix.copy(paperSolidMatrix(command,depth,order*.002,width,height));mesh.renderOrder=order;
   mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);vertices+=t.geometry.attributes.position.count;maxDepth=Math.max(maxDepth,depth);solids++;
  }
  renderer.render(scene,camera);
  if(renderer.getContext().isContextLost())throw new Error('Paper bake context was lost');
  const result=document.createElement('canvas');result.width=width*scale;result.height=height*scale;result.getContext('2d').drawImage(canvas,0,0);
  report(kind,{available:true,mode:'cached orthographic paper solids',solids,vertices,maxDepth,templates:templates.size,materials:materials.size,textures:textures.size,geometries:geometries.size,boardStops:commands.filter(c=>c.stop).length,shadowMap:[2048,kind==='platforms'?2048:1024],bakeSize:[result.width,result.height],bakeMilliseconds:(globalThis.performance?.now?.()??Date.now())-started,resourcesReleased:true,perFrameWebGLPasses:0});
  return result;
 }catch(error){report(kind,{available:false,mode:'illustrated fallback',reason:String(error?.message||error)});return null;}
 finally{sun?.shadow.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();renderer?.dispose();renderer?.forceContextLoss();}
}
