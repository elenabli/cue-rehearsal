// Long lines in the web app: the marker follows a long line through a misheard word, and a pause partway through
// a line is thinking time, not the end of the attempt: the next session remembers the start.
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer;const spoken=[];
class Recognition{constructor(){recognizer=this;this.ended=false}start(){this.onstart?.();this.onaudiostart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
const synthesis={cancel(){},getVoices(){return []},addEventListener(){},speak(u){spoken.push(u)}};
const ctx={console,document:{getElementById:get,querySelectorAll(){return []},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},window:{SpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(){}},SpeechSynthesisUtterance:class{constructor(t){this.text=t}},setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/core.js','utf8'),ctx);ctx.CueCore=ctx.window.CueCore;vm.runInContext(fs.readFileSync('dist/pdf-import.js','utf8'),ctx);ctx.CuePdf=ctx.window.CuePdf;vm.runInContext(fs.readFileSync('dist/app.js','utf8'),ctx);
const run=test=>{for(const [id,t] of [...timers])if(timers.has(id)&&test(t.ms)){timers.delete(id);t.fn();}};const flush=()=>{for(let i=0;i<10;i++)run(ms=>ms<2000)};
const pending=ms=>[...timers.values()].some(t=>t.ms===ms);
const index=()=>vm.runInContext('data.index',ctx);const marked=()=>get('current-line').children.filter(c=>c&&c.className==='heard').length;
// Words arrive one by one as interim results; Safari ends the session with a final result when the actor pauses.
function say(text,final=true){const words=text.split(' ');const r=recognizer;for(let k=1;k<=words.length;k++){const alt=[{transcript:words.slice(0,k).join(' ')}];alt.isFinal=final&&k===words.length;r.onresult({results:[alt]});}if(final)r.stop();}
const LONG='Я гуляла по набережной до самого утра, а потом сидела на скамейке и смотрела, как просыпается город.';
get('cast-input').value='';get('script-input').value='ДЕЙСТВУЮЩИЕ ЛИЦА\nСергей — муж\nСветлана — жена\nСЦЕНА 1\nСЕРГЕЙ: Ты где была всю ночь?\nСВЕТЛАНА: '+LONG+'\nСЕРГЕЙ: Ну и что.';
get('save-script').onclick();get('role').value='Светлана';get('role').onchange({target:get('role')});vm.runInContext('data.autoMic=true;micReady=true',ctx);
get('start').onclick();spoken.at(-1).onend();assert.equal(index(),1);
// 1. The marker follows the words as they come, past «берегу» (misheard), which stays unmarked.
say('я гуляла по берегу до самого утра а потом',false);
assert.equal(marked(),8,'Nine words reached, the misheard one unmarked');assert(get('current-line').children.some(c=>c&&c.textContent==='набережной'&&c.className===''));
assert(pending(6000),'Partway through the line, the session waits longer before giving up');
// 2. Safari ends the session at the pause: not judged, listening goes on and the marker stays.
const first=recognizer;first.onresult({results:[Object.assign([{transcript:'я гуляла по берегу до самого утра а потом'}],{isFinal:true})]});first.stop();flush();
assert.notEqual(recognizer,first,'A fresh session listens on');assert.equal(index(),1);assert(!get('feedback').children.some(c=>c.className==='count-it'),'Half a line is not judged');assert.equal(spoken.length,1,'The partner does not repeat the cue');
// 3. A quiet session while thinking: still no complaint.
recognizer.onerror({error:'no-speech'});recognizer.stop();flush();assert.equal(get('feedback').classList.error,undefined);assert(!/Didn/.test(get('feedback').textContent),'No complaint while thinking');
// 4. The rest of the line completes it.
say('сидела на скамейке и смотрела как просыпается город',false);assert.equal(marked(),16,'The marker covers both parts');say('сидела на скамейке и смотрела как просыпается город');flush();assert.equal(index(),2,'The line said in two parts is accepted');
console.log('Thinking time passed: live marker through misheard words, a pause across sessions, quiet while thinking, and the line completed after the pause.');
