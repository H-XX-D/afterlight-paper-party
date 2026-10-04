// Explicit visual test fixtures: both states share the same clock and seed.
// These are test-only snapshots, never shipped as gameplay authority.
export const LIGHTING_EVENT_FIXTURES={
 inkfall:g=>{g.players[0].cooldown=.76;g.players[0].flash=.82;g.players[0].message='HIT −6';g.state.objects=[{x:g.players[0].x,y:400,r:24,spin:0,speed:150}];},
 mothlight:g=>{g.players[0].carry=8;g.players[0].flash=.82;g.players[0].message='CARRY 8 — BANK IT';},
 sweep:g=>{g.state.next=g.time+.05;g.state.height='high';g.state.count=7;g.state.express=true;g.players[0].duck=true;g.players[0].combo=3;},
 rhythm:g=>{Object.assign(g.players[0],{track:1,lastBeat:6,combo:6,flash:.82,message:'PERFECT ×6 +6'});},
 maze:g=>{Object.assign(g.players[0],{hasKey:true,rune:1,ability:3.8,flash:.82,message:'SECRET RUNE +12'});},
 redlight:g=>{g.state.green=false;g.state.timer=.12;g.state.phase=1;Object.assign(g.players[0],{alert:.85,progress:48,lane:2});g.players[0].prev.up=true;},
 raft:g=>{Object.assign(g.state,{safe:4,warning:true,upcoming:1,shard:2,shardTimer:0,wind:32});g.players[0].jump=.48;},
 gallery:g=>{Object.assign(g.players[0],{charge:.78,shotTime:g.time,shot:480,aim:.5,flash:.82,message:'HIT +17'});},
 trace:g=>{g.state.comets[0].x=g.players[0].x+8;g.state.comets[0].y=g.players[0].y;Object.assign(g.players[0],{focus:.7,combo:7,linkTime:g.time});g.players[0].prev.action=true;},
 shadow:g=>{g.state.decoys=[{x:140,y:244,life:2.02},{x:725,y:350,life:1.6}];Object.assign(g.players[0],{relics:3,flash:.82,message:'GHOST DECOY'});},
};

const FIGHTER_IDS=['bell-breakers','relic-launch','hollow-horde','rift-ball','spark-heist','fuse-festival','tower-relay','bellows-boxing','colossus-wake','rift-rumble','crown-clash','meteor-melee','spire-kings'];
for(const id of FIGHTER_IDS)LIGHTING_EVENT_FIXTURES[id]=g=>{
 const p=g.players[0];Object.assign(p,{flash:.82,message:'HIT',damage:40,attack:.15,specialAnimation:'active',specialCharge:.25,specialProgress:.35,specialTime:.2,specialX:p.x+55,specialY:p.y-42});
 const o=g.state.objective;if(o?.targets?.[0])o.targets[0].hp=1;if(o?.dummies?.[0])o.dummies[0].damage=50;if(o?.ball){o.ball.lastTouch=p.id;o.ball.vx=500;}if(o?.bomb)o.bomb.fuse=.6;if(o?.boss)o.boss.open=true;
};
LIGHTING_EVENT_FIXTURES['gullet-gala']=g=>{Object.assign(g.players[0],{charging:true,charge:.8,bite:.4,bitePower:.8,extension:160,flash:.82,message:'LONG GULP',burpTime:.2});};
LIGHTING_EVENT_FIXTURES['clockwork-surgery']=g=>{
 Object.assign(g.state,{pressure:.88,resonance:.54,bell:.48,warning:.8});const p=g.players[0],organ=p.pieces[0];Object.assign(p,{carried:null,alarm:.5,cooldown:.45,cursor:{x:organ.x,y:organ.y},flash:.82,message:'ALARM · TOOL DROPPED'});
 const lifting=g.players[1],held=lifting.pieces[0];Object.assign(lifting,{carried:held.id,grabbed:.3,cursor:{x:held.x+4,y:held.y}});g.players[2].steady=.7;Object.assign(g.players[3],{success:.55,extractions:1});g.players[3].pieces[0].removed=true;
};
LIGHTING_EVENT_FIXTURES['tottering-tower']=g=>{
 Object.assign(g.state,{lean:.58,instability:.86,stress:1.35,wind:-.78,warning:.7});const p=g.players[0],block=g.state.blocks.find(b=>b.layer===p.selectedLayer&&b.slot===p.selectedSlot);Object.assign(p,{phase:'pulling',carried:block.id,cooldown:0,bracing:true,brace:.76,flash:.82,message:'PULL · KEEP IT BALANCED'});block.owner=p.id;block.pull=.72;Object.assign(g.players[1],{phase:'choosing',success:.4,cooldown:.2});
};

export function makeLightingPair(id,createGame){
 if(typeof createGame!=='function')throw new TypeError('makeLightingPair requires the production createGame function');
 const apply=LIGHTING_EVENT_FIXTURES[id];if(!apply)throw new Error(`No game lighting fixture for ${id}`);
 const roster=['Pip','Moth','Bolt','Wisp'].map((name,i)=>({id:`lighting-${i}`,name,character:i,bot:false}));
 const idle=createGame(id,roster,147);idle.time=4.1;
 if(id==='sweep')idle.state.next=idle.time+1.8;
 const event=structuredClone(idle);apply(event);return {idle,event};
}
