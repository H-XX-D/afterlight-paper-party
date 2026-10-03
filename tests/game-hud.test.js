import test from 'node:test';
import assert from 'node:assert/strict';
import {MINIGAMES,createGame,drawGame} from '../src/minigames.js';
const players=Array.from({length:4},(_,i)=>({id:'hud-'+i,name:'Traveler'+i,character:i,bot:false}));
test('every active HUD keeps one short objective and player identities without title or control legends',()=>{
 for(const def of MINIGAMES){
  const g=createGame(def.id,players,41),before=JSON.stringify(g),texts=[],frames=[];
  const ctx=new Proxy({canvas:{width:960,height:540},measureText:t=>({width:String(t).length*6}),fillText(t){texts.push(String(t));}},{get:(o,k)=>k in o?o[k]:()=>{}});
  drawGame(ctx,g,{character(){},prop(){},objective(){},background(){},platform(){},object(){},fx(){},uiFrame(c,x,y,w,h){frames.push({x,y,w,h});}});
  assert.equal(JSON.stringify(g),before,def.id+' stays state-pure');
  assert.ok(!texts.some(t=>/SPACE|HOLD SPACE|X SPECIAL|DOUBLE JUMP|TIMED PARRY|SECONDS|POINTS/i.test(t)),def.id+': '+texts.join(' / '));
  assert.ok(!texts.includes(def.name),def.id+' has no duplicate title banner');
  for(const p of players)assert.equal(texts.filter(t=>t===p.name).length,1,def.id+' identity appears only in the portrait plaque');
  const header=frames.find(f=>f.y<100);assert.ok(header&&header.h<=36&&header.w<=460,def.id+' uses a compact objective strip');
 }
});
