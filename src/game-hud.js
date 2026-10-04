export const GAME_UI_FONT='"Alegreya SC",Georgia,serif';
export const gameFont=(size,weight='700')=>`${weight} ${size}px ${GAME_UI_FONT}`;

/** Shared illustrated HUD. Read-only rendering, after the gameplay material pass. */
const IVORY='#f3e7c9',INK='#191d1b',MUTED='#c1b699',GOLD='#ead29b',TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=v=>Number.isFinite(v)?v:0;
function ink(c,value,x,y,size=12,color=IVORY,align='left',width=0){
  const s=String(value);c.font=gameFont(size);c.textAlign=align;c.textBaseline='middle';
  if(width>0&&typeof c.measureText==='function'){const measured=c.measureText(s)?.width;if(Number.isFinite(measured)&&measured>width)c.font=gameFont(Math.max(7,size*width/measured));}
  c.lineJoin='round';c.lineWidth=size>=24?3:2;c.strokeStyle='#101512';c.strokeText(s,x,y);c.fillStyle=color;c.fillText(s,x,y);
}
function seal(c,x,y,size,color,filled=true){
  c.save();c.translate(x,y);c.beginPath();for(let i=0;i<12;i++){const a=i*TAU/12,r=size*(i%2?.78:1);c[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fillStyle=filled?color:'#262e28';c.fill();c.strokeStyle=filled?'#f6ecd066':'#92897499';c.lineWidth=1;c.stroke();c.restore();
}
function frame(c,h,x,y,w,height,alpha=1){
  if(h.uiFrame){h.uiFrame(c,x,y,w,height,{alpha,variant:'plaque'});return;}
  c.save();c.globalAlpha*=alpha;c.fillStyle='#0c110deb';c.beginPath();c.moveTo(x+12,y);c.lineTo(x+w-12,y);c.lineTo(x+w,y+12);c.lineTo(x+w-4,y+height-7);c.lineTo(x+w-15,y+height);c.lineTo(x+11,y+height);c.lineTo(x,y+height-12);c.lineTo(x+2,y+9);c.closePath();c.fill();c.strokeStyle='#c7b98d';c.lineWidth=1.5;c.stroke();
  for(const px of [x+8,x+w-8])for(const py of [y+9,y+height-9])seal(c,px,py,4,'#d0c298');c.restore();
}
function pipMeter(c,x,y,w,value,color,count=8){const ready=Math.round(clamp(number(value),0,1)*count),step=w/(count-1);for(let n=0;n<count;n++)seal(c,x+n*step,y,n<ready?2.8:2.1,color,n<ready);}
function timer(c,g,h){
  const remaining=Math.max(0,number(g.duration)-number(g.time)),urgent=remaining<=10,cx=906,cy=46;
  c.save();c.shadowColor='#050905bb';c.shadowBlur=7;c.shadowOffsetY=3;
  h.prop?.(c,'gear',cx,cy,87,-.08);
  c.beginPath();c.arc(cx,cy,29,0,TAU);c.fillStyle='#15201df2';c.fill();c.strokeStyle='#bfb18b';c.lineWidth=2;c.stroke();c.shadowBlur=0;c.shadowOffsetY=0;
  for(let n=0;n<12;n++){const a=n*TAU/12-Math.PI/2,lit=n<Math.ceil(remaining/Math.max(1,g.duration)*12);seal(c,cx+Math.cos(a)*35,cy+Math.sin(a)*35,lit?2.5:1.7,urgent?'#e9b68e':GOLD,lit);}
  ink(c,String(Math.ceil(remaining)).padStart(2,'0'),cx,cy-1,30,urgent?'#f3c79b':IVORY,'center');c.restore();
}
const OBJECTIVES={
 'rift-rumble':'LAST ONE STANDING','crown-clash':'HOLD THE CROWN','meteor-melee':'SURVIVE THE METEORS','spire-kings':'HOLD THE SEAL',
 'bell-breakers':'BREAK THE BELLS','relic-launch':'LAUNCH THE RELIC','hollow-horde':'CLEAR THE HOLLOWS','rift-ball':'SCORE GOALS','spark-heist':'BANK SPARKS','fuse-festival':'PASS THE FUSE','tower-relay':'REACH YOUR NEXT SEAL','bellows-boxing':'POP RIVAL HEADS','colossus-wake':'BREAK THE CORE',
 inkfall:'DODGE THE FALLING GEARS',mothlight:'GATHER & BANK LIGHTS',sweep:'DODGE THE TRAIN',rhythm:'FOLLOW THE BEAT',maze:'FIND THE KEY · ESCAPE',redlight:'REACH THE GATE',raft:'REACH THE LANTERN',gallery:'HIT THE TARGETS',trace:'FOLLOW YOUR STARS',shadow:'STEAL & BANK RELICS','gullet-gala':'GATHER PEARLS'
};
function header(c,g,h,o){
 const cue=o.cue||OBJECTIVES[g.id]||'',w=Math.min(460,Math.max(220,cue.length*8+48));
 frame(c,h,480-w/2,12,w,36,.9);ink(c,cue,480,30,13,IVORY,'center',w-30);
}
function arcadeInfo(g,p){
 const ready=number(p.ability)<=0;
 switch(g.id){
  case'inkfall':return{detail:ready?'PHASE READY':'PHASE '+p.ability.toFixed(1)+'s',progress:ready?1:1-p.ability/2};
  case'mothlight':return{detail:'CARRY '+number(p.carry)+'/9',progress:number(p.carry)/9};
  case'sweep':return{detail:p.combo>1?'STREAK ×'+p.combo:'',progress:number(p.combo)/8};
  case'rhythm':return{detail:(p.track?'SUN':'MOON')+' · ×'+number(p.combo),progress:number(p.combo)/12};
  case'maze':return{detail:p.hasKey?'KEY FOUND':'FIND THE KEY',progress:p.hasKey?1:number(p.rune)?.6:.1};
  case'redlight':return{detail:Math.floor(number(p.progress))+'% · ALERT '+Math.round(number(p.alert)*100)+'%',progress:number(p.progress)/100};
  case'raft':return{detail:p.safe?'SAFE':'REACH THE LIGHT',progress:ready?1:1-p.ability};
  case'gallery':return{detail:'COMBO ×'+number(p.combo),progress:number(p.charge)/.65};
  case'trace':return{detail:'CHAIN ×'+number(p.combo)+' · FOCUS '+Math.round(number(p.focus)*100)+'%',progress:number(p.focus)};
  case'shadow':return{detail:'CARRY '+number(p.relics)+'/3',progress:number(p.relics)/3};
  case'gullet-gala':return{detail:p.stun>0?'STUNNED':p.charging?'CHARGING':p.mode.toUpperCase(),progress:p.charging?p.charge:p.burpCooldown>0?1-p.burpCooldown/3:1};
  default:return{detail:'',progress:0};
 }
}
/** Portrait plaques occupy y458..538; timer/header stay above y82. */
export function drawGameHUD(c,g,h={},options={}){
  c.save();header(c,g,h,options);timer(c,g,h);
  const count=g.players.length,slot=960/count,w=Math.min(238,slot-10),start=(960-count*w-(count-1)*8)/2;
  const high=Math.max(...g.players.map(p=>number(p.score))),combat=options.mode==='brawl';
  for(const p of g.players){
    const x=start+p.slot*(w+8),y=458,info=options.players?.[p.slot]||arcadeInfo(g,p),color=p.color||GOLD;
    frame(c,h,x,y,w,80,.98);
    // The cutout deliberately overlaps its inset portrait slip, like a paper badge.
    c.save();c.fillStyle='#384138';c.beginPath();c.ellipse(x+33,y+41,27,31,0,0,TAU);c.fill();c.strokeStyle='#c6b792aa';c.lineWidth=1;c.stroke();
    h.character?.(c,p,x+33,y+75,52,{static:true,time:g.time,portrait:true,grounded:true,facing:1,attack:0,specialAnimation:''});c.restore();
    seal(c,x+12,y+68,8,color);ink(c,p.slot+1,x+12,y+68,9,INK,'center');
    const left=x+68,right=x+w-12,name=(p.name||'Traveler '+(p.slot+1)).slice(0,18);
    ink(c,name,left,y+17,11,IVORY,'left',w-93);
    if(high>0&&p.score===high)h.prop?.(c,'crown',right-1,y+17,16,0);
    if(combat){
      const damage=p.eliminated?'OUT':Math.round(number(p.damage))+'%';ink(c,damage,left,y+40,p.eliminated?24:31,p.damage>100?'#f1b095':IVORY,'left',85);
      if(g.id==='rift-rumble'){for(let i=0;i<2;i++)seal(c,right-10-i*20,y+40,7,color,i<p.stocks);}
      else{ink(c,Math.max(0,Math.round(number(p.score))),right,y+37,19,color,'right');}
      ink(c,info.detail||'',left,y+57,8.5,MUTED,'left',w-80);
      ink(c,number(p.specialCooldown)<=0?'SPECIAL READY':p.specialCooldown.toFixed(1)+'s',left,y+68,8.2,number(p.specialCooldown)<=0?GOLD:MUTED,'left',w-131);
      pipMeter(c,right-39,y+68,39,info.progress??p.specialCharge,color,6);
    }else{
      ink(c,Math.max(0,Math.round(number(p.score))),left,y+40,33,color,'left',84);
      ink(c,info.detail||'',left,y+57,9,IVORY,'left',w-80);
      pipMeter(c,right-33,y+61,33,info.progress,color,5);
    }
  }
  c.restore();
}
