import {drawGameHUD,gameFont} from './game-hud.js';
import {configureBotDifficulty,botControl,botTarget,botRankedChoice} from './bot-difficulty.js';

/** Two original, snapshot-safe physical board challenges. No board hands enter this state. */
export const BOARDGAME_CHALLENGES = Object.freeze([
  Object.freeze({id:'clockwork-surgery',name:'CLOCKWORK SURGERY',tag:'PRECISION EXTRACTION',realm:'clockwork',duration:48,icon:'gear',description:'Lift clockwork organs through folded channels. Every slipped tool rings the shared alarm; clean chains and the changing bounty reward steady hands.',instructions:'Arrows guide tweezers · hold Space to lift an organ · follow its channel to the lower tray, then release · X steadies the tool briefly'}),
  Object.freeze({id:'tottering-tower',name:'TOTTERING TOWER',tag:'SHARED BLOCK TOWER',realm:'spire',duration:52,icon:'crate',description:'Claim real blocks from a shared tower, ease them out, and place them on top. Removed supports and off-center stacks change its balance. The traveler who topples it pays.',instructions:'Arrows choose a block · hold Space to pull · ← → counterbalance while pulling, ↓ inches, ↑ rushes · release, aim ← →, then tap Space to stack · hold X braces'}),
]);

const COLORS=['#e7c885','#8dc4bf','#baacd7','#d6a497'];
const PAPER='#d8cbb0',INK='#292722',TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cleanInput=(v={})=>({left:!!v?.left,right:!!v?.right,up:!!v?.up,down:!!(v?.down||v?.dn),action:!!v?.action,special:!!v?.special});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function random(g){let x=g.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;g.rng=x>>>0;return g.rng/4294967296;}
function tell(p,message){p.message=message;p.flash=.9;}
function effect(g,type,x,y,color,size=42){
  g.state.effects.push({type,x,y,color,size,life:.55,max:.55});
  if(g.state.effects.length>40)g.state.effects.splice(0,g.state.effects.length-40);
}
function publicPlayers(players){
  if(!Array.isArray(players)||players.length<1||players.length>4)throw new Error('Board challenges need 1–4 travelers.');
  if(players.some(p=>p?.id==null)||new Set(players.map(p=>String(p.id))).size!==players.length)throw new Error('Every traveler needs a distinct id.');
  return players.map((p,slot)=>({id:String(p.id),name:String(p.name||`Traveler ${slot+1}`).slice(0,18),character:clamp(Number.isInteger(p.character)?p.character:slot,0,7),bot:!!p.bot,slot,color:COLORS[slot],score:0,prev:cleanInput(),flash:0,message:'',cooldown:0}));
}

export function surgeryTable(slot,count=4){
  const cell=900/count,width=Math.min(206,cell-12),x=30+cell*(slot+.5)-width/2;
  return {x,y:195,w:width,h:235,tray:{x:x+width/2,y:421}};
}
function surgeryPieces(g,p){
  const table=surgeryTable(p.slot,g.players.length),middle=table.x+table.w/2;
  // Each organ owns a two-bend physical exit. All routes remain inside its own table.
  const layouts=[[-.25,53,.24],[.26,104,-.30],[-.07,155,.29]];
  const kinds=['heart','gear','bell'];
  p.pieces=layouts.map(([offset,y,lane],index)=>{
    const mirrored=p.level%2?-1:1,cx=middle+offset*table.w*mirrored,cy=table.y+y;
    const side=middle+lane*table.w*mirrored;
    return {id:`${p.level}-${index}`,kind:kinds[(index+p.level)%3],x:cx,y:cy,removed:false,value:[9,7,6][index],width:[19,22,25][index],route:[{x:cx,y:cy},{x:side,y:cy},{x:side,y:table.y+196},{x:middle,y:table.y+196},{...table.tray}]};
  });
  p.carried=null;p.pathIndex=1;p.cursor={x:middle,y:table.y+200};p.grabbed=0;p.targetId=null;
}
function pointSegmentDistance(point,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/den,0,1):0;
  return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t);
}
export function surgeryChannelContains(piece,point,pressure=0,steady=false){
  if(distance(point,piece)<25)return true;
  const width=piece.width*(1-(steady?0:pressure*.3));
  for(let i=1;i<piece.route.length;i++)if(pointSegmentDistance(point,piece.route[i-1],piece.route[i])<=width/2)return true;
  return false;
}
function surgeryShock(g,p,piece){
  p.shocks++;p.combo=0;p.score=Math.max(0,p.score-2);p.cooldown=.65;p.alarm=.7;p.carried=null;
  p.cursor={x:piece.x,y:piece.y};p.grabbed=0;p.targetId=null;
  g.state.alarms++;g.state.resonance=clamp(g.state.resonance+.19,0,.65);g.state.bell=.55;
  tell(p,'ALARM · TOOL DROPPED');effect(g,'hit',piece.x,piece.y,p.color,64);
}
function surgeryBank(g,p,piece){
  const bounty=piece.kind===g.state.bounty?4:0,finale=g.state.phase===2&&piece.kind==='heart'?6:0;
  p.combo++;const bonus=Math.min(6,Math.max(0,p.combo-1)*2),value=piece.value+bounty+finale+bonus;
  p.score+=value;p.extractions++;piece.removed=true;p.carried=null;p.grabbed=0;p.targetId=null;p.cooldown=.15;p.success=.65;
  g.state.extractions++;g.state.resonance=Math.max(0,g.state.resonance-.1);
  tell(p,`${piece.kind.toUpperCase()} +${value}`);const tray=surgeryTable(p.slot,g.players.length).tray;
  effect(g,'magic',tray.x,tray.y,p.color,66);
  if(p.pieces.every(q=>q.removed)){
    p.score+=8;p.clears++;p.level++;p.restock=.75;tell(p,'PATIENT SAVED +8');
    effect(g,'magic',tray.x,tray.y-75,p.color,94);
  }
}
function surgeryBot(g,p){
  const i=cleanInput();if(p.cooldown>0||p.restock>0)return i;
  const piece=p.pieces.find(o=>o.id===p.carried)||p.pieces.filter(o=>!o.removed).sort((a,b)=>(b.kind===g.state.bounty)-(a.kind===g.state.bounty)||b.value-a.value)[0];
  if(!piece)return i;
  let target=piece;
  if(p.carried){
    target=piece.route[p.pathIndex];
    if(distance(p.cursor,target)<4&&p.pathIndex<piece.route.length-1){p.pathIndex++;target=piece.route[p.pathIndex];}
    i.action=distance(p.cursor,surgeryTable(p.slot,g.players.length).tray)>10;
    i.special=g.state.pressure>.55&&p.steadyCooldown<=0;
  }else i.action=distance(p.cursor,piece)<10;
  const perceived=botTarget(g,p,target,'precision'),dx=perceived.x-p.cursor.x,dy=perceived.y-p.cursor.y;
  i.left=dx<-2;i.right=dx>2;i.up=dy<-2;i.down=dy>2;
  return i;
}
function stepSurgery(g,inputs,dt){
  const s=g.state;s.phase=g.time<16?0:g.time<36?1:2;
  const bounty=['gear','bell','heart'][Math.floor(g.time/12)%3];
  s.bounty=bounty;s.resonance=Math.max(0,s.resonance-dt*.075);s.bell=Math.max(0,s.bell-dt);
  // A visible bell pulse precedes the strongest airflow by 0.6s.
  const pulse=Math.max(0,Math.sin(g.time*(s.phase===2?2.3:1.65)-.6));
  s.pressure=clamp(pulse*(s.phase===0?.36:.65)+s.resonance,0,1);
  s.warning=Math.max(0,Math.sin(g.time*(s.phase===2?2.3:1.65)));
  for(const p of g.players){
    for(const key of ['cooldown','alarm','success','steady','steadyCooldown','restock'])p[key]=Math.max(0,p[key]-dt);
    if(p.restock===0&&p.pieces.every(o=>o.removed))surgeryPieces(g,p);
    const i=p.bot?botControl(g,p,surgeryBot(g,p),dt,'precision'):cleanInput(inputs[p.id]),press=i.action&&!p.prev.action,release=!i.action&&p.prev.action;
    if(i.special&&!p.prev.special&&p.steadyCooldown<=0&&p.cooldown<=0){p.steady=1.15;p.steadyCooldown=3.3;p.steadies++;tell(p,'STEADY HAND');}
    const piece=p.pieces.find(o=>o.id===p.carried),table=surgeryTable(p.slot,g.players.length);
    if(p.cooldown<=0&&p.restock<=0){
      const speed=piece?(p.steady>0?53:91):171;
      const dx=Number(i.right)-Number(i.left),dy=Number(i.down)-Number(i.up),length=Math.hypot(dx,dy)||1;
      const old={...p.cursor};p.cursor.x=clamp(p.cursor.x+dx/length*speed*dt,table.x+14,table.x+table.w-14);
      p.cursor.y=clamp(p.cursor.y+dy/length*speed*dt,table.y+17,table.y+table.h-1);
      if(piece){
        const wind=p.steady>0?0:s.pressure*16;
        p.cursor.x=clamp(p.cursor.x+Math.sin(g.time*3.2+p.slot)*wind*dt,table.x+14,table.x+table.w-14);
        p.grabbed+=dt;
        const steps=Math.max(1,Math.ceil(distance(old,p.cursor)/3));let collided=false;
        for(let n=1;n<=steps;n++)if(!surgeryChannelContains(piece,{x:old.x+(p.cursor.x-old.x)*n/steps,y:old.y+(p.cursor.y-old.y)*n/steps},s.pressure,p.steady>0)){collided=true;break;}
        if(collided)surgeryShock(g,p,piece);
        else if(release){
          if(distance(p.cursor,table.tray)<19&&p.grabbed>.18)surgeryBank(g,p,piece);
          else {p.carried=null;p.combo=0;p.grabbed=0;p.targetId=null;p.cooldown=.2;p.drops++;tell(p,'RELEASED · TRY AGAIN');effect(g,'dust',p.cursor.x,p.cursor.y,p.color,32);}
        }
      }else if(press){
        const nearest=p.pieces.filter(o=>!o.removed).sort((a,b)=>distance(p.cursor,a)-distance(p.cursor,b))[0];
        if(nearest&&distance(p.cursor,nearest)<19){p.carried=nearest.id;p.targetId=nearest.id;p.pathIndex=1;p.grabbed=0;tell(p,'LIFT · FOLLOW THE CUT');}
        else {p.cooldown=.16;tell(p,'FIND AN ORGAN');}
      }
    }
    p.prev=i;
  }
}

const TOWER_BLOCK_WIDTH=48,TOWER_BLOCK_HALF=23;
function towerRebuild(g){
  const s=g.state;s.blocks=[];s.lean=0;s.velocity=0;s.instability=0;s.stress=0;s.clearance=46;s.phase='playing';s.collapseTime=0;s.lastMover=null;s.lastMoverAt=-10;s.riskActor=null;s.claimSerial=0;s.wind=0;s.warning=0;
  for(let layer=0;layer<9;layer++)for(let slot=0;slot<3;slot++)s.blocks.push({id:++s.nextBlock,layer,slot,x:(slot-1)*TOWER_BLOCK_WIDTH,mass:.85+random(g)*.3,friction:.75+random(g)*.35,pull:0,removed:false,owner:null,stacked:false});
  for(const p of g.players){p.phase='choosing';p.selectedLayer=1+p.slot%4;p.selectedSlot=p.slot%3;p.carried=null;p.balance=0;p.stackX=0;p.bracing=false;p.brace=clamp(p.brace+.25,0,1);p.cooldown=.25;p.chooseClock=0;}
}
const towerHeight=s=>Math.max(...s.blocks.filter(b=>!b.removed).map(b=>b.layer),0)+1;
const selectedBlock=(g,p)=>g.state.blocks.find(b=>!b.removed&&b.layer===p.selectedLayer&&b.slot===p.selectedSlot);
function blockDirection(b){return b.slot===0?-1:b.slot===2?1:b.layer%2?-1:1;}
/** Support hull against the actual mass above it, including partly displaced blocks. */
export function towerSupport(state){
  const blocks=state.blocks.filter(b=>!b.removed),height=towerHeight(state);let clearance=999,violation=0,stress=0,direction=0;
  for(let layer=0;layer<height-1;layer++){
    const above=blocks.filter(b=>b.layer>layer);if(!above.length)continue;
    const mass=above.reduce((sum,b)=>sum+b.mass,0),center=above.reduce((sum,b)=>sum+(b.x+blockDirection(b)*b.pull*63)*b.mass,0)/mass;
    const supports=blocks.filter(b=>b.layer===layer&&b.pull<.88);
    if(!supports.length){clearance=-70;violation=Math.max(violation,2);stress=2;direction=Math.sign(center)||1;continue;}
    const lo=Math.min(...supports.map(b=>b.x-TOWER_BLOCK_HALF*(1-b.pull*.72))),hi=Math.max(...supports.map(b=>b.x+TOWER_BLOCK_HALF*(1-b.pull*.72)));
    const room=Math.min(center-lo,hi-center),risk=Math.max(0,(23-room)/23);
    if(room<clearance){clearance=room;direction=center>(lo+hi)/2?1:-1;}
    stress=Math.max(stress,risk);violation=Math.max(violation,Math.max(0,-room/24));
  }
  const mass=blocks.reduce((sum,b)=>sum+b.mass,0)||1,center=blocks.reduce((sum,b)=>sum+(b.x+blockDirection(b)*b.pull*63)*b.mass,0)/mass;
  return {clearance:clearance===999?70:clearance,violation,stress,direction,center,height};
}
function towerSafeBlock(g,p){
  const s=g.state,height=towerHeight(s),options=s.blocks.filter(b=>!b.removed&&!b.owner&&b.layer<height-2);
  const brain=p.botBrain,cached=brain&&s.blocks.find(b=>b.id===brain.plannedBlock&&!b.removed&&!b.owner&&b.layer<height-2);
  if(g.botDifficulty&&cached&&brain.planRound===s.round&&brain.planStacks===p.stacks)return cached;
  const ranked=options.map(b=>{
    const was=b.removed;b.removed=true;const support=towerSupport(s);b.removed=was;
    return {b,risk:support.violation*100+support.stress*8+(b.slot===1?2:0)+Math.abs(b.layer-p.selectedLayer)*.03};
  }).sort((a,b)=>a.risk-b.risk||a.b.layer-b.b.layer||a.b.slot-b.b.slot);
  const chosen=ranked[botRankedChoice(g,p,ranked.length,`${s.round}:${s.claimSerial}:${p.stacks}`)]?.b;
  if(g.botDifficulty&&brain&&chosen){brain.plannedBlock=chosen.id;brain.planRound=s.round;brain.planStacks=p.stacks;}
  return chosen;
}
function towerBot(g,p){
  const i=cleanInput();if(p.cooldown>0||g.state.phase!=='playing')return i;
  if(p.phase==='pulling'){
    const b=g.state.blocks.find(b=>b.id===p.carried);if(!b)return i;
    i.action=true;const target=-blockDirection(b)*.45+botTarget(g,p,{x:0,y:0},'precision').x/35;
    i.left=p.balance>target+.08;i.right=p.balance<target-.08;
    i.down=g.state.stress>.75||Math.abs(g.state.lean)>.27;
    i.special=Math.abs(g.state.lean)>.2||g.state.stress>.6;
  }else if(p.phase==='carrying'){
    const target=clamp(-g.state.lean*1.7+botTarget(g,p,{x:0,y:0},'precision').x/24,-.7,.7);
    i.left=p.stackX>target+.05;i.right=p.stackX<target-.05;
    i.action=Math.abs(p.stackX-target)<.07&&!p.prev.action;
    i.special=g.state.stress>.7;
  }else{
    const b=towerSafeBlock(g,p);if(!b)return i;
    i.left=b.slot<p.selectedSlot;i.right=b.slot>p.selectedSlot;i.up=b.layer>p.selectedLayer;i.down=b.layer<p.selectedLayer;
    i.action=b.layer===p.selectedLayer&&b.slot===p.selectedSlot&&!p.prev.action;
  }
  return i;
}
function towerCollapse(g,culpritId){
  const s=g.state;s.phase='collapsing';s.collapseTime=1.5;s.collapses++;
  const layout=towerLayout(s);
  s.debris=s.blocks.filter(b=>!b.removed).slice(-48).map(b=>{
    const position=towerBlockPosition(s,b,layout),side=Math.sign(b.x+s.lean*70)||1;
    return {x:position.x,y:position.y,vx:side*(70+random(g)*170),vy:-45-random(g)*110,angle:s.lean*.6,spin:(random(g)-.5)*8,life:1.5,scale:layout.scale,depth:random(g)};
  });
  s.culprit=culpritId||s.lastMover;
  for(const p of g.players){
    if(p.id===s.culprit){p.score=Math.max(0,p.score-8);p.collapses++;tell(p,'TOPPLED IT −8');}
    else if(p.bracing){p.score+=3;p.saves++;tell(p,'HELD FAST +3');}
    else tell(p,'TOWER FALLING!');
    p.phase='recovering';p.carried=null;p.bracing=false;p.cooldown=1.5;p.balance=0;
  }
  effect(g,'hit',480,325,'#d8bea0',160);
}
function towerStack(g,p){
  const s=g.state,before=towerSupport(s).violation,height=towerHeight(s),top=s.blocks.filter(b=>!b.removed&&b.layer===height-1);
  const layer=top.length>=3?height:height-1;
  const used=new Set(s.blocks.filter(b=>!b.removed&&b.layer===layer).map(b=>b.slot));
  const slots=[0,1,2].filter(slot=>!used.has(slot)),slot=slots.sort((a,b)=>Math.abs((a-1)-p.stackX)-Math.abs((b-1)-p.stackX))[0];
  const x=clamp(p.stackX,-1.45,1.45)*TOWER_BLOCK_WIDTH;
  // Packing constrains overlap, but an ambitious far-edge placement still shifts mass.
  const peers=s.blocks.filter(b=>!b.removed&&b.layer===layer);
  const freeX=peers.reduce((value,b)=>Math.abs(value-b.x)<40?value+(value>=b.x?40:-40):value,x);
  const target=-s.lean*1.7,precision=Math.abs(p.stackX-target),perfect=precision<.22;
  const value=8+(perfect?4:0)+Math.min(5,s.round-1);
  s.blocks.push({id:++s.nextBlock,layer,slot,x:clamp(freeX,-88,88),mass:p.carriedMass||1,friction:.8+random(g)*.25,pull:0,removed:false,owner:null,stacked:true});
  // Old extracted records are not needed by later physical simulation or snapshots.
  s.blocks=s.blocks.filter(b=>!b.removed);
  if(towerSupport(s).violation>before+.015)s.riskActor=p.id;
  p.score+=value;p.stacks++;if(perfect)p.perfectStacks++;
  p.phase='choosing';p.carried=null;p.cooldown=.3;p.stackTime=.45;p.stackFrom=x;p.success=.55;
  s.stacks++;s.lastMover=p.id;s.lastMoverAt=g.time;s.claimSerial++;
  s.velocity+=(x/100)*.08;
  tell(p,perfect?`BALANCED STACK +${value}`:`STACK +${value}`);
  const at=towerBlockPosition(s,s.blocks[s.blocks.length-1],towerLayout(s));effect(g,'magic',at.x,at.y,p.color,perfect?70:40);
}
function stepTower(g,inputs,dt){
  const s=g.state;
  for(const p of g.players)for(const key of ['cooldown','stackTime','success'])p[key]=Math.max(0,p[key]-dt);
  if(s.phase==='collapsing'){
    s.collapseTime=Math.max(0,s.collapseTime-dt);
    for(const d of s.debris){d.life-=dt;d.vy+=500*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.angle+=d.spin*dt;}
    if(s.collapseTime<=0){s.round++;s.debris=[];towerRebuild(g);}
    for(const p of g.players)p.prev=p.bot?cleanInput():cleanInput(inputs[p.id]);
    return;
  }
  const cycle=g.time%9,warning=cycle>=5.9&&cycle<6.65,gust=cycle>=6.65&&cycle<8.1;
  s.warning=warning?1-(6.65-cycle)/.75:0;
  s.wind=gust?Math.sin((cycle-6.65)/1.45*Math.PI)*(Math.floor(g.time/9)%2?-1:1):0;
  const height=towerHeight(s),frames=[];
  for(const p of g.players){
    const i=p.bot?botControl(g,p,towerBot(g,p),dt,'precision'):cleanInput(inputs[p.id]);frames.push({p,i,press:i.action&&!p.prev.action,release:!i.action&&p.prev.action});
    if(!i.special&&p.brace>.2)p.braceExhausted=false;
    p.bracing=i.special&&p.brace>0&&!p.braceExhausted&&p.cooldown<=0;p.brace=clamp(p.brace+(p.bracing?-.29:.11)*dt,0,1);
    if(p.bracing&&p.brace<=0)p.braceExhausted=true;
    if(p.cooldown>0)continue;
    if(p.phase==='choosing'){
      p.chooseClock-=dt;
      if(p.chooseClock<=0){
        if(i.left||i.right||i.up||i.down){
          p.selectedSlot=clamp(p.selectedSlot+Number(i.right)-Number(i.left),0,2);
          p.selectedLayer=clamp(p.selectedLayer+Number(i.up)-Number(i.down),0,Math.max(0,height-3));
          p.chooseClock=.15;
        }
      }
    }else if(p.phase==='pulling'){
      const block=s.blocks.find(b=>b.id===p.carried);
      if(!block||block.removed||block.owner!==p.id){p.phase='choosing';p.carried=null;continue;}
      p.balance=clamp(p.balance+(Number(i.right)-Number(i.left))*dt*1.7,-1,1);
      if(i.action){
        const before=towerSupport(s).violation;
        const speed=i.down?.36:i.up?1.58:.82;
        block.pull=clamp(block.pull+dt*speed/block.friction*(p.bracing?.78:1),0,1);
        if(towerSupport(s).violation>before+.015)s.riskActor=p.id;
        if(i.up){s.velocity+=blockDirection(block)*dt*.14;p.rushes++;}
        if(block.pull>=1){
          block.removed=true;block.owner=null;p.phase='carrying';p.carriedMass=block.mass;p.extractions++;p.score+=2;p.stackX=clamp(-s.lean*1.4,-.8,.8);p.carryTime=g.time;
          s.extractions++;s.lastMover=p.id;s.lastMoverAt=g.time;s.velocity+=blockDirection(block)*.045;
          tell(p,'BLOCK FREE · STACK IT');effect(g,'dust',480+block.x,350-block.layer*24,p.color,44);
        }
      }else if(!i.action){block.owner=null;p.phase='choosing';p.carried=null;p.balance=0;tell(p,'PULL PAUSED');}
    }else if(p.phase==='carrying'){
      p.stackX=clamp(p.stackX+(Number(i.right)-Number(i.left))*dt*1.05,-1.45,1.45);
    }
  }
  // Resolve simultaneous claims once, in rotating seat order. One block has one owner.
  const turn=s.claimSerial%g.players.length;
  const ordered=[...frames].sort((a,b)=>((a.p.slot-turn+g.players.length)%g.players.length)-((b.p.slot-turn+g.players.length)%g.players.length));
  for(const {p,press} of ordered){
    if(!press||p.cooldown>0)continue;
    if(p.phase==='carrying'&&g.time-p.carryTime>.05){towerStack(g,p);continue;}
    if(p.phase!=='choosing')continue;
    const block=selectedBlock(g,p);
    if(!block||block.layer>=height-2){tell(p,'CHOOSE A LOWER BLOCK');continue;}
    if(block.owner){tell(p,'RIVAL HAS THIS BLOCK');continue;}
    block.owner=p.id;p.carried=block.id;p.phase='pulling';p.balance=0;p.pulls++;s.claimSerial++;
    tell(p,'PULL · KEEP IT BALANCED');
  }
  const support=towerSupport(s);s.stress=support.stress;s.clearance=support.clearance;
  let force=0,brace=0,largest=0,culprit=null;
  for(const p of g.players){
    if(p.bracing)brace+=.19;
    if(p.phase==='pulling'){
      const b=s.blocks.find(b=>b.id===p.carried);if(!b)continue;
      const contribution=blockDirection(b)*b.pull*.21+p.balance*.23;
      force+=contribution;if(Math.abs(contribution)>largest){largest=Math.abs(contribution);culprit=p.id;}
    }
  }
  const target=clamp(support.center/220+support.direction*Math.min(.35,support.stress*.085)+force+s.wind*.13,-1.25,1.25);
  s.velocity+=((target-s.lean)*6-s.velocity*(4+brace*5))*dt;s.lean+=s.velocity*dt;
  const danger=Math.max(0,support.violation-brace)+Math.max(0,Math.abs(s.lean)-.48)*2;
  s.instability=clamp(s.instability+(danger>0?danger*1.65:-.65)*dt,0,1.1);
  for(const {p,i} of frames)p.prev=i;
  if(s.instability>=1||Math.abs(s.lean)>1.1)towerCollapse(g,support.violation>0?(s.riskActor||s.lastMover):(culprit||s.lastMover));
}

export function createChallenge(id,players,seed=1,options){
  const definition=BOARDGAME_CHALLENGES.find(d=>d.id===id);if(!definition)throw new Error(`Unknown board challenge: ${id}`);
  const g={id,time:0,duration:definition.duration,done:false,rng:(seed>>>0)||1,players:publicPlayers(players),state:{effects:[]}};
  if(id==='clockwork-surgery'){
    Object.assign(g.state,{phase:0,bounty:'gear',pressure:0,warning:0,resonance:0,bell:0,alarms:0,extractions:0});
    for(const p of g.players){Object.assign(p,{level:0,combo:0,clears:0,extractions:0,shocks:0,drops:0,steadies:0,steady:0,steadyCooldown:0,alarm:0,success:0,restock:0});surgeryPieces(g,p);}
  }else{
    Object.assign(g.state,{blocks:[],nextBlock:0,round:1,phase:'playing',lean:0,velocity:0,instability:0,stress:0,clearance:46,wind:0,warning:0,claimSerial:0,extractions:0,stacks:0,collapses:0,culprit:null,debris:[]});
    for(const p of g.players)Object.assign(p,{phase:'choosing',selectedLayer:1,selectedSlot:1,carried:null,carriedMass:1,balance:0,stackX:0,brace:1,braceExhausted:false,bracing:false,pulls:0,rushes:0,extractions:0,stacks:0,perfectStacks:0,collapses:0,saves:0,stackTime:0,success:0,chooseClock:0});
    towerRebuild(g);
  }
  return configureBotDifficulty(g,options,seed);
}
export function stepChallenge(g,inputs={},dt=1/60){
  if(g.done||!Number.isFinite(dt)||dt<=0)return g;
  dt=Math.min(dt,.05,g.duration-g.time);if(dt<=0){g.done=true;return g;}g.time+=dt;
  for(const p of g.players)p.flash=Math.max(0,p.flash-dt);
  for(const e of g.state.effects)e.life-=dt;g.state.effects=g.state.effects.filter(e=>e.life>0);
  if(g.id==='clockwork-surgery')stepSurgery(g,inputs,dt);else if(g.id==='tottering-tower')stepTower(g,inputs,dt);
  else throw new Error(`Unknown board challenge: ${g.id}`);
  if(g.time>=g.duration-1e-8){g.time=g.duration;g.done=true;}
  return g;
}
export function getChallengeResults(g){return g.players.map(p=>({id:p.id,score:Math.max(0,Math.round(p.score))})).sort((a,b)=>b.score-a.score);}

function label(c,text,x,y,size=12,color=PAPER){
  c.font=gameFont(size);c.textAlign='center';c.textBaseline='middle';c.lineWidth=3;c.strokeStyle=INK;c.strokeText(String(text),x,y);c.fillStyle=color;c.fillText(String(text),x,y);
}
function polygon(c,points,fill,stroke=INK){c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p[0],p[1]));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.lineWidth=1.4;c.strokeStyle=stroke;c.stroke();}}
function foldedBlock(c,x,y,w,h,color=PAPER){
  polygon(c,[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]],color);
  polygon(c,[[x-w/2,y-h/2],[x-w/2+8,y-h/2-7],[x+w/2+8,y-h/2-7],[x+w/2,y-h/2]],'#eee0bf');
  polygon(c,[[x+w/2,y-h/2],[x+w/2+8,y-h/2-7],[x+w/2+8,y+h/2-7],[x+w/2,y+h/2]],'#8e7d68');
}
function piece(c,h,kind,x,y,size,options={}){
  if(h.challengePiece){h.challengePiece(c,kind,x,y,size,options);return;}
  c.save();c.translate(x,y);c.rotate(options.rotation||0);c.globalAlpha*=options.alpha??1;
  if(kind==='block'||kind==='stack')foldedBlock(c,0,0,options.width||size,options.height||size*.4);
  else if(kind==='tweezers'){
    polygon(c,[[-size*.16,-size*.45],[-size*.06,size*.3],[-size*.2,size*.5],[-size*.28,size*.27]],'#d1c5b4');
    polygon(c,[[size*.16,-size*.45],[size*.06,size*.3],[size*.2,size*.5],[size*.28,size*.27]],'#e8d8bb');
  }else {polygon(c,[[0,-size*.45],[size*.38,-size*.12],[size*.28,size*.33],[0,size*.48],[-size*.35,size*.22],[-size*.31,-size*.2]],kind==='heart'?'#bba394':PAPER);polygon(c,[[0,-size*.45],[0,size*.48],[-size*.35,size*.22],[-size*.31,-size*.2]],'#8d7e6a',null);}
  c.restore();
}
function recessGradient(c,x1,y1,x2,y2,stops,fallback){
 const gradient=c.createLinearGradient?.(x1,y1,x2,y2);if(!gradient?.addColorStop)return fallback;
 for(const [at,color]of stops)gradient.addColorStop(at,color);return gradient;
}
function drawSocket(c,h,organ,time){
 // The printed gear supplies irregular cut edges and engraved grain. The inset
 // remains the same25px physical pickup cavity, rather than a flat UI circle.
 piece(c,h,'gear',organ.x,organ.y+1,66,{width:66,height:66,time,rotation:-.07});
 c.save();const shadow=c.createRadialGradient?.(organ.x+6,organ.y+6,3,organ.x,organ.y,25);
 if(shadow?.addColorStop){shadow.addColorStop(0,'#4b3b2c');shadow.addColorStop(.64,'#30271e');shadow.addColorStop(1,'#161413');}
 c.beginPath();c.arc(organ.x,organ.y,25,0,TAU);c.fillStyle=shadow?.addColorStop?shadow:'#30271e';c.fill();c.lineWidth=1.1;c.strokeStyle='#292018';c.stroke();
 c.beginPath();c.arc(organ.x,organ.y+1,25,.13,Math.PI-.13);c.strokeStyle='#c6b49788';c.lineWidth=.9;c.stroke();c.restore();
}
function drawChannel(c,h,organ,pressure,time){
 const width=organ.width*(1-pressure*.3);
 // Original carved cardstock is stretched along each physical channel segment.
 // Its exposed lips keep printed grain; a shaded inset and narrow crease ink
 // show depth inside that paper, instead of painting a broad flat web stroke.
 for(let n=1;n<organ.route.length;n++){
  const a=organ.route[n-1],b=organ.route[n],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<.01)continue;
  const x=(a.x+b.x)/2,y=(a.y+b.y)/2,rotation=Math.atan2(dy,dx);
  piece(c,h,'block',x,y+1,length,{width:length+width*.45,height:width+8,time,rotation,alpha:.8});
  c.save();c.translate(x,y);c.rotate(rotation);
  c.fillStyle=recessGradient(c,0,-width/2,0,width/2,[[0,'#161513'],[.24,'#30271e'],[.78,'#574534'],[1,'#79634b']],'#30271e');c.fillRect(-length/2,-width/2,length,width);
  c.beginPath();c.moveTo(-length/2,-width/2);c.lineTo(length/2,-width/2);c.strokeStyle='#292018';c.lineWidth=1.2;c.stroke();
  c.beginPath();c.moveTo(-length/2,width/2+1);c.lineTo(length/2,width/2+1);c.strokeStyle='#d5c29f9c';c.lineWidth=.85;c.stroke();
  // Small scored creases follow the source cardstock lip at regular intervals.
  for(let at=-length/2+12;at<length/2;at+=21){c.beginPath();c.moveTo(at,width/2+1);c.lineTo(at+2,width/2+3);c.strokeStyle='#43372c99';c.lineWidth=.65;c.stroke();}
  c.restore();
 }
 drawSocket(c,h,organ,time);
}

function drawSurgery(c,g,h){
  const t=g.time,s=g.state;
  for(const p of g.players){
    const a=surgeryTable(p.slot,g.players.length),mid=a.x+a.w/2;
    // Production uses the scene's own ornate table surface and folded thickness.
    if(h.challengeTable)h.challengeTable(c,a,p.slot,g.players.length);
    else {
      polygon(c,[[a.x+11,a.y+30],[a.x+a.w-11,a.y+30],[a.x+a.w,a.y+a.h],[a.x,a.y+a.h]],'#655b4b');
      polygon(c,[[a.x+11,a.y],[a.x+a.w-11,a.y],[a.x+a.w,a.y+a.h-12],[a.x,a.y+a.h-12]],'#bdb099');
      polygon(c,[[a.x+11,a.y],[a.x+26,a.y+12],[a.x+18,a.y+a.h-20],[a.x,a.y+a.h-12]],'#e1d3b7');
      polygon(c,[[a.x+a.w-11,a.y],[a.x+a.w,a.y+a.h-12],[a.x+a.w-16,a.y+a.h-18],[a.x+a.w-24,a.y+12]],'#8f806a');
    }
    // All cavities remain visible; only the gripped one exposes its full exit route.
    for(const organ of p.pieces)if(!organ.removed){
      const active=p.carried===organ.id;
      if(active)drawChannel(c,h,organ,p.steady>0?0:s.pressure,t);
      else drawSocket(c,h,organ,t);
      if(!active)piece(c,h,organ.kind,organ.x,organ.y,35,{time:t,rotation:Math.sin(t*2+organ.x)*.025});
      if(organ.kind===s.bounty&&!active)h.fx?.(c,'magic',organ.x,organ.y,42,t+organ.x*.003,{alpha:.35});
    }
    piece(c,h,'stack',a.tray.x,a.tray.y+2,66,{time:t,scaleY:.38});
    if(p.extractions>0)piece(c,h,['heart','gear','bell'][(p.extractions-1)%3],a.tray.x,a.tray.y-4,23,{time:t,rotation:-.13});
    const held=p.pieces.find(o=>o.id===p.carried);
    if(held){
      const bob=Math.sin(t*7)*2;
      h.fx?.(c,'dust',p.cursor.x,p.cursor.y+8,33,t,{alpha:.2});
      piece(c,h,held.kind,p.cursor.x,p.cursor.y-4+bob,39,{time:t,rotation:Math.sin(t*3)*.08});
    }
    piece(c,h,'tweezers',p.cursor.x,p.cursor.y-30,70,{time:t,rotation:Math.sin(t*2+p.slot)*.03+(p.alarm>0?Math.sin(t*60)*.1:0)});
    if(p.steady>0)piece(c,h,'counterweight',p.cursor.x+19,p.cursor.y-17,28,{time:t,rotation:-.22});
    h.character?.(c,p,mid-73,441,80,{time:t,moving:!!(p.prev.left||p.prev.right||p.prev.up||p.prev.down),attack:held?.3:0,hurt:p.alarm>0,celebrate:p.success>0?.8:0,facing:1,grounded:true});
    if(p.alarm>0){piece(c,h,'bell',mid,122,48,{time:t,rotation:Math.sin(t*32)*.3});h.fx?.(c,'hit',p.cursor.x,p.cursor.y,74,t,{alpha:p.alarm/.7});}
    if(p.flash>0)label(c,p.message,mid,410,10,p.color);
  }
  piece(c,h,'bell',480,95,60,{time:t,rotation:Math.sin(t*10)*(s.bell>0?.25:s.warning*.09)});
}

export function towerLayout(state){
  const height=towerHeight(state),step=Math.min(29,294/Math.max(9,height));
  return {baseX:480,baseY:404,step,scale:step/29,height};
}
export function towerBlockPosition(state,block,layout=towerLayout(state)){
  const y=layout.baseY-(block.layer+.5)*layout.step;
  return {x:layout.baseX+block.x*layout.scale+blockDirection(block)*block.pull*63*layout.scale+state.lean*(layout.baseY-y)*.42,y};
}
function drawTower(c,g,h){
  const s=g.state,t=g.time,a=towerLayout(s);
  h.platform?.(c,338,404,284,34,t,'stone');
  if(s.phase!=='collapsing'){
    const blocks=s.blocks.filter(b=>!b.removed).sort((u,v)=>u.layer-v.layer||u.slot-v.slot);
    for(const block of blocks){
      const at=towerBlockPosition(s,block,a),size=72*a.scale;
      piece(c,h,'block',at.x,at.y,size,{time:t,rotation:s.lean*.2,width:48*a.scale,height:26*a.scale});
      const actors=g.players.filter(p=>p.phase!=='carrying'&&p.phase!=='recovering'&&p.selectedLayer===block.layer&&p.selectedSlot===block.slot);
      for(const p of actors){
        const dx=(p.slot-1.5)*4;
        c.save();c.globalAlpha=.95;polygon(c,[[at.x-17+dx,at.y-8],[at.x+17+dx,at.y-8],[at.x+20+dx,at.y+6],[at.x-19+dx,at.y+6]],p.color);c.restore();
        label(c,p.slot+1,at.x+dx,at.y,10,'#29251e');
      }
      if(block.owner){
        const p=g.players.find(v=>v.id===block.owner);
        piece(c,h,'tweezers',at.x+blockDirection(block)*29,at.y-24,51,{time:t,rotation:blockDirection(block)*-.3});
        if(p?.bracing)piece(c,h,'counterweight',at.x-blockDirection(block)*35,at.y+1,35,{time:t});
      }
    }
    const top={x:480+s.lean*a.height*a.step*.42,y:404-a.height*a.step-11};
    piece(c,h,'crown',top.x,top.y,45*a.scale,{time:t,rotation:s.lean*.2});
    for(const p of g.players)if(p.phase==='carrying'){
      const x=480+p.stackX*48*a.scale+s.lean*a.height*a.step*.42;
      piece(c,h,'block',x,top.y-27-Math.sin(t*4+p.slot)*3,72*a.scale,{time:t,rotation:s.lean*.2,alpha:.95,width:48*a.scale,height:26*a.scale});
      label(c,p.slot+1,x,top.y-50,13,p.color);
      h.fx?.(c,'magic',x,top.y-24,60*a.scale,t+p.slot*.12,{alpha:.3});
    }
  }else for(const d of s.debris){
    // Foreground paper grows toward the camera; distant scraps shrink into the set.
    const progress=1-d.life/1.5,depthScale=d.depth>.5?1+progress*.85:1-progress*.55;
    piece(c,h,'block',d.x,d.y,72*d.scale*depthScale,{time:t,rotation:d.angle,alpha:clamp(d.life*2,0,1),width:48*d.scale*depthScale,height:26*d.scale*depthScale});
  }
  for(const p of g.players){
    const x=g.players.length===1?220:150+p.slot*660/(g.players.length-1);
    h.platform?.(c,x-46,440,92,20,t,'wood');
    const pulling=p.phase==='pulling',hurt=s.phase==='collapsing'&&s.culprit===p.id;
    h.character?.(c,p,x,440,85,{time:t,moving:pulling,attack:pulling?.45:0,hurt,celebrate:p.success>0?.9:0,grounded:true,facing:x<480?1:-1,lean:p.balance*.08});
    if(p.bracing)piece(c,h,'counterweight',x+(x<480?37:-37),409,54,{time:t,rotation:-p.balance*.12});
    if(p.phase==='carrying')piece(c,h,'block',x,369,59,{time:t,rotation:Math.sin(t*3)*.04,width:48,height:26});
    if(p.flash>0)label(c,p.message,x,348,10,p.color);
  }
  if(s.warning>0)piece(c,h,'bell',480+s.wind*170,85,55,{time:t,rotation:Math.sin(t*20)*.19});
  if(s.wind!==0)for(let n=0;n<4;n++)h.fx?.(c,'dust',220+((t*.3+n/4)%1)*520,170+n*49,70,t+n*.1,{alpha:Math.abs(s.wind)*.4,rotation:s.wind<0?Math.PI:0});
  if(s.instability>.15)h.fx?.(c,'dust',480,401,115,t,{alpha:s.instability*.8});
}

export function drawChallenge(c,g,h={}){
  c.save();h.background?.(c,g.id,g.time);
  if(g.id==='clockwork-surgery')drawSurgery(c,g,h);else drawTower(c,g,h);
  for(const e of g.state.effects)h.fx?.(c,e.type,e.x,e.y,e.size,g.time,{alpha:e.life/e.max,color:e.color});
  h.endScene?.(c);
  const surgery=g.id==='clockwork-surgery';
  const cue=surgery?(g.state.phase===2?'HEARTS +6 · BELL PRESSURE RISING':`${g.state.bounty.toUpperCase()} BOUNTY +4`):g.state.phase==='collapsing'?'TOWER FALLING · NEW ROUND':g.state.warning>0?'GUST COMING · BRACE':g.state.instability>.35?'SUPPORTS FAILING · EASE OFF':'PULL · BALANCE · STACK';
  const players=g.players.map(p=>surgery?{detail:p.alarm>0?'ALARM':p.carried?'CARRY TO TRAY':`CHAIN ×${p.combo}`,progress:p.steadyCooldown>0?1-p.steadyCooldown/3.3:1}:{detail:p.phase==='carrying'?'AIM · TAP TO STACK':p.phase==='pulling'?'COUNTERBALANCE':p.phase==='recovering'?'REBUILDING':'CHOOSE A BLOCK',progress:p.brace});
  drawGameHUD(c,g,h,{cue,players});c.restore();
}
