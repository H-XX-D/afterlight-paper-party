import {PAPER_PALETTES} from './paper-palette.js';

const {ivory,sage,violet,copper,frost}=PAPER_PALETTES;
const pad=(id,name,icon,symbol,color,effect)=>Object.freeze({
  id,name,icon,symbol,color,effect:Object.freeze(effect),
});

/** Public pad identities; the host applies their gameplay effects. */
export const BOARD_MISCHIEF=Object.freeze([
  pad('moon-mint','Moon Mint','spark','☼',ivory.accent,{type:'points',points:4}),
  pad('thorn-toll','Thorn Toll','spike','−',sage.edge,{type:'toll',points:3}),
  pad('spring-fold','Spring Fold','gear','↟',sage.accent,{type:'boost',boost:2}),
  pad('umbrella-roost','Umbrella Roost','umbrella','☂',frost.accent,{type:'shelter',shield:true}),
  pad('lantern-flare','Lantern Flare','lantern','✦',copper.accent,{type:'lantern',lanterns:1,points:3}),
  pad('sly-mimic','Sly Mimic','crate','♧',violet.edge,{type:'steal',points:3,target:'richest-other'}),
  pad('comet-gift','Comet Gift','spark','↑',frost.fx.magic,{type:'card-buff',buff:'boost'}),
  pad('ink-prize','Ink Prize','orb','✧',violet.accent,{type:'card-buff',buff:'shine'}),
  pad('clockwork-switch','Clockwork Switch','switch','↻',copper.metal,{type:'card-buff',buff:'shuffle'}),
  pad('twin-moons','Twin Moons','orb','☾',violet.fx.magic,{type:'all-points',points:2}),
  pad('hungry-cache','Hungry Cache','crate','◇',copper.edge,{type:'draw-prize',points:7,draw:1}),
  pad('quiet-bank','Quiet Bank','key','⌂',ivory.edge,{type:'bank',points:2,boost:1}),
]);

/** Rotate each quarter of the 48-pad loop so special pads do not hide a kind.
 * A stable numeric pad is enough for clients to draw its public identity.
 */
export function boardPadMischief(index){
  if(!Number.isSafeInteger(index)||index<0)return null;
  const slot=index%48;
  return BOARD_MISCHIEF[(slot%12+Math.floor(slot/12))%12];
}

const CARD_BUFFS=Object.freeze({
  boost:Object.freeze({id:'boost',name:'Comet Fold',icon:'spark',symbol:'↟',color:frost.fx.magic,movement:2}),
  shine:Object.freeze({id:'shine',name:'Ink Gleam',icon:'orb',symbol:'✧',color:violet.accent,points:3}),
  shuffle:Object.freeze({id:'shuffle',name:'Clockwork Fold',icon:'switch',symbol:'↻',color:copper.metal,seatOrder:'host-seeded'}),
});

/** Card identity and bonus only; private card selection and RNG stay on host. */
export function cardBuffDefinition(id){
  return typeof id==='string'&&Object.hasOwn(CARD_BUFFS,id)?CARD_BUFFS[id]:null;
}
