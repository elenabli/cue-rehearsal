const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
let timer;let recognizer;let spoken=[];
class Recognition{constructor(){recognizer=this}start(){this.onstart?.()}stop(){this.onend?.()}abort(){}}
class Utterance{constructor(text){this.text=text}}
const synthesis={cancel(){},getVoices(){return []},addEventListener(){},speak(u){spoken.push(u)}};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},window:{SpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:Utterance,setTimeout(fn){timer=fn;return 1},clearTimeout(){timer=null},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/core.js','utf8'),ctx);ctx.CueCore=ctx.window.CueCore;vm.runInContext(fs.readFileSync('dist/app.js','utf8'),ctx);
function index(){return vm.runInContext('data.index',ctx)}function flush(){const t=timer;timer=null;t?.()}
function result(text,final=true){const r=[{transcript:text}];r.isFinal=final;recognizer.onresult({results:[r]});}
assert.equal(index(),0);get('typed').value='I thought you were here';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),0,'Wrong line must not advance');
get('typed').value='I thought you might still be here';get('typed-form').onsubmit({preventDefault(){}});flush();assert.equal(index(),1,'Correct typed line advances once');
get('restart').onclick();get('listen').onclick();result('I thought you might still be here',false);flush();assert.equal(index(),0,'Interim speech must not advance');result('I thought you were here');flush();assert.equal(index(),0,'Wrong final speech must not advance');
get('listen').onclick();result('I thought you might still be here');flush();assert.equal(index(),1,'Correct final speech advances');
get('restart').onclick();get('start').onclick();get('listen').onclick();result('I thought you might still be here');flush();assert.equal(index(),1);assert.equal(spoken.at(-1).text,"The last train doesn't leave until midnight. We have a little time.");spoken.at(-1).onend();assert.equal(index(),2,'Partner cue advances after spoken completion');
get('listen').onclick();result('A little time is all we ever seem to have');get('restart').onclick();flush();assert.equal(index(),0,'Restart cancels a pending advance');
get('start').onclick();get('listen').onclick();result('I thought you might still be here');flush();const stale=spoken.at(-1);get('restart').onclick();stale.onend();assert.equal(index(),0,'Stale voice callbacks cannot advance after restart');
console.log('Rehearsal integration passed: wrong/interim/correct speech, typed checks, partner cues, restart cancellation.');
