import fs from 'node:fs';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {measurePaperCell,paperMotionCut} from '../src/paper-animation.js';

/** The production crop declarations are the fixture inputs, not copied pixels. */
export async function characterArtFixtures({overflow=0}={}){
 const source=fs.readFileSync(fileURLToPath(new URL('../src/art.js',import.meta.url)),'utf8');
 const declaration=name=>{const match=source.match(new RegExp(`const ${name}\\s*=\\s*([\\s\\S]*?);`));if(!match)throw new Error('Missing actor crop declaration '+name);return Function('return '+match[1])();};
 const cuts=declaration('cuts'),newCuts=declaration('NEW_CUTS'),attackCuts=declaration('ATTACK_CUTS');
 const manifest=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../assets-manifest.json',import.meta.url)),'utf8'));
 const images=new Map();
 for(const name of ['characters','characters-new','character-attacks','motion-classic','motion-new']){
  const file=manifest.images.find(image=>image.name===name)?.file;if(!file)throw new Error('Missing actor asset '+name);
  const {data,info}=await sharp(fileURLToPath(new URL('../public/assets/'+file,import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});images.set(name,{data,width:info.width,height:info.height});
 }
 return Array.from({length:8},(_,character)=>{
  const classic=character<4,row=character%4,motion=classic?'motion-classic':'motion-new';
  const sources=[{pose:'idle',sheet:classic?'characters':'characters-new',cut:classic?cuts[character]:newCuts[row][0]},{pose:'attack-peak',sheet:classic?'character-attacks':'characters-new',cut:classic?attackCuts[character][0]:newCuts[row][1]},{pose:'special-peak',sheet:classic?'character-attacks':'characters-new',cut:classic?attackCuts[character][1]:newCuts[row][2]},...['anticipation','followthrough','special-windup','special-recovery','run-contact','run-passing'].map((pose,column)=>({pose,sheet:motion,cut:paperMotionCut(character,column,images.get(motion).width,images.get(motion).height)}))];
  return {character,frames:sources.map(({pose,sheet,cut})=>{
   const image=images.get(sheet),bounds=measurePaperCell(image,{x:cut[0],y:cut[1],width:cut[2],height:cut[3]},{includeMask:true,overflow}),pixels=new Uint8ClampedArray(bounds.width*bounds.height*4);
   for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
    const ix=bounds.x+x,iy=bounds.y+y,mx=ix-bounds.cellX,my=iy-bounds.cellY;if(!bounds.mask[my*bounds.cellWidth+mx])continue;
    const original=(iy*image.width+ix)*4,at=(y*bounds.width+x)*4;pixels.set(image.data.subarray(original,original+4),at);
   }
   return {character,pose,sheet,cut:[...cut],pixels,width:bounds.width,height:bounds.height,bounds};
  })};
 });
}
