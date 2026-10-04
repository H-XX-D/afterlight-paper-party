import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_BANTER,BANTER_CATEGORIES,selectCharacterBanter,characterBanterLine} from '../src/character-banter.js';

test('all eight original travelers have at least fifty distinct concise written reactions',()=>{
 assert.deepEqual(CHARACTER_BANTER.map(voice=>voice.name),['Pip','Moth','Bolt','Wisp','Rook','Briar','Vellum','Nix']);
 const all=[];
 for(const voice of CHARACTER_BANTER){
  assert.equal(voice.character,CHARACTER_BANTER.indexOf(voice));
  assert.equal(voice.lineCount,88);
  const lines=Object.values(voice.lines).flat();all.push(...lines);
  assert.equal(new Set(lines).size,88,`${voice.name} has no copied line`);
  assert.ok(lines.length>=50);
  for(const category of BANTER_CATEGORIES){
   assert.equal(voice.lines[category].length,4,`${voice.name} ${category} has four authored variants`);
   for(const line of voice.lines[category]){
    const words=line.split(/\s+/).length;
    assert.ok(words>=6&&words<=15,`${voice.name} ${category}: ${words} words`);
    assert.ok(!/[<>]/.test(line),'dialogue is plain text rather than inline markup');
   }
  }
 }
 assert.equal(all.length,704);assert.equal(new Set(all).size,704,'every written line in the complete roster is distinct');
});

test('bank, voices, categories and all variant arrays reject mutation',()=>{
 assert.ok(Object.isFrozen(BANTER_CATEGORIES));assert.ok(Object.isFrozen(CHARACTER_BANTER));
 for(const voice of CHARACTER_BANTER){
  assert.ok(Object.isFrozen(voice));assert.ok(Object.isFrozen(voice.lines));
  for(const variants of Object.values(voice.lines))assert.ok(Object.isFrozen(variants));
 }
 assert.throws(()=>CHARACTER_BANTER[0].lines.play.push('changed'),TypeError);
 assert.throws(()=>{CHARACTER_BANTER[0].name='changed';},TypeError);
});

test('same public event selects the same immutable line before and after snapshot restoration',()=>{
 for(const voice of CHARACTER_BANTER)for(const category of BANTER_CATEGORIES){
  const metadata={character:voice.character,category,eventId:'public-147',eventOrdinal:147};
  const result=selectCharacterBanter(metadata);
  assert.ok(Object.isFrozen(result));assert.equal(result.character,voice.character);
  assert.ok(voice.lines[category].includes(result.text));assert.equal(result.eventId,'public-147');
  assert.deepEqual(result,selectCharacterBanter(JSON.parse(JSON.stringify(metadata))));
  assert.equal(characterBanterLine(metadata),result.text);
 }
 assert.deepEqual(selectCharacterBanter({character:'bRiAr',category:'ladder',eventOrdinal:7}),selectCharacterBanter({character:5,category:'ladder',eventOrdinal:7}));
});

test('sequential occurrences rotate through every variant before repeating',()=>{
 for(const voice of CHARACTER_BANTER)for(const category of BANTER_CATEGORIES){
  const first=Array.from({length:4},(_,eventOrdinal)=>selectCharacterBanter({character:voice.character,category,eventOrdinal}).key);
  assert.equal(new Set(first).size,4,`${voice.name} ${category} rotates all four`);
  assert.equal(selectCharacterBanter({character:voice.character,category,eventOrdinal:4}).key,first[0]);
 }
 // Reducing before adding avoids loss of ordinal precision at the safe integer limit.
 const ordinal=Number.MAX_SAFE_INTEGER-3;
 const keys=Array.from({length:4},(_,index)=>selectCharacterBanter({character:0,category:'play',eventOrdinal:ordinal+index}).key);
 assert.equal(new Set(keys).size,4);
});

test('caller-provided previous key prevents an immediate duplicate even across ordinal gaps',()=>{
 const metadata={character:7,category:'chute',eventId:'slide',eventOrdinal:20};
 const original=selectCharacterBanter(metadata),repeated=selectCharacterBanter({...metadata,eventOrdinal:24});
 assert.equal(original.key,repeated.key);
 const guarded=selectCharacterBanter({...metadata,eventOrdinal:24,previousKey:original.key});
 assert.notEqual(guarded.key,original.key);assert.notEqual(guarded.text,original.text);
 assert.deepEqual(guarded,selectCharacterBanter({...metadata,eventOrdinal:24,previousKey:original.key}));
});

test('stale and duplicate event ordinals are suppressed while the next public event is accepted',()=>{
 const metadata={character:1,category:'skip',afterOrdinal:39};
 assert.equal(selectCharacterBanter({...metadata,eventOrdinal:37}),null);
 assert.equal(selectCharacterBanter({...metadata,eventOrdinal:39}),null);
 assert.equal(characterBanterLine({...metadata,eventOrdinal:39}),'');
 assert.equal(selectCharacterBanter({...metadata,eventOrdinal:40}).ordinal,40);
 assert.ok(selectCharacterBanter({...metadata,eventOrdinal:0,afterOrdinal:-1}));
});

test('good and bad rival snapbacks use separate voices and never repeat the initiating move line',()=>{
 for(const voice of CHARACTER_BANTER){
  const actor=selectCharacterBanter({character:voice.character,category:'bump-hit',eventOrdinal:12});
  const good=selectCharacterBanter({character:voice.character,category:'bump-hit',role:'rival',tone:'good',eventOrdinal:12});
  const bad=selectCharacterBanter({character:voice.character,category:'bump-blocked',role:'rival',tone:'bad',eventOrdinal:12});
  assert.equal(good.category,'reply-good');assert.equal(bad.category,'reply-bad');
  assert.notEqual(good.text,actor.text);assert.notEqual(bad.text,actor.text);assert.notEqual(good.text,bad.text);
  assert.ok(voice.lines['reply-good'].includes(good.text));assert.ok(voice.lines['reply-bad'].includes(bad.text));
  assert.equal(selectCharacterBanter({character:voice.character,category:'play',role:'rival',tone:'neutral'}),null);
 }
});

test('unknown events, invalid character IDs, invalid roles and unsafe ordinals fail closed',()=>{
 for(const character of [-1,8,1.5,NaN,Infinity,'Nobody',null,{},[]])assert.equal(selectCharacterBanter({character,category:'play'}),null);
 for(const category of ['unknown','__proto__',null,undefined])assert.equal(selectCharacterBanter({character:0,category}),null);
 for(const eventOrdinal of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null])assert.equal(selectCharacterBanter({character:0,category:'play',eventOrdinal}),null);
 assert.equal(selectCharacterBanter({character:0,category:'play',role:'spectator'}),null);
 assert.equal(selectCharacterBanter(),null);
});

test('selection uses only public metadata and never inspects private cards or a wall clock',()=>{
 const metadata={character:2,category:'draw-penalty',eventId:'draw:29',eventOrdinal:29};
 const expected=selectCharacterBanter(metadata);
 Object.defineProperties(metadata,{
  hand:{get(){throw new Error('private hand was accessed');}},
  deck:{get(){throw new Error('hidden deck was accessed');}},
  time:{get(){throw new Error('clock was accessed');}},
  opponentCards:{get(){throw new Error('private opponent cards were accessed');}}
 });
 assert.deepEqual(selectCharacterBanter(metadata),expected);
 const idOnly={character:6,category:'play',eventId:'event:α:31'};
 assert.deepEqual(selectCharacterBanter(idOnly),selectCharacterBanter({...idOnly}));
 assert.equal(selectCharacterBanter({...metadata,category:'penalty'}).text,expected.text);
});

test('six new board contexts add exactly twenty-four bespoke lines per voice while preserving the original categories',()=>{
 const additions=['pad-good','pad-bad','pad-buff','chain','stack','shuffle'];
 const original=['play','draw','skip','reverse','draw-penalty','ladder','chute','shortcut','pass','bump-hit','bump-blocked','lap','finish-good','finish-bad','reply-good','reply-bad'];
 assert.deepEqual(BANTER_CATEGORIES,[...original,...additions]);
 const hallmarks=[
  /post|stamp|parcel|deliver|satchel|address|envelope|mail|route|courier|depot|express|sorting/i,
  /moon|dream|wing|lantern|flutter|wind|breeze|sleep|nightmare/i,
  /gear|cog|patent|mechan|circuit|load|defect|calibrat|torque|output|rotation|efficien|pressure|machin|tolerance|parts|upgrad|manufactur/i,
  /light|lantern|flame|guard|blessing|care|warmth|shelter|bright/i,
  /raven|knight|armor|banner|talon|shield|herald|campaign|march|siege|battlement|seal|sworn|levy|tribute/i,
  /sew|thorn|stitch|petal|doll|hem|button|basket|prickly|seam|garland|snag/i,
  /ink|plot|author|footnote|paragraph|print|editor|punctuat|script|cast|chapter|sentence|manuscript|narrator|theatrical|cue|comic|encore|pages/i,
  /winter|owl|perch|feather|wing|snow|icy|cold|nest|migration|watch|moon|flight/i,
 ];
 for(const voice of CHARACTER_BANTER){
  const retained=original.flatMap(category=>voice.lines[category]),fresh=additions.flatMap(category=>voice.lines[category]);
  assert.equal(retained.length,64);assert.equal(fresh.length,24);
  assert.ok(fresh.every(line=>!retained.includes(line)),'new reactions never relabel an old catchphrase');
  assert.ok(fresh.filter(line=>hallmarks[voice.character].test(line)).length>=20,`${voice.name} retains its established vocabulary across the new events`);
  for(const category of additions){
   const selected=Array.from({length:4},(_,ordinal)=>selectCharacterBanter({character:voice.character,category,eventId:`pad:${ordinal}`,eventOrdinal:ordinal}));
   assert.equal(new Set(selected.map(line=>line.text)).size,4);
   assert.ok(selected.every(line=>line.category===category&&voice.lines[category].includes(line.text)));
  }
 }
});

test('new board reactions and rival replies use public category/tone without reading hidden buff or card identity',()=>{
 for(const category of ['pad-good','pad-bad','pad-buff','chain','stack','shuffle'])for(const voice of CHARACTER_BANTER){
  const metadata={character:voice.character,category,eventId:'board-201',eventOrdinal:201,tone:category==='pad-bad'?'bad':'good'};
  Object.defineProperties(metadata,{
   hand:{get(){throw new Error('private hand');}},
   cardId:{get(){throw new Error('private enchanted card');}},
   privateBuff:{get(){throw new Error('private buff');}},
   rng:{get(){throw new Error('private host randomness');}}
  });
  const actor=selectCharacterBanter(metadata);
  assert.equal(actor.category,category);assert.equal(actor.character,voice.character);
  const reply=selectCharacterBanter({...metadata,role:'rival'});
  assert.equal(reply.category,metadata.tone==='bad'?'reply-bad':'reply-good');assert.notEqual(reply.text,actor.text);
  assert.deepEqual(actor,selectCharacterBanter(JSON.parse(JSON.stringify(metadata))));
 }
});
