import './style.css';
import './title-cast.css';
import {createTitleCast} from './title-cast.js';
import {createBoardDialogue,projectRingAnchor,BANTER_STATS} from './board-presentation.js';
import {CHARACTERS,loadArt,art,helpers,character,prop,drawCity,portrait,propPortrait,paperEnvironmentStats,paperWorldStats,setMaterialFeatures,materialStats,materialFeatures,resetVisualMotion,paperAnimationStats,setWorldDepth} from './art.js';
import {minigameSurpriseDiagnostics} from './minigame-surprises.js';
import {MINIGAMES,createGame,stepGame,drawGame,getGameResults} from './minigames.js';
import {BOARD_SPACES,paperBoardStats,createParty,actParty,stepParty,finishMinigame,rankPlayers,drawBoard,playableCards,viewParty,CARD_COLORS,CARD_SYMBOLS,CARD_PALETTE,finishingBonus,finishProjection} from './board.js';
import {SPECIALS,BRAWL_GAMES} from './brawlers.js';
import {PartyNetwork} from './network.js';
import {RealtimeGame} from './realtime.js';
import {toggleAudio,isAudioOn,sound} from './audio.js';
import {GAME_UI_FONT} from './game-hud.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DIFFICULTIES=['easy','medium','hard'];
const difficultyOf=value=>DIFFICULTIES.includes(value)?value:'medium';
let profile={name:'Traveler',character:0,difficulty:'medium'};
try{profile={...profile,...JSON.parse(localStorage.getItem('afterlight-profile')||'{}')}}catch{}
const savedCharacter=Number(profile.character);profile.character=Number.isInteger(savedCharacter)&&savedCharacter>=0&&savedCharacter<CHARACTERS.length?savedCharacter:0;profile.name=String(profile.name).slice(0,18);profile.difficulty=difficultyOf(profile.difficulty);
let route='home',party=null,network=null,localId='local',roster=[],modal=null,busy=false,status='',paused=false;
let lastFrame=performance.now(),broadcastElapsed=0,uiKey='',count=0;
const input={left:false,right:false,up:false,down:false,action:false,special:false},remoteInputs={};
const inputSources=new Map();
let prediction=null,renderedGame=null,localInputSequence=0,lastBroadcastMarker='',lastSnapshotAt=0,gameAttempt=0;
let thumbnails=[],boardCamera=null,overview=false,lastCardAnimation='',lastVisibleDiscard=null;
let titleCast=null,titleTransition=false,transitionDone=Promise.resolve(),transitionStage='idle',ringAnchor=null,dialogueView=null,dialogueSignature='',cardFlightPending=null,cardPlayOrigin=null,presentationEpoch=0;
const boardDialogue=createBoardDialogue();
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function resetPresentation(){presentationEpoch++;boardDialogue.reset();dialogueView=null;dialogueSignature='';ringAnchor=null;cardFlightPending=null;cardPlayOrigin=null;lastCardAnimation='';lastVisibleDiscard=null;boardCamera=null;}
async function transitionScreen(callback,button=null){
 if(titleTransition){await transitionDone;return transitionScreen(callback,button);}titleTransition=true;transitionStage='celebrating';let complete;transitionDone=new Promise(resolve=>complete=resolve);
 const hero=$('.hero'),cast=route==='home'?titleCast:null;hero?.setAttribute('data-celebrating','true');button?.classList.add('title-choice-selected');
 try{
  if(cast)await delay(cast.celebrate(performance.now()/1000)*1000);
  const curtain=document.createElement('div');curtain.className='title-transition-overlay';curtain.setAttribute('aria-hidden','true');document.body.append(curtain);void curtain.offsetWidth;curtain.dataset.covered='true';transitionStage='covering';
  await delay(reducedMotion()?90:220);callback();cast?.reset();hero?.removeAttribute('data-celebrating');button?.classList.remove('title-choice-selected');
  transitionStage='revealing';$('.shell')?.classList.add('title-screen-enter');void curtain.offsetWidth;curtain.dataset.covered='false';await delay(reducedMotion()?90:240);curtain.remove();
 }finally{titleTransition=false;transitionStage='idle';complete();}
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4500)}
function saveProfile(){try{localStorage.setItem('afterlight-profile',JSON.stringify(profile))}catch{}}
function authority(){return !network||network.role==='host'||network.role==='offline'}
function resetRealtime(){prediction?.clear();prediction=null;renderedGame=null;localInputSequence=0;broadcastElapsed=0;lastBroadcastMarker='';for(const id of Object.keys(remoteInputs))delete remoteInputs[id]}
function sendLocalInput(immediate=false){
 if(network&&network.role!=='offline')return network.sendInput(input,{immediate});
 if(!immediate)return localInputSequence;
 const seq=++localInputSequence,next={...input};remoteInputs[localId]={input:next,seq};prediction?.setInput(localId,next,seq);return seq;
}
function setControl(key,down,source){
 if(!inputSources.has(key))inputSources.set(key,new Set());const sources=inputSources.get(key);down?sources.add(source):sources.delete(source);
 const held=sources.size>0;if(input[key]===held)return;input[key]=held;sendLocalInput(true);
}
function releaseInputs(){const changed=Object.values(input).some(Boolean);inputSources.clear();for(const key of Object.keys(input))input[key]=false;if(changed)sendLocalInput(true);document.querySelectorAll('.touch-btn.active').forEach(b=>b.classList.remove('active'))}
function gameKey(state=party){return state?.game?.netId||`${state?.round||0}:${state?.nextGame??state?.game?.id}:${state?.game?.id}`}
function preparePrediction(meta){
 if(!party?.game||party.phase!=='minigame'||party.countdown>0){prediction?.clear();prediction=null;return null}
 const fresh=!prediction||prediction.authoritative!==authority()||prediction.localId!==localId;
 if(fresh)prediction=new RealtimeGame({localId,authoritative:authority(),onApplied:(id,seq)=>network?.markInputApplied(id,seq)});
 const key=meta?.gameKey||gameKey(),changed=prediction.key!==key;
 if(authority())prediction.setGame(party.game,key);else if(meta||fresh||changed)prediction.reconcile(party.game,meta||{},key);
 if(fresh||changed){for(const[id,record]of Object.entries(remoteInputs))prediction.setInput(id,record.input,record.seq);sendLocalInput(true)}
 return prediction;
}
function broadcastParty(force=false){
 if(!party||network?.role!=='host')return;
 const marker=[party.phase,party.boardStage,party.currentPlayerId,party.round,party.nextGame,party.game?.netId,party.message,party.activeColor,party.drawnCardId,party.pendingDraw,party.chainCount,party.turnOrderRevision,party.discard?.at(-1)?.id,party.players.map(p=>`${p.id}:${p.bot}:${p.position}:${p.handCount}:${p.hand?.length}:${p.calledLast}:${p.item}:${p.sparks}:${p.lanterns}:${p.laps}`).join('|')].join('/');
 const idle=party.phase==='board'&&['await-card','drawn-card','choose-path','choose-event','choose-chain','penalty-card'].includes(party.boardStage);
 if(force||marker!==lastBroadcastMarker||broadcastElapsed>=(idle?1:.125)){network.broadcast(party,viewParty);broadcastElapsed=0;lastBroadcastMarker=marker}
}
function header(){return `<div class="menu-tools"><button class="icon-button" data-nav="home" aria-label="Back to title" ${route==='home'?'hidden':''}>←</button><button class="icon-button" data-nav="rules" aria-label="Rules">?</button><button class="icon-button" id="fullscreen" aria-label="Toggle fullscreen">⛶</button><button class="icon-button" id="audio" aria-label="${isAudioOn()?'Mute':'Enable'} sound">${isAudioOn()?'♫':'♪'}</button></div>`}
function propIcon(name){return `<span class="prop-icon ${name}" style="background-image:url('${propPortrait(name)}');background-size:contain;background-position:center"></span>`}
function home(){return `<section class="hero title-cast-ready" aria-label="Afterlight title screen"><div class="hero-copy"><h1>AFTERLIGHT</h1><div class="title-menu"><button class="mode-card" data-play="solo">${propIcon('lantern')}<h3>Play solo</h3><span>✦</span></button><button class="mode-card" data-play="online">${propIcon('drone')}<h3>Play with friends</h3><span>✦</span></button><button class="mode-card" data-nav="arcade">${propIcon('gear')}<h3>Minigames</h3><span>✦</span></button></div></div><div class="title-cast" aria-hidden="true"><canvas id="title-cast" width="960" height="900"></canvas></div></section>`}
function arcade(){return `<div class="page-head"><h1>Minigames</h1></div><section class="library-grid" aria-label="Choose a minigame">${MINIGAMES.map((g,i)=>`<button class="game-card" data-practice="${i}"><img src="${thumbnails[i]||''}" alt="${esc(g.name)} gameplay preview" loading="lazy"><div class="game-card-body"><h3>${esc(g.name)}</h3><span class="game-duration">${g.duration}s</span></div></button>`).join('')}</section>`}
function rules(){return `<div class="page-head"><div><span class="eyebrow">TRAVELER’S FIELD GUIDE</span><h1>Play your last card wisely.</h1><p>Seven cards each. Highest points wins. Finishing is a choice.</p></div><button class="button" data-play="solo">Enter the realms ✦</button></div><div class="rules-grid"><article class="rule"><span class="number">I</span><h3>Match & move</h3><p>Match the discard’s color or symbol. Numbers move that many spaces (zero moves one); action cards move four, Wilds five. Reverse changes turn order. Skip misses a traveler; draw attacks start a stack-or-take penalty. Chain cards with the same number before traveling. Stack +2 on +2 or +4 on +4; taking the accumulated penalty ends your turn. Outside a penalty chain, +4 requires no card of the active color. Draw one even if you could play; then play that drawn card or pass.</p></article><article class="rule"><span class="number">II</span><h3>Choose your ending</h3><p>Before playing from two cards to one, call “Last light!” or draw two. Playing your final card ends the party and adds 25% of your current points, rounded up. The highest final score wins—even if someone else cleared their hand. A tied score favors the finisher, then minigame wins, fewer cards, and seat order. Your projected finish is shown with one card left.</p></article><article class="rule"><span class="number">III</span><h3>A world with mischief</h3><p>Complete the 48-space circuit for +25 points. Climb ladders, slide chutes and choose secret bridges. Passing rivals shares a high-five bonus; landing on them bumps them back two spaces for +3. An umbrella blocks a bump or chute. Every pad has an illustrated effect: prizes, tolls, shelters, steals or card buffs. Comet Fold adds two steps; Ink Gleam adds three points; Clockwork Fold shuffles the seats. Storybook spaces offer bargains, portals and challenge invitations. Every four card turns opens a minigame worth 20 / 12 / 8 / 4 party points.</p></article><article class="rule"><span class="number">IV</span><h3>Learn your fighter</h3><p>Arrows / WASD move. Up jumps twice. Space attacks: slash on land, spin in air; Up + Space uppercuts and airborne Down + Space dives. Down guards; a fresh press parries. X / Shift unleashes your traveler’s special. Windups can be interrupted and cooldowns are shown beneath your portrait. Damage increases launch force—recover before leaving the arena.</p></article><article class="rule"><span class="number">V</span><h3>Fight for the objective</h3><p>Smash bells, launch a practice relic, repel a hollow horde, score moon-ball goals, steal and bank sparks, escape a cursed fuse, race moving checkpoints, break a giant owl’s heart, or pop a spring boxer’s head. Each arena scores its own objective, with warned surprise events during play. Clockwork Surgery tests a steady hand; Tottering Tower tests risky pulls and counterbalancing. Gullet Gala turns the table into a contested feast: aim, hold and release a gulp, switch sip mode or burp away trouble.</p></article><article class="rule"><span class="number">VI</span><h3>Bring your company</h3><p>Share AFTERLIGHT.html. Everyone opens it, chooses Gather your friends, then joins the host’s room code. Up to four people play; empty seats become rivals. Solo and arcade work offline. Online play needs internet and an open host tab. Escape opens the game menu; ⛶ fills your screen.</p></article></div>`}
function profileModal(mode,index){
 const own=mode==='lobby'?roster.find(player=>player.id===localId):null;
 modal={type:'profile',mode,index,character:own?.character??profile.character,name:own?.name??profile.name};showModal();
}
function difficultyPicker(scope='profile'){
 return `<div class="difficulty-picker" role="group" aria-label="Bot difficulty" data-difficulty-scope="${scope}"><span class="field-label">Rival mischief</span><div class="difficulty-options">${DIFFICULTIES.map(level=>`<button type="button" class="difficulty-choice ${profile.difficulty===level?'selected':''}" data-difficulty="${level}" aria-pressed="${profile.difficulty===level}">${{easy:'Easy',medium:'Medium',hard:'Hard'}[level]}</button>`).join('')}</div></div>`;
}
function bindDifficulty(scope=document){
 scope.querySelectorAll('[data-difficulty]').forEach(button=>button.onclick=()=>{
  profile.difficulty=difficultyOf(button.dataset.difficulty);saveProfile();
  scope.querySelectorAll('[data-difficulty]').forEach(choice=>{const selected=choice.dataset.difficulty===profile.difficulty;choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected));});sound('click');
 });
}

function modalContent(){
 if(modal.type==='wild')return `<button class="close-modal" data-close aria-label="Cancel">×</button><h2>Choose a color</h2><div class="wild-colors">${CARD_COLORS.map(color=>`<button class="wild-color" data-color="${color}" style="--suit:${CARD_PALETTE[color]}">${CARD_SYMBOLS[color]}<b>${color}</b></button>`).join('')}</div>`;
 if(modal.type==='pause')return `<button class="close-modal" data-close aria-label="Close">×</button><h2>${network?'Menu':'Paused'}</h2>${network?'<p class="online-live">Match continues online</p>':''}<div class="pause-options"><button class="button" data-close>Resume</button><button class="button outline" id="show-controls">Controls & rules</button><button class="button outline" id="menu-fullscreen">Fullscreen</button><button class="button outline" id="menu-audio">${isAudioOn()?'Mute':'Enable'} sound</button><button class="button outline" id="quit">Leave game</button></div>`;
 if(modal.type==='help'){const mini=party&&['minigame','minigame-intro','results'].includes(party.phase),info=gameInfo();return `<button class="close-modal" data-close aria-label="Close">×</button><h2>${mini?esc(info.name):'Cards & movement'}</h2><p>${mini?esc(info.description):'Match the discard’s color or symbol. Draw if you cannot play, or to delay finishing. Call Last light before playing down to one card.'}</p><p class="instructions">${mini?esc(info.instructions):'Matching numbers chain into one journey; Travel commits the combo. Match a draw attack to stack it, or take the full debt. Boost cards add two steps, Shine adds three points, and Shuffle changes turn order. Numbers move their value; actions four, Wilds five. Every four turns starts a minigame. Laps award 25 points. Your last card ends the party with a 25% bonus; highest points wins.'}</p><button class="button" data-close>Back to game</button>`;}
 if(modal.type==='error')return `<button class="close-modal" data-close aria-label="Close">×</button><h2>Disconnected</h2><p>${esc(modal.message)}</p><button class="button" id="quit">Back to the city</button>`;
 const selection=modal.mode==='lobby'?modal.character:profile.character,traveler=CHARACTERS[selection],special=SPECIALS[selection];
 const picker=`<div class="traveler-picker-stage"><aside class="traveler-spotlight">${portrait(selection,'spotlight-portrait')}<div class="traveler-description"><h3>${esc(traveler.name)}</h3><span class="traveler-role">${esc(traveler.role)} · ${esc(traveler.outfitLabel||'')}</span><b>${esc(special.name)}</b><p>${esc(traveler.quote)}</p><span class="special-key">X <span>special</span></span></div></aside><div class="character-picker">${CHARACTERS.map(c=>`<button class="character-choice ${selection===c.id?'selected':''}" data-character="${c.id}" aria-label="Choose ${esc(c.name)}" aria-pressed="${selection===c.id}" style="--traveler-color:${esc(c.outfitColor||'#927042')}">${portrait(c.id)}<b>${esc(c.name)}</b><small>${esc(SPECIALS[c.id].name)}</small></button>`).join('')}</div></div>`;
 const name=`<div class="profile-name"><label class="field-label" for="player-name">Your name</label><input id="player-name" maxlength="18" value="${esc(modal.mode==='lobby'?modal.name:profile.name)}" autocomplete="nickname"></div>`;
 const controls=modal.mode==='online'?`<div class="traveler-setup online-setup">${name}<button class="button" id="host" ${busy?'disabled':''}>${busy?'Connecting…':'Host a room ↗'}</button><div class="profile-join"><label class="field-label" for="join-code">Join a room</label><div class="field-row"><input id="join-code" maxlength="6" placeholder="ROOM CODE" value="${esc(modal.joinCode??new URLSearchParams(location.search).get('room')??'')}" aria-label="Room code"><button class="button outline" id="join" ${busy?'disabled':''}>Join ↗</button></div></div></div><p class="note" id="net-status" role="status">${esc(status||'')}</p>`:modal.mode==='lobby'?`<div class="traveler-setup lobby-setup">${name}<button class="button" id="apply-character">Join the cast ✦</button></div>`:`<div class="traveler-setup">${name}${difficultyPicker()}<button class="button" id="start-solo">${modal.mode==='practice'?'Enter the minigame':'Start the party'} ↗</button></div>`;
 return `<button class="close-modal" data-close aria-label="Close">×</button><h2>Choose your traveler</h2>${picker}${controls}`;
}
function showModal(){
 releaseInputs();let backdrop=$('.modal-backdrop');if(!backdrop){backdrop=document.createElement('div');backdrop.className='modal-backdrop';document.body.append(backdrop)}
 const selecting=modal.type==='profile';backdrop.innerHTML=`<section class="modal ${selecting?'traveler-modal':''}" role="dialog" aria-modal="true" aria-label="${selecting?'Choose your traveler':'Game menu'}">${modalContent()}</section>`;
 backdrop.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal);backdrop.onclick=e=>{if(e.target===backdrop&&!busy)closeModal()};
 backdrop.querySelectorAll('[data-character]').forEach(b=>b.onclick=()=>{
  if(modal.mode==='lobby'){modal.name=$('#player-name')?.value??modal.name;modal.character=Number(b.dataset.character);}
  else{readProfile();modal.joinCode=$('#join-code')?.value;profile.character=Number(b.dataset.character);saveProfile();}
  sound('click');showModal();backdrop.querySelector(`[data-character="${b.dataset.character}"]`)?.focus();
 });bindDifficulty(backdrop);
 backdrop.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{const cardId=modal.cardId,color=b.dataset.color;closeModal();doAction('play-card',{cardId,color})});
 if($('#start-solo'))$('#start-solo').onclick=()=>{readProfile();const practice=modal.mode==='practice'?modal.index:null;closeModal();transitionScreen(()=>startLocal(practice))};
 if($('#host'))$('#host').onclick=()=>connect('host');if($('#join'))$('#join').onclick=()=>connect('join');
 if($('#apply-character'))$('#apply-character').onclick=()=>{
  const character=modal.character,name=$('#player-name').value.trim().slice(0,18)||CHARACTERS[character].name;
  if(!network?.updateProfile({name,character})){toast('The cast is already on its way. Choose again in the next lobby.');return;}
  profile={...profile,name,character};saveProfile();closeModal();sound('click');
 };
 if($('#quit'))$('#quit').onclick=quit;if($('#show-controls'))$('#show-controls').onclick=()=>{modal={type:'help'};showModal()};if($('#menu-fullscreen'))$('#menu-fullscreen').onclick=toggleFullscreen;if($('#menu-audio'))$('#menu-audio').onclick=async()=>{await toggleAudio();showModal()};
 setTimeout(()=>backdrop.querySelector(selecting?'[data-character].selected':'button')?.focus(),0);
}
function readProfile(){if($('#player-name'))profile.name=$('#player-name').value.trim().slice(0,18)||CHARACTERS[profile.character].name;saveProfile()}

function closeModal(){if(busy)return;modal=null;paused=false;$('.modal-backdrop')?.remove();releaseInputs()}
function render(){
 uiKey='';const content=route==='home'?home():route==='arcade'?arcade():route==='rules'?rules():route==='lobby'?lobby():match();
 $('#app').innerHTML=`<div class="shell" data-route="${route}">${header()}<main>${content}</main></div>`;
 titleCast=route==='home'?createTitleCast($('#title-cast'),helpers,{reducedMotion:reducedMotion()}):null;
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>route==='home'?transitionScreen(()=>navigate(b.dataset.nav),b):navigate(b.dataset.nav));document.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>route==='home'?transitionScreen(()=>profileModal(b.dataset.play),b):profileModal(b.dataset.play));document.querySelectorAll('[data-practice]').forEach(b=>b.onclick=()=>profileModal('practice',Number(b.dataset.practice)));
 $('#fullscreen').onclick=toggleFullscreen;
 $('#audio').onclick=async()=>{try{await toggleAudio();$('#audio').textContent=isAudioOn()?'♫':'♪';$('#audio').setAttribute('aria-label',isAudioOn()?'Mute sound':'Enable sound')}catch{toast('Audio is unavailable in this browser.')}};
 if(route==='lobby')bindLobby();if(route==='match'){bindMatch();updateMatchUI(true)}
}
function navigate(to){if(party||route==='lobby'){modal={type:'pause'};paused=!network;showModal();return}route=to;render();window.scrollTo(0,0)}
function localPlayers(){return [{id:'local',...profile,bot:false},...CHARACTERS.filter(c=>c.id!==profile.character).sort((a,b)=>((a.id-profile.character+8)%8)-((b.id-profile.character+8)%8)).slice(0,3).map((c,i)=>({id:`bot-${i}`,name:c.name,character:c.id,bot:true}))]}
function startLocal(practice=null){releaseInputs();network?.close();network=null;localId='local';resetRealtime();party=createParty(localPlayers(),{seed:Date.now()>>>0});party.kind='party';party.botDifficulty=profile.difficulty;if(practice!==null){party.practice=true;party.phase='minigame-intro';party.nextGame=practice}route='match';resetPresentation();render();sound('click')}
function makeNetwork(){return new PartyNetwork({
 onStatus:message=>{status=typeof message==='string'?message:message.message||JSON.stringify(message);if($('#net-status'))$('#net-status').textContent=status},
 onPlayers:players=>{roster=players;const own=players.find(player=>player.id===localId);if(own){profile={...profile,name:own.name,character:own.character};saveProfile();}if(route==='lobby')render()},
 onState:(state,meta)=>{if(!state||state.kind!=='party')return;party=state;lastSnapshotAt=performance.now();preparePrediction(meta);if(route!=='match'){resetPresentation();route='match';closeModal();render()}else updateMatchUI()},
 onAction:({playerId,action,payload})=>{if(party&&authority()&&['play-card','draw-card','pass','end-chain','call-last','choose-path','choose-event','item'].includes(action)&&actParty(party,playerId,action,payload))broadcastParty(true)},
 onInput:({playerId,input:next,seq})=>{remoteInputs[playerId]={input:next,seq};prediction?.setInput(playerId,next,seq)},
 onDisconnect:({playerId,hostLost,reason})=>{if(hostLost){const message=reason||'The host disconnected, so this room has ended. You can host a new room or play solo.';releaseInputs();party=null;roster=[];busy=false;paused=false;resetRealtime();resetPresentation();route='home';render();modal={type:'error',message};showModal()}else if(party&&authority()){const p=party.players.find(p=>p.id===playerId);if(p){p.bot=true;if(party.game){const gp=party.game.players.find(p=>p.id===playerId);if(gp)gp.bot=true}toast(`${p.name} left. A computer traveler takes over.`);broadcastParty(true)}}}
})}
async function connect(mode){if(busy)return;readProfile();const code=$('#join-code')?.value.trim().toUpperCase();if(mode==='join'&&!/^[A-Z0-9]{6}$/.test(code)){toast('Enter the six-character room code.');return}busy=true;status='Connecting to the signaling service…';showModal();network?.close();resetRealtime();network=makeNetwork();try{const result=mode==='host'?await network.host(profile):await network.join(code,profile);localId=result.id||network.id;roster=network.players;busy=false;closeModal();route='lobby';render()}catch(err){busy=false;status=err.message||'Unable to connect. Please try again.';network?.close();network=null;toast(status);showModal()}}
function lobby(){
 const players=roster.length?roster:network?.players||[];
 return `<div class="page-head"><h1>Your party</h1><button class="button outline small" id="leave-lobby">Leave</button></div><div class="lobby"><div class="lobby-stage">${Array.from({length:4},(_,i)=>{
  const p=players[i],own=p?.id===localId,c=CHARACTERS[p?.character??i],tag=own?'button':'div';
  return `<${tag} class="lobby-traveler ${own?'own-traveler':''} ${p?'':'empty-traveler'}" ${own?'data-lobby-character aria-label="Change your traveler"':''} style="--traveler-color:${esc(c.outfitColor||'#927042')}">${portrait(c.id)}<span class="lobby-name-slip"><b>${p?esc(p.name):'Bot'}</b><small>${p?esc(c.name):'A seat for a friend'}${own?' · Change ✦':''}</small></span></${tag}>`;
 }).join('')}</div><aside class="lobby-info"><h2>Room code</h2><div class="room-code" id="room-code">${esc(network?.code||'…')}</div><button class="button outline" id="copy-code">Copy code</button><button class="button outline" id="copy-link">Invite friends</button>${authority()?`${difficultyPicker('lobby')}<button class="button" id="start-online">Start party</button>`:'<p class="waiting-host">Waiting for host…</p>'}</aside></div>`;
}
function bindLobby(){
 if($('#leave-lobby'))$('#leave-lobby').onclick=quit;document.querySelectorAll('[data-lobby-character]').forEach(button=>button.onclick=()=>profileModal('lobby'));bindDifficulty();
 $('#copy-code').onclick=()=>copy(network.code);$('#copy-link').onclick=()=>{if(location.protocol==='file:'){toast('Send friends AFTERLIGHT.html. They open it, choose Play with friends, and join room '+network.code+'.');return}const url=new URL(location.href);url.searchParams.set('room',network.code);copy(url.toString())};
 if($('#start-online'))$('#start-online').onclick=()=>{if(!authority())return;network.setLocked(true);resetRealtime();party=createParty(roster,{seed:Date.now()>>>0});party.kind='party';party.botDifficulty=profile.difficulty;resetPresentation();transitionScreen(()=>{route='match';broadcastParty(true);render()})};
}

async function copy(value){try{await navigator.clipboard.writeText(value);toast('Copied')}catch{toast(`Copy this: ${value}`)}}
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable here. Use your browser’s fullscreen control.')}}
function match(){return `<section class="game-room" data-phase="${party.phase}" data-overview="${overview}"><div class="match-tools"><button class="icon-button" id="board-overview" aria-label="Toggle board overview">◎</button><button class="icon-button" id="match-fullscreen" aria-label="Toggle fullscreen">⛶</button><button class="icon-button" id="match-menu" aria-label="${network?'Game menu':'Pause game'}">☰</button></div><div class="match-layout"><div class="stage-wrap"><canvas id="game-canvas" width="960" height="540" aria-label="Afterlight game"></canvas><div id="ring-discard" class="ring-discard discard-preview" aria-label="Discard and active color"></div><div id="board-dialogue" class="board-dialogue" aria-live="polite" aria-atomic="true"></div><div id="overlay-slot"></div></div><aside class="score-panel" id="score-panel" aria-label="Party standings"></aside><section class="card-dock" aria-label="Card table"><div id="board-actions" class="board-actions"></div><section id="hand-panel" class="hand-panel" aria-label="Your cards"></section></section><div class="touch-controls"><div class="dpad" aria-label="Movement controls">${['up','left','down','right'].map((k,i)=>`<button class="touch-btn" data-input="${k}" aria-label="Move ${k}">${['↑','←','↓','→'][i]}</button>`).join('')}</div><div class="attack-controls"><button class="touch-btn special-pad" data-input="special" aria-label="Character special">X</button><button class="touch-btn action-pad" data-input="action" aria-label="Minigame action">●</button></div></div><div class="card-play-layer" aria-hidden="true"></div></div></section>`}
function bindMatch(){
 $('#match-fullscreen').onclick=toggleFullscreen;$('#board-overview').onclick=()=>{overview=!overview;$('.game-room').dataset.overview=String(overview);$('#board-overview').classList.toggle('active',overview)};
 $('#match-menu').onclick=()=>{modal={type:'pause'};paused=!network;showModal()};
 document.querySelectorAll('[data-input]').forEach(b=>{const key=b.dataset.input;let source='';b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);source=`touch:${key}:${e.pointerId}`;setControl(key,true,source);b.classList.add('active')};const release=()=>{setControl(key,false,source);b.classList.remove('active')};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release});
}
function doAction(action,payload){if(!party)return;sound('click');if(authority()){if(action==='begin-minigame'){if(actParty(party,party.hostId,action)){prediction?.clear();prediction=null;party.game=createGame(MINIGAMES[party.nextGame].id,party.players,((party.seed||Date.now())+party.round*1111)>>>0,{difficulty:party.botDifficulty||profile.difficulty});party.game.netId=`${Date.now().toString(36)}-${++gameAttempt}`;party.countdown=3;delete party.finishPresentationRemaining}}else if(action==='continue'){actParty(party,party.hostId,action)}else actParty(party,localId,action,payload);broadcastParty(true)}else network.sendAction(action,payload);updateMatchUI(true)}
function gameInfo(){return MINIGAMES[party?.nextGame??0]||MINIGAMES[0]}
const cardMark=card=>({skip:'⊘',reverse:'⇄',draw2:'+2',draw4:'+4',wild:'✦'}[card?.value]??card?.value??'✦');
function cardFace(card,{playable=false,button=false}={}){if(!card)return '';const tag=button?'button':'div';return `<${tag} class="realm-card ${playable?'playable':''} ${card.color==='wild'?'wild-card':''}" style="--suit:${CARD_PALETTE[card.color]||CARD_PALETTE.ivory}" ${button?`data-card="${esc(card.id)}" ${playable?'':'disabled'} aria-label="Play ${esc(card.color)} ${esc(card.value)}"`:''}><span class="card-corner">${CARD_SYMBOLS[card.color]} ${cardMark(card)}</span><b>${cardMark(card)}</b><small>${esc(card.color)}<br>${esc(card.value)}</small>${card.buff?`<span class="card-buff" title="${esc({boost:'+2 movement',shine:'+3 points',shuffle:'Shuffle turn order'}[card.buff])}">${{boost:'➤',shine:'✦',shuffle:'⇄'}[card.buff]||'✦'}</span>`:''}<span class="card-corner bottom">${CARD_SYMBOLS[card.color]} ${cardMark(card)}</span></${tag}>`}
function updateRingAnchor(){
 const canvas=$('#game-canvas'),stage=$('.stage-wrap'),ring=$('#ring-discard');if(!canvas||!stage||!ring)return;
 ringAnchor=projectRingAnchor(canvas.getBoundingClientRect(),boardCamera||undefined,{cover:party?.phase==='board'&&!overview});
 const rect=stage.getBoundingClientRect();ring.style.setProperty('--ring-x',`${ringAnchor.x-rect.left}px`);ring.style.setProperty('--ring-y',`${ringAnchor.y-rect.top}px`);
}
function updateRingCard(slap=false){
 const ring=$('#ring-discard');if(!ring||!party)return;const top=cardFlightPending?.previous||party.discard?.at(-1);
 const key=`${top?.id}:${party.activeColor}`;if(ring.dataset.cardKey!==key){ring.dataset.cardKey=key;ring.innerHTML=`${cardFace(top)}<span class="active-suit" style="color:${CARD_PALETTE[party.activeColor]}" aria-label="${esc(party.activeColor)}">${CARD_SYMBOLS[party.activeColor]}</span>`;}
 if(slap){const face=ring.querySelector('.realm-card');face?.classList.remove('discard-slap');void face?.offsetWidth;face?.classList.add('discard-slap');}
}
function updateBoardPresentation(now){
 if(!party||route!=='match')return;updateRingAnchor();updateRingCard();
 const container=$('#board-dialogue');if(!container)return;
 dialogueView=boardDialogue.sample(party,localId,now/1000);container.hidden=!['board','finished'].includes(party.phase);
 for(const side of ['left','right']){
  const speaker=dialogueView[side];let el=container.querySelector(`[data-side="${side}"]`);if(!speaker){el?.remove();continue;}
  if(!el||el.dataset.playerId!==speaker.id||el.dataset.character!==String(speaker.character)){
   el?.remove();el=document.createElement('div');el.className='dialogue-speaker';el.dataset.side=side;el.dataset.playerId=speaker.id;el.dataset.character=String(speaker.character);el.innerHTML=`<div class="dialogue-portrait">${portrait(speaker.character)}</div><div class="dialogue-copy"><span class="dialogue-name"></span><p class="dialogue-line"></p></div>`;container.append(el);
  }
  el.style.setProperty('--speaker-accent',['#dfc899','#a7c8bb','#c3b4d2','#d4b4a5'][speaker.character%4]);
  const current=dialogueView.current,line=speaker.lineKey===current?.actorLine?.key?current.actorLine:speaker.lineKey===current?.rivalLine?.key?current.rivalLine:null;
  el.dataset.category=line?.category||'';el.dataset.speaking=String(!!speaker.text);el.dataset.moving=String(!!speaker.moving);
  el.dataset.reaction=speaker.reaction;const name=el.querySelector('.dialogue-name'),copy=el.querySelector('.dialogue-line');if(name.textContent!==CHARACTERS[speaker.character].name)name.textContent=CHARACTERS[speaker.character].name;if(copy.textContent!==speaker.text)copy.textContent=speaker.text;
 }

}
function animateCardPlay(){
 const previous=lastVisibleDiscard;lastVisibleDiscard=party?.discard?.at(-1)||null;const card=party?.lastPlayedCard;if(!card){updateRingCard();return;}
 const token=`${party.lastCardPlayerId}:${card.id}`;if(token===lastCardAnimation){updateRingCard();return;}lastCardAnimation=token;
 if(Number.isFinite(party.lastCardPlayedAt)&&party.clock-party.lastCardPlayedAt>2){updateRingCard();return;}
 updateRingAnchor();const layer=$('.card-play-layer');if(!layer||!ringAnchor)return;
 const epoch=presentationEpoch,finish={x:ringAnchor.x,y:ringAnchor.y},source=$(`[data-player="${CSS.escape(party.lastCardPlayerId)}"]`)?.getBoundingClientRect();
 const start=party.lastCardPlayerId===localId?(cardPlayOrigin||{x:innerWidth*.5,y:innerHeight+50}):{x:source?source.left+source.width/2:40,y:source?source.top+source.height/2:80};cardPlayOrigin=null;
 cardFlightPending={token,previous:previous||card};updateRingCard();
 const el=document.createElement('div');el.className='card-flight';el.innerHTML=cardFace(card);el.style.cssText=`--from-x:${start.x}px;--from-y:${start.y}px;--to-x:${finish.x}px;--to-y:${finish.y}px;--to-scale:1;--suit:${CARD_PALETTE[card.color]}`;layer.append(el);
 setTimeout(()=>{if(epoch!==presentationEpoch)return;cardFlightPending=null;updateRingCard(true);if(previous&&previous.id!==card.id){const old=document.createElement('div');old.className='card-ejected';old.style.cssText=`left:${finish.x}px;top:${finish.y}px`;old.innerHTML=cardFace(previous);layer.append(old);setTimeout(()=>old.remove(),700);}sound(card.color==='wild'?'win':'click');for(let n=0;n<9;n++){const star=document.createElement('span');star.className='paper-star';star.style.cssText=`left:${finish.x}px;top:${finish.y}px;--dx:${Math.cos(n/9*Math.PI*2)*110}px;--dy:${Math.sin(n/9*Math.PI*2)*95}px;--spin:${n*70}deg;animation-delay:${n*.014}s`;layer.append(star);setTimeout(()=>star.remove(),1000);}},570);
 setTimeout(()=>el.remove(),640);
}
function updateStageBackdrop(){
 const stage=$('.stage-wrap');if(!stage||!party)return;
 const minigame=party.game&&['minigame','results'].includes(party.phase),id=minigame?party.game.id:'world',image=art[id==='world'?'world':`scene-${id}`]||art.world||art.city;
 if(stage.dataset.scene===id)return;stage.dataset.scene=id;
 if(image?.src)stage.style.setProperty('--stage-scene',`url(${JSON.stringify(image.src)})`);
}
function updateMatchUI(force=false){
 if(!party||route!=='match'||!$('#score-panel'))return;
 const me=party.players.find(p=>p.id===localId),current=party.players[party.turnIndex],top=party.discard?.at(-1);
 const key=[party.phase,party.boardStage,party.currentPlayerId,party.round,party.nextGame,party.game?.netId,party.message,party.activeColor,party.drawnCardId,party.pendingDraw,party.chainCount,party.turnOrderRevision,Math.ceil(party.countdown||0),party.players.map(p=>`${p.id}:${p.handCount}:${p.hand?.map(c=>c.id+':'+(c.buff||'')).join(',')}:${p.calledLast}:${p.sparks}:${p.laps}:${p.lanterns}:${p.item}:${p.shortcutChoice}`).join('|')].join('/');
 if(!force&&key===uiKey)return;uiKey=key;updateStageBackdrop();
 const info=gameInfo(),isCombat=BRAWL_GAMES.some(g=>g.id===info.id),isGame=['minigame','minigame-intro'].includes(party.phase),mine=party.phase==='board'&&current?.id===localId,canPlay=mine&&['await-card','drawn-card','choose-chain','penalty-card'].includes(party.boardStage),legal=new Set(playableCards(party,localId).map(c=>c.id)),ranks=rankPlayers(party);
 $('.special-pad').hidden=!isCombat;$('.game-room').dataset.phase=party.phase;$('.game-room').dataset.stage=party.boardStage;$('#board-overview').hidden=party.phase!=='board';
 $('#score-panel').innerHTML=party.players.map((p,i)=>`<div data-player="${esc(p.id)}" class="score-row ${party.phase==='board'&&i===party.turnIndex?'current':''} ${ranks[0]?.id===p.id?'leading':''}" style="--player-color:${['#e7c885','#8dc4bf','#baacd7','#d6a497'][i]}">${portrait(p.character)}<span class="info"><b>${ranks[0]?.id===p.id?'♛ ':''}${esc(p.name)}</b><small aria-label="${p.laps||0} laps">↻ ${p.laps||0}${p.shield?' · ☂':''}</small></span><span class="stats"><strong>${p.sparks}</strong><small>POINTS</small></span><span class="card-count" title="Cards remaining">▱ <b>${p.handCount??p.hand?.length??0}</b></span></div>`).join('');
 $('#board-actions').innerHTML=party.phase==='board'?`${mine&&party.boardStage==='choose-path'?'<button class="button" id="path-shortcut">Cross the bridge ↗</button><button class="button outline" id="path-main">Circle onward →</button>':''}${canPlay?`<div class="turn-buttons">${party.boardStage==='choose-chain'?'<button class="button" id="end-chain">Travel →</button>':`<button class="button" id="draw-card" ${party.boardStage==='drawn-card'?'disabled':''}>${party.boardStage==='penalty-card'?`Take +${party.pendingDraw}`:'Draw +1'}</button>`}${party.boardStage==='drawn-card'?'<button class="button outline" id="pass-turn">Keep & pass →</button>':''}<button class="button outline" id="call-last" ${me.hand.length===2?'':'hidden'} ${me.calledLast?'disabled':''}>${me.calledLast?'Called ✓':'Last light!'}</button><button class="button outline" id="use-item" ${me.item?'':'hidden'}>${me.item==='shield'?'☂ Umbrella':me.item==='boost'?'➤ Boost':'No item'}</button></div>`:''}`:'';
 const hand=$('#hand-panel');hand.hidden=party.phase!=='board';
 const projection=me?.handCount===1?finishProjection(party,me.id,{buff:me.hand?.[0]?.buff}):null;
 if(party.phase==='board')hand.innerHTML=`<div class="hand-top">${projection?`<p class="finish-warning ${projection.wouldWin?'winning':'trailing'}" aria-label="Projected finish">${me.sparks}${me.hand?.[0]?.buff==='shine'?' + 3✦':''} + ${projection.bonus} = <b>${projection.points}</b> · #${projection.rank}</p>`:''}</div><div class="hand-cards">${(me?.hand||[]).map((card,i)=>cardFace(card,{playable:legal.has(card.id),button:true}).replace('style="',`style="--fan:${Math.max(-5,Math.min(5,(i-(me.hand.length-1)/2)*1.4))}deg;`)).join('')}</div>`;
 document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{const card=me.hand.find(c=>c.id===b.dataset.card),rect=b.getBoundingClientRect();cardPlayOrigin={x:rect.left+rect.width/2,y:rect.top+rect.height/2};if(card.color==='wild'){modal={type:'wild',cardId:card.id};showModal()}else doAction('play-card',{cardId:card.id})});
 if($('#end-chain'))$('#end-chain').onclick=()=>doAction('end-chain');if($('#draw-card'))$('#draw-card').onclick=()=>doAction('draw-card');if($('#pass-turn'))$('#pass-turn').onclick=()=>doAction('pass');if($('#call-last'))$('#call-last').onclick=()=>doAction('call-last');if($('#use-item'))$('#use-item').onclick=()=>doAction('item');if($('#path-shortcut'))$('#path-shortcut').onclick=()=>doAction('choose-path',{choice:'shortcut'});if($('#path-main'))$('#path-main').onclick=()=>doAction('choose-path',{choice:'main'});
 let overlay='',overlayClass='';
 if(party.phase==='board'&&party.boardStage==='choose-event'&&party.pendingEvent){const event=party.pendingEvent;overlayClass='story-overlay';overlay=`<div class="story-choice"><h2>${esc(event.title)}</h2><p>${esc(event.description)}</p>${mine?`<div class="story-choices">${event.choices.map(choice=>`<button class="button" data-event="${esc(choice.id)}"><b>${esc(choice.label)}</b><small>${esc(choice.description)}</small></button>`).join('')}</div>`:`<p>${esc(current?.name)} chooses their fate…</p>`}</div>`;}
 if(party.phase==='minigame-intro')overlay=`<div class="challenge-scroll"><h2>${esc(info.name)}</h2><p>${esc(info.description.split('. ')[0])}${info.description.includes('. ')?'.':''}</p><details class="minigame-rules"><summary>Controls & rules</summary><p>${esc(info.description)}</p><p>${esc(info.instructions)}</p></details>${authority()?'<button class="button light" id="begin-minigame">Play</button>':'<p>Waiting for host…</p>'}</div>`;
 if(party.phase==='minigame'&&party.countdown>0)overlay=`<div class="countdown-only"><div class="countdown">${Math.ceil(party.countdown)}</div></div>`;
 if(party.phase==='results'){const results=party.lastResults||party.results||party.gameResults||getGameResults(party.game),rows=Array.isArray(results)?results:results.ranking||[];overlay=`<div class="results-scroll"><h2>Results</h2>${rows.map((r,i)=>{const p=party.players.find(p=>p.id===r.id);return `<div class="result-row">${portrait(p?.character||0)}<b>${r.rank??i+1}. ${esc(p?.name||r.name||'Traveler')}</b><span><strong>+${r.award??[20,12,8,4][i]}</strong> POINTS</span></div>`}).join('')}${authority()?(party.practice?'<button class="button light" id="again">REMATCH ↻</button> <button class="button outline light" id="arcade-back">Minigames</button>':'<button class="button light" id="continue-party">Continue</button>'):'<p>Waiting for the host…</p>'}</div>`;}
 if(party.phase==='finished'){const ranked=rankPlayers(party),winner=ranked[0],finisher=party.players.find(p=>p.id===party.finisherId);overlay=`<div class="results-scroll"><h2>${esc(winner?.name||'Traveler')} wins</h2><p>${esc(finisher?.name)} · +${party.finishBonus||0} finish bonus</p>${ranked.map((p,i)=>`<div class="result-row">${portrait(p.character)}<b>${i===0?'♛':i+1} ${esc(p.name)}</b><span><strong>${p.sparks}</strong> POINTS<small>${p.laps||0} LAPS${p.id===party.finisherId?' · FINISHER':''}</small></span></div>`).join('')}<button class="button light" id="finish-home">Done</button></div>`;}
 $('#overlay-slot').innerHTML=overlay?`<div class="stage-overlay ${overlayClass}">${overlay}</div>`:'';
 document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>doAction('choose-event',{choice:b.dataset.event}));
 if($('#begin-minigame'))$('#begin-minigame').onclick=()=>doAction('begin-minigame');if($('#continue-party'))$('#continue-party').onclick=()=>doAction('continue');if($('#again'))$('#again').onclick=()=>startLocal(party.nextGame);if($('#arcade-back'))$('#arcade-back').onclick=()=>{quit();route='arcade';render()};if($('#finish-home'))$('#finish-home').onclick=quit;
 animateCardPlay();
}
function quit(){busy=false;releaseInputs();network?.close();network=null;party=null;roster=[];modal=null;paused=false;resetRealtime();resetPresentation();closeModal();route='home';render()}
function prepareStageCanvas(canvas){
 const scale=Math.min(2,Math.max(1,Math.max(canvas.clientWidth/960,canvas.clientHeight/540)*(window.devicePixelRatio||1))),width=Math.round(960*scale),height=Math.round(540*scale);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 const ctx=canvas.getContext('2d');ctx.setTransform(width/960,0,0,height/540,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';return ctx;
}
function frame(now){const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
 if(route==='home')titleCast?.draw(now/1000);
 if(party&&route==='match'){
 if(network?.role!=='offline')sendLocalInput();
 if(authority()&&!paused){
  if(party.phase==='board')stepParty(party,dt);
  if(party.phase==='minigame'&&party.game){if(party.countdown>0)party.countdown=Math.max(0,party.countdown-dt);else{preparePrediction()?.advance(dt);if(party.game.done){if(party.finishPresentationRemaining===undefined)party.finishPresentationRemaining=.82;else party.finishPresentationRemaining=Math.max(0,party.finishPresentationRemaining-dt);if(party.finishPresentationRemaining===0){finishMinigame(party,getGameResults(party.game));delete party.finishPresentationRemaining;prediction?.clear();prediction=null;sound('win')}}}}
  broadcastElapsed+=dt;broadcastParty();
 }else if(network?.role==='guest'&&party.phase==='minigame'&&party.countdown<=0)preparePrediction()?.advance(dt);
 const canvas=$('#game-canvas');if(canvas){
  const ctx=prepareStageCanvas(canvas);ctx.clearRect(0,0,960,540);
  if(party.game&&['minigame','results'].includes(party.phase)){renderedGame=party.phase==='minigame'&&prediction?prediction.renderGame(dt):party.game;if(party.phase==='minigame'&&party.game.done&&Number.isFinite(party.finishPresentationRemaining))renderedGame={...renderedGame,time:party.game.time+.82-party.finishPresentationRemaining};drawGame(ctx,renderedGame,helpers)}
  else{renderedGame=null;const elapsed=network?.role==='guest'?Math.max(0,(now-lastSnapshotAt)/1000):0;const board=elapsed?{...party,clock:party.clock+elapsed,timer:Math.max(0,party.timer-Math.min(.2,elapsed))}:party;boardCamera=drawBoard(ctx,board,{...helpers,boardPortrait:canvas.clientHeight>canvas.clientWidth,boardOverview:overview||window.matchMedia('(prefers-reduced-motion: reduce)').matches})}

 }
 updateMatchUI();updateBoardPresentation(now);}
 requestAnimationFrame(frame)
}
function infoDuration(){return gameInfo().duration}
const keyMap={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',' ':'action',Enter:'action',x:'special',X:'special',Shift:'special'};
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.target.closest('button,a')&&['Enter',' '].includes(e.key))return;if(e.key==='Escape'){if(modal)closeModal();else if(party){modal={type:'pause'};paused=!network;showModal()}return}const key=keyMap[e.key];if(key&&route==='match'&&!modal){e.preventDefault();setControl(key,true,`key:${e.code||e.key}`)}});
window.addEventListener('keyup',e=>{const key=keyMap[e.key];if(key)setControl(key,false,`key:${e.code||e.key}`)});window.addEventListener('blur',releaseInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInputs()});
window.addEventListener('beforeunload',e=>{if(network&&party){e.preventDefault();e.returnValue=''}});
function makeThumbnails(){const c=document.createElement('canvas');c.width=960;c.height=540;const ctx=c.getContext('2d');thumbnails=MINIGAMES.map((g,i)=>{const game=createGame(g.id,localPlayers().map(p=>({...p,bot:true})),101+i);for(let t=0;t<60;t++)stepGame(game,{},1/60);drawGame(ctx,game,helpers);return c.toDataURL('image/webp',.65)})}
$('#app').innerHTML='<div class="loading"><div><h1>AFTERLIGHT</h1><span class="loading-mark" role="status" aria-label="Loading">✦</span></div></div>';
try{await Promise.all([loadArt(),document.fonts.load('700 16px "Alegreya SC"'),document.fonts.load('400 16px "Alegreya"')]);makeThumbnails();render();requestAnimationFrame(frame);if(new URLSearchParams(location.search).has('room'))profileModal('online')}catch(error){$('#app').innerHTML=`<div class="loading"><div><h1>Unable to load</h1><p>${esc(error.message)}</p><button onclick="location.reload()" class="button">Try again</button></div></div>`;console.error(error)}
// Read-only diagnostics for smoke tests and inspection; no alternate network path.
window.afterlight={materials:{setFeatures:setMaterialFeatures,setDepth:setWorldDepth,get features(){return materialFeatures()},get stats(){return materialStats()},resetMotion:resetVisualMotion},
 renderVisualFixture({game,features={},background=true,lightingProfile,context}={}){
  const before=JSON.stringify(game),saved=materialFeatures();setMaterialFeatures({...saved,...features});resetVisualMotion(game.time??0);
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');
  const fixtureHelpers={...helpers,...(!background?{background(){}}:{}),beginScene(ctx,id,time,profile){helpers.beginScene(ctx,id,time,lightingProfile||profile,context||game)}};
  try{drawGame(ctx,game,fixtureHelpers);return {image:canvas.toDataURL('image/png'),stats:materialStats(),features:materialFeatures(),environment:paperEnvironmentStats(),surprises:minigameSurpriseDiagnostics(game),animation:paperAnimationStats(),stateUnchanged:before===JSON.stringify(game)}}
  finally{setMaterialFeatures(saved);resetVisualMotion()}
 },get ui(){return {profile:{...profile},fontFamily:GAME_UI_FONT,difficulty:party?.game?.botDifficulty||party?.botDifficulty||profile.difficulty}},get titleCast(){return titleCast?.stats||null},get presentation(){return {ring:ringAnchor,dialogue:dialogueView,transition:transitionStage}},get banter(){return BANTER_STATS},get animation(){return paperAnimationStats()},get boardCamera(){return boardCamera},get state(){return party},get network(){return network},get route(){return route},get renderedGame(){return renderedGame},get prediction(){return prediction},get boardPads(){return {count:BOARD_SPACES.length,spaces:BOARD_SPACES.map(({type,icon,symbol,color,mischiefId})=>({type,icon,symbol,color,mischiefId})),event:party?.padEvent||null}},get paperBoard(){return paperBoardStats()},get surprises(){return party?.game?minigameSurpriseDiagnostics(party.game):null},get environment(){return paperEnvironmentStats()},get paperWorld(){return paperWorldStats()},get minigames(){return MINIGAMES.map(({id,name})=>({id,name}))}};
