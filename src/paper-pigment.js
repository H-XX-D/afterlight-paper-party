import {paperColorRGB,paperEffectVariant,paperPalette} from './paper-palette.js';

export const PAPER_SOURCE_FILTER='grayscale(.45) sepia(.1) saturate(.9)';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const lightness=(data,i)=>(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
const smoothstep=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};

/** Cloth dyes are traveler identities, independent of the current realm light.
 * Their value/saturation differ as well as hue; faces and tools stay ivory. */
export const CHARACTER_CLOTH_STYLES=Object.freeze([
 ['Pip','Copper red','#b85f51'],['Moth','Moon teal','#4c9690'],
 ['Bolt','Clockwork amber','#bc963f'],['Wisp','Dusk violet','#8c70ac'],
 ['Rook','Steel blue','#557e9e'],['Briar','Thorn sage','#799b60'],
 ['Vellum','Ink berry','#a45381'],['Nix','Frost blue','#79b5c5'],
].map(([name,label,color],character)=>Object.freeze({character,name,label,color,headEnd:character===3?.56:.44,hemEnd:.92,halfWidth:.26})));

function characterLandmarks(width,height,metrics={}){
 const bodyHeight=Math.max(1,Math.min(height,Number.isFinite(metrics.bodyHeight)?metrics.bodyHeight:height)),bodyTop=Number.isFinite(metrics.bodyTop)?metrics.bodyTop:Math.max(0,(Number.isFinite(metrics.anchorY)?metrics.anchorY:height)-bodyHeight);
 return {bodyHeight,bodyTop,centerX:Number.isFinite(metrics.bodyCenterX)?metrics.bodyCenterX:Number.isFinite(metrics.anchorX)?metrics.anchorX:width/2};
}
function validCharacterPixels(pixels,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels.length!==width*height*4)throw new RangeError('Character paper pixels must match positive integer dimensions.');
}

/** A source-tone reference from ivory head paper, excluding dark printed ink.
 * This is measured once per pose, before dye/folds; it never samples scene light. */
export function measureCharacterTone(pixels,width,height,{metrics={}}={}){
 validCharacterPixels(pixels,width,height);
 const {bodyTop,bodyHeight}=characterLandmarks(width,height,metrics),samples=[];
 for(let y=Math.max(0,Math.floor(bodyTop));y<Math.min(height,Math.ceil(bodyTop+bodyHeight*.44));y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,luma=lightness(pixels,i)*255;if(pixels[i+3]<160||luma<125)continue;
  samples.push({luma,r:pixels[i],g:pixels[i+1],b:pixels[i+2]});
 }
 if(!samples.length)return Object.freeze({paperLuma:215,paperRGB:Object.freeze([224,216,199]),samples:0});
 samples.sort((a,b)=>a.luma-b.luma);const paper=samples[Math.floor((samples.length-1)*.72)],near=samples.filter(sample=>Math.abs(sample.luma-paper.luma)<9),mass=Math.max(1,near.length);
 return Object.freeze({paperLuma:paper.luma,paperRGB:Object.freeze(['r','g','b'].map(channel=>near.reduce((sum,sample)=>sum+sample[channel],0)/mass)),samples:samples.length});
}

/** Soft body-landmark mask. This deliberately leaves the entire head, outer
 * wings/weapons and feet out of the dye, rather than tinting a sprite rectangle. */
export function characterClothMask(pixels,width,height,{character=0,metrics={}}={}){
 validCharacterPixels(pixels,width,height);const style=CHARACTER_CLOTH_STYLES[clamp(Math.floor(Number.isFinite(character)?character:0),0,7)],{bodyTop,bodyHeight,centerX}=characterLandmarks(width,height,metrics),mask=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*width+x,i=at*4;if(!pixels[i+3])continue;
  const v=(y-bodyTop)/bodyHeight,side=Math.abs(x-centerX)/(bodyHeight*style.halfWidth),vertical=smoothstep(style.headEnd,style.headEnd+.075,v)*(1-smoothstep(style.hemEnd-.045,style.hemEnd,v)),paper=lightness(pixels,i)*255;
  // Ivory chin/beak paper and shiny held tools can enter the torso band in a
  // crouch. Protect that bright stock rather than mistaking it for colored cloth.
  const ivory=1-smoothstep(175,225,paper),facePaper=1-(1-smoothstep(.61,.67,v))*smoothstep(110,175,paper);
  mask[at]=vertical*(1-smoothstep(.72,1,side))*ivory*facePaper;
 }
 return mask;
}

/** Cached pose preparation: normalize its paper to the idle source tone, then
 * dye cloth through a soft body mask. Exact alpha, clear pixels and deep ink
 * remain untouched. Printing grain/creases remain in the source luminance. */
export function harmonizePaperCharacterPixels(pixels,width,height,{character=0,metrics={},toneReference=null,strength=1}={}){
 validCharacterPixels(pixels,width,height);const result=new Uint8ClampedArray(pixels),amount=clamp(Number.isFinite(strength)?strength:0),source=measureCharacterTone(pixels,width,height,{metrics}),target=toneReference||source,mask=characterClothMask(pixels,width,height,{character,metrics}),style=CHARACTER_CLOTH_STYLES[clamp(Math.floor(Number.isFinite(character)?character:0),0,7)],dye=paperColorRGB(style.color).map(value=>value*255),dyeLuma=dye[0]*.2126+dye[1]*.7152+dye[2]*.0722,targetLuma=Number.isFinite(target.paperLuma)?target.paperLuma:source.paperLuma,ratio=clamp(targetLuma/Math.max(1,source.paperLuma),.75,1.28),targetRGB=target.paperRGB||source.paperRGB,targetChroma=targetRGB.map(value=>value-targetLuma);
 if(!amount)return result;
 for(let i=0;i<pixels.length;i+=4){
  if(!pixels[i+3])continue;const luma=lightness(pixels,i)*255,ink=smoothstep(29,66,luma);if(!ink)continue;
  const level=luma*(1+(ratio-1)*ink),cloth=mask[i/4]*ink*amount,clothLevel=level*.76+12*ink;
  for(let c=0;c<3;c++){
   const neutral=level+(pixels[i+c]-luma)*.36+targetChroma[c]*.64,matched=pixels[i+c]+(neutral-pixels[i+c])*ink*amount,dyed=clothLevel*dye[c]/Math.max(1,dyeLuma);
   result[i+c]=matched*(1-cloth*.88)+dyed*cloth*.88;
  }
 }
 return result;
}

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
  const pigment=low>high?shadow:light,ink=clamp((lightness(pixels,i)-.12)/.35),strength=rim*ink*(low>high?.35:.24);
  for(let c=0;c<3;c++)result[i+c]=pixels[i+c]*(1-strength)+pigment[c]*strength;
 }
 return result;
}

/** Physical face folds for character material preparation. Values are sampled
 * once per cached pose; none of these operations belongs on a warmed draw path.
 * Broad folded faces follow the actual alpha silhouette instead of crossing its
 * empty rectangle. The source alpha is never dilated or displaced. */
export function characterPaperRelief(pixels,width,height,{character=0}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels.length!==width*height*4)throw new RangeError('Character paper pixels must match positive integer dimensions.');
 const relief=new Float32Array(width*height),crease=new Float32Array(width*height),edge=new Float32Array(width*height);
 const rows=Array.from({length:height},()=>({left:width,right:-1})),columns=new Float64Array(width);
 let left=width,right=-1,top=height,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=pixels[(y*width+x)*4+3]/255;if(a<.03)continue;
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  rows[y].left=Math.min(rows[y].left,x);rows[y].right=Math.max(rows[y].right,x);columns[x]+=a;
 }
 const bounds={left,right,top,bottom};if(right<left)return {relief,crease,edge,bounds};
 const bodyHeight=Math.max(1,bottom-top),bodyWidth=Math.max(1,right-left),radius=clamp(Math.round(Math.min(bodyWidth,bodyHeight)*.024),2,6);
 // A held weapon may widen one row. The densest silhouette column supplies a
 // stable body axis and prevents such appendages moving the main torso fold.
 const massCenter=columns.reduce((sum,a,x)=>sum+a*x,0)/Math.max(.0001,columns.reduce((sum,a)=>sum+a,0));
 let axis=left;for(let x=left+1;x<=right;x++)if(columns[x]>columns[axis]||(columns[x]===columns[axis]&&Math.abs(x-massCenter)<Math.abs(axis-massCenter)))axis=x;
 const central=[];for(let x=Math.max(left,axis-Math.ceil(bodyWidth*.1));x<=Math.min(right,axis+Math.ceil(bodyWidth*.1));x++)central.push([x,columns[x]]);
 const center=central.reduce((sum,[x,a])=>sum+x*a,0)/Math.max(.0001,central.reduce((sum,[,a])=>sum+a,0));
 const id=Number.isInteger(character)?((character%8)+8)%8:0,tilt=[-.035,.025,-.015,.04,-.025,.02,-.045,.03][id],foldOffset=[-.02,.015,.03,-.01,.015,-.025,.02,-.015][id];
 const alpha=(x,y)=>x<0||y<0||x>=width||y>=height?0:pixels[(y*width+x)*4+3]/255;
 for(let y=top;y<=bottom;y++)for(let x=rows[y].left;x<=rows[y].right;x++){
  const at=y*width+x,a=alpha(x,y);if(!a)continue;
  const v=(y-top)/bodyHeight,row=rows[y],ridge=clamp(center+bodyWidth*(foldOffset+tilt*(v-.5)),row.left+1,row.right-1),half=Math.max(2,Math.min(bodyWidth*.35,Math.max(ridge-row.left,row.right-ridge))),u=(x-ridge)/half;
  const face=Math.max(0,1-Math.abs(u)),shoulder=Math.max(0,1-Math.abs(v-.33)/.09),hem=Math.max(0,1-Math.abs(v-.72)/.115);
  relief[at]=(face*.095+shoulder*.018+hem*.014)*bodyWidth;
  // Crease shadows remain narrow; broad plane slopes provide most of the form.
  crease[at]=Math.max(Math.max(0,1-Math.abs(x-ridge)/Math.max(1,bodyWidth*.006))*.64,Math.max(0,1-Math.abs(v-.33)/.008)*.2,Math.max(0,1-Math.abs(v-.72)/.009)*.16);
  let distance=radius;for(let r=1;r<=radius;r++)if(Math.min(alpha(x-r,y),alpha(x+r,y),alpha(x,y-r),alpha(x,y+r))<a*.45){distance=r-1;break;}
  edge[at]=1-distance/radius;
 }
 return {relief,crease,edge,bounds};
}

/** Character-only folded-face pigment and layered cut stock. The exact alpha,
 * clear pixels and darkest original ink are copied; this is a raster relief
 * treatment, while characterPaperRelief supplies its matching light normals. */
export function foldPaperCharacterPixels(pixels,width,height,{character=0,palette='ivory',strength=1,metrics=null}={}){
 const result=new Uint8ClampedArray(pixels),field=characterPaperRelief(pixels,width,height,{character}),color=paperPalette(palette),edgeRGB=paperColorRGB(color.edge).map(v=>v*255),paperRGB=paperColorRGB(color.paper).map(v=>v*255),amount=clamp(Number.isFinite(strength)?strength:0,0,1.4),body=metrics?characterLandmarks(width,height,metrics):null;
 if(!amount)return result;
 const heightAt=(x,y)=>field.relief[clamp(y,0,height-1)*width+clamp(x,0,width-1)];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*width+x,i=at*4;if(!pixels[i+3])continue;
  const ink=clamp((lightness(pixels,i)-.12)/.5);if(!ink)continue;
  const nx=clamp((heightAt(x-1,y)-heightAt(x+1,y))*.5,-.5,.5),ny=clamp((heightAt(x,y-1)-heightAt(x,y+1))*.5,-.5,.5),plane=clamp(1-nx*.47-ny*.32-field.crease[at]*.075,.73,1.18),rim=field.edge[at];
  // Four inward stock layers make thickness legible at game scale. Layer
  // pigment sits within the existing edge pixels, with no background strokes.
  const rib=(Math.cos((1-rim)*Math.PI*5)*.5+.5),layer=clamp(rim*.34*amount*ink),highlight=nx+ny<0;
  // Ivory faces should not change exposure as the costume silhouette changes.
  // Their quieter fold still keeps surface detail; the coat receives the full ridge.
  const head=body?1-smoothstep(.4,.49,(y-body.bodyTop)/body.bodyHeight):0,faceAmount=1-head*.9;
  for(let c=0;c<3;c++){
   const shaded=pixels[i+c]*(1+(plane-1)*amount*ink*faceAmount),edgeTone=highlight?paperRGB[c]*(.84+.16*rib):edgeRGB[c]*(.69+.18*rib),faceLayer=layer*faceAmount;
   result[i+c]=shaded*(1-faceLayer)+edgeTone*faceLayer;
  }
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
