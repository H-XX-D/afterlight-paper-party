import test from 'node:test';
import assert from 'node:assert/strict';
import {BANTER_STATS,boardBanterCue,createBoardDialogue,projectRingAnchor} from '../src/board-presentation.js';
import {CHARACTER_BANTER} from '../src/character-banter.js';
import {createParty,viewParty} from '../src/board.js';

const roster=[{id:'a',name:'Pip',character:0},{id:'b',name:'Moth',character:1},{id:'c',name:'Briar',character:5},{id:'d',name:'Nix',character:7}];
const make=()=>({...createParty(roster,{seed:214}),clock:10,currentPlayerId:'a',turnIndex:0,boardStage:'await-card'});
const event=(type,detail={})=>({type,id:'a',serial:1,at:10,...detail});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('public card metadata maps play, skip and reverse to actor and actual affected rival',()=>{
 const state=make();
 for(const [value,category,tone] of [['6','play','neutral'],['wild','play','neutral'],['skip','skip','good'],['reverse','reverse','good']]){
  const cue=boardBanterCue(state,event('card',{cardValue:value,targetId:'d'}));
  assert.equal(cue.category,category);assert.equal(cue.tone,tone);assert.equal(cue.speakerId,'a');assert.equal(cue.rivalId,'d');
  assert.equal(cue.eventId,'board-1');assert.equal(cue.serial,1);assert.equal(cue.at,10);assert.ok(Object.isFrozen(cue));
 }
 state.turnDirection=-1;
 assert.equal(boardBanterCue(state,event('card',{cardValue:'reverse'})).rivalId,'d','old snapshots use public direction for their fallback rival');
});

test('draw penalties speak through the card receiver and retain the imposing player as rival',()=>{
 const state=make();
 for(const [value,penalty] of [['draw2',2],['draw4',4]]){
  const cue=boardBanterCue(state,event('card',{cardValue:value,penalty,targetId:'c'}));
  assert.equal(cue.category,'draw-penalty');assert.equal(cue.tone,'bad');assert.equal(cue.speakerId,'c');assert.equal(cue.rivalId,'a');
  assert.equal(cue.moverId,'a','receiver dialogue does not reassign the moving traveler');
 }
 const draw=boardBanterCue(state,event('draw',{id:'b'}));
 assert.equal(draw.category,'draw');assert.equal(draw.speakerId,'b');assert.equal(draw.tone,'bad');
});

test('transport, passing, bump and lap outcomes use their specific public categories',()=>{
 const state=make();
 for(const [type,tone] of [['ladder','good'],['chute','bad'],['shortcut','good'],['lap','good']]){
  const cue=boardBanterCue(state,event(type));assert.equal(cue.category,type);assert.equal(cue.tone,tone);
 }
 const pass=boardBanterCue(state,event('encounter',{kind:'high-five',targetIds:['c','d']}));
 assert.equal(pass.category,'pass');assert.equal(pass.speakerId,'a');assert.equal(pass.rivalId,'c');
 const bump=boardBanterCue(state,event('encounter',{kind:'bump',targetIds:['c'],blockedIds:[]}));
 assert.equal(bump.category,'bump-hit');assert.equal(bump.tone,'good');
 const blocked=boardBanterCue(state,event('encounter',{kind:'bump',targetIds:['c'],blockedIds:['c']}));
 assert.equal(blocked.category,'bump-blocked');assert.equal(blocked.tone,'bad');
});
test('custom chains, stacked debt and shuffled cards speak as actions before the victim accepts',()=>{
 const state=make();state.turnOrder=['a','d','b','c'];
 for(const [detail,category]of [[{chained:true,cardValue:'6'},'chain'],[{penalty:2,pendingDraw:6,cardValue:'draw2',targetId:'c'},'stack'],[{buff:'shine',cardValue:'4'},'pad-buff'],[{buff:'shuffle',cardValue:'4'},'shuffle']]){const cue=boardBanterCue(state,event('card',detail));assert.equal(cue.category,category);assert.equal(cue.speakerId,'a');assert.equal(cue.tone,'good');}
 assert.equal(boardBanterCue(state,event('card',{cardValue:'4'})).rivalId,'d');const accepted=boardBanterCue(state,event('draw',{id:'c',penalty:6,amount:6}));assert.equal(accepted.category,'draw-penalty');assert.equal(accepted.speakerId,'c');assert.equal(accepted.tone,'bad');
});
test('public pad outcomes choose character-specific reward, toll, buff and stolen-rival reactions',()=>{
 const state=make();
 for(const [effects,category,tone]of [[[{type:'points',playerId:'a',amount:4}],'pad-good','good'],[[{type:'points',playerId:'a',amount:-3}],'pad-bad','bad'],[[{type:'card-buff',playerId:'a',buff:'boost',amount:1}],'pad-buff','good']]){const cue=boardBanterCue(state,event('mischief',{effects}));assert.equal(cue.category,category);assert.equal(cue.tone,tone);assert.equal(cue.speakerId,'a');}
 const mimic=boardBanterCue(state,event('mischief',{effects:[{type:'points',playerId:'c',amount:-3},{type:'points',playerId:'a',amount:3}]}));assert.equal(mimic.rivalId,'c');assert.equal(mimic.category,'pad-good');
});

test('final reaction follows whether the hand closer actually won on points',()=>{
 const state=make();
 const good=boardBanterCue(state,event('winner',{id:'c',finisherId:'c',bonus:20}));
 assert.equal(good.category,'finish-good');assert.equal(good.tone,'good');assert.equal(good.speakerId,'c');assert.equal(good.rivalId,'d');
 const bad=boardBanterCue(state,event('winner',{id:'b',finisherId:'c',bonus:4}));
 assert.equal(bad.category,'finish-bad');assert.equal(bad.tone,'bad');assert.equal(bad.speakerId,'c');assert.equal(bad.rivalId,'b');
 assert.equal(boardBanterCue(state,event('winner',{id:'b',finisherId:'missing'})),null);
});

test('unknown public outcomes and invalid event serials do not create generic dialogue',()=>{
 const state=make();
 assert.equal(boardBanterCue(state,null),null);
 for(const serial of [0,-1,1.5,NaN,Infinity,'1'])assert.equal(boardBanterCue(state,event('card',{serial,cardValue:'6'})),null);
 for(const type of ['spark','minigame','fork','info','unknown'])assert.equal(boardBanterCue(state,event(type)),null);
 assert.equal(boardBanterCue(state,event('card',{id:'missing',cardValue:'6'})),null);
});

test('same snapshots and older serials never replay a caption or append duplicate history',()=>{
 const state=make(),dialogue=createBoardDialogue();state.history=[event('card',{cardValue:'skip',targetId:'b'})];state.eventSerial=1;
 const initial=dialogue.sample(state,'a',20);assert.equal(initial.history.length,1);assert.equal(initial.current.age,0);
 const repeat=dialogue.sample(JSON.parse(JSON.stringify(state)),'a',20.8);assert.equal(repeat.history.length,1);close(repeat.current.age,.8);
 state.history=[event('card',{cardValue:'reverse',targetId:'d'})];
 const older=dialogue.sample(state,'a',21.2);assert.equal(older.history.length,1);assert.equal(older.current.category,'skip');close(older.current.age,1.2);
 state.history.push(event('chute',{serial:2,at:10.2}));state.eventSerial=2;state.clock=10.2;
 const fresh=dialogue.sample(state,'a',21.4);assert.equal(fresh.history.length,2);assert.equal(fresh.current.category,'chute');assert.equal(fresh.current.age,0);
 dialogue.reset();const reset=dialogue.sample(state,'a',30);assert.equal(reset.history.length,1);assert.equal(reset.current.serial,2);
});

test('same-frame final outcome outranks a card, and delayed stale batches stay silent',()=>{
 const state=make(),dialogue=createBoardDialogue();
 state.history=[event('card',{serial:1,cardValue:'6',targetId:'b'}),event('winner',{serial:2,id:'c',finisherId:'a'})];state.eventSerial=2;
 const sample=dialogue.sample(state,'a',20);assert.equal(sample.current.type,'winner');assert.equal(sample.current.category,'finish-bad');assert.equal(sample.history.length,1);
 assert.equal(dialogue.sample(state,'a',23.41).current,null,'caption lifetime is bounded independently of a static snapshot');
 const stale=make();stale.clock=15;stale.history=[event('lap')];stale.eventSerial=1;
 assert.equal(createBoardDialogue().sample(stale,'a',30).current,null,'an already old event does not flash on joining');
});

test('local portrait stays left while the speaking moving opponent and contextual reply appear right',()=>{
 const state=make(),dialogue=createBoardDialogue();state.currentPlayerId='c';state.turnIndex=2;state.boardStage='moving';
 let sample=dialogue.sample(state,'a',20);assert.equal(sample.left.id,'a');assert.equal(sample.right.id,'c');assert.equal(sample.right.moving,true);
 state.history=[event('ladder',{id:'c',targetId:'a'})];state.eventSerial=1;
 sample=dialogue.sample(state,'a',21);assert.equal(sample.left.id,'a');assert.equal(sample.right.id,'c');assert.equal(sample.right.text,sample.current.actorLine.text);assert.equal(sample.left.text,'');
 sample=dialogue.sample(state,'a',21.7);assert.ok(sample.left.text);assert.equal(sample.left.text,sample.current.rivalLine.text);assert.equal(sample.current.rivalLine.category,'reply-good');
 state.history.push(event('chute',{id:'c',targetId:'a',serial:2}));state.eventSerial=2;
 sample=dialogue.sample(state,'a',22);assert.equal(sample.current.category,'chute');assert.equal(sample.current.rivalLine.category,'reply-bad');
});

test('client presentation reads public events and emits no private hand or deck information',()=>{
 const state=make();state.history=[event('card',{cardValue:'draw2',penalty:2,targetId:'b'})];state.eventSerial=1;
 const view=viewParty(state,'a'),before=JSON.stringify(view),sample=createBoardDialogue().sample(view,'a',20);
 assert.equal(JSON.stringify(view),before,'client display never mutates its snapshot');
 for(const side of [sample.left,sample.right]){
  assert.deepEqual(Object.keys(side).sort(),['character','id','lineKey','moving','name','reaction','text']);
  assert.equal(side.hand,undefined);assert.equal(side.handCount,undefined);assert.equal(side.sparks,undefined);
 }
 assert.equal(sample.current.category,'draw-penalty');assert.equal(sample.current.speakerId,'b');
 Object.defineProperty(view,'deck',{get(){throw new Error('private deck read');}});
 for(const player of view.players)Object.defineProperty(player,'hand',{get(){throw new Error('private hand read');}});
 const guarded=createBoardDialogue().sample(view,'a',20);assert.equal(guarded.current.actorLine.text,sample.current.actorLine.text);
 assert.equal(boardBanterCue(view,view.history[0]).speakerId,'b');
 assert.equal(BANTER_STATS.total,704);assert.equal(BANTER_STATS.characters.length,8);
 assert.deepEqual(BANTER_STATS.characters.map(c=>c.lines),CHARACTER_BANTER.map(c=>c.lineCount));
});

test('card landing projection matches desktop cover cropping and the board camera transform',()=>{
 const rect={left:100,top:40,width:1280,height:540};
 const point=projectRingAnchor(rect);close(point.scale,4/3);close(point.x,740);close(point.y,330);
 const camera={zoom:1.7,tx:-326,ty:-170};
 const focused=projectRingAnchor(rect,camera,{x:430,y:275});
 close(focused.x,100+(430*1.7-326)*4/3);
 close(focused.y,40+(540-540*4/3)/2+(275*1.7-170)*4/3);
 const contain=projectRingAnchor(rect,{zoom:1,tx:0,ty:0},{cover:false});
 close(contain.scale,1);close(contain.x,740);close(contain.y,325);
 const offset=projectRingAnchor({left:0,top:0,width:1280,height:540});close(point.x-offset.x,100);close(point.y-offset.y,40);
});
