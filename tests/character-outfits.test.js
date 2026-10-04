import test from 'node:test';
import assert from 'node:assert/strict';
import {characterArtFixtures} from './character-art-fixtures.js';
import {CHARACTER_CLOTH_STYLES,characterClothMask,measureCharacterTone,harmonizePaperCharacterPixels,paperCutEdgePixels,foldPaperCharacterPixels} from '../src/paper-pigment.js';
import {measurePaperCell} from '../src/paper-animation.js';

const luma=(pixels,i)=>pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
function prepare(frame,character,tone){
 const {pixels,width,height,bounds}=frame;
 const matched=harmonizePaperCharacterPixels(pixels,width,height,{character,metrics:bounds,toneReference:tone});
 return foldPaperCharacterPixels(paperCutEdgePixels(matched,width,height,Math.max(width,height)*.008),width,height,{character,metrics:bounds});
}
const fixtures=characterArtFixtures({overflow:48});

test('eight immutable cloth identities have distinct hues and original traveler names',()=>{
 assert.ok(Object.isFrozen(CHARACTER_CLOTH_STYLES));assert.deepEqual(CHARACTER_CLOTH_STYLES.map(style=>style.name),['Pip','Moth','Bolt','Wisp','Rook','Briar','Vellum','Nix']);
 assert.equal(new Set(CHARACTER_CLOTH_STYLES.map(style=>style.color)).size,8);
 for(const style of CHARACTER_CLOTH_STYLES){assert.ok(Object.isFrozen(style));assert.match(style.color,/^#[0-9a-f]{6}$/);assert.ok(style.headEnd>=.44);}
});

test('soft cloth mask excludes head, feet, outer tools and clear pixels without a rectangular overlay',()=>{
 const width=120,height=160,pixels=new Uint8ClampedArray(width*height*4),metrics={bodyTop:10,bodyHeight:140,bodyCenterX:60,anchorX:60,anchorY:150};
 for(let y=10;y<151;y++)for(let x=15;x<106;x++)pixels.set([164,155,139,255],(y*width+x)*4);
 for(let character=0;character<8;character++){
  const mask=characterClothMask(pixels,width,height,{character,metrics});
  assert.equal(mask[42*width+60],0,'ivory head never receives costume dye');assert.equal(mask[149*width+60],0,'foot silhouette never receives costume dye');assert.equal(mask[105*width+16],0,'a held object outside the torso remains neutral');assert.equal(mask[0],0);
  assert.ok(mask[112*width+60]>.95);assert.ok(mask.some(value=>value>0&&value<1),'transition is feathered rather than a solid rectangular recolor');
 }
});

test('tone and clothing preparation preserves exact alpha, darkest ink, source bytes and foot metrics in every real pose',async()=>{
 let dyed=0;
 for(const {character,frames}of await fixtures){const idle=frames[0],tone=measureCharacterTone(idle.pixels,idle.width,idle.height,{metrics:idle.bounds});
  for(const frame of frames){const before=frame.pixels.slice(),matched=harmonizePaperCharacterPixels(frame.pixels,frame.width,frame.height,{character,metrics:frame.bounds,toneReference:tone}),out=prepare(frame,character,tone),rect={x:0,y:0,width:frame.width,height:frame.height};
   assert.deepEqual(frame.pixels,before);
   for(let i=0;i<out.length;i+=4){assert.equal(matched[i+3],before[i+3]);assert.equal(out[i+3],before[i+3]);if(!before[i+3])assert.deepEqual(out.slice(i,i+4),before.slice(i,i+4));if(luma(before,i)<=29){assert.deepEqual(matched.slice(i,i+4),before.slice(i,i+4));assert.deepEqual(out.slice(i,i+4),before.slice(i,i+4));}if(Math.max(...[0,1,2].map(c=>Math.abs(matched[i+c]-before[i+c])))>12)dyed++;}
   assert.deepEqual(measurePaperCell({data:out,width:frame.width,height:frame.height},rect),measurePaperCell({data:before,width:frame.width,height:frame.height},rect),'pigment must not shift its measured foot anchor');
  }
 }
 assert.ok(dyed>25000,'costumes change a substantial printed region across the original atlases');
});

test('all nine prepared poses match idle paper exposure within five percent and each voice varies less than four percent',async()=>{
 for(const {character,frames}of await fixtures){const idle=frames[0],tone=measureCharacterTone(idle.pixels,idle.width,idle.height,{metrics:idle.bounds}),values=[];
  for(const frame of frames){const out=prepare(frame,character,tone),prepared=measureCharacterTone(out,frame.width,frame.height,{metrics:frame.bounds});assert.ok(Math.abs(prepared.paperLuma/tone.paperLuma-1)<.05,`${CHARACTER_CLOTH_STYLES[character].name} ${frame.pose} paper exposure`);values.push(prepared.paperLuma);}
  assert.ok((Math.max(...values)-Math.min(...values))/tone.paperLuma<.04,CHARACTER_CLOTH_STYLES[character].name+' does not flash between source sheets');
 }
});

test('head paper stays warm neutral while eight actual idle costumes retain distinct chroma',async()=>{
 const colors=[];
 for(const {character,frames}of await fixtures){const frame=frames[0],tone=measureCharacterTone(frame.pixels,frame.width,frame.height,{metrics:frame.bounds}),matched=harmonizePaperCharacterPixels(frame.pixels,frame.width,frame.height,{character,metrics:frame.bounds,toneReference:tone}),mask=characterClothMask(frame.pixels,frame.width,frame.height,{character,metrics:frame.bounds});let sum=[0,0,0],mass=0;
  for(let i=0;i<matched.length;i+=4){if(mask[i/4]>.85&&matched[i+3]>200&&luma(frame.pixels,i)>50&&luma(frame.pixels,i)<180){for(let c=0;c<3;c++)sum[c]+=matched[i+c];mass++;}}
  assert.ok(mass>100);const rgb=sum.map(value=>value/mass),level=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;colors.push(rgb.map(value=>value/level));
  const head=measureCharacterTone(matched,frame.width,frame.height,{metrics:frame.bounds}).paperRGB;assert.ok(head[0]>=head[1]&&head[1]>=head[2],'faces remain warm ivory rather than outfit-colored');
 }
 for(let a=0;a<colors.length;a++)for(let b=a+1;b<colors.length;b++)assert.ok(Math.hypot(...colors[a].map((value,c)=>value-colors[b][c]))>.12,'actual outfit chroma must distinguish travelers '+a+' and '+b);
});

test('head-aware folds remain subtle without losing the original torso crease treatment',()=>{
 const width=80,height=120,pixels=new Uint8ClampedArray(width*height*4);for(let y=5;y<115;y++)for(let x=15;x<65;x++)pixels.set([219,211,196,255],(y*width+x)*4);
 const metrics={bodyTop:5,bodyHeight:110,bodyCenterX:40,anchorX:40,anchorY:115},out=foldPaperCharacterPixels(pixels,width,height,{character:2,metrics});
 const head=(20*width+25)*4,body=(68*width+25)*4;
 assert.ok(Math.abs(luma(out,head)-luma(pixels,head))<4);assert.ok(Math.abs(luma(out,body)-luma(pixels,body))>9);
 assert.throws(()=>harmonizePaperCharacterPixels(pixels,width+1,height),RangeError);assert.deepEqual(harmonizePaperCharacterPixels(pixels,width,height,{strength:0}),pixels);
});
