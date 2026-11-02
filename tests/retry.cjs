const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer;let spoken=[];
const started=[];class Recognition{constructor(){recognizer=this;this.ended=false}start(){started.push(this);this.onstart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
class Utterance{constructor(text){this.text=text}}
const synthesis={cancel(){},getVoices(){return []},addEventListener(){},speak(u){spoken.push(u)}};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},window:{SpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:Utterance,setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/core.js','utf8'),ctx);ctx.CueCore=ctx.window.CueCore;vm.runInContext(fs.readFileSync('dist/pdf-import.js','utf8'),ctx);ctx.CuePdf=ctx.window.CuePdf;vm.runInContext(fs.readFileSync('dist/app.js','utf8'),ctx);vm.runInContext('data.autoMic=false',ctx);
function index(){return vm.runInContext('data.index',ctx)}// flush() runs the short app timers (advance, retry); watchdog() runs the long listening watchdogs.
function runTimers(test){for(const [id,t] of [...timers])if(timers.has(id)&&test(t.ms)){timers.delete(id);t.fn();}}function flush(){runTimers(ms=>ms<2000)}function watchdog(){runTimers(ms=>ms>=2000)}
function result(text,final=true){const r=[{transcript:text}];r.isFinal=final;const active=recognizer;active.onresult({results:[r]});if(final&&!active.ended)active.stop();}
function heardPrefix(...a){return vm.runInContext('heardPrefix',ctx)(...a)}
// Reported line: «Господи, перегарищем-то разит!» — particles, unusual word forms, and retrying after a wrong attempt.
{const M=ctx.CueCore.matches,line='Господи, перегарищем-то разит!';
for(const said of ['господи перегарищем то разит','Господи перегарищем разит','Господи перегарищемто разит','Господи перегар ищем то разит','Господи, перегаром-то разит'])assert.equal(M(line,said),true,said);
for(const said of ['Господи, как разит','Господи перегарищем-то','Ты всю ночь квасил'])assert.equal(M(line,said),false,said);
assert.equal(M('Ты всю ночь квасил!','ты всю ночь курил'),false,'A different word is still wrong');assert.equal(M('Привет.','Приветик'),false,'Short lines stay strict');assert.equal(M('Дай-ка сюда.','дай сюда'),true);
assert.equal(ctx.CueCore.diffWords(line,'господи перегарищем то разит').every(o=>o.type==='same'),true,'A particle heard as its own word is not marked wrong');
assert.equal(heardPrefix(line,'господи перегарищем разит'),3,'Marker follows the line without the particle');}
get('cast-input').value='';get('script-input').value='ДЕЙСТВУЮЩИЕ ЛИЦА\nСергей — муж\nСветлана — жена\nСЦЕНА 1\nСЕРГЕЙ: А водка ещё есть?\nСВЕТЛАНА: Господи, перегарищем-то разит!\nСЕРГЕЙ: Какая водка?';get('save-script').onclick();get('role').value='Светлана';get('role').onchange({target:get('role')});vm.runInContext('data.autoMic=true',ctx);
get('start').onclick();spoken.at(-1).onend();assert.equal(index(),1);
const sees=r=>{const s=r.start;r.start=function(){s.call(this);this.onaudiostart?.()};};
// iOS can leave the first session hanging; the retry must wait until it lets go of the mic.
const first=recognizer;first.onaudiostart?.();first.stop=function(){};result('Господи, как разит');watchdog();flush();assert.equal(vm.runInContext('!!recognition',ctx),false);assert(get('feedback').children.length,'The mismatch is shown');
flush();assert.equal(recognizer,first,'No new session while the old one still holds the mic');first.onend?.();flush();flush();assert.equal(spoken.at(-1).text,'А водка ещё есть?','The partner repeats the cue before listening again');assert.equal(recognizer,first);spoken.at(-1).onend();assert.notEqual(recognizer,first,'Retry starts once the old session has ended and the cue is given');
assert(get('feedback').children.length,'The diff stays on screen while listening again');recognizer.onaudiostart?.();delete first.stop;
result('Господи, перегарищем то разит');flush();assert.equal(index(),2,'The second attempt is heard and accepted');
// A deaf session (no audio at all) is replaced, then the actor is asked to tap; a tap starts a fresh session.
const drain=()=>{for(let i=0;i<15;i++)flush();};spoken.at(-1).onend();get('start').onclick();spoken.at(-1).onend();assert.equal(index(),1);const deaf1=recognizer;watchdog();assert.equal(deaf1.ended,true,'Deaf session is dropped');drain();const deaf2=recognizer;assert.notEqual(deaf2,deaf1,'…and replaced');watchdog();drain();assert.equal(recognizer,deaf2,'Only one automatic replacement');assert(get('feedback').textContent.includes('Tap Speak'));
get('listen').onclick();const tapped=recognizer;assert.notEqual(tapped,deaf2);tapped.onaudiostart?.();get('listen').onclick();assert.notEqual(recognizer,tapped,'Tapping Speak while listening starts over');assert.equal(tapped.ended,true);result('Господи перегарищем-то разит');flush();assert.equal(index(),2);
// «Count it» moves on when recognition can't get a word right; a first line gets «Ещё раз» instead of a cue.
get('restart').onclick();get('script-input').value='ДЕЙСТВУЮЩИЕ ЛИЦА\nСергей — муж\nСветлана — жена\nСЦЕНА 1\nСВЕТЛАНА: Господи, перегарищем-то разит!\nСЕРГЕЙ: А водка ещё есть?';get('save-script').onclick();get('role').value='Светлана';get('role').onchange({target:get('role')});get('start').onclick();assert.equal(index(),0);
recognizer.onaudiostart?.();result('Господи перегарищем-то рящий тормозит');flush();flush();assert.equal(spoken.at(-1).text,'Ещё раз.','A first line has no cue to repeat');const count=get('feedback').children.find(c=>c.className==='count-it');assert(count,'Count it is offered');spoken.at(-1).onend();count.onclick();assert.equal(index(),1,'Count it moves on');assert.equal(spoken.at(-1).text,'А водка ещё есть?');
console.log('Retry fixes passed: hyphenated particles, unusual word forms, retry after a wrong attempt, deaf sessions, and tap to restart.');
