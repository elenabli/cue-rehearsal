// Android (Chrome): a mic per line even if one open session was chosen, a short wait after the partner's voice, Chrome in the
// messages, voices reported as ru_RU, and the install button using Chrome's own install dialog.
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();function element(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){}},children:[],setAttribute(k,v){this[k]=v},replaceChildren(...els){this.children=els},append(...els){this.children.push(...els)},querySelector(){return this.button||(this.button=element())},showModal(){this.open=true},close(){},click(){}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
const timers=new Map();let timerId=0;let recognizer=null;const spoken=[];
class Recognition{constructor(){recognizer=this;this.ended=false}start(){this.onstart?.()}stop(){if(this.ended)return;this.ended=true;this.onend?.()}abort(){this.ended=true}}
const voices=[{name:'Google русский',lang:'ru_RU',voiceURI:'ru-google'},{name:'English',lang:'en_US',voiceURI:'en'}];
const synthesis={cancel(){},getVoices(){return voices},addEventListener(){},speak(u){if(u.volume===0)return;spoken.push(u);u.onstart?.()}};
const installButtons=[element(),element()],winEvents={};
const ctx={console,document:{getElementById:get,querySelectorAll(sel){return sel==='.install-help'?installButtons:[]},createElement:element,body:{classList:{add(){},remove(){}}},addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},
 navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'},
 window:{webkitSpeechRecognition:Recognition,speechSynthesis:synthesis,scrollTo(){},addEventListener(name,fn){winEvents[name]=fn}},SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
 setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},Blob,URL};
ctx.window.window=ctx.window;vm.createContext(ctx);for(const f of ['core','pdf-import','pocket','app']){vm.runInContext(fs.readFileSync(`dist/${f}.js`,'utf8'),ctx);ctx.CueCore=ctx.window.CueCore;ctx.CuePdf=ctx.window.CuePdf;}
const run=code=>vm.runInContext(code,ctx);
function runTimers(test){for(const [id,t] of [...timers])if(timers.has(id)&&test(t.ms)){timers.delete(id);t.fn();}}const flush=()=>runTimers(ms=>ms<2000);
get('cast-input').value='Светлана\nСергей';get('script-input').value='СЦЕНА 1\nСВЕТЛАНА: Чего не спишь\nСЕРГЕЙ: Ждал.\nСВЕТЛАНА: Чего ждал';get('save-script').onclick();get('role').value='Сергей';get('role').onchange({target:get('role')});
assert.equal(run('data.language'),'ru-RU');
assert.equal(get('voice').children.length,2,'A voice reported as ru_RU is listed for Russian');
run('data.longSession=true;data.autoMic=true');assert.equal(run('longMode()'),false,'Chrome on Android always opens the mic per line');
get('start').onclick();assert.equal(spoken.at(-1).text,'Чего не спишь');assert.equal(spoken.at(-1).voice,voices[0],'The ru_RU voice speaks Russian lines');
recognizer=null;spoken.at(-1).onend();
assert.equal(recognizer,null,'Right after the partner line ends the mic waits a moment');
assert(!run('recognition'));runTimers(ms=>ms===350);assert(recognizer,'…then listens');assert.equal(recognizer.continuous,false);
recognizer.onerror({error:'not-allowed'});recognizer.stop();assert.match(get('feedback').textContent,/Chrome/,'Mic help names Chrome');assert.doesNotMatch(get('feedback').textContent,/Safari/);
// Install: Chrome's own dialog when it is offered, the steps otherwise.
let prompted=0;winEvents.beforeinstallprompt({prompt(){prompted++},userChoice:Promise.resolve({outcome:'accepted'})});installButtons[0].onclick();assert.equal(prompted,1,'Install opens Chrome’s dialog');
installButtons[1].onclick();assert.equal(prompted,1);assert.equal(get('help').open,true,'Without it, the steps are shown');
console.log('Android checks passed: mic per line, wait after the partner voice, ru_RU voices, Chrome in messages, install button.');
