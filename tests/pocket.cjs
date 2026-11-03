// Pocket mode: tones say right or wrong, missed lines are read aloud, silence gets a prompt, and the scene end is announced.
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer=null;const events=[];let pendingSpeech=null;
class Recognition{constructor(){recognizer=this;this.ended=false}start(){events.push('listen');this.onstart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
class Utterance{constructor(text){this.text=text}}
const synthesis={cancel(){pendingSpeech=null},getVoices(){return []},addEventListener(){},speak(u){events.push('say:'+u.text);pendingSpeech=u}};
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
const L=['I thought you might still be here.',"The last train doesn't leave until midnight. We have a little time.",'A little time is all we ever seem to have.',"Then let's not waste it on things we cannot change.","What if I told you I wasn't going?"];

// The switch is off by default and listens by itself once on, even with automatic listening turned off.
assert.equal(run('data.pocket'),false);run('data.autoMic=false');get('pocket-toggle').onclick();assert.equal(run('data.pocket'),true);assert.equal(get('pocket-toggle')['aria-checked'],'true');
get('start').onclick();settle();
assert.deepEqual(take(),['tone:ready/light','listen'],'A ping says the mic is open');
assert.ok(bodyClasses.has('pocket'));assert.deepEqual(proximity,[true],'The iPhone screen turns off in the pocket');

// Missed line: 1st → cue again («Again.» on a first line), 2nd → hear the line, 3rd → hear it and move on.
say('I thought you were gone');
assert.deepEqual(take(),['tone:wrong/buzz','say:Again.','tone:ready/light','listen']);assert.equal(run('data.index'),0);
say('I thought you were still here maybe');
assert.deepEqual(take(),['tone:wrong/buzz','say:'+L[0],'tone:ready/light','listen']);
say('Nothing like it');
assert.deepEqual(take(),['tone:wrong/buzz','say:'+L[0],'tone:next/light','say:'+L[1],'tone:ready/light','listen'],'After three misses the scene moves on');
assert.equal(run('data.index'),2);

// Right line: chime, then the partner goes on.
say(L[2]);
assert.deepEqual(take(),['tone:correct/success','say:'+L[3],'tone:ready/light','listen']);
// Misses are counted per line: a new line starts again from the cue.
say('What if I stayed');assert.deepEqual(take(),['tone:wrong/buzz','say:'+L[3],'tone:ready/light','listen']);

// Silence: listen again, then the first words, then the whole line, then pause and say so.
silence();assert.deepEqual(take(),['tone:ready/light','listen']);
silence();assert.deepEqual(take(),['say:What if I','tone:ready/light','listen']);
silence();assert.deepEqual(take(),['say:'+L[4],'tone:ready/light','listen']);
silence();assert.deepEqual(take(),['tone:pause/error','say:Paused.']);
assert.equal(run('running'),false);assert.ok(!bodyClasses.has('pocket'));assert.deepEqual(proximity,[true,false],'Pausing turns the screen back on');

// Resume and finish: the end of the scene is announced.
get('start').onclick();settle();take();
say(L[4]);assert.deepEqual(take(),['tone:correct/success',"say:I'd ask you to say it again.",'tone:ready/light','listen']);
say("I'm staying. This time, I'm staying.");
assert.deepEqual(take(),['tone:correct/success','tone:done/success','say:Scene complete.']);
assert.equal(run('data.index'),7);assert.equal(run('running'),false);

// Press and hold pauses; a tap does nothing.
get('restart').onclick();get('start').onclick();settle();take();const guard=get('pocket-guard');
guard.onpointerdown({});guard.onpointerup();settle();assert.equal(run('running'),true,'A tap in the pocket is ignored');
guard.onpointerdown({});const hold=[...timers].find(([,t])=>t.ms===800);assert.ok(hold);timers.delete(hold[0]);hold[1].fn();assert.equal(run('running'),false,'Holding pauses');

// Pocket mode off: no tones at all.
get('pocket-toggle').onclick();run('data.autoMic=true');get('restart').onclick();get('start').onclick();settle();take();
say('Wrong words entirely');assert.ok(!take().some(e=>e.startsWith('tone:')),'No tones without pocket mode');
console.log('Pocket mode passed: tones for right and wrong, missed lines read aloud, silence prompts, scene end, screen-off, and hold to pause.');
