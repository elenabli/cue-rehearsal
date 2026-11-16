// iPhone outside hands-free: soft tones between the partner's voice and the mic, as hands-free plays them.
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){this.open=true},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer=null;const spoken=[];
class Recognition{constructor(){recognizer=this;this.ended=false}start(){this.onstart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
const voices=[{name:'Google русский',lang:'ru_RU',voiceURI:'ru-google'},{name:'English',lang:'en_US',voiceURI:'en'}];
const synthesis={cancel(){},getVoices(){return voices},addEventListener(){},speak(u){if(u.volume===0)return;spoken.push(u);u.onstart?.()}};
const types=[];const audioSession={_t:'auto',get type(){return this._t},set type(v){this._t=v;types.push(v)}};
const played=[];
const installButtons=[element(),element()],winEvents={};
const ctx={console,document:{getElementById:get,querySelectorAll(sel){return sel==='.install-help'?installButtons:[]},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},
 navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',audioSession},
 window:{webkitSpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(name,fn){winEvents[name]=fn}},SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
 setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);for(const f of ['core','pdf-import','pocket','app']){vm.runInContext(fs.readFileSync(`dist/${f}.js`,'utf8'),ctx);ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;}
const run=code=>vm.runInContext(code,ctx);
function runTimers(test){for(const [id,t] of [...timers])if(timers.has(id)&&test(t.ms)){timers.delete(id);t.fn();}}const flush=()=>runTimers(ms=>ms<2000);

ctx.window.CuePocket.play=(kind,then,volume=1)=>{played.push([kind,volume]);if(then)ctx.setTimeout(then,200);};
get('cast-input').value='Anna\nBoris';get('script-input').value='Scene 1\nANNA: Where were you\nBORIS: Waiting.\nANNA: For what';get('save-script').onclick();get('role').value='Boris';get('role').onchange({target:get('role')});
get('start').onclick();spoken.at(-1).onend();
assert.equal(run('recognition'),null,'The mic waits for the soft tone');assert.deepEqual(played.at(-1),['ready',0.4],'A soft ready tone before the mic');
flush();assert(run('recognition'),'…then listens');
recognizer.onresult({results:[Object.assign([{transcript:'Waiting'}],{isFinal:true})]});recognizer.stop();
assert.deepEqual(played.at(-1),['correct',0.4],'A soft tone for a right line');
// Silent sessions: a soft tone before every new try.
run('pause()');played.length=0;run('data.index=1');get('start').onclick();flush();const n=played.length;recognizer.onerror({error:'no-speech'});recognizer.stop();flush();assert(played.length>n,'Retries get a tone too');
// Off switch, and hands-free keeps its own full tones.
run('pause()');get('soft-tones').onchange({target:{checked:false}});played.length=0;run('data.index=0');get('start').onclick();spoken.at(-1).onend();flush();assert.equal(played.length,0,'Off: no tones');
run('pause()');run('data.pocket=true;data.index=0');get('start').onclick();spoken.at(-1).onend();assert.deepEqual(played.at(-1),['ready',1],'Hands-free tones stay full');
console.log('Soft tones passed: soft ready and correct tones on iPhone outside hands-free, also before retries, off switch.');
