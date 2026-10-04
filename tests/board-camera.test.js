import test from 'node:test';
import assert from 'node:assert/strict';
import {boardCamera,sampleBoardTraveler,sampleBoardEncounter} from '../src/board-camera.js';
import {BOARD_SPACES,BOARD_LADDERS,BOARD_CHUTES,BOARD_SHORTCUTS,BOARD_TIMINGS,boardRoutePoint,createParty,drawBoard} from '../src/board.js';

const geometry={spaces:BOARD_SPACES,routePoint:boardRoutePoint,timings:BOARD_TIMINGS};
const make=(stage='await-card',position=8,timer=0)=>{
 const state=createParty([{id:'a',name:'Pip',character:0},{id:'b',name:'Moth',character:1}],{seed:17});
 Object.assign(state,{phase:'board',boardStage:stage,currentPlayerId:'a',turnIndex:0,clock:4,timer});
 state.players[0].position=position;state.players[1].position=31;
 return state;
};
const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-7,`${message}: ${a} versus ${b}`);
function bounded(camera){
 assert.ok(camera.zoom>=1&&camera.zoom<=1.8);
 assert.ok(camera.tx<=1e-7&&camera.ty<=1e-7,'top and left backdrop edges cover viewport');
 assert.ok(camera.tx+960*camera.zoom>=960-1e-7&&camera.ty+540*camera.zoom>=540-1e-7,'right and bottom backdrop edges cover viewport');
}

test('desktop card playback holds overview and movement eases into the traveler over three tenths',()=>{
 const state=make('playing-card',8,BOARD_TIMINGS.play),start=boardCamera(state,geometry);near(start.zoom,1);near(start.tx,0);near(start.ty,0);
 for(let n=0;n<=24;n++){state.timer=BOARD_TIMINGS.play*(1-n/24);const camera=boardCamera(state,geometry);bounded(camera);near(camera.zoom,1);near(camera.tx,0);near(camera.ty,0);}
 const before=boardCamera(state,geometry);Object.assign(state,{boardStage:'moving',moveTarget:9,timer:BOARD_TIMINGS.move,cardTravelStartedAt:state.clock});
 const after=boardCamera(state,geometry);near(before.zoom,after.zoom);near(before.tx,after.tx);near(before.ty,after.ty);
 let previous=1;
 for(let n=0;n<=30;n++){
  state.clock=state.cardTravelStartedAt+.3*n/30;
  const snapshot=JSON.stringify(state),camera=boardCamera(state,geometry);bounded(camera);assert.ok(camera.zoom>=previous-1e-8);previous=camera.zoom;assert.equal(JSON.stringify(state),snapshot);
  if(n===15){near(camera.weight,.5);near(camera.zoom,1.35);}
 }
 near(boardCamera(state,geometry).zoom,1.7);near(boardCamera(state,geometry).weight,1);
 state.clock=state.cardTravelStartedAt-.1;near(boardCamera(state,geometry).zoom,1,'negative network-clock offset clamps safely to overview');
});

test('every main step keeps the moving actor visible and prevents blank camera edges',()=>{
 for(let position=0;position<48;position++)for(let n=0;n<=20;n++){
  const state=make('moving',position,BOARD_TIMINGS.move*(1-n/20));state.moveTarget=(position+1)%48;
  const camera=boardCamera(state,geometry),motion=sampleBoardTraveler(state,state.players[0],geometry),expected=boardRoutePoint(position,state.moveTarget,n/20);
  bounded(camera);near(motion.x,expected.x);near(motion.y,expected.y);
  const x=motion.x*camera.zoom+camera.tx,y=motion.drawY*camera.zoom+camera.ty;
  assert.ok(x>=30&&x<=930,'actor stays horizontally visible');assert.ok(y>=110&&y<=510,'actor head and feet stay inside camera');
 }
});

test('camera position is continuous at every consecutive step and the lap seam',()=>{
 for(let position=0;position<48;position++){
  const state=make('moving',position,0);state.moveTarget=(position+1)%48;const end=boardCamera(state,geometry);
  state.players[0].position=state.moveTarget;state.moveTarget=(state.moveTarget+1)%48;state.timer=BOARD_TIMINGS.move;const start=boardCamera(state,geometry);
  near(end.tx,start.tx);near(end.ty,start.ty);near(end.zoom,start.zoom);
 }
});

test('camera and animated feet use the same ladders, chutes, shortcuts and doors',()=>{
 for(const [kind,links]of [['ladder',BOARD_LADDERS],['chute',BOARD_CHUTES],['shortcut',BOARD_SHORTCUTS],['door',{9:12}]])for(const [from,to]of Object.entries(links))for(let n=0;n<=12;n++){
  const shortcut=kind==='shortcut',duration=shortcut?BOARD_TIMINGS.shortcut:BOARD_TIMINGS.transport;
  const state=make(shortcut?'moving':'transport',+from,duration*(1-n/12));
  if(shortcut)Object.assign(state,{shortcutTravel:true,moveTarget:to});else state.transport={from:+from,to,type:kind};
  const motion=sampleBoardTraveler(state,state.players[0],geometry),expected=boardRoutePoint(+from,to,n/12,kind),camera=boardCamera(state,geometry);
  near(motion.x,expected.x);near(motion.y,expected.y);bounded(camera);assert.ok(Number.isFinite(motion.rotation)&&motion.scaleX>0&&motion.scaleY>0);
 }
});

test('fork view keeps both decisions visible and choice stages never drift with frame count',()=>{
 for(const [from,to]of Object.entries(BOARD_SHORTCUTS)){
  const state=make('choose-path',+from,.72);state.pathOptions=[{choice:'main',target:+from+1},{choice:'shortcut',target:to}];
  const camera=boardCamera(state,geometry);
  for(const option of state.pathOptions){const point=BOARD_SPACES[option.target],x=point.x*camera.zoom+camera.tx,y=point.y*camera.zoom+camera.ty;assert.ok(x>30&&x<930&&y>40&&y<510);}
  for(const clock of [5,80,3000]){state.clock=clock;assert.deepEqual(boardCamera(state,geometry),camera);}
  state.boardStage='choose-event';const held=boardCamera(state,geometry);state.clock=9000;assert.deepEqual(boardCamera(state,geometry),held);
 }
});

test('landing settles then eases to overview before another player takes over',()=>{
 const state=make('event',35,BOARD_TIMINGS.event),settled=boardCamera(state,geometry);near(settled.zoom,1.7);
 state.timer=BOARD_TIMINGS.event-.2;near(boardCamera(state,geometry).zoom,1.7);
 let previous=1.7;
 for(let n=0;n<=30;n++){state.timer=BOARD_TIMINGS.event*(1-n/30);const camera=boardCamera(state,geometry);assert.ok(camera.zoom<=previous+1e-8);previous=camera.zoom;bounded(camera);}
 const end=boardCamera(state,geometry);near(end.zoom,1);near(end.tx,0);near(end.ty,0);
 state.currentPlayerId='b';state.turnIndex=1;state.boardStage='await-card';const next=boardCamera(state,geometry);near(next.tx,end.tx);near(next.ty,end.ty);
});

test('overview override does not change the simulation and camera ignores sampling order',()=>{
 const state=make('moving',47,.08);state.moveTarget=0;const snapshot=JSON.stringify(state),camera=boardCamera(state,geometry);
 for(let n=0;n<100;n++){const other=make('moving',n%48,n/100);other.moveTarget=(n+1)%48;boardCamera(other,{...geometry,overview:true});assert.deepEqual(boardCamera(state,geometry),camera);}
 const overview=boardCamera(state,{...geometry,overview:true});near(overview.zoom,1);assert.equal(JSON.stringify(state),snapshot);
});

test('bump rendering interpolates authority endpoints without moving or scoring anyone',()=>{
 const state=make('event',8,.8);state.players[1].position=6;
 state.boardEncounter={id:'bump-1',type:'bump',playerId:'a',targetIds:['b'],space:8,from:7,to:8,startedAt:4,duration:1.2,moves:[{playerId:'b',from:8,to:6,blocked:false}]};
 const before=JSON.stringify(state),initial=sampleBoardEncounter(state,state.players[1],geometry);near(initial.x,BOARD_SPACES[8].x);near(initial.y,BOARD_SPACES[8].y);assert.equal(JSON.stringify(state),before);
 state.clock=4.4;assert.ok(sampleBoardEncounter(state,state.players[1],geometry).hop>0);
 state.clock=4.8;const end=sampleBoardEncounter(state,state.players[1],geometry);near(end.x,BOARD_SPACES[6].x);near(end.y,BOARD_SPACES[6].y);near(end.hop,0);
 state.clock=5.21;assert.equal(sampleBoardEncounter(state,state.players[1],geometry),null);
});

test('shield contacts stay in place and overlapping encounter cues preserve earlier targets',()=>{
 const state=make('event',8,.8);state.clock=4.2;
 state.boardEncounters=[{type:'bump',playerId:'a',targetIds:['b'],startedAt:4,duration:1.2,moves:[{playerId:'b',from:8,to:8,blocked:true}]},{type:'high-five',playerId:'a',targetIds:['c'],startedAt:4.1,duration:1.2,moves:[]}];
 const blocked=sampleBoardEncounter(state,state.players[1],geometry);assert.equal(blocked.blocked,true);assert.equal(blocked.x,undefined);near(blocked.hop,0);
});

test('board render is state-pure and applies the camera before backdrop and actor drawing',()=>{
 const state=make('moving',12,.09);state.moveTarget=13;state.storyEvent={id:'paper-picnic',title:'Paper picnic',description:'A little gift',playerId:'a',startedAt:3.8,duration:3};state.lapCelebration={playerId:'a',startedAt:3.8,duration:3,amount:25,lap:1};
 const snapshot=JSON.stringify(state),calls=[],actors=[];let saves=0;
 const ctx=new Proxy({canvas:{width:960,height:540},measureText:t=>({width:t.length*5}),createRadialGradient:()=>({addColorStop(){}}),save(){saves++;},restore(){saves--;},translate(x,y){calls.push(['translate',x,y]);},scale(x,y){calls.push(['scale',x,y]);}}, {get:(target,key)=>key in target?target[key]:(()=>{})});
 const helpers={beginScene(ctx,id){calls.push(['begin',id]);},endScene(){calls.push(['end']);},boardPiece(){},background(){calls.push(['background']);},character(ctx,player,x,y,size,options){actors.push({id:player.id,x,y,options});},prop(){},object(){},fx(){}};
 const camera=drawBoard(ctx,state,helpers);assert.deepEqual(camera,boardCamera(state,geometry));assert.equal(JSON.stringify(state),snapshot);assert.equal(saves,0);
 assert.deepEqual(calls.slice(0,4),[['begin','world'],['translate',camera.tx,camera.ty],['scale',camera.zoom,camera.zoom],['background']]);assert.equal(calls.filter(call=>call[0]==='end').length,1);
 const expected=sampleBoardTraveler(state,state.players[0],geometry),actor=actors.find(p=>p.id==='a');near(actor.x,expected.x);near(actor.y,expected.drawY);assert.ok(actor.options.scaleY>1);
});


test('portrait cover follows every idle traveler inside its crop without exposing the backdrop',()=>{
 for(const visibleWidth of[240,320,410])for(let position=0;position<48;position++){
  const state=make('await-card',position),before=JSON.stringify(state),camera=boardCamera(state,{...geometry,portrait:true,visibleWidth});
  near(camera.zoom,1.2);const left=(960-visibleWidth)/2,right=(960+visibleWidth)/2,x=BOARD_SPACES[position].x*camera.zoom+camera.tx;
  assert.ok(x>left+45&&x<right-45,'active traveler fits the visible portrait crop');
  assert.ok(camera.tx<=left&&camera.tx+960*camera.zoom>=right,'visible crop has no horizontal backdrop gap');
  assert.ok(camera.ty<=0&&camera.ty+540*camera.zoom>=540,'visible crop has no vertical backdrop gap');
  assert.equal(JSON.stringify(state),before);const overview=boardCamera(state,{...geometry,portrait:true,visibleWidth,overview:true});near(overview.zoom,1);near(overview.tx,0);near(overview.ty,0);
 }
});
test('portrait camera passes continuously from idle focus into movement and settles back to focused idle',()=>{
 const state=make('await-card',14),opts={...geometry,portrait:true,visibleWidth:320},idle=boardCamera(state,opts);
 Object.assign(state,{boardStage:'playing-card',timer:BOARD_TIMINGS.play});assert.deepEqual({...boardCamera(state,opts),stage:'await-card'},idle);
 state.timer=0;const close=boardCamera(state,opts);Object.assign(state,{boardStage:'moving',moveTarget:15,timer:BOARD_TIMINGS.move});const moving=boardCamera(state,opts);near(close.tx,moving.tx);near(close.ty,moving.ty);near(close.zoom,moving.zoom);
 Object.assign(state,{boardStage:'event',timer:0});near(boardCamera(state,opts).zoom,1.2);
});
test('quiet board draws no persistent footer, active-player inset, or repeated actor names',()=>{
 const state=make(),texts=[],ctx=new Proxy({canvas:{width:960,height:540,clientWidth:390,clientHeight:700},measureText:t=>({width:String(t).length*5}),createRadialGradient:()=>({addColorStop(){}}),fillText(t){texts.push(String(t));}},{get:(o,k)=>k in o?o[k]:()=>{}});
 const before=JSON.stringify(state),camera=drawBoard(ctx,state,{boardPortrait:true,boardPiece(){},character(){}});near(camera.zoom,1.2);assert.equal(JSON.stringify(state),before);
 assert.ok(!texts.some(t=>/Rope ladders|Stone slides|footbridges|sanctuary|SPACE|POINTS|Pip|Moth/i.test(t)),texts.join(' / '));
});
