import {paperColorRGB,paperEffectVariant} from './paper-palette.js';

export const PAPER_SOURCE_FILTER='grayscale(.45) sepia(.1) saturate(.9)';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lightness=(data,i)=>(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;

/** Cached raster dye. Alpha and deep printed ink are copied exactly. */
export function tintPaperPixels(pixels,color,strength=.74){
 const result=new Uint8ClampedArray(pixels),rgb=paperColorRGB(color),bright=Math.max(...rgb),amount=clamp(Number.isFinite(strength)?strength:0);
 if(bright===0)return result;
 for(let i=0;i<pixels.length;i+=4){
  if(!pixels[i+3])continue;
  const ink=clamp((lightness(pixels,i)-.12)/.45),t=amount*ink;
  for(let c=0;c<3;c++)result[i+c]=pixels[i+c]*(1-t+t*rgb[c]/bright);
 }
 return result;
}

/** A printed cut rim inside the measured silhouette; this is raster shading,
 * not extrusion. No expanded alpha or shifted feet, weapons or hitboxes. */
export function paperCutEdgePixels(pixels,width,height,radius=2){
 const result=new Uint8ClampedArray(pixels),r=clamp(Math.round(Number.isFinite(radius)?radius:2),1,3),light=[244,235,216],shadow=[151,133,110];
 const alpha=(x,y)=>x<0||y<0||x>=width||y>=height?0:pixels[(y*width+x)*4+3]/255;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,a=pixels[i+3]/255;if(a<=0)continue;
  const high=Math.max(0,a-Math.min(alpha(x-r,y),alpha(x,y-r))),low=Math.max(0,a-Math.min(alpha(x+r,y),alpha(x,y+r))),rim=Math.max(high,low);
  if(rim<=0)continue;
  const pigment=low>high?shadow:light,ink=clamp((lightness(pixels,i)-.08)/.35),strength=rim*ink*(low>high?.35:.24);
  for(let c=0;c<3;c++)result[i+c]=pixels[i+c]*(1-strength)+pigment[c]*strength;
 }
 return result;
}

/** Only 4 frames × 4 effect roles × 5 pigments can be retained. The injected
 * rasterizer runs once for a source/variant, never on a warmed draw path. */
export function createPaperEffectCache(makeSprite){
 const entries=new Map();let builds=0;
 return {
  get(source,type,frame,scene,requestedColor){
   if(!source)return null;
   const variant=paperEffectVariant(scene,type,requestedColor),index=clamp(Math.floor(Number.isFinite(frame)?frame:0),0,3),key=variant.type+':'+index+':'+variant.id,entry=entries.get(key);
   if(entry?.source===source)return entry.sprite;
   const sprite=makeSprite(source,variant.color);entries.set(key,{source,sprite});builds++;return sprite;
  },
  clear(){entries.clear();builds=0},
  get stats(){return {entries:entries.size,builds,maxEntries:80,palettes:5}},
 };
}
