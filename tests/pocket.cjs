// Pocket mode: tones say right or wrong, missed lines are read aloud, silence gets a prompt, and the scene end is announced.
// A stub stands in for the tone player so the test can record which tones play and when.
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer=null;const events=[];let pendingSpeech=null;
class Recognition{constructor(){recognizer=this;this.ended=false}start(){events.push('listen');this.onstart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
class Utterance{constructor(text){this.text=text}}
const synthesis={cancel(){pendingSpeech=null},getVoices(){return []},addEventListener(){},speak(u){if(u.volume===0)return;events.push('say:'+u.text);pendingSpeech=u}};
const bodyClasses=new Set();const proximity=[];
const native={tone(notes,haptic){events.push('tone:'+Object.entries(tones()).find(([,t])=>t.notes===notes)[0]+(haptic!=='none'?'/'+haptic:''))},proximity(on){proximity.push(on)}};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(c){bodyClasses.add(c)},remove(c){bodyClasses.delete(c)}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},window:{SpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(){},CuePocketNative:native},SpeechSynthesisUtterance:Utterance,setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);
for(const file of ['core.js','pdf-import.js','pocket.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),ctx);
ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;const tones=()=>ctx.window.CuePocket.tones;
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);
// Let short timers run and spoken lines finish until nothing is left to do but listen (long watchdogs stay pending).
function settle(){for(let i=0;i<200;i++){const short=[...timers].find(([,t])=>t.ms<2000);if(short){timers.delete(short[0]);short[1].fn();continue;}if(pendingSpeech){const u=pendingSpeech;pendingSpeech=null;u.onend?.();continue;}return;}throw Error('did not settle');}
function say(text){const r=[{transcript:text}];r.isFinal=true;const active=recognizer;active.onresult({results:[r]});if(!active.ended)active.stop();settle();}
function silence(){const active=recognizer;active.onerror({error:'no-speech'});active.stop();settle();}
const take=()=>events.splice(0);
const L=["What if I told you I wasn't going?","I'd ask you to say it again.","I'm staying. This time, I'm staying."];

// The switch is off by default and listens by itself once on, even with automatic listening turned off.
assert.equal(run('data.pocket'),false);run('data.autoMic=false');get('pocket-toggle').onclick();assert.equal(run('data.pocket'),true);assert.equal(get('pocket-toggle')['aria-checked'],'true');
// Start from the demo's last ELENA lines.
run('data.index=4');get('start').onclick();settle();
assert.deepEqual(take(),['tone:ready/light','listen'],'A ping says the mic is open');
assert.ok(bodyClasses.has('pocket'));

// A start that fits the line is thinking time; a quiet session then brings a spoken hint of the next words, and the start is kept.
say('What if I');assert.deepEqual(take(),['listen'],'Half a line is not judged');
silence();assert.deepEqual(take(),['say:told you I','listen'],'The hint says what comes next');
say("told you I wasn't going");assert.deepEqual(take(),['tone:correct/success','say:'+L[1],'tone:ready/light','listen'],'Start and rest together are right');assert.equal(run('data.index'),6);

// Missed line: 1st → the cue again, 2nd → hear the line, 3rd → hear it and move on.
say('Nobody is here at all');
assert.deepEqual(take(),['tone:wrong/buzz','say:'+L[1],'tone:ready/light','listen']);assert.equal(run('data.index'),6);
say('Nobody is here at all');
assert.deepEqual(take(),['tone:wrong/buzz','say:'+L[2],'tone:ready/light','listen']);
say('Nobody is here at all');
assert.deepEqual(take(),['tone:wrong/buzz','say:'+L[2],'tone:next/light','tone:done/success','say:Scene complete.'],'After three misses the scene moves on; the end is announced');
assert.equal(run('data.index'),7);assert.equal(run('running'),false);

// Silence from the start: listen again, then hints that grow to the whole line, then pause and say so.
get('restart').onclick();run('data.index=4');get('start').onclick();settle();take();
silence();assert.deepEqual(take(),['listen']);
silence();assert.deepEqual(take(),['say:What if I','listen']);
silence();assert.deepEqual(take(),['say:What if I told you I','listen']);
silence();assert.deepEqual(take(),["say:What if I told you I wasn't going?",'listen']);
silence();assert.deepEqual(take(),['tone:pause/error','say:Paused.']);
assert.equal(run('running'),false);assert.ok(!bodyClasses.has('pocket'));

// Press and hold pauses; a tap does nothing.
get('restart').onclick();get('start').onclick();settle();take();const guard=get('pocket-guard');
guard.onpointerdown({});guard.onpointerup();settle();assert.equal(run('running'),true,'A tap in the pocket is ignored');
guard.onpointerdown({});const hold=[...timers].find(([,t])=>t.ms===800);assert.ok(hold);timers.delete(hold[0]);hold[1].fn();assert.equal(run('running'),false,'Holding pauses');

// Pocket mode off: no tones at all.
get('pocket-toggle').onclick();run('data.autoMic=true');get('restart').onclick();get('start').onclick();settle();take();
say('Wrong words entirely');assert.ok(!take().some(e=>e.startsWith('tone:')),'No tones without pocket mode');

// iPhone (one listening session per scene). Lena's case: a pause while remembering must not throw away the start of the line.
const LONG='Я гуляла по набережной до самого утра, а потом сидела на скамейке.';
function fire(ms){const t=[...timers].find(([,x])=>x.ms===ms);assert.ok(t,'a '+ms+' ms timer is pending');timers.delete(t[0]);t[1].fn();settle();}
const hasTimer=ms=>[...timers.values()].some(x=>x.ms===ms);
let heardSoFar=[];function hear(text){run('turnStartedAt-=1000');heardSoFar=[...heardSoFar,text];const results=heardSoFar.map(t=>{const r=[{transcript:t}];r.isFinal=true;return r;});recognizer.onresult({results});settle();}
function micCloses(){const old=recognizer;heardSoFar=[];old.stop();settle();assert.notEqual(recognizer,old,'The mic reopens');}
get('restart').onclick();get('cast-input').value='';get('script-input').value='ДЕЙСТВУЮЩИЕ ЛИЦА\nСергей\nСветлана\nСЦЕНА 1\nСЕРГЕЙ: Ты где была всю ночь?\nСВЕТЛАНА: '+LONG+'\nСЕРГЕЙ: Ну и что.';get('save-script').onclick();get('role').value='Светлана';get('role').onchange({target:get('role')});
run('data.longSession=true;data.autoMic=true');
for(const pocket of [false,true]){
 run('data.pocket='+pocket);get('restart').onclick();get('feedback').children=[];get('start').onclick();settle();take();heardSoFar=[];if(pendingSpeech)settle();
 assert.equal(run('data.index'),1);
 hear('я гуляла по набережной до самого');
 assert.equal(run('data.index'),1);assert(!get('feedback').children.some(c=>c&&c.className==='count-it'),'Half a line is not judged');assert(/Keep going/.test(get('feedback').textContent));
 // iOS closes the mic during the pause; what was said is kept.
 micCloses();
 if(pocket){fire(5000);assert.deepEqual(take().filter(e=>e.startsWith('say:')),['say:утра, а потом'],'After 5 s of quiet the next words are spoken');micCloses();}
 else assert.ok(!hasTimer(5000),'No spoken hints without hands-free mode');
 hear('утра а потом сидела на скамейке');
 assert.equal(run('data.index'),3,'The line is accepted and the scene ends');const after=take();
 if(pocket)assert.ok(after.includes('tone:correct/success')&&after.includes('say:Сцена пройдена.'),'Chime, then the scene end is announced');
 assert.ok(after.includes('say:Ну и что.'),'Start and rest, across the pause, are accepted: the partner goes on');
}
// Without hands-free mode, a half line left for a long time is checked so the missing words show (not after 1.8 s).
run('data.pocket=false');get('restart').onclick();get('feedback').children=[];get('start').onclick();settle();take();heardSoFar=[];
hear('я гуляла по набережной');assert.ok(hasTimer(15000));fire(15000);assert(get('feedback').children.some(c=>c&&c.className==='count-it'),'After a long silence the half line is checked');
// iPhone, hands-free: a wrong line gets the low tone and the cue again; silence from the start brings growing hints, then a spoken pause.
run('data.pocket=true');get('restart').onclick();get('feedback').children=[];get('start').onclick();settle();take();heardSoFar=[];
hear('совсем другие слова здесь');assert.deepEqual(take().filter(e=>!e.startsWith('listen')),['tone:wrong/buzz','say:Ты где была всю ночь?']);assert.equal(run('data.index'),1);
heardSoFar=[];fire(5000);fire(5000);fire(5000);fire(5000);fire(5000);
assert.deepEqual(take().filter(e=>e.startsWith('say:')||e.startsWith('tone:')),['say:Я гуляла по','say:Я гуляла по набережной до самого','say:Я гуляла по набережной до самого утра, а потом','say:'+LONG,'tone:pause/error','say:Пауза.']);
assert.equal(run('running'),false);
console.log('Pocket mode passed: tones for right and wrong, missed lines read aloud, silence prompts, scene end, and hold to pause; on iPhone a pause keeps what was said and brings a spoken hint.');
