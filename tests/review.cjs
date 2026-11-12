// Check the play: the logic behind the review screen (roles, scenes, lines → text and back).
const assert=require('node:assert/strict');
globalThis.CuePdf=require('../dist/pdf-import.js');globalThis.CueCore=require('../dist/core.js');
const R=require('../dist/review.js');const {parseScript}=globalThis.CueCore;
const cast=['СЕРГЕЙ ГОРДЕЕВ','СВЕТЛАНА','ГОЛОС'];
const text='ДЕЙСТВУЮЩИЕ ЛИЦА\nСЕРГЕЙ ГОРДЕЕВ\nСВЕТЛАНА\nГОЛОС\n\nСцена 1. Кухня\n[Утро.]\nСЕРГЕЙ: Не хочу. [встаёт] Пойду уже.\nСВЕТЛАНА: Подожди.\nещё минуту.\n[Пауза.]\nГОЛОС: Он уходит.\nСцена 2\nСветлана одна.\nСВЕТЛАНА: Ушёл.';
const fresh=()=>R.parseDraft(text,cast);
let m=fresh();
assert.deepEqual(m.scenes.map(s=>s.title),['Сцена 1. Кухня','Сцена 2']);
assert.deepEqual(m.scenes[0].blocks,[{speaker:null,text:'Утро.'},{speaker:'СЕРГЕЙ ГОРДЕЕВ',text:'Не хочу. [встаёт] Пойду уже.'},{speaker:'СВЕТЛАНА',text:'Подожди.\nещё минуту.'},{speaker:null,text:'Пауза.'},{speaker:'ГОЛОС',text:'Он уходит.'}]);
assert.deepEqual(m.scenes[1].blocks[0],{speaker:null,text:'Светлана одна.'},'text before the first speech is a direction');
assert.deepEqual([...R.roleCounts(m)],[['СЕРГЕЙ ГОРДЕЕВ',1],['СВЕТЛАНА',2],['ГОЛОС',1]]);
// Text → model → text → model is stable, and the saved text still parses for rehearsal.
const out=R.serialize(m);assert.equal(out,'Сцена 1. Кухня\n[Утро.]\nСЕРГЕЙ ГОРДЕЕВ: Не хочу. [встаёт] Пойду уже.\nСВЕТЛАНА: Подожди.\nещё минуту.\n[Пауза.]\nГОЛОС: Он уходит.\n\nСцена 2\n[Светлана одна.]\nСВЕТЛАНА: Ушёл.');
assert.deepEqual(R.parseDraft(out,cast),m);assert.equal(R.serialize(R.parseDraft(out,cast)),out);
const scenes=CuePdf.splitPlayScenes(out).scenes;assert.equal(parseScript(scenes[0].script,cast).length,3);assert.equal(parseScript(scenes[1].script,cast)[0].direction,'[Светлана одна.]');
// Roles.
R.renameRole(m,'СЕРГЕЙ ГОРДЕЕВ','СЕРГЕЙ');assert.deepEqual(m.cast,['СЕРГЕЙ','СВЕТЛАНА','ГОЛОС']);assert.equal(m.scenes[0].blocks[1].speaker,'СЕРГЕЙ');
R.renameRole(m,'ГОЛОС','светлана');assert.deepEqual(m.cast,['СЕРГЕЙ','СВЕТЛАНА'],'renaming to an existing role merges');assert.equal(R.roleCounts(m).get('СВЕТЛАНА'),3);
m=fresh();R.mergeRole(m,'ГОЛОС','СВЕТЛАНА');assert.equal(m.scenes[0].blocks[4].speaker,'СВЕТЛАНА');
m=fresh();R.dropRole(m,'ГОЛОС');assert.deepEqual(m.scenes[0].blocks[4],{speaker:null,text:'ГОЛОС. Он уходит.'});assert.deepEqual(m.cast,['СЕРГЕЙ ГОРДЕЕВ','СВЕТЛАНА']);assert(R.serialize(m).includes('[ГОЛОС. Он уходит.]'));
// Lines.
m=fresh();R.setBlock(m,0,3,'СЕРГЕЙ ГОРДЕЕВ','Пауза.');assert.equal(R.roleCounts(m).get('СЕРГЕЙ ГОРДЕЕВ'),2,'a direction becomes a speech');
R.setBlock(m,0,2,'','Подожди [ещё] минуту.');assert.deepEqual(m.scenes[0].blocks[2],{speaker:null,text:'Подожди ещё минуту.'},'a speech becomes a direction');
R.setBlock(m,0,4,'Сосед: [новый]','Он уходит.');assert.equal(m.scenes[0].blocks[4].speaker,'Сосед новый');assert(m.cast.includes('Сосед новый'),'a new role joins the cast');
R.setBlock(m,0,0,'','  ');assert.equal(m.scenes[0].blocks.length,4,'emptied text deletes the line');
R.deleteBlock(m,0,0);assert.equal(m.scenes[0].blocks.length,3);
// Scenes.
m=fresh();R.splitScene(m,0,3);assert.deepEqual(m.scenes.map(s=>s.title),['Сцена 1. Кухня','Сцена 2','Сцена 2']);assert.deepEqual(m.scenes.map(s=>s.blocks.length),[3,2,2]);
assert.equal(CuePdf.splitPlayScenes(R.serialize(m)).scenes.length,3,'the new scene survives saving');
R.renameScene(m,1,'За гаражами');assert.equal(m.scenes[1].title,'Сцена 2. За гаражами');R.renameScene(m,1,'Картина 5');assert.equal(m.scenes[1].title,'Картина 5');
R.joinScene(m,1);assert.deepEqual(m.scenes.map(s=>s.blocks.length),[5,2]);R.joinScene(m,0);assert.equal(m.scenes.length,2,'the first scene has nothing to join');
R.deleteScene(m,1);assert.equal(m.scenes.length,1);R.deleteScene(m,0);assert.equal(m.scenes.length,1,'the last scene is never deleted');
// A play without headings is one scene, and can be divided; English text gets English headings.
m=R.parseDraft('CHARACTERS\nANNA\nBORIS\n\nANNA: Hello there.\nBORIS: Hello.\nANNA: Goodbye now.',['ANNA','BORIS']);assert.equal(m.scenes.length,1);assert.equal(m.scenes[0].blocks.length,3,'the roster is not a line');
R.splitScene(m,0,2);assert.deepEqual(m.scenes.map(s=>s.title),['Scene 1','Scene 2']);assert.equal(CuePdf.splitPlayScenes(R.serialize(m)).scenes.length,2);
console.log('Check-the-play logic passed: reading and writing text, renaming, merging and removing roles, speech ↔ direction, new roles, splitting, joining, renaming and deleting scenes.');
