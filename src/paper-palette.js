/** Restrained pigments shared by scenery, paper sprites and pixel effects.
 * These five immutable palettes are render data, never authoritative state.
 * Scene identifiers alone select a palette, so caches cannot grow with time,
 * player count, scores or private card data.
 */
const scheme=(id,values)=>Object.freeze({id,...values,fx:Object.freeze(values.fx)});
export const PAPER_PALETTES=Object.freeze({
 ivory:scheme('ivory',{paper:'#eee5d1',edge:'#a69a80',ink:'#27282c',accent:'#bca887',bounce:'#c4b49a',ambient:'#ddd6c8',key:'#f1e5cb',fill:'#bcc7c9',metal:'#c7ad83',spriteTint:.12,fx:{dust:'#c6b89c',hit:'#dfbf8e',magic:'#cbc0d3',shield:'#b9cdd0'}}),
 sage:scheme('sage',{paper:'#e1e5d1',edge:'#8f9b83',ink:'#252c29',accent:'#a7b89a',bounce:'#b3c3a6',ambient:'#d0d8c8',key:'#e9e9cd',fill:'#b4c9bd',metal:'#c1b48c',spriteTint:.16,fx:{dust:'#aeb99e',hit:'#d6c299',magic:'#c1d2ad',shield:'#b1ccc3'}}),
 violet:scheme('violet',{paper:'#e6deea',edge:'#9b8eaa',ink:'#2b2731',accent:'#b3a1c5',bounce:'#c2b1d1',ambient:'#d7ccdf',key:'#eee1df',fill:'#beb4d3',metal:'#bca4b5',spriteTint:.16,fx:{dust:'#b5a6be',hit:'#dbb99e',magic:'#cbb6db',shield:'#b7c1da'}}),
 copper:scheme('copper',{paper:'#eee0d0',edge:'#aa8870',ink:'#302825',accent:'#c19a78',bounce:'#d2b294',ambient:'#decebf',key:'#f1ddc0',fill:'#b9c2bd',metal:'#cfaa7e',spriteTint:.18,fx:{dust:'#c6aa8e',hit:'#e0b180',magic:'#d5c299',shield:'#b9c8c8'}}),
 frost:scheme('frost',{paper:'#dee7e8',edge:'#8b9fa9',ink:'#242b32',accent:'#a0bbc7',bounce:'#b2cbd1',ambient:'#cbd9dc',key:'#e9e8de',fill:'#aec7d4',metal:'#b6c5cb',spriteTint:.16,fx:{dust:'#afc2cb',hit:'#d9c6a7',magic:'#c0d1df',shield:'#a9cbd8'}}),
});

export const PAPER_REALMS=Object.freeze({
 world:'ivory',ivory:'ivory',sage:'sage',violet:'violet',copper:'copper',frost:'frost',
 grove:'sage',workshop:'copper',astral:'violet',chapel:'ivory',city:'frost',
 inkfall:'copper',mothlight:'sage',sweep:'frost',rhythm:'violet',maze:'sage',
 redlight:'copper',raft:'frost',gallery:'copper',trace:'violet',shadow:'violet',
 'bell-breakers':'ivory','relic-launch':'copper','hollow-horde':'sage','rift-ball':'frost',
 'spark-heist':'copper','fuse-festival':'copper','tower-relay':'sage','bellows-boxing':'copper',
 'colossus-wake':'violet','rift-rumble':'violet','crown-clash':'ivory','meteor-melee':'copper',
 'spire-kings':'frost','gullet-gala':'sage',
 // Retained scene-art aliases do not add cache variants.
 memory:'violet',tug:'copper',fishing:'frost',balance:'frost',sorting:'copper',
 reaction:'ivory',potato:'sage',crates:'sage',orbit:'frost',cipher:'violet',
});

export function paperPalette(scene='world'){
 const id=typeof scene==='string'?scene:scene?.id;
 return PAPER_PALETTES[typeof id==='string'&&Object.hasOwn(PAPER_REALMS,id)?PAPER_REALMS[id]:'ivory'];
}

export function paperEffectColor(scene,type='magic'){
 const palette=paperPalette(scene);return typeof type==='string'&&Object.hasOwn(palette.fx,type)?palette.fx[type]:palette.fx.magic;
}

/** Hex channels for graphics uniforms; invalid external profile data is neutral. */
export function paperColorRGB(color){
 if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))return [1,1,1];
 return [1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)/255);
}

const EFFECT_TYPES=Object.freeze(['hit','dust','magic','shield']);
const EFFECT_VARIANTS=Object.freeze(Object.values(PAPER_PALETTES).flatMap(palette=>EFFECT_TYPES.map(type=>Object.freeze({id:palette.id,type,color:palette.fx[type]}))));
/** Honor requested hues by selecting a nearby existing pigment, never inventing
 * an unbounded cache entry from an arbitrary per-frame color string. */
export function paperEffectVariant(scene,type='magic',requestedColor){
 type=EFFECT_TYPES.includes(type)?type:'magic';
 const variants=EFFECT_VARIANTS.filter(variant=>variant.type===type);
 if(typeof requestedColor==='string'&&/^#[0-9a-f]{6}$/i.test(requestedColor)){
  const target=paperColorRGB(requestedColor);let closest=variants[0],distance=Infinity;
  for(const variant of variants){const rgb=paperColorRGB(variant.color),score=rgb.reduce((total,v,i)=>total+(v-target[i])**2,0);if(score<distance){distance=score;closest=variant;}}
  return closest;
 }
 return variants.find(variant=>variant.id===paperPalette(scene).id);
}
