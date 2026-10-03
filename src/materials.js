/**
 * Authored surface measurements for the paper theater. These are material data,
 * not replacement illustrations: all generated character/realm art stays intact.
 * Normal = tangent-space RGB, AO = red, roughness = green, metalness = blue.
 * Every map is linear/non-color data when uploaded to a graphics API.
 */
export const MATERIAL_KINDS=Object.freeze(['paper','corrugation','foil']);

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const TAU=Math.PI*2;
function noise(x,y,seed){
  let n=Math.imul(x+seed,374761393)^Math.imul(y-seed,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}

/** Pure, deterministic data path; usable in tests and non-Three renderers. */
export function createMaterialPixels(kind='paper',size=128,seed=2147){
  if(!MATERIAL_KINDS.includes(kind))throw new RangeError('Unknown paper material: '+kind);
  if(!Number.isInteger(size)||size<16||size>512)throw new RangeError('Material size must be an integer from 16 to 512');
  if(!Number.isFinite(seed))throw new RangeError('Material seed must be finite');
  seed=seed|0;
  const height=new Float32Array(size*size),normal=new Uint8ClampedArray(size*size*4),ao=new Uint8ClampedArray(normal.length),roughness=new Uint8ClampedArray(normal.length),metalness=new Uint8ClampedArray(normal.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,fiber=Math.sin(TAU*(u*23+Math.sin(v*TAU*2)*.08)),fine=noise(x,y,seed)-.5;
    const folds=Math.pow(.5+.5*Math.cos(u*TAU*2+Math.sin(v*TAU)*.11),24);
    let value=.52+fiber*.014+Math.sin(v*TAU*39)*.004+fine*.013-folds*.042;
    if(kind==='corrugation')value=.5+Math.cos(u*TAU*12)*.12+Math.cos(v*TAU*34)*.012+fine*.012;
    if(kind==='foil')value=.52+Math.sin(TAU*(u*4+v*3))*.015+Math.cos(TAU*(u*13-v*5))*.005+fine*.005-folds*.018;
    height[y*size+x]=value;
  }
  const at=(x,y)=>height[((y%size+size)%size)*size+(x%size+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,h=at(x,y),strength=kind==='corrugation'?4.2:5.2;
    const dx=(at(x+1,y)-at(x-1,y))*strength,dy=(at(x,y+1)-at(x,y-1))*strength;
    const inv=1/Math.hypot(dx,dy,1);
    normal[i]=(-dx*inv*.5+.5)*255;normal[i+1]=(dy*inv*.5+.5)*255;normal[i+2]=(inv*.5+.5)*255;normal[i+3]=255;
    // Heightfield horizon approximation: recessed fibers/folds lose ambient
    // illumination. This is baked micro-AO, independent of world shadow maps.
    let cavity=0;
    for(const r of [2,4,8])cavity+=Math.max(0,(at(x+r,y)+at(x-r,y)+at(x,y+r)+at(x,y-r))*.25-h);
    const occlusion=clamp(1-cavity*(kind==='corrugation'?2.4:5.6),.53,1);
    const grain=noise(x,y,seed+337),worn=grain>.92;
    const rough=kind==='foil'?clamp(.40+grain*.18+(worn?.19:0),.38,.8):clamp(.85+grain*.12+(kind==='corrugation'?.025:0),.85,1);
    const metal=kind==='foil'?(worn?.35:.96):0;
    for(let c=0;c<3;c++){ao[i+c]=occlusion*255;roughness[i+c]=rough*255;metalness[i+c]=metal*255;}
    ao[i+3]=roughness[i+3]=metalness[i+3]=255;
  }
  return {kind,size,height,normal,ao,roughness,metalness};
}

/** Convert authored measurements into Canvas images without a Three dependency. */
export function generateMaterialMaps({size=128,seed=2147,canvasFactory}={}){
  const make=canvasFactory||((width,height)=>{
    if(typeof document==='undefined')throw new Error('Material canvases require a document or canvasFactory');
    const c=document.createElement('canvas');c.width=width;c.height=height;return c;
  });
  const result={size,source:'authored periodic paper heightfield',colorSpace:'linear'};
  for(const kind of MATERIAL_KINDS){
    const pixels=createMaterialPixels(kind,size,seed),maps={};
    for(const key of ['normal','ao','roughness','metalness']){
      const canvas=make(size,size);canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('2D context unavailable for material data');
      const image=ctx.createImageData(size,size);image.data.set(pixels[key]);ctx.putImageData(image,0,0);maps[key]=canvas;
    }
    result[kind]=maps;
  }
  return result;
}
